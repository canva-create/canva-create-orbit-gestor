/** Helpers para enviar dados do sistema ao Google Sheets e ao Google Drive. */

const GW = "https://connector-gateway.lovable.dev";

function headers(connectorKey: string) {
  const lovable = process.env["LOVABLE_API_KEY"];
  const key = process.env[connectorKey];
  if (!lovable) throw new Error("LOVABLE_API_KEY não configurada");
  if (!key) throw new Error(`Conexão Google não configurada (${connectorKey})`);
  return {
    Authorization: `Bearer ${lovable}`,
    "X-Connection-Api-Key": key,
  } as Record<string, string>;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call(
  connector: "google_drive" | "google_sheets",
  path: string,
  init: RequestInit = {},
) {
  const keyName = connector === "google_drive" ? "GOOGLE_DRIVE_API_KEY" : "GOOGLE_SHEETS_API_KEY";
  // O Google limita as chamadas por minuto: em 429/5xx espera e tenta de novo.
  // As esperas são curtas para a sincronização inteira caber no tempo máximo
  // de uma requisição do servidor (senão o navegador mostra "Failed to fetch").
  let ultima = "";
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    let res: Response;
    try {
      res = await fetch(`${GW}/${connector}${path}`, {
        ...init,
        headers: { ...headers(keyName), ...(init.headers as Record<string, string> | undefined) },
        signal: AbortSignal.timeout(20000),
      });
    } catch (e: any) {
      ultima = `Google (${connector}) sem resposta: ${e?.message ?? "conexão interrompida"}`;
      await espera(1000 * (tentativa + 1));
      continue;
    }
    const texto = await res.text();
    if (res.ok) return texto ? JSON.parse(texto) : {};
    ultima = `Google (${connector}) ${res.status}: ${texto.slice(0, 400)}`;
    if (res.status !== 429 && res.status < 500) throw new Error(ultima);
    const retry = Number(res.headers.get("Retry-After"));
    await espera(Math.min(6000, retry > 0 ? retry * 1000 : 1500 * 2 ** tentativa));
  }
  throw new Error(ultima);
}

const FOLDER_MIME = "application/vnd.google-apps.folder";

/** Cria a pasta do sistema no Drive (se ainda não existir) e devolve o id. */
export async function criarPasta(nome: string): Promise<string> {
  const r = await call("google_drive", "/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: nome, mimeType: FOLDER_MIME }),
  });
  return r.id as string;
}

/** Procura uma pasta pelo nome; se não existir, cria. Evita pastas duplicadas. */
export async function garantirPasta(nome: string): Promise<string> {
  const q = encodeURIComponent(
    `name='${nome.replace(/'/g, "\\'")}' and mimeType='${FOLDER_MIME}' and trashed=false`,
  );
  try {
    const r = await call("google_drive", `/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`);
    const id = r.files?.[0]?.id as string | undefined;
    if (id) return id;
  } catch {
    /* sem permissão de busca: cria uma nova pasta */
  }
  return criarPasta(nome);
}

/**
 * Cria a planilha usando a própria API do Sheets (a conexão do Sheets precisa
 * ser a dona do arquivo, senão o Google devolve 403 PERMISSION_DENIED).
 * Depois tenta mover para a pasta de backups no Drive — se não conseguir,
 * a planilha continua funcionando na raiz do Drive.
 */
