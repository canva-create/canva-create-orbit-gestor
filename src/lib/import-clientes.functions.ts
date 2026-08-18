import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  rows: z.array(z.record(z.string(), z.any())),
  servidores: z.array(z.object({ id: z.string(), nome: z.string() })),
});

export type NormalizedRow = {
  nome: string;
  telefone: string;
  servidor_id: string | null;
  servidor_nome_original: string | null;
  data_inicio: string | null;
  data_vencimento: string | null;
  status: string;
  status_pagamento: string;
  valor_pago: number;
  mac: string;
  device: string;
  aplicativo: string;
  observacao: string;
  errors: string[];
};

export type ColumnMapping = { field: string; column: string | null };

const STATUSES = ["ativo", "teste", "vencido", "cancelado", "suspenso"];
const PAGAMENTOS = ["pago", "devendo"];

// Normalização determinística no cliente/servidor sem chamar IA.
// Suporta planilhas grandes (milhares de linhas) sem timeout.

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const FIELD_ALIASES: Record<string, string[]> = {
  nome: ["nome", "cliente", "clientes", "usuario", "user", "assinante"],
  telefone: ["telefone", "celular", "whatsapp", "whats", "fone", "tel", "contato"],
  servidor: ["servidor", "server", "painel", "plano", "linha"],
  data_inicio: ["datainicio", "inicio", "criacao", "cadastro", "datacriacao", "datacadastro"],
  data_vencimento: ["vencimento", "datavencimento", "venc", "datavenc", "vence", "expira", "expiracao"],
  status: ["status", "situacao", "estado"],
  status_pagamento: ["pagamento", "statuspagamento", "pgto", "pago"],
  valor_pago: ["valor", "valorpago", "preco", "price", "mensalidade"],
  mac: ["mac", "macaddress"],
  device: ["device", "aparelho", "dispositivo", "tv"],
  aplicativo: ["aplicativo", "app", "player"],
  observacao: ["observacao", "obs", "nota", "notas", "comentario"],
};

function buildColMap(sample: Record<string, unknown>): Record<string, string> {
  const map: Record<string, string> = {};
  const keys = Object.keys(sample);
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const found = keys.find((k) => aliases.includes(norm(k)));
    if (found) map[field] = found;
  }
  return map;
}

function parseDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  // Excel serial number
  if (typeof v === "number" && isFinite(v)) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
    const dd = d.padStart(2, "0");
    const mm = mo.padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function parseNumber(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

function normalizeStatus(v: unknown): string {
  const s = norm(String(v ?? ""));
  if (!s) return "ativo";
  if (STATUSES.includes(s)) return s;
  if (s.startsWith("ativ")) return "ativo";
  if (s.startsWith("test")) return "teste";
  if (s.startsWith("venc")) return "vencido";
  if (s.startsWith("canc")) return "cancelado";
  if (s.startsWith("susp")) return "suspenso";
  return "ativo";
}

function normalizePagamento(v: unknown): string {
  const s = norm(String(v ?? ""));
  if (!s) return "devendo";
  if (s.startsWith("pag") || s === "ok" || s === "sim" || s === "quitado") return "pago";
  if (s.startsWith("dev") || s.startsWith("pend") || s.startsWith("aber") || s === "nao") return "devendo";
  return "devendo";
}

export const normalizeImportRows = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }): Promise<{ rows: NormalizedRow[]; mapping: ColumnMapping[]; unmapped: string[] }> => {
    if (data.rows.length === 0) return { rows: [], mapping: [], unmapped: [] };

    const servMap = new Map(data.servidores.map((s) => [norm(s.nome), s.id]));
    const colMap = buildColMap(data.rows[0]);
    const mapping: ColumnMapping[] = Object.keys(FIELD_ALIASES).map((f) => ({ field: f, column: colMap[f] ?? null }));
    const mappedCols = new Set(Object.values(colMap));
    const unmapped = Object.keys(data.rows[0]).filter((k) => !mappedCols.has(k));

    const results: NormalizedRow[] = [];
    for (const raw of data.rows) {
      const get = (field: string): unknown => {
        const col = colMap[field];
        return col ? (raw as any)[col] : undefined;
      };

      const nome = String(get("nome") ?? "").trim();
      const telefone = String(get("telefone") ?? "").replace(/\D/g, "");
      const servNome = String(get("servidor") ?? "").trim();
      const servId = servNome ? servMap.get(norm(servNome)) ?? null : null;
      const data_inicio = parseDate(get("data_inicio"));
      const data_vencimento = parseDate(get("data_vencimento"));
      const status = normalizeStatus(get("status"));
      const status_pagamento = normalizePagamento(get("status_pagamento"));
      const valor_pago = parseNumber(get("valor_pago"));
      const mac = String(get("mac") ?? "").trim();
      const device = String(get("device") ?? "").trim();
      const aplicativo = String(get("aplicativo") ?? "").trim();
      const observacao = String(get("observacao") ?? "").trim();

      const hasAny =
        nome || telefone || servNome || data_vencimento || data_inicio || valor_pago ||
        mac || device || aplicativo || observacao;
      if (!hasAny) continue;

      const errors: string[] = [];
      if (!nome) errors.push("Nome obrigatório");
      if (servNome && !servId) errors.push(`Servidor "${servNome}" não encontrado`);

      results.push({
        nome,
        telefone,
        servidor_id: servId,
        servidor_nome_original: servNome || null,
        data_inicio,
        data_vencimento,
        status,
        status_pagamento,
        valor_pago,
        mac,
        device,
        aplicativo,
        observacao,
        errors,
      });
    }

    return { rows: results, mapping, unmapped };
  });