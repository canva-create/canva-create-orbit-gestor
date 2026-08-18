import { supabase } from "@/integrations/supabase/client";

export type Funcionario = {
  id: string;
  nome: string;
  cargo: string | null;
  data_admissao: string | null;
  salario_fixo: number;
  diaria_minima: number;
  percentual: number;
  base_calculo: "faturamento" | "lucro";
  ativo: boolean;
};

export async function fetchFuncionarios() {
  const { data, error } = await supabase
    .from("funcionarios")
    .select("*")
    .order("nome", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Funcionario[];
}

/**
 * Faturamento BRUTO por lançamento, usando exatamente as mesmas fontes da
 * Dashboard (renovações/ativações de clientes + vendas de créditos para
 * revendedores). A tabela historico_financeiro não é usada aqui porque
 * duplica/omite lançamentos e gerava bases divergentes na planilha de
 * pagamentos.
 */
export async function fetchFinanceiro() {
  const [ren, rev, ativ] = await Promise.all([
    supabase
      .from("historico_renovacoes")
      .select("id, valor_recebido, custo, lucro, created_at, status")
      .order("created_at", { ascending: false })
      .limit(20000),
    supabase
      .from("revendedores_movimentacoes")
      .select("id, tipo, valor_pago, custo, lucro, created_at, status_venda, status_pagamento")
      .order("created_at", { ascending: false })
      .limit(20000),
    supabase
      .from("ativacoes_apps")
      .select("id, valor, custo, ativado_em")
      .order("ativado_em", { ascending: false })
      .limit(20000),
  ]);
  if (ren.error) throw ren.error;
  if (rev.error) throw rev.error;
  if (ativ.error) throw ativ.error;

  const linhasClientes = (ren.data ?? [])
    .filter((r: any) => r.status !== "cancelada")
    .map((r: any) => ({
      id: r.id,
      tipo: "cliente",
      valor: Number(r.valor_recebido || 0),
      custo: Number(r.custo || 0),
      lucro: Number(r.lucro || 0),
      created_at: r.created_at,
    }));

  const linhasRev = (rev.data ?? [])
    .filter((m: any) => m.tipo === "venda" && m.status_venda !== "cancelada" && m.status_pagamento === "pago")
    .map((m: any) => ({
      id: m.id,
      tipo: "revendedor",
      valor: Number(m.valor_pago || 0),
      custo: Number(m.custo || 0),
      lucro: Number(m.lucro || 0),
      created_at: m.created_at,
    }));

  const linhasAtiv = (ativ.data ?? []).map((a: any) => ({
    id: a.id,
    tipo: "ativacao_app",
    valor: Number(a.valor || 0),
    custo: Number(a.custo || 0),
    lucro: Number(a.valor || 0) - Number(a.custo || 0),
    created_at: a.ativado_em,
  }));

  return [...linhasClientes, ...linhasRev, ...linhasAtiv];
}

export function localISODate(d: Date | string) {
  const dt = typeof d === "string" ? new Date(d) : d;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type DayAgg = { faturamento: number; lucro: number };

/** Agrupa lançamentos financeiros por dia local (YYYY-MM-DD). */
export function agruparPorDia(rows: any[]): Record<string, DayAgg> {
  const map: Record<string, DayAgg> = {};
  for (const r of rows) {
    const k = localISODate(r.created_at);
    const cur = (map[k] ??= { faturamento: 0, lucro: 0 });
    cur.faturamento += Number(r.valor || 0);
    cur.lucro += Number(r.lucro || 0);
  }
  return map;
}

export function diasNoMes(ano: number, mes: number) {
  return new Date(ano, mes, 0).getDate();
}

export type LinhaApuracao = {
  dia: number;
  data: string;
  faturamento: number;
  lucro: number;
  base: number;
  comissao: number;
  diaria: number;
  considerado: number;
  acumulado: number;
  usouDiaria: boolean;
  futuro: boolean;
};

export function apurarMes(
  f: Funcionario,
  porDia: Record<string, DayAgg>,
  ano: number,
  mes: number,
): LinhaApuracao[] {
  const total = diasNoMes(ano, mes);
  const hoje = localISODate(new Date());
  const linhas: LinhaApuracao[] = [];
  let acumulado = 0;
  for (let dia = 1; dia <= total; dia++) {
    const data = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    const agg = porDia[data] ?? { faturamento: 0, lucro: 0 };
    const base = f.base_calculo === "lucro" ? agg.lucro : agg.faturamento;
    const comissao = Math.max(0, (base * Number(f.percentual || 0)) / 100);
    const diaria = Number(f.diaria_minima || 0);
    const futuro = data > hoje;
    const considerado = futuro ? 0 : Math.max(comissao, diaria);
    acumulado += considerado;
    linhas.push({
      dia,
      data,
      faturamento: agg.faturamento,
      lucro: agg.lucro,
      base,
      comissao,
      diaria,
      considerado,
      acumulado,
      usouDiaria: !futuro && diaria > comissao,
      futuro,
    });
  }
  return linhas;
}
