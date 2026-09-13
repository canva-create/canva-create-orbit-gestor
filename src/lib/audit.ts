import { supabase } from "@/integrations/supabase/client";

export type AuditCategoria =
  | "cliente"
  | "revendedor"
  | "servidor"
  | "aplicativo"
  | "painel"
  | "backup"
  | "auth"
  | "importacao"
  | "exportacao"
  | "sistema"
  | "outro";

export type AuditAcao =
  | "criar"
  | "editar"
  | "excluir"
  | "excluir_definitivo"
  | "restaurar"
  | "reativar"
  | "duplicar"
  | "transferir"
  | "login"
  | "primeiro_login"
  | "backup"
  | "importar"
  | "atualizar_planilha"
  | "exportar"
  | "ajustar"
  | "outro";

export interface AuditPayload {
  categoria: AuditCategoria;
  acao: AuditAcao;
  descricao: string;
  entidade?: string;
  entidade_id?: string | null;
  entidade_nome?: string | null;
  dados_anteriores?: Record<string, any> | null;
  dados_novos?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
}

/**
 * Registra uma ação estrutural no log de auditoria.
 * Ignora automaticamente renovações e transações financeiras de créditos
 * (que já possuem suas próprias seções de controle no sistema).
 */
export async function logAudit(payload: AuditPayload): Promise<void> {
  const cat = String(payload.categoria || "").toLowerCase();
  const acao = String(payload.acao || "").toLowerCase();
  if (
    cat === "renovacao" ||
    cat === "venda_credito" ||
    cat === "compra_credito" ||
    cat === "financeiro" ||
    acao === "renovar" ||
    acao === "vender" ||
    acao === "comprar" ||
    acao === "cancelar_venda"
  ) {
    return;
  }

  try {
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) return;
    await supabase.from("audit_logs" as any).insert({
      user_id: user.id,
      user_email: user.email ?? null,
      categoria: payload.categoria,
      acao: payload.acao,
      descricao: payload.descricao,
      entidade: payload.entidade ?? null,
      entidade_id: payload.entidade_id ?? null,
      entidade_nome: payload.entidade_nome ?? null,
      dados_anteriores: payload.dados_anteriores ?? null,
      dados_novos: payload.dados_novos ?? null,
      metadata: payload.metadata ?? null,
    });
  } catch {
    // silencioso
  }
}

/**
 * Registra o login do usuário (primeiro login do dia ou logins subsequentes).
 * Evita duplicação dentro da mesma sessão de navegação via sessionStorage.
 */
export async function registrarLogAcesso(userEmail: string, userId: string): Promise<void> {
  try {
    if (typeof window === "undefined") return;
    const today = new Date().toISOString().slice(0, 10);
    const sessionKey = `orbit_login_logged_${userId}_${today}`;
    
    // Evita chamadas repetidas na mesma sessão do navegador
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, "1");

    // Checa se já existe algum login hoje desse usuário
    const startOfDay = `${today}T00:00:00.000Z`;
    const { data: existingLogins } = await supabase
      .from("audit_logs" as any)
      .select("id")
      .eq("user_id", userId)
      .eq("categoria", "auth")
      .gte("created_at", startOfDay)
      .limit(1);

    const isPrimeiro = !existingLogins || existingLogins.length === 0;

    await supabase.from("audit_logs" as any).insert({
      user_id: userId,
      user_email: userEmail,
      categoria: "auth",
      acao: isPrimeiro ? "primeiro_login" : "login",
      descricao: isPrimeiro
        ? `Primeiro login do dia realizado por ${userEmail}`
        : `Login de acesso ao painel realizado por ${userEmail}`,
      entidade: "autenticacao",
      entidade_nome: userEmail,
      metadata: {
        primeiro_do_dia: isPrimeiro,
        data: today,
        hora: new Date().toLocaleTimeString("pt-BR"),
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      },
    });
  } catch (err) {
    console.warn("Falha ao registrar log de acesso:", err);
  }
}

/** Extrai um diff superficial entre dois objetos (chaves com valores diferentes). */
export function diffObjects(
  antes: Record<string, any> | null | undefined,
  depois: Record<string, any> | null | undefined,
): { antes: Record<string, any>; depois: Record<string, any> } {
  const a: Record<string, any> = {};
  const d: Record<string, any> = {};
  if (!antes || !depois) return { antes: antes ?? {}, depois: depois ?? {} };
  const keys = new Set([...Object.keys(antes), ...Object.keys(depois)]);
  keys.forEach((k) => {
    const va = (antes as any)[k];
    const vd = (depois as any)[k];
    if (JSON.stringify(va) !== JSON.stringify(vd)) {
      a[k] = va;
      d[k] = vd;
    }
  });
  return { antes: a, depois: d };
}