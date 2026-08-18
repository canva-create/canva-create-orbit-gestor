import { supabase } from "@/integrations/supabase/client";

export type AuditCategoria =
  | "cliente"
  | "renovacao"
  | "revendedor"
  | "venda_credito"
  | "compra_credito"
  | "credito"
  | "servidor"
  | "painel"
  | "financeiro"
  | "importacao"
  | "exportacao"
  | "backup"
  | "auth"
  | "outro";

export type AuditAcao =
  | "criar"
  | "editar"
  | "excluir"
  | "excluir_definitivo"
  | "restaurar"
  | "reativar"
  | "renovar"
  | "cancelar"
  | "cancelar_venda"
  | "duplicar"
  | "vender"
  | "comprar"
  | "ajustar"
  | "transferir"
  | "importar"
  | "atualizar_planilha"
  | "exportar"
  | "alterar_pagamento"
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
 * Registra uma ação no log de auditoria. Nunca lança erro — falhas de log
 * são silenciadas para não bloquear a operação principal.
 */
export async function logAudit(payload: AuditPayload): Promise<void> {
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