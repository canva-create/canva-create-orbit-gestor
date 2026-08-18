import { supabase } from "@/integrations/supabase/client";

export type CreditoMovTipo = "compra" | "ativacao" | "renovacao" | "ajuste_add" | "ajuste_rem" | "transferencia" | "venda_revendedor";

/**
 * Registra uma movimentação de créditos.
 * quantidade: positiva = entrada, negativa = saída.
 */
export async function registrarMovimentacaoCredito(args: {
  servidor_id: string;
  quantidade: number;
  tipo: CreditoMovTipo;
  motivo?: string;
  cliente_id?: string | null;
  compra_id?: string | null;
}) {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user || !args.servidor_id || !args.quantidade) return;
  await supabase.from("creditos_movimentacoes").insert({
    user_id: user.id,
    servidor_id: args.servidor_id,
    quantidade: args.quantidade,
    tipo: args.tipo,
    motivo: args.motivo ?? null,
    cliente_id: args.cliente_id ?? null,
    compra_id: args.compra_id ?? null,
  });
}

/**
 * 1 crédito = ~30 dias, com tolerância de +1 dia por mês:
 *  30-31 → 1, 60-62 → 2, 90-93 → 3, 180-186 → 6, 365 → 12.
 */
export function creditosPorDias(dias: number) {
  if (!dias || dias <= 0) return 0;
  return Math.max(1, Math.ceil(dias / 31));
}

/**
 * Calcula o custo do cliente = créditos do período × custo mensal do servidor.
 *
 * Quando `historico` é informado, usamos apenas a duração da ÚLTIMA renovação
 * daquele cliente (`dias_adicionados`). Isso evita somar o custo de todas as
 * renovações passadas: se a última foi de 1 mês, mostramos ×1; se foi de
 * 3 meses, ×3. Sem histórico, caímos no período data_inicio → data_vencimento.
 */
export function custoCliente(cliente: any, historico?: any[]): number {
  const custoMensal = Number(cliente?.servidor?.custo_mensal ?? cliente?.custo_snapshot ?? 0);
  if (!custoMensal) return 0;
  let dias = 30;
  const ultima = Array.isArray(historico)
    ? historico
        .filter((h: any) => h?.cliente_id === cliente?.id)
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    : null;
  if (ultima && Number(ultima.dias_adicionados) > 0) {
    dias = Number(ultima.dias_adicionados);
  } else if (cliente?.data_inicio && cliente?.data_vencimento) {
    const parse = (s: string) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const [y, m, d] = s.split("-").map(Number);
        return new Date(y, m - 1, d);
      }
      return new Date(s);
    };
    const ms = parse(cliente.data_vencimento).getTime() - parse(cliente.data_inicio).getTime();
    dias = Math.round(ms / 86400000);
  }
  const creditos = creditosPorDias(dias) || 1;
  return creditos * custoMensal;
}