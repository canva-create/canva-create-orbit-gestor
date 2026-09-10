import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirm";
import { creditosPorDias, registrarMovimentacaoCredito } from "@/lib/creditos";
import { addDaysISO, currencyBRL, diasParaVencer, formatDateBR, toISODate } from "@/lib/iptv";
import { logAudit } from "@/lib/audit";

/**
 * Reverte a ÚLTIMA renovação ativa de um cliente:
 * - Devolve os dias adicionados e restaura o vencimento anterior exato
 * - Estorna valor recebido / pendente, custo e lucro (marca a renovação como cancelada e zera valores)
 * - Devolve os créditos consumidos ao saldo do servidor
 * - Restaura status (ativo/vencido) e status de pagamento anteriores do cliente
 */
export async function reverterUltimaRenovacao(cliente: any): Promise<boolean> {
  if (!cliente?.id) return false;

  const { data: h, error: eH } = await supabase
    .from("historico_renovacoes")
    .select("*")
    .eq("cliente_id", cliente.id)
    .neq("status", "cancelada")
    .order("created_at", { ascending: false })
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

  const dias = Number(h.dias_adicionados || 0);
  const valorRecebido = Number(h.valor_recebido || 0);
  const valorPendente = Number((h as any).valor_pendente || 0);
  const valorTotal = valorRecebido + valorPendente;
  const custo = Number(h.custo || 0);
  const creditos = creditosPorDias(dias);
  const isDevendo = h.status_pagamento === "devendo";

  const descDialog = dias > 0
    ? `Cliente: ${cliente.nome ?? "-"}\nRenovação de ${dias} dias (${formatDateBR(h.vencimento_anterior)} → ${formatDateBR(h.vencimento_novo)}).\nStatus: ${isDevendo ? "DEVENDO / PENDENTE" : "PAGO"}\n\nSerão removidos os ${dias} dias, estornados ${currencyBRL(valorTotal)} (${isDevendo ? "pendência" : "faturamento"}), custo de ${currencyBRL(custo)} e devolvidos ${creditos} crédito(s) ao saldo do servidor.`
    : `Cliente: ${cliente.nome ?? "-"}\nEstorno de recebimento de ${currencyBRL(valorRecebido)} (liquidação de pendência).\n\nO valor será retirado do faturamento e a pendência restaurada.`;

  const ok = await confirmDialog({
    title: "Reverter renovação?",
    description: descDialog,
    confirmText: "Reverter renovação",
    cancelText: "Voltar",
    destructive: true,
  });
  if (!ok) return false;

  try {
    const { data: cli } = await supabase
      .from("clientes")
      .select("id, data_vencimento, valor_pago, status_pagamento, status, servidor_id")
      .eq("id", cliente.id)
      .maybeSingle();

    // Busca a renovação ativa imediatamente anterior a esta (se houver)
    const { data: prevList } = await supabase
      .from("historico_renovacoes")
      .select("*")
      .eq("cliente_id", cliente.id)
      .neq("id", h.id)
      .neq("status", "cancelada")
      .order("created_at", { ascending: false })
      .limit(1);

    const prev = prevList && prevList.length > 0 ? prevList[0] : null;

    // Determina a data de vencimento restaurada
    let novoVenc = h.vencimento_anterior as string | null;
    if (!novoVenc && prev?.vencimento_novo) {
      novoVenc = prev.vencimento_novo;
    }
    if (!novoVenc && cli?.data_vencimento && dias > 0) {
      novoVenc = addDaysISO(cli.data_vencimento, -dias);
    }
    if (!novoVenc) {
      novoVenc = cli?.data_vencimento ?? toISODate(new Date());
    }

    // Determina status (ativo vs vencido) com base na data restaurada
    const diasVenc = diasParaVencer(novoVenc);
    const novoStatus = diasVenc !== null && diasVenc < 0 ? "vencido" : "ativo";

    // Determina valor_pago e status_pagamento restaurados
    let novoValorPago = 0;
    let novoStatusPag: "pago" | "devendo" = "devendo";

    if (prev) {
      novoValorPago = Number(prev.valor_recebido || prev.valor_pendente || cli?.valor_pago || 0);
      novoStatusPag = prev.status_pagamento === "pago" ? "pago" : (Number(prev.valor_recebido || 0) > 0 ? "pago" : "devendo");
    } else {
      novoValorPago = Number(cli?.valor_pago || valorTotal || 0);
      novoStatusPag = (diasVenc !== null && diasVenc < 0) ? "devendo" : (cli?.status_pagamento === "pago" && !isDevendo ? "pago" : "devendo");
    }

    // 1. Atualiza o cadastro do cliente
    const updatesCli: any = {
      data_vencimento: novoVenc,
      valor_pago: novoValorPago,
      status_pagamento: novoStatusPag,
      status: novoStatus,
    };
    const { error: eUp } = await supabase.from("clientes").update(updatesCli).eq("id", cliente.id);
    if (eUp) throw eUp;

    // 2. Devolve os créditos ao servidor (se a operação consumiu créditos)
    const servidorId = (cli as any)?.servidor_id || cliente.servidor_id || (h as any).servidor_id || null;
    if (servidorId && creditos > 0) {
      await registrarMovimentacaoCredito({
        servidor_id: servidorId,
        quantidade: creditos,
        tipo: "ajuste_add",
        motivo: `Reversão de renovação ${dias}d — ${cliente.nome ?? ""}`.trim(),
        cliente_id: cliente.id,
      });
    }

    // 3. Cancela o registro no histórico de renovações e zera os valores financeiros
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

    // 4. Se houver liquidação avulsa atrelada (dias_adicionados = 0 em data separada), cancela também
    if (dias > 0) {
      const { data: settlements } = await supabase
        .from("historico_renovacoes")
        .select("id")
        .eq("cliente_id", cliente.id)
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

    // 5. Registra log de auditoria
    await logAudit({
      categoria: "renovacao",
      acao: "cancelar",
      descricao: `Renovação de "${cliente.nome ?? "-"}" revertida (${dias} dias / ${currencyBRL(valorTotal)} estornados / ${creditos} crédito(s) devolvido(s))`,
      entidade: "historico_renovacoes",
      entidade_id: h.id,
      entidade_nome: cliente.nome ?? null,
      dados_anteriores: {
        data_vencimento: cli?.data_vencimento,
        valor_recebido: h.valor_recebido,
        valor_pendente: (h as any).valor_pendente,
        custo: h.custo,
        lucro: h.lucro,
        status_pagamento: h.status_pagamento,
      },
      dados_novos: {
        data_vencimento: novoVenc,
        status: "cancelada",
        valor_recebido: 0,
        valor_pendente: 0,
        custo: 0,
        lucro: 0,
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
