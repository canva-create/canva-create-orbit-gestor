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

export function parseDateOnly(iso: string | Date | null | undefined): Date {
  if (!iso) return new Date();
  if (iso instanceof Date) {
    return new Date(iso.getFullYear(), iso.getMonth(), iso.getDate(), 0, 0, 0, 0);
  }
  const str = String(iso).trim();
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const [, y, mon, d] = m;
    return new Date(Number(y), Number(mon) - 1, Number(d), 0, 0, 0, 0);
  }
  const parsed = parseISO(str);
  if (!isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0);
  }
  return new Date();
}

export function formatDateBR(iso: string | Date | null | undefined) {
  if (!iso) return "-";
  if (typeof iso === "string") {
    const str = iso.trim();
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(str) || str.includes("T00:00:00");
    if (isDateOnly) {
      const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) {
        const [, y, mon, d] = m;
        return `${d.padStart(2, "0")}/${mon.padStart(2, "0")}/${y}`;
      }
    }
  }
  const d = parseDateOnly(iso);
  return format(d, "dd/MM/yyyy");
}

export function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function diasParaVencer(dataVenc: string | Date | null | undefined) {
  if (!dataVenc) return null;
  const target = parseDateOnly(dataVenc);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return differenceInCalendarDays(target, today);
}

export function addDaysISO(iso: string | Date | null | undefined, days: number) {
  const base = iso ? parseDateOnly(iso) : new Date();
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0, 0);
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

export interface FaixaPrecoPlano {
  meses: number;
  labelPeriodo: string;
  min: number;
  max: number;
  sugestao: number;
  valoresRapidos: number[];
  isDiscrepante: (valor: number) => boolean;
  mensagemDiscrepancia?: (valor: number) => string;
}

/**
 * Retorna a faixa esperada de valores (R$) e sugestões para um dado número de dias.
 * - 1 mês (~30-31d): R$ 25 a R$ 35 (médio: 30)
 * - 2 meses (~60-62d): R$ 50 a R$ 70 (médio: 60)
 * - 3 meses (~90-93d): R$ 85 a R$ 110 (médio: 90)
 * - 6 meses (~180-186d): R$ 150 a R$ 190 (médio: 160)
 * - 12 meses (~365d): R$ 250 a R$ 350 (médio: 250)
 */
export function getFaixaPrecoEsperada(dias: number, baseMensalCliente?: number): FaixaPrecoPlano {
  const baseMensal = (baseMensalCliente && baseMensalCliente >= 20 && baseMensalCliente <= 40)
    ? baseMensalCliente
    : 30;

  if (dias <= 35) {
    // 1 Mês (~30 a 31 dias) -> 25 a 35 reais
    const min = 25;
    const max = 35;
    const sugestao = baseMensal;
    return {
      meses: 1,
      labelPeriodo: "1 mês (~30 dias)",
      min,
      max,
      sugestao,
      valoresRapidos: [25, 30, 35],
      isDiscrepante: (val: number) => val > 0 && (val < min || val > max),
      mensagemDiscrepancia: (val: number) =>
        `Para 1 mês (${dias} dias), o valor esperado fica entre ${currencyBRL(min)} e ${currencyBRL(max)}. Valor digitado: ${currencyBRL(val)}.`,
    };
  } else if (dias <= 70) {
    // 2 Meses (~60 a 62 dias) -> 50 a 70 reais
    const min = 50;
    const max = 70;
    const sugestao = Math.min(max, Math.max(min, baseMensal * 2));
    return {
      meses: 2,
      labelPeriodo: "2 meses (~60 dias)",
      min,
      max,
      sugestao,
      valoresRapidos: [50, 60, 70],
      isDiscrepante: (val: number) => val > 0 && (val < min || val > max),
      mensagemDiscrepancia: (val: number) =>
        `Para 2 meses (${dias} dias), o valor esperado fica entre ${currencyBRL(min)} e ${currencyBRL(max)}. Valor digitado: ${currencyBRL(val)}.`,
    };
  } else if (dias <= 110) {
    // 3 Meses (~90 a 93 dias) -> 85 a 110 reais
    const min = 85;
    const max = 110;
    const sugestao = 90;
    return {
      meses: 3,
      labelPeriodo: "3 meses (Trimestral)",
      min,
      max,
      sugestao,
      valoresRapidos: [85, 90, 100],
      isDiscrepante: (val: number) => val > 0 && (val < min || val > max),
      mensagemDiscrepancia: (val: number) =>
        `Para 3 meses (${dias} dias), o valor esperado fica entre ${currencyBRL(min)} e ${currencyBRL(max)}. Valor digitado: ${currencyBRL(val)}.`,
    };
  } else if (dias <= 210) {
    // 6 Meses (~180 a 186 dias) -> 150 a 190 reais
    const min = 150;
    const max = 190;
    const sugestao = 160;
    return {
      meses: 6,
      labelPeriodo: "6 meses (Semestral)",
      min,
      max,
      sugestao,
      valoresRapidos: [150, 160, 180],
      isDiscrepante: (val: number) => val > 0 && (val < min || val > max),
      mensagemDiscrepancia: (val: number) =>
        `Para 6 meses (${dias} dias), o valor esperado fica entre ${currencyBRL(min)} e ${currencyBRL(max)}. Valor digitado: ${currencyBRL(val)}.`,
    };
  } else if (dias <= 400) {
    // 12 Meses (~365 dias) -> 250 a 350 reais
    const min = 250;
    const max = 350;
    const sugestao = 250;
    return {
      meses: 12,
      labelPeriodo: "12 meses (Anual)",
      min,
      max,
      sugestao,
      valoresRapidos: [250, 280, 300],
      isDiscrepante: (val: number) => val > 0 && (val < min || val > max),
      mensagemDiscrepancia: (val: number) =>
        `Para 12 meses / Anual (${dias} dias), o valor esperado fica entre ${currencyBRL(min)} e ${currencyBRL(max)}. Valor digitado: ${currencyBRL(val)}.`,
    };
  } else {
    // Personalizado
    const meses = Math.max(1, Math.round(dias / 30));
    const min = Math.round(meses * 22);
    const max = Math.round(meses * 38);
    const sugestao = Math.round(meses * 25);
    return {
      meses,
      labelPeriodo: `${meses} meses (${dias} dias)`,
      min,
      max,
      sugestao,
      valoresRapidos: [min, sugestao, max],
      isDiscrepante: (val: number) => val > 0 && (val < min || val > max),
      mensagemDiscrepancia: (val: number) =>
        `Para ${meses} meses (${dias} dias), o valor esperado fica entre ${currencyBRL(min)} e ${currencyBRL(max)}. Valor digitado: ${currencyBRL(val)}.`,
    };
  }
}