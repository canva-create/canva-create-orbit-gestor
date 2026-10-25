import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { toISODate } from "@/lib/iptv";
import type { QueryClient } from "@tanstack/react-query";

/**
 * Marca um cliente com status_pagamento = "pago"
 * Realiza as devidas conciliações no histórico financeiro (mesmo dia vs retroativo)
 * e registra log de auditoria.
 */
export async function marcarClienteComoPago(c: any, qc?: QueryClient) {
  const { error } = await supabase
    .from("clientes")
    .update({ status_pagamento: "pago" })
    .eq("id", c.id);

  if (error) {
    toast.error(error.message);
    throw error;
  }

  try {
    const user = (await supabase.auth.getUser()).data.user;
    if (user) {
      const { data: pend } = await supabase
        .from("historico_renovacoes")
        .select("id, valor_pendente, custo, created_at")
        .eq("cliente_id", c.id)
        .eq("status_pagamento", "devendo" as any)
        .neq("status", "cancelada")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const valor = Number((pend as any)?.valor_pendente || c.valor_pago || 0);
      const custoH = Number((pend as any)?.custo || 0);
      const isSameDay = pend && toISODate(new Date((pend as any).created_at)) === toISODate(new Date());

      if (pend && isSameDay) {
        // Cadastrado hoje como devendo e pago hoje: atualiza o mesmo registro
        await supabase
          .from("historico_renovacoes")
          .update({
            status_pagamento: "pago" as any,
            valor_recebido: valor,
            valor_pendente: 0,
            lucro: valor - custoH,
            pago_em: new Date().toISOString(),
          } as any)
          .eq("id", (pend as any).id);
      } else {
        // Cadastrado em data anterior: o custo já foi debitado na data passada.
        // Hoje dá baixa na pendência e lança o recebimento no dia atual.
        if (pend) {
          await supabase
            .from("historico_renovacoes")
            .update({
              valor_pendente: 0,
              pago_em: new Date().toISOString(),
            } as any)
            .eq("id", (pend as any).id);
        }
        await supabase.from("historico_renovacoes").insert({
          user_id: user.id,
          cliente_id: c.id,
          dias_adicionados: 0,
          valor_recebido: valor,
          valor_pendente: 0,
          custo: 0, // Custo já deduzido na criação/renovação
          lucro: valor, // Entra integralmente como faturamento e lucro do dia de hoje
          vencimento_anterior: c.data_vencimento,
          vencimento_novo: c.data_vencimento,
          status_pagamento: "pago" as any,
          pago_em: new Date().toISOString(),
        } as any);
      }
    }
  } catch (e) {
    console.error("Erro ao atualizar histórico financeiro:", e);
  }

  await logAudit({
    categoria: "financeiro",
    acao: "alterar_pagamento",
    descricao: `Pagamento de "${c.nome}" alterado para PAGO`,
    entidade: "clientes",
    entidade_id: c.id,
    entidade_nome: c.nome,
    dados_anteriores: { status_pagamento: c.status_pagamento },
    dados_novos: { status_pagamento: "pago" },
  });

  toast.success(`✅ Pagamento de "${c.nome}" confirmado como PAGO!`);

  if (qc) {
    qc.invalidateQueries({ queryKey: ["clientes"] });
    qc.invalidateQueries({ queryKey: ["historico"] });
    qc.invalidateQueries({ queryKey: ["clientes-devedores"] });
    qc.invalidateQueries({ queryKey: ["faturamento_bruto_dia"] });
    qc.invalidateQueries();
  }
}