export async function criarPlanilha(nome: string, pastaId?: string): Promise<string> {
  const r = await call("google_sheets", "/v4/spreadsheets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ properties: { title: nome } }),
  });
  const id = r.spreadsheetId as string;
  if (pastaId) {
    try {
      await call("google_drive", `/drive/v3/files/${id}?addParents=${pastaId}&fields=id`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch {
      /* sem permissão para mover: mantém a planilha onde foi criada */
    }
  }
  return id;
}

/** Confere se a planilha pode ser lida/escrita pela conexão do Sheets. */
export async function planilhaAcessivel(id: string): Promise<boolean> {
  try {
    await call("google_sheets", `/v4/spreadsheets/${id}?fields=spreadsheetId`);
    return true;
  } catch {
    return false;
  }
}

/** Confere se um arquivo/pasta ainda existe e não está na lixeira. */
export async function existe(id: string): Promise<boolean> {
  try {
    const r = await call("google_drive", `/drive/v3/files/${id}?fields=id,trashed`);
    return !r.trashed;
  } catch {
    return false;
  }
}

/** Envia um arquivo (texto) para a pasta do Drive. */
export async function enviarArquivo(
  pastaId: string,
  nome: string,
  conteudo: string,
  mime = "application/json",
): Promise<{ id: string; link: string }> {
  const boundary = `orbit${Date.now()}`;
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify({ name: nome, parents: [pastaId] })}\r\n` +
    `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n${conteudo}\r\n--${boundary}--`;
  const r = await call(
    "google_drive",
    "/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  return { id: r.id as string, link: (r.webViewLink as string) ?? `https://drive.google.com/file/d/${r.id}` };
}

function celula(v: any) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function paraMatriz(linhas: any[]): string[][] {
  const colunas: string[] = [];
  for (const l of linhas) for (const k of Object.keys(l ?? {})) if (!colunas.includes(k)) colunas.push(k);
  if (!colunas.length) return [["vazio"]];
  return [colunas, ...linhas.map((l) => colunas.map((c) => celula(l?.[c])))];
}

/** Colunas da aba CLIENTES — mesma ordem da visualização de cadastros na dashboard. */
export const COLUNAS_CLIENTES = [
  "Cliente","Telefone","Servidor","Data Início","Vencimento","Status","Pagamento","Custo",
  "Valor Pago","Lucro","MAC","Device","Aplicativo","Observação","Categoria Servidor",
  "Dias p/ Vencer","Situação","Lembrete no dia","Lembrete 1 dia antes","Lembrete vencimento",
  "Lembrete após","Cadastrado em","Atualizado em","ID",
];

function dataBR(v: any, comHora = false) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric",
    ...(comHora ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(d);
}

function diasParaVencer(v: any): number | null {
  if (!v) return null;
  const hoje = new Date(new Date().toISOString().slice(0, 10));
  const alvo = new Date(String(v).slice(0, 10));
  if (isNaN(alvo.getTime())) return null;
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
}

