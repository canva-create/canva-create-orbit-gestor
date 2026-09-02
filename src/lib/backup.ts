import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";

/** Tabelas incluídas no backup completo do sistema. */
export const TABELAS_BACKUP = [
  "servidores",
  "clientes",
  "revendedores",
  "revendedores_movimentacoes",
  "creditos_compras",
  "creditos_movimentacoes",
  "funcionarios",
  "historico_financeiro",
  "historico_renovacoes",
  "paineis_info",
  "pix_pagamentos",
  "integracoes",
  "audit_logs",
] as const;

export type TabelaBackup = (typeof TABELAS_BACKUP)[number];

export type BackupRow = {
  id: string;
  nome: string;
  tipo: "automatico" | "manual";
  status: "concluido" | "erro";
  erro_msg: string | null;
  tamanho_bytes: number;
  registros: Record<string, number>;
  conteudo: Record<string, any[]> | null;
  referencia_dia: string;
  exportado_em: string | null;
  created_at: string;
};

const TZ = "America/Sao_Paulo";

/** Data (AAAA-MM-DD) no fuso de São Paulo. */
export function diaSP(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

function horaSP(d = new Date()) {
  const s = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  const [h, m] = s.split(":").map(Number);
  return { h, m, minutos: h * 60 + m };
}

export function nomeBackup(dia: string, hh: string, mm: string) {
  return `Backup_Servidor_${dia}_${hh}-${mm}`;
}

export function formatarTamanho(bytes: number) {
  if (!bytes) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function lerTabela(tabela: string): Promise<any[]> {
  const PAGE = 1000;
  let from = 0;
  const all: any[] = [];
  while (true) {
    const { data, error } = await (supabase as any)
      .from(tabela)
      .select("*")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    const chunk = data ?? [];
    all.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

/** Coleta todos os dados do sistema visíveis ao usuário atual. */
export async function coletarDados(): Promise<Record<string, any[]>> {
  const out: Record<string, any[]> = {};
  for (const t of TABELAS_BACKUP) out[t] = await lerTabela(t);
  return out;
}

export type ResultadoImport = {
  inseridos: number;
  atualizados: number;
  erros: string[];
  detalhes: { tabela: string; registros: number; erro?: string }[];
};

async function uid() {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error("Sessão expirada");
  return id;
}

/** Cria um backup completo e grava no banco. */
export async function criarBackup(
  tipo: "automatico" | "manual",
  referencia_dia = diaSP(),
  hora?: { hh: string; mm: string },
): Promise<BackupRow> {
  const user_id = await uid();
  const agora = new Date();
  const { h, m } = horaSP(agora);
  const hh = hora?.hh ?? String(h).padStart(2, "0");
  const mm = hora?.mm ?? String(m).padStart(2, "0");
  const nome = nomeBackup(referencia_dia, hh, mm);

  try {
    const dados = await coletarDados();
    const registros = Object.fromEntries(Object.entries(dados).map(([k, v]) => [k, v.length]));
    const json = JSON.stringify({ versao: 1, gerado_em: agora.toISOString(), dados });
    const tamanho_bytes = new Blob([json]).size;
    if (tipo === "automatico") {
      await (supabase as any)
        .from("backups")
        .delete()
        .eq("tipo", "automatico")
        .eq("referencia_dia", referencia_dia);
    }
    const { data, error } = await (supabase as any)
      .from("backups")
      .insert({
        user_id,
        nome,
        tipo,
        status: "concluido",
        erro_msg: null,
        tamanho_bytes,
        registros,
        conteudo: dados,
        referencia_dia,
      })
      .select()
      .single();
    if (error) throw error;
    return data as BackupRow;
  } catch (e: any) {
    const { data } = await (supabase as any)
      .from("backups")
      .insert({
        user_id,
        nome,
        tipo,
        status: "erro",
        erro_msg: e?.message ?? "Falha desconhecida",
        referencia_dia,
      })
      .select()
      .single();
    throw Object.assign(new Error(e?.message ?? "Falha ao gerar backup"), { registro: data });
  }
}

/** Exclui backups gerados há mais de X dias (padrão: 7 dias) para evitar consumo desnecessário de banco e egress. */
export async function limparBackupsAntigos(dias = 7): Promise<number> {
  const limite = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await (supabase as any)
    .from("backups")
    .delete()
    .lt("created_at", limite)
    .select("id");
  if (error) {
    console.error("Erro ao remover backups antigos:", error.message);
    return 0;
  }
  return data?.length ?? 0;
}

/** Garante que exista o backup automático diário das 23:59 e limpa registros com mais de 7 dias. */
export async function garantirBackupAutomatico(): Promise<BackupRow | null> {
  // Purga backups antigos (> 7 dias) em segundo plano
  await limparBackupsAntigos(7).catch(() => {});

  const hoje = diaSP();
  const { minutos } = horaSP();
  const fechouHoje = minutos >= 23 * 60 + 59;
  const alvo = fechouHoje
    ? hoje
    : diaSP(new Date(new Date(`${hoje}T12:00:00Z`).getTime() - 86400000));

  const { data } = await (supabase as any)
    .from("backups")
    .select("referencia_dia")
    .eq("tipo", "automatico")
    .eq("status", "concluido")
    .order("referencia_dia", { ascending: false })
    .limit(1);
  const ultimo = data?.[0]?.referencia_dia as string | undefined;
  if (ultimo && ultimo >= alvo) return null;
  return criarBackup("automatico", alvo, { hh: "23", mm: "59" });
}

function baixar(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function marcarExportado(id: string) {
  await (supabase as any).from("backups").update({ exportado_em: new Date().toISOString() }).eq("id", id);
}

export async function exportarJSON(b: BackupRow, dados?: Record<string, any[]>) {
  const conteudo = dados ?? b.conteudo ?? (await carregarConteudo(b.id));
  const payload = {
    versao: 1,
    sistema: "Orbit",
    backup: b.nome,
    gerado_em: b.created_at,
    exportado_em: new Date().toISOString(),
    dados: conteudo,
  };
  baixar(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `${b.nome}.json`);
  await marcarExportado(b.id);
}

function paraCelula(v: any) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

export async function exportarXLSX(b: BackupRow, dados?: Record<string, any[]>) {
  const conteudo = dados ?? b.conteudo ?? (await carregarConteudo(b.id));
  const wb = XLSX.utils.book_new();
  for (const [tabela, linhas] of Object.entries(conteudo)) {
    const rows = (linhas ?? []).map((r: any) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, paraCelula(v)])),
    );
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ vazio: "" }]);
    XLSX.utils.book_append_sheet(wb, ws, tabela.slice(0, 31));
  }
  XLSX.writeFile(wb, `${b.nome}.xlsx`);
  await marcarExportado(b.id);
}

