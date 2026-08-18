import { differenceInCalendarDays, format, parseISO } from "date-fns";

export function maskPhoneBR(v: string) {
  const raw = (v ?? "").trim();
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return hasPlus ? "+" : "";

  // Formata a parte local BR: (DD) NNNNN-NNNN ou (DD) NNNN-NNNN
  const formatBRLocal = (d: string) => {
    const dd = d.slice(0, 2);
    const rest = d.slice(2);
    if (d.length <= 2) return `(${dd}`;
    if (rest.length <= 4) return `(${dd}) ${rest}`;
    if (rest.length <= 8) return `(${dd}) ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
    return `(${dd}) ${rest.slice(0, 5)}-${rest.slice(5, 9)}`;
  };

  // Formato +1 (AAA) PPP-NNNN (EUA/Canadá)
  const formatUS = (d: string) => {
    if (d.length <= 3) return `+1 (${d}`;
    if (d.length <= 6) return `+1 (${d.slice(0, 3)}) ${d.slice(3)}`;
    return `+1 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
  };

  // Formato genérico +CC AAA AAA AAA (grupos de 3)
  const formatIntl = (cc: string, rest: string) => {
    const groups = rest.match(/.{1,3}/g) ?? [];
    return groups.length ? `+${cc} ${groups.join(" ")}` : `+${cc}`;
  };

  // Caso internacional: usuário digitou "+" ou passou de 11 dígitos.
  if (hasPlus || digits.length > 11) {
    if (digits.startsWith("55") && digits.length >= 12) {
      return `+55 ${formatBRLocal(digits.slice(2, 13))}`;
    }
    if (digits.startsWith("1") && (hasPlus || digits.length >= 11)) {
      return formatUS(digits.slice(1, 11));
    }
    // Detecta código do país (1 a 3 dígitos). Prioriza CC de 3 dígitos
    // quando sobrarem 9+ dígitos após o CC.
    let cc = digits.slice(0, 1);
    let rest = digits.slice(1);
    if (digits.length >= 12) { cc = digits.slice(0, 3); rest = digits.slice(3); }
    else if (digits.length >= 10) { cc = digits.slice(0, 2); rest = digits.slice(2); }
    return formatIntl(cc, rest.slice(0, 12));
  }

  return formatBRLocal(digits.slice(0, 11));
}

export function maskMAC(v: string) {
  const d = v.replace(/[^0-9a-zA-Z]/g, "").slice(0, 12).toUpperCase();
  return d.match(/.{1,2}/g)?.join(":") ?? "";
}

export function currencyBRL(v: number | string | null | undefined) {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  return (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDateTimeBR(iso: string | Date | null | undefined) {
  if (!iso) return "-";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return format(d, "dd/MM/yyyy HH:mm:ss");
}

export function formatDateBR(iso: string | Date | null | undefined) {
  if (!iso) return "-";
  const d = typeof iso === "string" ? parseDateOnly(iso) : iso;
  return format(d, "dd/MM/yyyy");
}

export function parseDateOnly(iso: string) {
  // handle YYYY-MM-DD without TZ shift
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return parseISO(iso);
}

export function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function diasParaVencer(dataVenc: string | null | undefined) {
  if (!dataVenc) return null;
  return differenceInCalendarDays(parseDateOnly(dataVenc), new Date());
}

export function addDaysISO(iso: string | null | undefined, days: number) {
  const base = iso ? parseDateOnly(iso) : new Date();
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function whatsappLink(phone: string) {
  const raw = (phone ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  // Se tem "+" ou já veio com código de país (>11 dígitos), usa como está.
  const full = raw.startsWith("+") || digits.length > 11 ? digits : `55${digits}`;
  // Link padrão wa.me (abre no WhatsApp Web ou no app instalado).
  return `https://wa.me/${full}`;
}

/**
 * Converte um telefone para o formato E.164 aceito pelo WhatsApp (apenas dígitos, com código de país).
 * - Números começando com "+" ou com mais de 11 dígitos são tratados como já internacionais.
 * - Números BR (10 ou 11 dígitos) recebem o prefixo 55.
 * Retorna { digits, valid, reason } — quando inválido, `reason` explica o motivo.
 */
export function phoneToE164(phone: string): { digits: string; valid: boolean; reason?: string } {
  const raw = (phone ?? "").trim();
  if (!raw) return { digits: "", valid: false, reason: "Número não informado" };
  const digits = raw.replace(/\D/g, "");
  if (!digits) return { digits: "", valid: false, reason: "Número não contém dígitos" };

  // Internacional (usuário digitou "+" ou já veio com código do país)
  if (raw.startsWith("+") || digits.length > 11) {
    if (digits.length < 8) return { digits, valid: false, reason: "Número internacional muito curto" };
    if (digits.length > 15) return { digits, valid: false, reason: "Número internacional inválido (máx. 15 dígitos)" };
    return { digits, valid: true };
  }

  // Nacional BR: 10 (fixo) ou 11 (celular) dígitos → adiciona +55.
  if (digits.length === 10 || digits.length === 11) {
    return { digits: `55${digits}`, valid: true };
  }

  return {
    digits,
    valid: false,
    reason: digits.length < 10 ? "Número incompleto (mínimo 10 dígitos)" : "Formato de número inválido",
  };
}

export const STATUS_CLIENTE = [
  { value: "ativo", label: "ATIVO", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" },
  { value: "teste", label: "TESTE", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40" },
  { value: "vencido", label: "VENCIDO", color: "bg-red-500/20 text-red-400 border-red-500/40" },
  { value: "cancelado", label: "CANCELADO", color: "bg-zinc-500/20 text-zinc-300 border-zinc-500/40" },
  { value: "suspenso", label: "SUSPENSO", color: "bg-blue-500/20 text-blue-400 border-blue-500/40" },
] as const;

export type StatusCliente = (typeof STATUS_CLIENTE)[number]["value"];

export function statusMeta(s: string) {
  return STATUS_CLIENTE.find((x) => x.value === s) ?? STATUS_CLIENTE[0];
}