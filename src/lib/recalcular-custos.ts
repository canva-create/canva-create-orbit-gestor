import { supabase } from "@/integrations/supabase/client";
import { creditosPorDias } from "./creditos";
import { logAudit } from "./audit";

export interface ItemAnaliseCustoCliente {
  id: string;
  nome: string;
  telefone: string | null;
  servidorId: string | null;
  servidorNome: string;
  custoMensalServidor: number;
  dataInicio: string | null;
  dataVencimento: string | null;
  diasPeriodo: number;
  creditosProporcionais: number;
  custoSnapshotAtual: number;
  custoSnapshotEsperado: number;
  custoProporcionalPeriodo: number;
  valorPago: number;
  statusPagamento: string;
  discrepante: boolean;
  motivoDiscrepancia?: string;
}

export interface ResumoAnaliseCustos {
  totalClientes: number;
  comServidor: number;
  semServidor: number;
  custosDiscrepantes: number;
  custosEmDia: number;
  totalCreditosProporcionais: number;
  itens: ItemAnaliseCustoCliente[];
}

/**
 * Calcula os dias de duração do ciclo do cliente a partir de data_inicio e data_vencimento
 * ou fallback padrão (30 dias).
 */
export function calcularDiasPeriodo(dataInicio?: string | null, dataVencimento?: string | null): number {
  if (dataInicio && dataVencimento) {
    const parse = (s: string) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const [y, m, d] = s.split("-").map(Number);
        return new Date(y, m - 1, d);
      }
      return new Date(s);
    };
    try {
      const ms = parse(dataVencimento).getTime() - parse(dataInicio).getTime();
      const dias = Math.round(ms / 86400000);
      if (dias > 0) return dias;
    } catch {}
  }
  return 30;
}

/**
 * Analisa a base completa de clientes para diagnosticar discrepâncias de custos e calcular proporcionalidade.
 */
export function analisarBaseClientes(
  clientes: any[],
  servidores: any[],
  historico?: any[],
): ResumoAnaliseCustos {
  const servMap = new Map<string, any>();
  servidores.forEach((s: any) => servMap.set(s.id, s));

  let comServidor = 0;
  let semServidor = 0;
  let custosDiscrepantes = 0;
  let custosEmDia = 0;
  let totalCreditosProporcionais = 0;

  const itens: ItemAnaliseCustoCliente[] = clientes.map((c: any) => {
    const sId = c.servidor_id ?? c.servidor?.id ?? null;
    const serv = sId ? servMap.get(sId) ?? c.servidor : c.servidor ?? null;
    const servNome = serv?.nome ?? (sId ? "Servidor desconhecido" : "Sem servidor");
    const custoMensalServ = Number(serv?.custo_mensal ?? 0);

    if (sId) {
      comServidor++;
    } else {
      semServidor++;
    }

    // Calcula duração da última renovação ou período data_inicio -> data_vencimento
    let dias = 30;
    const ultima = Array.isArray(historico)
      ? historico
          .filter((h: any) => h?.cliente_id === c?.id && h.status !== "cancelada")
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
      : null;

    if (ultima && Number(ultima.dias_adicionados) > 0) {
      dias = Number(ultima.dias_adicionados);
    } else {
      dias = calcularDiasPeriodo(c.data_inicio, c.data_vencimento);
    }

    const creditos = creditosPorDias(dias) || 1;
    totalCreditosProporcionais += creditos;

    const custoSnapshotAtual = Number(c.custo_snapshot ?? 0);
    // O custo_snapshot no cadastro representa o custo mensal base unitário do servidor (ou fallback existente)
    const custoSnapshotEsperado = serv ? custoMensalServ : custoSnapshotAtual;
    const custoProporcionalPeriodo = creditos * (serv ? custoMensalServ : custoSnapshotAtual);

    let discrepante = false;
    let motivoDiscrepancia: string | undefined;

    if (serv) {
      if (Math.abs(custoSnapshotAtual - custoSnapshotEsperado) > 0.009) {
        discrepante = true;
        motivoDiscrepancia = `Custo snapshot cadastrado (R$ ${custoSnapshotAtual.toFixed(2)}) difere do servidor ${serv.nome} (R$ ${custoSnapshotEsperado.toFixed(2)}).`;
      }
    } else if (custoSnapshotAtual === 0) {
      discrepante = true;
      motivoDiscrepancia = "Cliente sem servidor e com custo_snapshot zerado.";
    }

    if (discrepante) {
      custosDiscrepantes++;
    } else {
      custosEmDia++;
    }

    return {
      id: c.id,
      nome: c.nome || "Sem nome",
      telefone: c.telefone ?? null,
      servidorId: sId,
      servidorNome: servNome,
      custoMensalServidor: custoMensalServ,
      dataInicio: c.data_inicio ?? null,
      dataVencimento: c.data_vencimento ?? null,
      diasPeriodo: dias,
      creditosProporcionais: creditos,
      custoSnapshotAtual,
      custoSnapshotEsperado,
      custoProporcionalPeriodo,
      valorPago: Number(c.valor_pago || 0),
      statusPagamento: c.status_pagamento || "devendo",
      discrepante,
      motivoDiscrepancia,
    };
  });

  return {
    totalClientes: clientes.length,
    comServidor,
    semServidor,
    custosDiscrepantes,
    custosEmDia,
    totalCreditosProporcionais,
    itens,
  };
}

/**
 * Executa a atualização em massa dos custos dos clientes no Supabase em lotes de 50.
 */
export async function atualizarCustosClientesEmMassa(args: {
  itens: ItemAnaliseCustoCliente[];
  apenasDiscrepantes?: boolean;
  onProgress?: (progress: { total: number; done: number; pct: number }) => void;
}): Promise<{ total: number; atualizados: number; falhas: number }> {
  const { itens, apenasDiscrepantes = false, onProgress } = args;
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error("Usuário não autenticado.");

  const alvos = apenasDiscrepantes ? itens.filter((i) => i.discrepante) : itens;
  const total = alvos.length;

  if (total === 0) {
    return { total: 0, atualizados: 0, falhas: 0 };
  }

  let atualizados = 0;
  let falhas = 0;
  const BATCH_SIZE = 50;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const chunk = alvos.slice(i, i + BATCH_SIZE);

    // Atualiza individualmente dentro do lote para preservar o custo_snapshot individualizado de cada servidor
    await Promise.all(
      chunk.map(async (item) => {
        try {
          const { error } = await supabase
            .from("clientes")
            .update({
              custo_snapshot: item.custoSnapshotEsperado,
              updated_at: new Date().toISOString(),
            })
            .eq("id", item.id);

          if (error) {
            console.error(`Erro ao atualizar cliente ${item.id} (${item.nome}):`, error);
            falhas++;
          } else {
            atualizados++;
          }
        } catch (err) {
          console.error(`Exceção ao atualizar cliente ${item.id}:`, err);
          falhas++;
        }
      }),
    );

    const done = Math.min(total, i + chunk.length);
    const pct = Math.round((done / total) * 100);
    onProgress?.({ total, done, pct });
  }

  await logAudit({
    categoria: "cliente",
    acao: "atualizacao_massa_custos",
    descricao: `Atualização em massa de custos proporcionais: ${atualizados} cliente(s) atualizado(s) de ${total} analisados.`,
    entidade: "clientes",
    metadata: {
      total,
      atualizados,
      falhas,
      apenasDiscrepantes,
    },
  });

  return { total, atualizados, falhas };
}