function normalizarValor(v: any) {
  if (v === "" || v === undefined) return null;
  if (typeof v === "string") {
    const t = v.trim();
    if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
      try {
        return JSON.parse(t);
      } catch {
        return v;
      }
    }
  }
  return v;
}

/** Grava um conjunto de dados no banco (atualiza existentes / insere novos). */
export async function aplicarDados(dados: Record<string, any[]>): Promise<ResultadoImport> {
  const user_id = await uid();
  const res: ResultadoImport = { inseridos: 0, atualizados: 0, erros: [], detalhes: [] };

  // Respeita a ordem de dependências entre as tabelas.
  const ordem = TABELAS_BACKUP.filter((t) => Array.isArray(dados[t]) && dados[t].length);
  for (const tabela of ordem) {
    const linhas = (dados[tabela] ?? []).map((r: any) => {
      const clean: any = {};
      for (const [k, v] of Object.entries(r)) {
        if (v && typeof v === "object" && !Array.isArray(v) && "id" in (v as any) && k !== "registros") {
          continue; // ignora objetos de relacionamento (ex.: servidor)
        }
        clean[k] = normalizarValor(v);
      }
      clean.user_id = user_id;
      return clean;
    });

    const idsExistentes = new Set<string>();
    const ids = linhas.map((l: any) => l.id).filter(Boolean);
    for (let i = 0; i < ids.length; i += 500) {
      const { data } = await (supabase as any)
        .from(tabela)
        .select("id")
        .in("id", ids.slice(i, i + 500));
      (data ?? []).forEach((r: any) => idsExistentes.add(r.id));
    }

    let gravados = 0;
    let erroTabela: string | undefined;
    for (let i = 0; i < linhas.length; i += 100) {
      const chunk = linhas.slice(i, i + 100);
      const { error } = await (supabase as any).from(tabela).upsert(chunk, { onConflict: "id" });
      if (error) {
        // Fallback: tenta linha a linha para não perder o lote inteiro
        for (const item of chunk) {
          const { error: itemErr } = await (supabase as any).from(tabela).upsert(item, { onConflict: "id" });
          if (!itemErr) {
            gravados++;
          } else {
            erroTabela = itemErr.message;
          }
        }
      } else {
        gravados += chunk.length;
      }
    }
    if (erroTabela && gravados === 0) {
      res.erros.push(`${tabela}: ${erroTabela}`);
    }
    const atualizados = linhas.filter((l: any) => idsExistentes.has(l.id)).length;
    res.atualizados += Math.min(atualizados, gravados);
    res.inseridos += Math.max(gravados - atualizados, 0);
    res.detalhes.push({ tabela, registros: gravados, ...(erroTabela && gravados < linhas.length ? { erro: erroTabela } : {}) });
  }
  return res;
}

export async function carregarConteudo(id: string): Promise<Record<string, any[]>> {
  const { data, error } = await (supabase as any).from("backups").select("conteudo").eq("id", id).single();
  if (error) throw error;
  if (!data?.conteudo) throw new Error("Backup sem conteúdo armazenado");
  return data.conteudo as Record<string, any[]>;
}

export async function restaurarBackup(id: string): Promise<ResultadoImport> {
  return aplicarDados(await carregarConteudo(id));
}

export async function importarJSON(file: File): Promise<ResultadoImport> {
  const texto = await file.text();
  let parsed: any;
  try {
    parsed = JSON.parse(texto);
  } catch {
    throw new Error("Arquivo JSON inválido");
  }
  const dados = parsed?.dados ?? parsed;
  if (!dados || typeof dados !== "object") throw new Error("Estrutura do JSON não reconhecida");
  const conhecidas = Object.keys(dados).filter((k) => (TABELAS_BACKUP as readonly string[]).includes(k));
  if (!conhecidas.length) throw new Error("Nenhuma tabela conhecida encontrada no arquivo");
  return aplicarDados(dados);
}

export async function importarXLSX(file: File): Promise<ResultadoImport> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const dados: Record<string, any[]> = {};
  for (const nome of wb.SheetNames) {
    const alvo = (TABELAS_BACKUP as readonly string[]).find(
      (t) => t.toLowerCase() === nome.trim().toLowerCase(),
    );
    if (!alvo) continue;
    const rows = XLSX.utils.sheet_to_json<any>(wb.Sheets[nome], { defval: "" });
    dados[alvo] = rows.filter((r) => r && r.id);
  }
  if (!Object.keys(dados).length) throw new Error("Nenhuma planilha compatível encontrada");
  return aplicarDados(dados);
}
