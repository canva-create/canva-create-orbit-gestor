import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirm";
import { creditosPorDias, registrarMovimentacaoCredito } from "@/lib/creditos";
import { currencyBRL, formatDateBR } from "@/lib/iptv";
import { logAudit } from "@/lib/audit";

/**
 * Reverte a ÚLTIMA renovação ativa de um cliente:
 * - devolve os dias adicionados (volta o vencimento)
 * - estorna valor recebido / custo / lucro (marca a renovação como cancelada)
 * - devolve os créditos consumidos ao servidor
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
  if (eH) { toast.error(eH.message); return false; }
  if (!h) { toast.error("Nenhuma renovação ativa para reverter."); return false; }

  const dias = Number(h.dias_adicionados || 0);
  const valor = Number(h.valor_recebido || 0) + Number((h as any).valor_pendente || 0);

  const ok = await confirmDialog({
    title: "Reverter renovação?",
    description: `Cliente: ${cliente.nome ?? "-"}\nRenovação de ${dias} dias (${formatDateBR(h.vencimento_anterior)} → ${formatDateBR(h.vencimento_novo)}).\n\nSerão removidos os ${dias} dias, estornados ${currencyBRL(valor)} de faturamento, o custo de ${currencyBRL(Number(h.custo || 0))} e o lucro, além da devolução dos créditos ao servidor.`,
    confirmText: "Reverter renovação",
    cancelText: "Voltar",
    destructive: true,
  });
  if (!ok) return false;

  try {
    const { data: cli } = await supabase
      .from("clientes")
      .select("id, data_vencimento, valor_pago, servidor_id")
      .eq("id", cliente.id)
      .maybeSingle();

    let novoVenc = h.vencimento_anterior as string | null;
    if (cli?.data_vencimento) {
      const [y, m, d] = String(cli.data_vencimento).split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      dt.setDate(dt.getDate() - dias);
      novoVenc = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    }

    const updates: any = { data_vencimento: novoVenc, valor_pago: 0, status_pagamento: "devendo" };
    const { error: eUp } = await supabase.from("clientes").update(updates).eq("id", cliente.id);
    if (eUp) throw eUp;

    const servidorId = (cli as any)?.servidor_id || cliente.servidor_id || null;
    const creditos = creditosPorDias(dias);
    if (servidorId && creditos > 0) {
      await registrarMovimentacaoCredito({
        servidor_id: servidorId,
        quantidade: creditos,
        tipo: "ajuste_add",
        motivo: `Reversão de renovação ${dias}d — ${cliente.nome ?? ""}`.trim(),
        cliente_id: cliente.id,
      });
    }

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

    await logAudit({
      categoria: "renovacao",
      acao: "cancelar",
      descricao: `Renovação de "${cliente.nome ?? "-"}" revertida (${dias} dias / ${currencyBRL(valor)} estornados)`,
      entidade: "historico_renovacoes",
      entidade_id: h.id,
      entidade_nome: cliente.nome ?? null,
      dados_anteriores: { data_vencimento: cli?.data_vencimento, valor_recebido: h.valor_recebido, custo: h.custo, lucro: h.lucro },
      dados_novos: { data_vencimento: novoVenc, status: "cancelada", valor_recebido: 0, custo: 0, lucro: 0 },
    });

    toast.success("Renovação revertida e valores estornados.");
    return true;
  } catch (e: any) {
    toast.error(e?.message ?? "Falha ao reverter renovação");
    return false;
  }
}
