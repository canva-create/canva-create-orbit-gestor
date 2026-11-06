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

/**
 * Marca uma ativação de aplicativo como PAGA.
 * Lança o recebimento no histórico financeiro de hoje (entra no faturamento e lucro do dia),
 * atualiza status_pagamento para "pago", limpa marcação [DEVENDO], e concilia eventuais
 * vínculos com revendedores ou clientes.
 */
export async function marcarAtivacaoComoPaga(a: any, qc?: QueryClient) {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) {
    toast.error("Não autenticado");
    return;
  }

  const valor = Number(a.valor_devendo || a.valor || 0);
  const obsLimpa = (a.observacao || "").replace(/\s*\[DEVENDO\]\s*/g, "").trim();

  // 1. Atualizar ativacoes_apps
  try {
    const { error: err1 } = await supabase
      .from("ativacoes_apps")
      .update({
        status_pagamento: "pago",
        valor: valor > 0 ? valor : Number(a.valor || 0),
        observacao: obsLimpa || null,
      } as any)
      .eq("id", a.id);

    if (err1) {
      // Fallback se coluna status_pagamento não estiver ativa no schema cache
      await supabase
        .from("ativacoes_apps")
        .update({
          valor: valor > 0 ? valor : Number(a.valor || 0),
          observacao: obsLimpa || null,
        } as any)
        .eq("id", a.id);
    }
  } catch (err) {
    console.warn("Aviso ao atualizar status da ativação:", err);
  }

  // 2. Lançar o recebimento no histórico financeiro de hoje (entra como faturamento e lucro do dia)
  try {
    await supabase.from("historico_financeiro").insert({
      user_id: user.id,
      tipo: "ativacao_app",
      valor: valor,
      custo: 0, // Custo já deduzido no momento da ativação
      lucro: valor, // Entra integralmente como faturamento e lucro de hoje
      descricao: `Recebimento de ativação pendente: ${a.aplicativo || "App"} (${a.cliente_nome || a.mac || ""})`,
    });
  } catch (err) {
    console.error("Erro ao inserir em historico_financeiro:", err);
  }

  // 3. Se for revenda vinculada, concilia revendedores_movimentacoes e revendedores
  try {
    let revId = a.revendedor_id;
    if (!revId && a.cliente_nome && typeof a.cliente_nome === "string") {
      const match = a.cliente_nome.match(/^Rev:\s*([^(]+)/);
      if (match) {
        const revNome = match[1].trim();
        const { data: revData } = await supabase
          .from("revendedores")
          .select("id")
          .ilike("nome", revNome)
          .maybeSingle();
        if (revData?.id) revId = revData.id;
      }
    }

    if (revId) {
      const { data: pendMov } = await supabase
        .from("revendedores_movimentacoes")
        .select("id, custo, valor_pago")
        .eq("revendedor_id", revId)
        .eq("status_pagamento", "devendo" as any)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pendMov) {
        const custoMov = Number((pendMov as any).custo || 0);
        await supabase
          .from("revendedores_movimentacoes")
          .update({
            status_pagamento: "pago" as any,
            lucro: valor - custoMov,
          } as any)
          .eq("id", (pendMov as any).id);
      }

      const { data: restam } = await supabase
        .from("revendedores_movimentacoes")
        .select("id")
        .eq("revendedor_id", revId)
        .eq("status_pagamento", "devendo" as any);

      if (!restam || restam.length === 0) {
        await supabase.from("revendedores").update({ status_pagamento: "pago" } as any).eq("id", revId);
      }
    }
  } catch (err) {
    console.warn("Aviso ao conciliar revendedores_movimentacoes:", err);
  }

  // 4. Se for cliente vinculado, concilia status do cliente
  if (a.cliente_id) {
    try {
      await supabase.from("clientes").update({ status_pagamento: "pago" }).eq("id", a.cliente_id);
    } catch {}
  }

  // 5. Auditoria
  await logAudit({
    categoria: "financeiro",
    acao: "alterar_pagamento",
    descricao: `Ativação de aplicativo "${a.aplicativo || "App"}" (${a.cliente_nome || a.mac}) marcada como PAGA`,
    entidade: "ativacoes_apps",
    entidade_id: a.id,
    metadata: { valor, aplicativo: a.aplicativo, mac: a.mac },
  });

  toast.success(`✅ Ativação de "${a.aplicativo || "App"}" confirmada como PAGA!`);

  if (qc) {
    qc.invalidateQueries({ queryKey: ["ativacoes_apps"] });
    qc.invalidateQueries({ queryKey: ["clientes-devedores"] });
    qc.invalidateQueries({ queryKey: ["clientes-devedores-count"] });
    qc.invalidateQueries({ queryKey: ["faturamento_bruto_dia"] });
    qc.invalidateQueries({ queryKey: ["financeiro_lancamentos"] });
    qc.invalidateQueries({ queryKey: ["revendedores"] });
    qc.invalidateQueries({ queryKey: ["revendedores_movs"] });
    qc.invalidateQueries();
  }
}

/**
 * Marca um revendedor como PAGO (quita todas as vendas devendo e lança histórico financeiro).
 */
export async function marcarRevendedorComoPago(r: any, qc?: QueryClient) {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) {
    toast.error("Não autenticado");
    return;
  }

  const { error: errRev } = await supabase
    .from("revendedores")
    .update({ status_pagamento: "pago" } as any)
    .eq("id", r.id);
  if (errRev) {
    toast.error(errRev.message);
    return;
  }

  const { data: pendentes = [] } = await supabase
    .from("revendedores_movimentacoes")
    .select("id, quantidade, valor_pago, custo")
    .eq("revendedor_id", r.id)
    .eq("tipo", "venda")
    .neq("status_venda", "cancelada")
    .eq("status_pagamento", "devendo" as any);

  for (const m of pendentes ?? []) {
    const valor = Number(m.valor_pago || 0);
    const { error: errMov } = await supabase
      .from("revendedores_movimentacoes")
      .update({ status_pagamento: "pago" } as any)
      .eq("id", m.id);
    if (errMov) continue;

    if (valor > 0) {
      await supabase.from("historico_financeiro").insert({
        user_id: user.id,
        tipo: "revendedor",
        valor: valor,
        custo: 0,
        lucro: valor,
        descricao: `Recebimento venda ${m.quantidade} créd p/ ${r.nome}`,
      });
    }
  }

  await logAudit({
    categoria: "venda_credito",
    acao: "alterar_pagamento",
    descricao: `Revendedor "${r.nome}" marcado como PAGO (${(pendentes ?? []).length} venda(s) quitada(s))`,
    entidade: "revendedores",
    entidade_id: r.id,
    entidade_nome: r.nome,
    metadata: { status_pagamento: "pago", vendas_quitadas: (pendentes ?? []).length },
  });

  toast.success((pendentes ?? []).length > 0
    ? `Revendedor marcado como PAGO (${(pendentes ?? []).length} venda(s) quitada(s))`
    : `Revendedor marcado como PAGO (em dia)`);

  if (qc) {
    qc.invalidateQueries({ queryKey: ["revendedores"] });
    qc.invalidateQueries({ queryKey: ["revendedores_movs"] });
    qc.invalidateQueries({ queryKey: ["clientes-devedores-count"] });
    qc.invalidateQueries({ queryKey: ["faturamento_bruto_dia"] });
    qc.invalidateQueries({ queryKey: ["financeiro_lancamentos"] });
    qc.invalidateQueries();
  }
}