/** Telefone no padrão (11) 99999-9999. */
function telefoneBR(v: any) {
  const d = String(v ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(v ?? "");
}

/** Mesma regra de custo usada na tela de Clientes (créditos x custo do servidor). */
function custoDoCliente(c: any, custoMensal: number, renovacoes: any[]): number {
  if (!custoMensal) return 0;
  let dias = 30;
  const ultima = renovacoes
    .filter((h: any) => h?.cliente_id === c?.id)
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  if (ultima && Number(ultima.dias_adicionados) > 0) {
    dias = Number(ultima.dias_adicionados);
  } else if (c?.data_inicio && c?.data_vencimento) {
    const ms = new Date(String(c.data_vencimento).slice(0, 10)).getTime() -
      new Date(String(c.data_inicio).slice(0, 10)).getTime();
    const calc = Math.round(ms / 86400000);
    if (calc > 0) dias = calc;
  }
  const creditos = Math.max(1, Math.round((dias / 30) * 10) / 10);
  return creditos * custoMensal;
}

/** Monta a aba CLIENTES com todos os cadastros, na mesma ordem da dashboard. */
export function matrizClientes(dados: Record<string, any[]>): (string | number)[][] {
  const servidores = new Map<string, any>((dados.servidores ?? []).map((s: any) => [s.id, s]));
  const renovacoes = dados.historico_renovacoes ?? [];
  const sim = (v: any) => (v ? "Sim" : "Não");
  const linhas = [...(dados.clientes ?? [])].sort((a: any, b: any) => {
    const va = a.data_vencimento ? new Date(a.data_vencimento).getTime() : Infinity;
    const vb = b.data_vencimento ? new Date(b.data_vencimento).getTime() : Infinity;
    if (va !== vb) return va - vb;
    return String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR", { sensitivity: "base" });
  });
  const corpo = linhas.map((c: any) => {
    const s = servidores.get(c.servidor_id);
    const custo = custoDoCliente(c, Number(s?.custo_mensal ?? c.custo_snapshot ?? 0), renovacoes);
    const d = diasParaVencer(c.data_vencimento);
    return [
      c.nome ?? "", telefoneBR(c.telefone), s?.nome ?? "", dataBR(c.data_inicio, true), dataBR(c.data_vencimento),
      c.status ?? "", c.status_pagamento ?? "", custo, Number(c.valor_pago || 0),
      Number(c.valor_pago || 0) - custo, c.mac ?? "", c.device ?? "", c.aplicativo ?? "",
      c.observacao ?? "", s?.categoria ?? "", d ?? "",
      d === null ? "Sem vencimento" : d < 0 ? `Vencido há ${Math.abs(d)} dia(s)` : d === 0 ? "Vence hoje" : `Faltam ${d} dia(s)`,
      sim(c.lembrete_no_dia), sim(c.lembrete_1_dia_antes), sim(c.lembrete_vencimento), sim(c.lembrete_apos),
      dataBR(c.created_at, true), dataBR(c.updated_at, true), c.id ?? "",
    ].map((v) => (typeof v === "number" ? v : celula(v)));
  });
  return [COLUNAS_CLIENTES, ...corpo];
}

/** CSV (separador ";") da lista completa de clientes, pronto para abrir no Excel. */
export function csvClientes(dados: Record<string, any[]>): string {
  const escapa = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const linhas = matrizClientes(dados).map((l) => l.map(escapa).join(";"));
  return "\uFEFF" + linhas.join("\r\n");
}

/** Regrava a planilha com os dados de cada tabela em uma aba própria (poucas chamadas para não estourar a cota). */
export async function gravarPlanilha(
  planilhaId: string,
  dados: Record<string, any[]>,
  titulo?: string,
): Promise<number> {
  const abas: Record<string, (string | number)[][]> = { CLIENTES_DASHBOARD: matrizClientes(dados) };
  for (const t of Object.keys(dados)) abas[t] = paraMatriz(dados[t] ?? []);
  const nomes = Object.keys(abas);

  // 1 leitura de metadados por sincronização.
  const meta = await call("google_sheets", `/v4/spreadsheets/${planilhaId}?fields=sheets.properties.title`);
  const existentes = new Set<string>((meta.sheets ?? []).map((s: any) => s.properties.title));

  const requests: any[] = nomes
    .filter((t) => !existentes.has(t))
    .map((t) => ({ addSheet: { properties: { title: t } } }));
  if (titulo) requests.push({ updateSpreadsheetProperties: { properties: { title: titulo }, fields: "title" } });
  if (requests.length) {
    await call("google_sheets", `/v4/spreadsheets/${planilhaId}:batchUpdate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    });
  }

  await call("google_sheets", `/v4/spreadsheets/${planilhaId}/values:batchClear`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ranges: nomes.map((t) => `${t}!A1:ZZ200000`) }),
  });

  // Escreve tudo em blocos, em vez de uma chamada por aba.
  const dadosValores = nomes.map((t) => ({ range: `${t}!A1`, values: abas[t] }));
  const BLOCO = 10;
  for (let i = 0; i < dadosValores.length; i += BLOCO) {
    await call("google_sheets", `/v4/spreadsheets/${planilhaId}/values:batchUpdate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valueInputOption: "RAW", data: dadosValores.slice(i, i + BLOCO) }),
    });
  }

  return nomes.reduce((acc, t) => acc + Math.max(0, abas[t].length - 1), 0);
}
