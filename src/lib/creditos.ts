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
 * Retorna a quantidade de créditos correspondente ao valor do plano/assinatura:
 * - Até R$ 45 -> 1 crédito (~1 mês)
 * - R$ 46 a R$ 75 -> 2 créditos (~2 meses)
 * - R$ 76 a R$ 125 -> 3 créditos (~3 meses / Trimestral)
 * - R$ 126 a R$ 220 -> 6 créditos (~6 meses / Semestral)
 * - R$ 221 a R$ 450 -> 12 créditos (~12 meses / Anual)
 * - Acima disso -> proporcional a ~R$ 30 por crédito
 */
export function creditosPorValor(valorPago: number): number {
  const v = Number(valorPago || 0);
  if (v <= 0) return 1;
  if (v <= 45) return 1;
  if (v <= 75) return 2;
  if (v <= 125) return 3;
  if (v <= 220) return 6;
  if (v <= 450) return 12;
  return Math.max(1, Math.round(v / 30));
}

/**
 * Determina os créditos do ciclo atual do plano do cliente.
 * Prioriza:
 * 1. Valor da assinatura paga pelo cliente (valor_pago)
 * 2. Última renovação com duração <= 366 dias
 * 3. Período do ciclo atual se <= 366 dias
 */
export function creditosDoCliente(cliente: any, historico?: any[]): number {
  const valor = Number(cliente?.valor_pago || 0);

  // 1. Se o valor do plano/assinatura está definido, calcula diretamente por ele
  if (valor > 0) {
    return creditosPorValor(valor);
  }

  // 2. Histórico de renovação recente (se <= 366 dias)
  const ultima = Array.isArray(historico)
    ? historico
        .filter((h: any) => h?.cliente_id === cliente?.id && h.status !== "cancelada")
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    : null;
  if (ultima && Number(ultima.dias_adicionados) > 0 && Number(ultima.dias_adicionados) <= 366) {
    return creditosPorDias(Number(ultima.dias_adicionados));
  }

  // 3. Diferença entre datas se for de um ciclo razoável (<= 366 dias)
  if (cliente?.data_inicio && cliente?.data_vencimento) {
    const parse = (s: string) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const [y, m, d] = s.split("-").map(Number);
        return new Date(y, m - 1, d);
      }
      return new Date(s);
    };
    try {
      const ms = parse(cliente.data_vencimento).getTime() - parse(cliente.data_inicio).getTime();
      const dias = Math.round(ms / 86400000);
      if (dias > 0 && dias <= 366) {
        return creditosPorDias(dias);
      }
    } catch {}
  }

  return 1;
}

/**
 * Calcula o custo do plano do cliente com base no valor da assinatura e servidores,
 * assegurando que o custo seja proporcional ao período e mantendo o lucro positivo.
 */
export function custoCliente(cliente: any, historico?: any[]): number {
  const custoUnitario = Number(cliente?.servidor?.custo_mensal ?? cliente?.custo_snapshot ?? 0);
  const creditos = creditosDoCliente(cliente, historico);
  const valor = Number(cliente?.valor_pago || 0);

  let custoTotal = 0;

  if (custoUnitario > 0) {
    custoTotal = creditos * custoUnitario;
  } else if (valor > 0) {
    // Custo padrão de R$ 10 por crédito
    custoTotal = creditos * 10;
  } else {
    custoTotal = creditos * 10;
  }

  // Se o valor pago for informado (> 0), garante que o custo respeite uma margem saudável
  // para que o lucro permaneça estritamente positivo
  if (valor > 0 && custoTotal >= valor) {
    custoTotal = Math.round(Math.min(custoTotal, valor * 0.4) * 100) / 100;
  }

  return Math.round(custoTotal * 100) / 100;
}