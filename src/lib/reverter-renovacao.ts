import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirm";
import { creditosPorDias, registrarMovimentacaoCredito } from "@/lib/creditos";
import { addDaysISO, currencyBRL, diasParaVencer, formatDateBR, toISODate } from "@/lib/iptv";
import { logAudit } from "@/lib/audit";

/**
 * Reverte uma renovação específica (objeto de historico_renovacoes) ou a última renovação ativa de um cliente:
 * - Devolve os dias adicionados (restaura a data_vencimento anterior)
 * - Restaura status_pagamento e valor_pago anteriores
 * - Restaura status ('ativo' / 'vencido') conforme a data recalculada
 * - Estorna valor recebido, valor pendente, custo e lucro (marca como cancelada e zera valores)
 * - Devolve a quantidade exata de créditos consumidos ao servidor correspondente
 * - Remove eventuais lançamentos em historico_financeiro
 * - Registra auditoria completa
 */
export async function reverterRenovacaoRegistro(h: any, clienteArg?: any): Promise<boolean> {
  if (!h?.id) return false;

  const clienteId = h.cliente_id || clienteArg?.id;
  if (!clienteId) return false;

  // Busca o cliente atualizado no banco
  const { data: cli, error: eCli } = await supabase
    .from("clientes")
    .select("id, nome, data_vencimento, valor_pago, status_pagamento, status, servidor_id, servidor:servidores(id, nome, custo_mensal)")
    .eq("id", clienteId)
    .maybeSingle();

  if (eCli) {
    toast.error(eCli.message);
    return false;
  }

  const clienteNome = cli?.nome || clienteArg?.nome || (h.cliente as any)?.nome || "Cliente";
  const dias = Number(h.dias_adicionados || 0);
  const creditos = creditosPorDias(dias);
  const valorRecebido = Number(h.valor_recebido || 0);
  const valorPendente = Number(h.valor_pendente || 0);
  const valorTotal = valorRecebido + valorPendente;
  const custo = Number(h.custo || 0);

  const ok = await confirmDialog({
    title: "Reverter renovação?",
    description: `Cliente: ${clienteNome}\nRenovação de ${dias} dias (${formatDateBR(h.vencimento_anterior)} → ${formatDateBR(h.vencimento_novo)}).\n\nSerão removidos os ${dias} dias do vencimento, estornados ${currencyBRL(valorTotal)} de faturamento/pendência, o custo de ${currencyBRL(custo)} e o lucro, além da devolução de ${creditos} crédito(s) ao servidor.\n\nConfirma a reversão?`,
    confirmText: "Reverter renovação",
    cancelText: "Voltar",
    destructive: true,
  });
  if (!ok) return false;

  try {
    // 1. Localiza a renovação anterior ativa para recuperar vencimento, status e valor anteriores
    const { data: prevH } = await supabase
      .from("historico_renovacoes")
      .select("*")
      .eq("cliente_id", clienteId)
      .neq("id", h.id)
      .neq("status", "cancelada")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 2. Calcula a data de vencimento a ser restaurada
    let novoVenc: string | null = null;
    if (h.vencimento_anterior && typeof h.vencimento_anterior === "string" && h.vencimento_anterior.trim().length >= 10) {
      novoVenc = h.vencimento_anterior.slice(0, 10);
    } else if (prevH?.vencimento_novo) {
      novoVenc = String(prevH.vencimento_novo).slice(0, 10);
    } else if (cli?.data_vencimento && dias > 0) {
      novoVenc = addDaysISO(String(cli.data_vencimento).slice(0, 10), -dias);
    } else {
      novoVenc = cli?.data_vencimento ? String(cli.data_vencimento).slice(0, 10) : toISODate(new Date());
    }

    // 3. Determina status de pagamento e valor anterior
    let prevStatusPag: "pago" | "devendo" = "devendo";
    let prevValorPago = 0;
    if (prevH) {
      prevStatusPag = (prevH.status_pagamento as any) || (Number(prevH.valor_recebido || 0) > 0 ? "pago" : "devendo");
      prevValorPago = Number(prevH.valor_recebido || prevH.valor_pendente || 0);
    } else {
      prevStatusPag = "devendo";
      prevValorPago = 0;
    }

    // 4. Calcula o status ativo / vencido com base na data recalculada
    const dParaVencer = diasParaVencer(novoVenc);
    const targetStatus = (dParaVencer === null || dParaVencer >= 0) ? "ativo" : "vencido";

    // 5. Atualiza o cadastro do cliente
    const updates: any = {
      data_vencimento: novoVenc,
      valor_pago: prevValorPago,
      status_pagamento: prevStatusPag,
      status: targetStatus,
    };
    const { error: eUp } = await supabase.from("clientes").update(updates).eq("id", clienteId);
    if (eUp) throw eUp;

    // 6. Devolve os créditos ao servidor
    const servidorId = (cli as any)?.servidor_id || clienteArg?.servidor_id || null;
    if (servidorId && creditos > 0) {
      await registrarMovimentacaoCredito({
        servidor_id: servidorId,
        quantidade: creditos,
        tipo: "ajuste_add",
        motivo: `Reversão de renovação ${dias}d — ${clienteNome}`.trim(),
        cliente_id: clienteId,
      });
    }

    // 7. Marca o registro de renovação como cancelada e zera valores para garantir consistência financeira imediata
    const { error: eHist } = await supabase
      .from("historico_renovacoes")
      .update({
        status: "cancelada",
        cancelado_em: new Date().toISOString(),
        valor_recebido: 0,
        valor_pendente: 0,
        custo: 0,
        lucro: 0,
      } as any)
      .eq("id", h.id);
    if (eHist) throw eHist;

    // 8. Remove lançamentos vinculados em historico_financeiro caso existam
    try {
      await supabase
        .from("historico_financeiro")
        .delete()
        .eq("cliente_id", clienteId)
        .eq("tipo", "renovacao");
    } catch {}

    // 9. Auditoria
    await logAudit({
      categoria: "renovacao",
      acao: "cancelar",
      descricao: `Renovação de "${clienteNome}" revertida (${dias} dias / ${currencyBRL(valorTotal)} estornados, ${creditos} crédito(s) devolvidos)`,
      entidade: "historico_renovacoes",
      entidade_id: h.id,
      entidade_nome: clienteNome,
      dados_anteriores: {
        data_vencimento: cli?.data_vencimento,
        valor_recebido: h.valor_recebido,
        valor_pendente: h.valor_pendente,
        custo: h.custo,
        lucro: h.lucro,
        status_pagamento: h.status_pagamento,
      },
      dados_novos: {
        data_vencimento: novoVenc,
        status_pagamento: prevStatusPag,
        valor_pago: prevValorPago,
        status: targetStatus,
        creditos_devolvidos: creditos,
      },
    });

    toast.success("Renovação revertida com sucesso! Dias, valores e créditos foram restaurados.");
    return true;
  } catch (e: any) {
    toast.error(e?.message ?? "Falha ao reverter renovação");
    return false;
  }
}

/**
 * Reverte a ÚLTIMA renovação ativa de um cliente
 */
export async function reverterUltimaRenovacao(cliente: any): Promise<boolean> {
  if (!cliente?.id) return false;

  const { data: h, error: eH } = await supabase
    .from("historico_renovacoes")
    .select("*")
    .eq("cliente_id", cliente.id)
    .neq("status", "cancelada")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (eH) {
    toast.error(eH.message);
    return false;
  }
  if (!h) {
    toast.error("Nenhuma renovação ativa para reverter.");
    return false;
  }

  return reverterRenovacaoRegistro(h, cliente);
}
