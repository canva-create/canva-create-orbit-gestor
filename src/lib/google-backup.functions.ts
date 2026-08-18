import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const PASTA_DRIVE = "ORBIT — Backups";
export const PASTA_CLIENTES = "CLIENTES_ATUALIZADOS";
export const PLANILHA_NOME = "ORBIT — Dados do Sistema";

/** Data DD-MM-AAAA no fuso de São Paulo. */
function dataArquivo(d = new Date()) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric",
  }).format(d).replace(/\//g, "-");
}

/** Título da planilha com a data/hora da última atualização. */
export function nomePlanilha(d = new Date()) {
  const q = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(d).replace(/\//g, "-");
  return `${PLANILHA_NOME} — atualizado ${q}`;
}

/** Nome do arquivo enviado ao Drive: BACKUP_ORBIT_DD-MM-AAAA */
export function nomeArquivoDrive(d = new Date()) {
  return `BACKUP_ORBIT_${dataArquivo(d)}`;
}

/** Nome do arquivo diário da lista de clientes. */
export function nomeArquivoClientes(d = new Date()) {
  return `CLIENTES_ATUALIZADOS_${dataArquivo(d)}.csv`;
}

/** Envia o backup informado para o Google Drive (arquivo JSON) e Google Sheets (planilha). */
export const sincronizarGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { backupId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const {
      criarPasta,
      criarPlanilha,
      enviarArquivo,
      existe,
      garantirPasta,
      planilhaAcessivel,
      gravarPlanilha,
      csvClientes,
    } = await import("./google-backup.server");

    const { data: backup, error } = await supabase
      .from("backups")
      .select("id,nome,conteudo,created_at")
      .eq("id", data.backupId)
      .single();
    if (error) throw new Error(error.message);
    if (!backup?.conteudo) throw new Error("Backup sem conteúdo armazenado");

    const { data: cfg } = await supabase
      .from("integracoes")
      .select("id,credenciais")
      .eq("provider", "google_backup")
      .maybeSingle();
    const cred = (cfg?.credenciais ?? {}) as { pasta_id?: string; planilha_id?: string };

    let pastaId = cred.pasta_id;
    if (!pastaId || !(await existe(pastaId))) pastaId = await criarPasta(PASTA_DRIVE);

    let planilhaId = cred.planilha_id;
    // A planilha precisa ser acessível pela conexão do Google Sheets; se não
    // for (403/404), cria outra pela própria API do Sheets.
    if (!planilhaId || !(await planilhaAcessivel(planilhaId))) {
      planilhaId = await criarPlanilha(PLANILHA_NOME, pastaId);
    }

    const arquivo = await enviarArquivo(
      pastaId,
      `${nomeArquivoDrive(new Date(backup.created_at))}.json`,
      JSON.stringify({ versao: 1, sistema: "Orbit", gerado_em: backup.created_at, dados: backup.conteudo }, null, 2),
    );

    // Lista completa de clientes (mesmas colunas/ordem da exportação) em pasta própria.
    let pastaClientesId = (cred as any).pasta_clientes_id as string | undefined;
    if (!pastaClientesId || !(await existe(pastaClientesId))) {
      pastaClientesId = await garantirPasta(PASTA_CLIENTES);
    }
    const arquivoClientes = await enviarArquivo(
      pastaClientesId,
      nomeArquivoClientes(new Date(backup.created_at)),
      csvClientes(backup.conteudo as Record<string, any[]>),
      "text/csv",
    );

    const titulo = nomePlanilha();
    let registros: number;
    try {
      registros = await gravarPlanilha(planilhaId, backup.conteudo as Record<string, any[]>, titulo);
    } catch (e: any) {
      if (!String(e?.message ?? "").includes("403")) throw e;
      planilhaId = await criarPlanilha(PLANILHA_NOME, pastaId);
      registros = await gravarPlanilha(planilhaId, backup.conteudo as Record<string, any[]>, titulo);
    }

    const payload = {
      user_id: userId,
      provider: "google_backup",
      nome: "Google Drive & Sheets",
      credenciais: { pasta_id: pastaId, planilha_id: planilhaId, pasta_clientes_id: pastaClientesId },
      ativo: true,
      status: "conectado",
      ultimo_teste_ok: true,
      ultimo_teste_msg: `Backup ${backup.nome} enviado`,
      ultima_sync: new Date().toISOString(),
    };
    await supabase.from("integracoes").upsert(payload, { onConflict: "user_id,provider" });

    return {
      registros,
      arquivo: arquivo.link,
      clientes: arquivoClientes.link,
      planilha: `https://docs.google.com/spreadsheets/d/${planilhaId}`,
      pasta: `https://drive.google.com/drive/folders/${pastaId}`,
      pasta_clientes: `https://drive.google.com/drive/folders/${pastaClientesId}`,
    };
  });

/** Situação atual da integração com o Google. */
export const statusGoogle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as any;
    const { data } = await supabase
      .from("integracoes")
      .select("ativo,ultima_sync,credenciais,ultimo_teste_msg")
      .eq("provider", "google_backup")
      .maybeSingle();
    const cred = (data?.credenciais ?? {}) as {
      pasta_id?: string;
      planilha_id?: string;
      pasta_clientes_id?: string;
    };
    return {
      ativo: !!data?.ativo,
      ultima_sync: (data?.ultima_sync as string | null) ?? null,
      planilha: cred.planilha_id ? `https://docs.google.com/spreadsheets/d/${cred.planilha_id}` : null,
      pasta: cred.pasta_id ? `https://drive.google.com/drive/folders/${cred.pasta_id}` : null,
      pasta_clientes: cred.pasta_clientes_id
        ? `https://drive.google.com/drive/folders/${cred.pasta_clientes_id}`
        : null,
    };
  });

/** Liga/desliga o envio automático diário para o Google. */
export const definirAutoGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { ativo: boolean }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await supabase.from("integracoes").upsert(
      {
        user_id: userId,
        provider: "google_backup",
        nome: "Google Drive & Sheets",
        ativo: data.ativo,
        status: data.ativo ? "conectado" : "desconectado",
      },
      { onConflict: "user_id,provider" },
    );
    return { ativo: data.ativo };
  });
