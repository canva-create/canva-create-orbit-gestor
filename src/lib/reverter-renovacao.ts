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
 * - Cancela eventuais liquidações avulsas atreladas (dias_adicionados = 0)
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
  const isDevendo = h.status_pagamento === "devendo";

  const descDialog = dias > 0
    ? `Cliente: ${clienteNome}\nRenovação de ${dias} dias (${formatDateBR(h.vencimento_anterior)} → ${formatDateBR(h.vencimento_novo)}).\nStatus: ${isDevendo ? "DEVENDO / PENDENTE" : "PAGO"}\n\nSerão removidos os ${dias} dias, estornados ${currencyBRL(valorTotal)} (${isDevendo ? "pendência" : "faturamento"}), custo de ${currencyBRL(custo)} e devolvidos ${creditos} crédito(s) ao saldo do servidor.\n\nConfirma a reversão?`
    : `Cliente: ${clienteNome}\nEstorno de recebimento de ${currencyBRL(valorRecebido)} (liquidação de pendência).\n\nO valor será retirado do faturamento e a pendência restaurada.\n\nConfirma a reversão?`;

  const ok = await confirmDialog({
    title: "Reverter renovação?",
    description: descDialog,
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

    // 8. Se houver liquidação avulsa atrelada (dias_adicionados = 0), cancela também
    if (dias > 0) {
      const { data: settlements } = await supabase
        .from("historico_renovacoes")
        .select("id")
        .eq("cliente_id", clienteId)
        .eq("dias_adicionados", 0)
        .neq("status", "cancelada");

      if (settlements && settlements.length > 0) {
        for (const st of settlements) {
          await supabase
            .from("historico_renovacoes")
            .update({
              status: "cancelada",
              cancelado_em: new Date().toISOString(),
              valor_recebido: 0,
              valor_pendente: 0,
              custo: 0,
              lucro: 0,
            } as any)
            .eq("id", st.id);
        }
      }
    }

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

    toast.success(
      creditos > 0
        ? `Renovação revertida: ${creditos} crédito(s) devolvido(s) e vencimento restaurado para ${formatDateBR(novoVenc)}.`
        : `Renovação revertida e vencimento restaurado para ${formatDateBR(novoVenc)}.`
    );
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

/**
 * Reverte ou exclui um lançamento financeiro/faturamento específico (Cliente, Revendedor ou Ativação de App).
 */
export async function reverterLancamentoFaturamento(item: {
  id: string;
  tipo: "cliente" | "revendedor" | "ativacao" | "ativacao_app";
  raw?: any;
  descricao?: string;
  valor?: number;
}): Promise<boolean> {
  if (!item?.id) return false;

  if (item.tipo === "cliente") {
    let h = item.raw;
    if (!h || !h.cliente_id) {
      const { data } = await supabase
        .from("historico_renovacoes")
        .select("*, cliente:clientes(id, nome, data_vencimento, servidor_id, servidor:servidores(id, nome, custo_mensal))")
        .eq("id", item.id)
        .maybeSingle();
      h = data;
    }
    if (!h) {
      toast.error("Lançamento de cliente não encontrado.");
      return false;
    }
    return reverterRenovacaoRegistro(h);
  }

  if (item.tipo === "revendedor") {
    let m = item.raw;
    if (!m || !m.revendedor_id) {
      const { data } = await supabase
        .from("revendedores_movimentacoes")
        .select("*, revendedor:revendedores(id, nome)")
        .eq("id", item.id)
        .maybeSingle();
      m = data;
    }
    if (!m) {
      toast.error("Lançamento de revendedor não encontrado.");
      return false;
    }

    const revNome = m.revendedor?.nome ?? item.descricao ?? "Revendedor";
    const qtd = Number(m.quantidade || 0);
    const valor = Number(m.valor_pago || m.valor_venda || item.valor || 0);

    const ok = await confirmDialog({
      title: "Reverter faturamento de revendedor?",
      description: `Revendedor: ${revNome}\nQuantidade: ${qtd} crédito(s)\nValor: ${currencyBRL(valor)}\n\nO faturamento será cancelado, ${qtd} crédito(s) serão estornados ao servidor e deduzidos do saldo do revendedor.\n\nConfirma a reversão?`,
      confirmText: "Reverter faturamento",
      cancelText: "Voltar",
      destructive: true,
    });
    if (!ok) return false;

    try {
      const user = (await supabase.auth.getUser()).data.user;
      const { error: upErr } = await supabase
        .from("revendedores_movimentacoes")
        .update({
          status_venda: "cancelada",
          cancelada_em: new Date().toISOString(),
          cancelada_por: user?.id ?? null,
          motivo_cancelamento: "Reversão direta pelo Faturamento",
        })
        .eq("id", m.id);
      if (upErr) throw upErr;

      // Devolve crédito ao servidor
      if (m.servidor_id && qtd > 0) {
        await registrarMovimentacaoCredito({
          servidor_id: m.servidor_id,
          quantidade: qtd,
          tipo: "ajuste_add",
          motivo: `Estorno de recarga p/ ${revNome} — Reversão pelo Faturamento`,
        });
      }

      // Reduz créditos do revendedor
      if (m.revendedor_id && qtd > 0) {
        const { data: rev } = await supabase
          .from("revendedores")
          .select("creditos")
          .eq("id", m.revendedor_id)
          .maybeSingle();
        const atual = Number(rev?.creditos || 0);
        await supabase
          .from("revendedores")
          .update({ creditos: Math.max(0, atual - qtd) })
          .eq("id", m.revendedor_id);
      }

      await logAudit({
        categoria: "revendedor",
        acao: "cancelar",
        descricao: `Venda de recarga (${qtd} créditos / ${currencyBRL(valor)}) para ${revNome} revertida pelo Faturamento`,
        entidade: "revendedores_movimentacoes",
        entidade_id: m.id,
      });

      toast.success("Faturamento de revendedor revertido!");
      return true;
    } catch (e: any) {
      toast.error(e?.message || "Falha ao reverter faturamento de revendedor");
      return false;
    }
  }

  if (item.tipo === "ativacao" || item.tipo === "ativacao_app") {
    let a = item.raw;
    if (!a) {
      const { data } = await supabase
        .from("ativacoes_apps")
        .select("*")
        .eq("id", item.id)
        .maybeSingle();
      a = data;
    }
    const appNome = a?.nome ?? item.descricao ?? "Ativação de App";
    const valor = Number(a?.valor || item.valor || 0);

    const ok = await confirmDialog({
      title: "Excluir lançamento de ativação de app?",
      description: `Aplicativo: ${appNome}\nValor: ${currencyBRL(valor)}\n\nO lançamento será excluído do faturamento.\n\nConfirma a exclusão?`,
      confirmText: "Excluir faturamento",
      cancelText: "Voltar",
      destructive: true,
    });
    if (!ok) return false;

    try {
      const { error: delErr } = await supabase.from("ativacoes_apps").delete().eq("id", item.id);
      if (delErr) throw delErr;

      await logAudit({
        categoria: "financeiro",
        acao: "excluir",
        descricao: `Ativação de app "${appNome}" (${currencyBRL(valor)}) excluída pelo Faturamento`,
        entidade: "ativacoes_apps",
        entidade_id: item.id,
      });

      toast.success("Lançamento de ativação excluído!");
      return true;
    } catch (e: any) {
      toast.error(e?.message || "Falha ao excluir ativação");
      return false;
    }
  }

  return false;
}
