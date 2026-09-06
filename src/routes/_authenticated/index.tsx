import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchClientes, fetchServidores, fetchHistorico, fetchSaldosCreditos, fetchRevendedores, fetchMovimentacoesCreditos, fetchRevendedoresMovs, fetchComprasCreditos, fetchAtivacoesApps, limparCacheLocal } from "@/lib/queries";
import { Link } from "@tanstack/react-router";
import { StatCard } from "@/components/stat-card";
import { Users, AlertTriangle, Clock, CalendarClock, DollarSign, TrendingUp, Wallet, Layers, RefreshCw, CreditCard, Package, Flame, ShoppingCart, TrendingDown } from "lucide-react";
import { currencyBRL, diasParaVencer } from "@/lib/iptv";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { FileText, FileImage, FileSpreadsheet } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, LineChart, Line } from "recharts";
import { GlobalClienteSearch } from "@/components/global-cliente-search";
import { IndicadoresBasePanel } from "@/components/indicadores-base-panel";
import { AnaliseBaseDialog } from "@/components/analise-base-dialog";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LayoutDashboard, Target } from "lucide-react";
import { CentralGestao } from "./central";
import { cn } from "@/lib/utils";

const DASHBOARD_CUTOFF_KEY = "dashboard_cutoff_iso_v2";
function getDashboardCutoff(): Date {
  if (typeof window === "undefined") return new Date();
  let iso = window.localStorage.getItem(DASHBOARD_CUTOFF_KEY);
  if (!iso) {
    const d = new Date();
    iso = d.toISOString();
    window.localStorage.setItem(DASHBOARD_CUTOFF_KEY, iso);
    try { window.localStorage.removeItem("dashboard_cutoff_iso"); } catch {}
  }
  return new Date(iso);
}

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

function Dashboard() {
  const queryClient = useQueryClient();
  const { data: clientes = [] } = useQuery({ queryKey: ["clientes"], queryFn: fetchClientes });
  const { data: servidores = [] } = useQuery({ queryKey: ["servidores"], queryFn: fetchServidores });
  const { data: historico = [] } = useQuery({ queryKey: ["historico"], queryFn: fetchHistorico });
  const { data: saldos = {} } = useQuery({ queryKey: ["creditos_saldos"], queryFn: fetchSaldosCreditos });
  const { data: revendedores = [] } = useQuery({ queryKey: ["revendedores"], queryFn: fetchRevendedores });
  const { data: movsCred = [] } = useQuery({ queryKey: ["creditos_movs"], queryFn: fetchMovimentacoesCreditos });
  const { data: revMovs = [] } = useQuery({ queryKey: ["revendedores_movs"], queryFn: fetchRevendedoresMovs });
  const { data: comprasCred = [] } = useQuery({ queryKey: ["creditos_compras"], queryFn: fetchComprasCreditos });
  const { data: ativacoesApps = [] } = useQuery({ queryKey: ["ativacoes_apps"], queryFn: fetchAtivacoesApps });
  const [detail, setDetail] = useState<null | { title: string; rows: Array<{ data: string; origem: string; descricao: string; valor: number }>; tone: "green" | "red" | "blue" }>(null);
  const [refreshing, setRefreshing] = useState(false);
  const nowInit = new Date();
  const [mesSel, setMesSel] = useState<number>(nowInit.getMonth());
  const [anoSel, setAnoSel] = useState<number>(nowInit.getFullYear());
  const [mesAberto, setMesAberto] = useState<number | null>(null);
  const refreshAll = async () => {
    if (refreshing) return;
    setRefreshing(true);
    const started = Date.now();
    const tId = toast.loading("Sincronizando dados do sistema...");
    try {
      limparCacheLocal();
      // Invalida apenas as queries ativas na tela para evitar refetches em cascata nas outras abas
      await queryClient.invalidateQueries({
        predicate: (query) => ["clientes", "servidores", "historico", "creditos_saldos", "revendedores", "creditos_movs", "revendedores_movs", "creditos_compras", "ativacoes_apps"].includes(query.queryKey[0] as string),
      });
      // Força refetch imediato das queries usadas na Dashboard
      await queryClient.refetchQueries({ type: "active" });
      const ms = Date.now() - started;
      toast.success(`Dados atualizados em ${(ms / 1000).toFixed(1)}s`, { id: tId });
      logAudit({ categoria: "outro", acao: "outro", descricao: "Varredura completa do sistema (Atualizar Dashboard)", metadata: { duracao_ms: ms } });
    } catch (e: any) {
      toast.error(e?.message || "Falha ao atualizar", { id: tId });
    } finally {
      setRefreshing(false);
    }
  };
  const baixos = servidores.filter((s: any) => (saldos[s.id] ?? 0) <= 5);

  // Considera todo o histórico persistido no backend para manter os valores
  // consistentes entre preview e publicação (o cutoff antigo era salvo no
  // localStorage, que é isolado por domínio e gerava totais diferentes).
  const afterCutoff = (iso: string | null | undefined) => !!iso;
  const historicoF = historico.filter((h: any) => afterCutoff(h.created_at) && h.status !== "cancelada");
  const revendedoresF = revendedores.filter((r: any) => afterCutoff(r.data_recarga));
  // Cada venda de crédito para revendedor vira uma linha financeira.
  // Fonte: revendedores_movimentacoes (tipo = "venda"), que registra todas as
  // vendas — não só a última, como o campo r.valor_venda do revendedor faria.
  const revVendas = (revMovs as any[])
    .filter((m: any) => m.tipo === "venda" && m.status_venda !== "cancelada" && afterCutoff(m.created_at))
    .map((m: any) => {
      const isDevendo = m.status_pagamento === "devendo";
      const custo = Number(m.custo || 0);
      const valor = isDevendo ? 0 : Number(m.valor_pago || 0);
      const lucro = isDevendo ? -custo : Number(m.lucro ?? (valor - custo));
      return {
        id: m.id,
        data_recarga: m.created_at,
        valor_venda: valor,
        custo,
        lucro,
        revendedor_id: m.revendedor_id,
        revendedor: m.revendedor,
        nome: m.revendedor?.nome,
      };
    });
  const movsCredF = movsCred.filter((m: any) => afterCutoff(m.created_at));
  // Ativações de aplicativos entram no faturamento e na despesa do dia.
  const ativLinhas = (ativacoesApps as any[])
    .filter((a: any) => afterCutoff(a.ativado_em))
    .map((a: any) => ({
      id: a.id,
      data: a.ativado_em,
      valor: Number(a.valor || 0),
      custo: Number(a.custo || 0),
      nome: a.cliente_nome ?? a.device ?? a.mac ?? "Ativação",
    }));

  const ativos = clientes.filter((c: any) => {
    const d = diasParaVencer(c.data_vencimento);
    return d !== null && d >= 0 && c.status === "ativo";
  }).length;
  const vencidos = clientes.filter((c: any) => {
    const d = diasParaVencer(c.data_vencimento);
    return (d !== null && d < 0) || (d !== null && d >= 0 && c.status === "vencido");
  }).length;
  const total = ativos + vencidos;
  const hoje = clientes.filter((c: any) => diasParaVencer(c.data_vencimento) === 0).length;
  const amanha = clientes.filter((c: any) => diasParaVencer(c.data_vencimento) === 1).length;
  const pendentes = clientes.filter((c: any) => c.status_pagamento === "devendo").length;

  const porServidor = servidores.map((s: any) => {
    const doServidor = clientes.filter((c: any) => c.servidor_id === s.id);
    const ativos = doServidor.filter((c: any) => {
      const d = diasParaVencer(c.data_vencimento);
      return d === null || d >= 0;
    }).length;
    const vencidos = doServidor.filter((c: any) => {
      const d = diasParaVencer(c.data_vencimento);
      return d !== null && d < 0;
    }).length;
    return { nome: s.nome, qtd: doServidor.length, ativos, vencidos };
  });

  // ===== Renovações e faturamento por dia =====
  const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const today = startOfDay(new Date());
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const dayBefore = new Date(today); dayBefore.setDate(today.getDate() - 2);

  const sameDay = (a: Date, b: Date) => a.getTime() === startOfDay(b).getTime();

  const renovHoje = historicoF.filter((h: any) => sameDay(today, new Date(h.created_at))).length;
  const renovOntem = historicoF.filter((h: any) => sameDay(yesterday, new Date(h.created_at))).length;
  const renovAnteontem = historicoF.filter((h: any) => sameDay(dayBefore, new Date(h.created_at))).length;

  const fatHoje = historicoF
    .filter((h: any) => sameDay(today, new Date(h.created_at)))
    .reduce((s: number, h: any) => s + Number(h.valor_recebido || 0), 0);
  const fatOntem = historicoF
    .filter((h: any) => sameDay(yesterday, new Date(h.created_at)))
    .reduce((s: number, h: any) => s + Number(h.valor_recebido || 0), 0);

  // Média mensal de faturamento (últimos 6 meses com dados)
  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const monthLabel = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
  };

  const monthsMap = new Map<string, { renovacoes: number; faturamento: number; lucro: number }>();
  // Seed últimos 6 meses
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    monthsMap.set(monthKey(d), { renovacoes: 0, faturamento: 0, lucro: 0 });
  }
  historicoF.forEach((h: any) => {
    const key = monthKey(new Date(h.created_at));
    if (!monthsMap.has(key)) return;
    const cur = monthsMap.get(key)!;
    cur.renovacoes += 1;
    cur.faturamento += Number(h.valor_recebido || 0);
    cur.lucro += Number(h.lucro || 0);
  });
  const monthlyData = Array.from(monthsMap.entries()).map(([k, v]) => ({
    mes: monthLabel(k),
    ...v,
  }));

  const mesesComFat = monthlyData.filter((m) => m.faturamento > 0);
  const fatMedioMensal = mesesComFat.length
    ? mesesComFat.reduce((s, m) => s + m.faturamento, 0) / mesesComFat.length
    : 0;

  // Projeção de lucro do mês corrente: acumulado até hoje / dia do mês * dias totais do mês
  const curMonthKey = monthKey(today);
  const curMonth = monthsMap.get(curMonthKey) ?? { renovacoes: 0, faturamento: 0, lucro: 0 };
  const diaMes = today.getDate();
  const diasNoMes = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const projecaoLucro = diaMes > 0 ? (curMonth.lucro / diaMes) * diasNoMes : 0;

  // ===== Receita e Lucro do mês corrente (faturamento bruto + revendedores) =====
  const inCurMonth = (iso: string | null | undefined) => {
    if (!iso) return false;
    const d = new Date(iso);
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
  };
  const receitaClientesMes = historicoF
    .filter((h: any) => inCurMonth(h.created_at))
    .reduce((s: number, h: any) => s + Number(h.valor_recebido || 0), 0);
  const custoClientesMes = historicoF
    .filter((h: any) => inCurMonth(h.created_at))
    .reduce((s: number, h: any) => s + Number(h.custo || 0), 0);
  const receitaRevMes = revVendas
    .filter((r: any) => inCurMonth(r.data_recarga))
    .reduce((s: number, r: any) => s + Number(r.valor_venda || 0), 0);
  const custoRevMes = revVendas
    .filter((r: any) => inCurMonth(r.data_recarga))
    .reduce((s: number, r: any) => s + Number(r.custo || 0), 0);
  const receita = receitaClientesMes + receitaRevMes;
  const custoTotal = custoClientesMes + custoRevMes;
  const lucro = receita - custoTotal;

  // ===== Resumo Financeiro (Dia / Mês / Ano) =====
  const startOfYear = new Date(today.getFullYear(), 0, 1);
  const startOfMonth = new Date(anoSel, mesSel, 1);
  const endOfMonthSel = new Date(anoSel, mesSel + 1, 0, 23, 59, 59);
  const inDay = (iso: string) => sameDay(today, new Date(iso));
  const inMonth = (iso: string) => { const d = new Date(iso); return d >= startOfMonth && d <= endOfMonthSel; };
  const inYear = (iso: string) => { const d = new Date(iso); return d >= startOfYear && d.getFullYear() === today.getFullYear(); };

  // Considerar apenas pagos: histórico já é registro efetivado; ainda assim filtramos por status_pagamento quando existir.
  const histPagos = historicoF.filter((h: any) => h.valor_recebido > 0);
  const revPagos = revVendas;

  const sumFat = (pred: (iso: string) => boolean) =>
    histPagos.filter((h: any) => h.created_at && pred(h.created_at)).reduce((s: number, h: any) => s + Number(h.valor_recebido || 0), 0)
    + revPagos.filter((r: any) => r.data_recarga && pred(r.data_recarga)).reduce((s: number, r: any) => s + Number(r.valor_venda || 0), 0)
    + ativLinhas.filter((a) => a.data && pred(a.data)).reduce((s: number, a) => s + a.valor, 0);
  const sumDesp = (pred: (iso: string) => boolean) =>
    historicoF.filter((h: any) => h.created_at && pred(h.created_at)).reduce((s: number, h: any) => s + Number(h.custo || 0), 0)
    + revPagos.filter((r: any) => r.data_recarga && pred(r.data_recarga)).reduce((s: number, r: any) => s + Number(r.custo || 0), 0)
    + ativLinhas.filter((a) => a.data && pred(a.data)).reduce((s: number, a) => s + a.custo, 0);

  const fatDia = sumFat(inDay), fatMes = sumFat(inMonth), fatAno = sumFat(inYear);
  const despDia = sumDesp(inDay), despMes = sumDesp(inMonth), despAno = sumDesp(inYear);
  const lucroDia = fatDia - despDia, lucroMes = fatMes - despMes, lucroAno = fatAno - despAno;

  // ===== Faturamento Semanal (semana atual, domingo → hoje) =====
  const startOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
  const startOfPrevWeek = new Date(startOfWeek.getTime() - 7 * 86400000);
  const inWeek = (iso: string) => { const d = new Date(iso); return d >= startOfWeek; };
  const inPrevWeek = (iso: string) => { const d = new Date(iso); return d >= startOfPrevWeek && d < startOfWeek; };
  const fatSemana = sumFat(inWeek), despSemana = sumDesp(inWeek);
  const lucroSemana = fatSemana - despSemana;
  const fatSemanaAnt = sumFat(inPrevWeek), despSemanaAnt = sumDesp(inPrevWeek);
  const lucroSemanaAnt = fatSemanaAnt - despSemanaAnt;
  const diasSemana = Array.from({ length: today.getDay() + 1 }, (_, i) => {
    const d = new Date(startOfWeek.getTime() + i * 86400000);
    const pred = (iso: string) => sameDay(d, new Date(iso));
    const fat = sumFat(pred), desp = sumDesp(pred);
    return { label: d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" }), fat, desp, lucro: fat - desp };
  }).reverse();

  // ===== Indicadores de desempenho por seção =====
  // Diário: comparação com ontem.
  const fatOntemFin = sumFat((iso) => sameDay(yesterday, new Date(iso)));
  const despOntemFin = sumDesp((iso) => sameDay(yesterday, new Date(iso)));
  const lucroOntemFin = fatOntemFin - despOntemFin;
  const pct = (atual: number, ant: number) => (ant === 0 ? (atual > 0 ? 100 : 0) : ((atual - ant) / ant) * 100);

  // Mensal: melhor e pior dia (com movimento) do mês selecionado.
  const dailyMonthMap = new Map<string, number>();
  const addDay = (iso: string, valor: number) => {
    if (!iso) return;
    const d = new Date(iso);
    if (d.getFullYear() !== anoSel || d.getMonth() !== mesSel) return;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    dailyMonthMap.set(key, (dailyMonthMap.get(key) ?? 0) + valor);
  };
  histPagos.forEach((h: any) => addDay(h.created_at, Number(h.valor_recebido || 0)));
  revPagos.forEach((r: any) => addDay(r.data_recarga, Number(r.valor_venda || 0)));
  ativLinhas.forEach((a) => addDay(a.data, a.valor));
  const dailyEntries = Array.from(dailyMonthMap.entries()).map(([k, v]) => {
    const [y, m, d] = k.split("-").map(Number);
    return { date: new Date(y, m, d), valor: v };
  }).filter((e) => e.valor > 0);
  const maiorDia = dailyEntries.length ? dailyEntries.reduce((a, b) => (b.valor > a.valor ? b : a)) : null;
  const menorDia = dailyEntries.length ? dailyEntries.reduce((a, b) => (b.valor < a.valor ? b : a)) : null;
  const mediaDiaMes = dailyEntries.length ? fatMes / dailyEntries.length : 0;

  // Fechamento diário do mês selecionado (dias já decorridos).
  const despDayMap = new Map<string, number>();
  const addDesp = (iso: string, valor: number) => {
    if (!iso) return;
    const d = new Date(iso);
    if (d.getFullYear() !== anoSel || d.getMonth() !== mesSel) return;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    despDayMap.set(key, (despDayMap.get(key) ?? 0) + valor);
  };
  historicoF.forEach((h: any) => addDesp(h.created_at, Number(h.custo || 0)));
  revPagos.forEach((r: any) => addDesp(r.data_recarga, Number(r.custo || 0)));
  ativLinhas.forEach((a) => addDesp(a.data, a.custo));
  const mesSelEhAtual = anoSel === today.getFullYear() && mesSel === today.getMonth();
  const diasExibirMes = mesSelEhAtual
    ? today.getDate()
    : (anoSel > today.getFullYear() || (anoSel === today.getFullYear() && mesSel > today.getMonth()))
      ? 0
      : new Date(anoSel, mesSel + 1, 0).getDate();
  const fechamentoDiario = Array.from({ length: diasExibirMes }, (_, i) => {
    const dia = i + 1;
    const key = `${anoSel}-${mesSel}-${dia}`;
    const fat = dailyMonthMap.get(key) ?? 0;
    const desp = despDayMap.get(key) ?? 0;
    return { dia, fat, desp, lucro: fat - desp };
  }).reverse();

  // Anual: comparação com ano anterior + média mensal.
  const startPrevYear = new Date(today.getFullYear() - 1, 0, 1);
  const endPrevYear = new Date(today.getFullYear() - 1, 11, 31, 23, 59, 59);
  const inPrevYear = (iso: string) => { const d = new Date(iso); return d >= startPrevYear && d <= endPrevYear; };
  const fatAnoAnt = sumFat(inPrevYear);
  const despAnoAnt = sumDesp(inPrevYear);
  const lucroAnoAnt = fatAnoAnt - despAnoAnt;
  const mesAtualIdx = today.getMonth() + 1;
  const mediaMensalFat = mesAtualIdx > 0 ? fatAno / mesAtualIdx : 0;
  const mesNomeBR = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

  // Top 3 maiores / menores faturamentos diários do ano (qualquer mês).
  const dailyYearMap = new Map<string, number>();
  const addDayYear = (iso: string, valor: number) => {
    if (!iso) return;
    const d = new Date(iso);
    if (d.getFullYear() !== today.getFullYear()) return;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    dailyYearMap.set(key, (dailyYearMap.get(key) ?? 0) + valor);
  };
  histPagos.forEach((h: any) => addDayYear(h.created_at, Number(h.valor_recebido || 0)));
  revPagos.forEach((r: any) => addDayYear(r.data_recarga, Number(r.valor_venda || 0)));
  ativLinhas.forEach((a) => addDayYear(a.data, a.valor));
  const yearDays = Array.from(dailyYearMap.entries())
    .map(([k, v]) => { const [y, m, d] = k.split("-").map(Number); return { date: new Date(y, m, d), valor: v }; })
    .filter((e) => e.valor > 0)
    .sort((a, b) => b.valor - a.valor);
  const top3Maiores = yearDays.slice(0, 3);
  const top3Menores = [...yearDays].reverse().slice(0, 3);
  const maxDiaAno = top3Maiores[0]?.valor ?? 0;

  // Acumulado diário do ano, organizado e separado por mês.
  const despYearMap = new Map<string, number>();
  const addDespYear = (iso: string, valor: number) => {
    if (!iso) return;
    const d = new Date(iso);
    if (d.getFullYear() !== today.getFullYear()) return;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    despYearMap.set(key, (despYearMap.get(key) ?? 0) + valor);
  };
  historicoF.forEach((h: any) => addDespYear(h.created_at, Number(h.custo || 0)));
  revPagos.forEach((r: any) => addDespYear(r.data_recarga, Number(r.custo || 0)));
  ativLinhas.forEach((a) => addDespYear(a.data, a.custo));

  // Top 3 dias do ano por lucro e por despesa.
  const keyToDate = (k: string) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m, d); };
  const despDaysAno = Array.from(despYearMap.entries())
    .map(([k, v]) => ({ date: keyToDate(k), valor: v }))
    .filter((e) => e.valor > 0)
    .sort((a, b) => b.valor - a.valor);
  const top3Despesas = despDaysAno.slice(0, 3);
  const maxDespAno = top3Despesas[0]?.valor ?? 0;
  const lucroDaysAno = Array.from(new Set([...dailyYearMap.keys(), ...despYearMap.keys()]))
    .map((k) => ({ date: keyToDate(k), valor: (dailyYearMap.get(k) ?? 0) - (despYearMap.get(k) ?? 0) }))
    .sort((a, b) => b.valor - a.valor);
  const top3Lucros = lucroDaysAno.slice(0, 3);
  const maxLucroAno = top3Lucros[0]?.valor ?? 0;

  const mesesAno = Array.from({ length: 12 }, (_, m) => {
    const totalDias = new Date(today.getFullYear(), m + 1, 0).getDate();
    const dias: { dia: number; fat: number; desp: number; lucro: number }[] = [];
    let fat = 0, desp = 0;
    for (let dia = 1; dia <= totalDias; dia++) {
      const key = `${today.getFullYear()}-${m}-${dia}`;
      const f = dailyYearMap.get(key) ?? 0;
      const dsp = despYearMap.get(key) ?? 0;
      if (f !== 0 || dsp !== 0) dias.push({ dia, fat: f, desp: dsp, lucro: f - dsp });
      fat += f; desp += dsp;
    }
    return {
      mes: m,
      nome: new Date(today.getFullYear(), m, 1).toLocaleDateString("pt-BR", { month: "long" }),
      fat, desp, lucro: fat - desp, dias,
    };
  }).filter((x) => x.dias.length > 0);
  const dataLongaBR = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const mesAnoBR = (d: Date) => d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  // ===== Exportações do Resumo Financeiro =====
  const resumoRows = [
    { Indicador: "Faturamento Dia", Valor: fatDia },
    { Indicador: "Faturamento Mês", Valor: fatMes },
    { Indicador: "Faturamento Ano", Valor: fatAno },
    { Indicador: "Despesa Dia", Valor: despDia },
    { Indicador: "Despesa Mês", Valor: despMes },
    { Indicador: "Despesa Ano", Valor: despAno },
    { Indicador: "Lucro Dia", Valor: lucroDia },
    { Indicador: "Lucro Mês", Valor: lucroMes },
    { Indicador: "Lucro Ano", Valor: lucroAno },
  ];
  // Detalhamento (mesmas linhas das janelas de detalhe)
  const getDetailSheets = (): { name: string; rows: Array<{ data: string; origem: string; descricao: string; valor: number }> }[] => [
    { name: "Faturamento Dia", rows: buildRows(inDay, "fat") },
    { name: "Faturamento Mês", rows: buildRows(inMonth, "fat") },
    { name: "Faturamento Ano", rows: buildRows(inYear, "fat") },
    { name: "Despesa Dia", rows: buildRows(inDay, "desp") },
    { name: "Despesa Mês", rows: buildRows(inMonth, "desp") },
    { name: "Despesa Ano", rows: buildRows(inYear, "desp") },
    { name: "Lucro Dia", rows: buildRows(inDay, "lucro") },
    { name: "Lucro Mês", rows: buildRows(inMonth, "lucro") },
    { name: "Lucro Ano", rows: buildRows(inYear, "lucro") },
  ];
  const stampFile = () => new Date().toISOString().slice(0, 10);
  const exportResumoExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumoRows), "Resumo Financeiro");
    getDetailSheets().forEach((s) => {
      const data = s.rows.length
        ? s.rows.map((r) => ({ Data: r.data, Origem: r.origem, Descrição: r.descricao, Valor: r.valor }))
        : [{ Info: "Sem lançamentos no período" }];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), s.name.slice(0, 31));
    });
    XLSX.writeFile(wb, `resumo-financeiro-${stampFile()}.xlsx`);
  };
  const exportResumoPDF = () => {
    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const margin = 15;
    const pageH = pdf.internal.pageSize.getHeight();
    const nextLine = (h: number) => { if (y + h > pageH - margin) { pdf.addPage(); y = margin; } };
    let y = margin;
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(14); pdf.setTextColor(37, 99, 235);
    pdf.text("Resumo Financeiro", margin, y); y += 8;
    pdf.setFontSize(10); pdf.setTextColor(100, 100, 100);
    pdf.text(new Date().toLocaleString("pt-BR"), margin, y); y += 8;
    const groups: { title: string; color: [number, number, number]; rows: [string, number][] }[] = [
      { title: "Faturamento", color: [16, 185, 129], rows: [["Dia", fatDia], ["Mês", fatMes], ["Ano", fatAno]] },
      { title: "Despesas", color: [239, 68, 68], rows: [["Dia", despDia], ["Mês", despMes], ["Ano", despAno]] },
      { title: "Lucro Líquido", color: [59, 130, 246], rows: [["Dia", lucroDia], ["Mês", lucroMes], ["Ano", lucroAno]] },
    ];
    groups.forEach((g) => {
      nextLine(8);
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(12);
      pdf.setTextColor(...g.color);
      pdf.text(g.title, margin, y); y += 6;
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(11); pdf.setTextColor(17, 24, 39);
      g.rows.forEach(([k, v]) => { nextLine(6); pdf.text(`${k}: ${currencyBRL(v)}`, margin + 4, y); y += 6; });
      y += 2;
    });
    // Detalhes por período/tipo
    getDetailSheets().forEach((s) => {
      pdf.addPage(); y = margin;
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(13); pdf.setTextColor(37, 99, 235);
      pdf.text(`Detalhes — ${s.name}`, margin, y); y += 7;
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(9); pdf.setTextColor(80, 80, 80);
      pdf.text("Data", margin, y);
      pdf.text("Origem", margin + 45, y);
      pdf.text("Descrição", margin + 75, y);
      pdf.text("Valor", 195, y, { align: "right" });
      y += 5;
      pdf.setDrawColor(200); pdf.line(margin, y, 195, y); y += 3;
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(17, 24, 39);
      if (s.rows.length === 0) {
        pdf.setTextColor(120); pdf.text("Sem lançamentos no período.", margin, y); y += 6;
      } else {
        s.rows.forEach((r) => {
          nextLine(5);
          const desc = pdf.splitTextToSize(r.descricao || "-", 110)[0] ?? "-";
          pdf.text(String(r.data), margin, y);
          pdf.text(String(r.origem), margin + 45, y);
          pdf.text(String(desc), margin + 75, y);
          pdf.text(currencyBRL(r.valor), 195, y, { align: "right" });
          y += 5;
        });
        nextLine(6);
        pdf.setDrawColor(200); pdf.line(margin, y, 195, y); y += 4;
        pdf.setFont("helvetica", "bold");
        pdf.text(`Total: ${currencyBRL(s.rows.reduce((sum, r) => sum + r.valor, 0))}`, 195, y, { align: "right" });
      }
    });
    pdf.save(`resumo-financeiro-${stampFile()}.pdf`);
  };
  const exportResumoPNG = () => {
    const scale = 2, width = 900, padX = 32, padY = 32, lineH = 22;
    const groups: { title: string; color: string; rows: [string, number][] }[] = [
      { title: "Faturamento", color: "#10b981", rows: [["Dia", fatDia], ["Mês", fatMes], ["Ano", fatAno]] },
      { title: "Despesas", color: "#ef4444", rows: [["Dia", despDia], ["Mês", despMes], ["Ano", despAno]] },
      { title: "Lucro Líquido", color: "#3b82f6", rows: [["Dia", lucroDia], ["Mês", lucroMes], ["Ano", lucroAno]] },
    ];
    const sheets = getDetailSheets();
    const totalLines =
      2 +
      groups.reduce((s, g) => s + 1 + g.rows.length + 1, 0) +
      sheets.reduce((s, sh) => s + 2 + Math.max(1, sh.rows.length) + 2, 0);
    const height = padY * 2 + totalLines * lineH;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale; canvas.height = height * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, width, height);
    ctx.textBaseline = "top";
    let y = padY;
    ctx.fillStyle = "#111827"; ctx.font = "bold 20px Arial";
    ctx.fillText("Resumo Financeiro", padX, y); y += lineH;
    ctx.fillStyle = "#6b7280"; ctx.font = "12px Arial";
    ctx.fillText(new Date().toLocaleString("pt-BR"), padX, y); y += lineH;
    groups.forEach((g) => {
      ctx.fillStyle = g.color; ctx.font = "bold 16px Arial";
      ctx.fillText(g.title, padX, y); y += lineH;
      ctx.fillStyle = "#111827"; ctx.font = "14px Arial";
      g.rows.forEach(([k, v]) => { ctx.fillText(`${k}: ${currencyBRL(v)}`, padX + 12, y); y += lineH; });
      y += 4;
    });
    sheets.forEach((sh) => {
      ctx.fillStyle = "#2563eb"; ctx.font = "bold 15px Arial";
      ctx.fillText(`Detalhes — ${sh.name}`, padX, y); y += lineH;
      ctx.fillStyle = "#6b7280"; ctx.font = "bold 11px Arial";
      ctx.fillText("Data", padX, y);
      ctx.fillText("Origem", padX + 170, y);
      ctx.fillText("Descrição", padX + 260, y);
      ctx.fillText("Valor", width - padX - 90, y);
      y += lineH;
      ctx.fillStyle = "#111827"; ctx.font = "12px Arial";
      if (sh.rows.length === 0) {
        ctx.fillStyle = "#9ca3af";
        ctx.fillText("Sem lançamentos no período.", padX, y); y += lineH;
      } else {
        sh.rows.forEach((r) => {
          const desc = (r.descricao || "-").slice(0, 60);
          ctx.fillStyle = "#111827";
          ctx.fillText(r.data, padX, y);
          ctx.fillText(r.origem, padX + 170, y);
          ctx.fillText(desc, padX + 260, y);
          ctx.fillText(currencyBRL(r.valor), width - padX - 90, y);
          y += lineH;
        });
        ctx.fillStyle = "#111827"; ctx.font = "bold 12px Arial";
        ctx.fillText(`Total: ${currencyBRL(sh.rows.reduce((s, r) => s + r.valor, 0))}`, width - padX - 200, y);
        y += lineH;
      }
      y += 6;
    });
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `resumo-financeiro-${stampFile()}.png`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  const buildRows = (pred: (iso: string) => boolean, kind: "fat" | "desp" | "lucro") => {
    const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR");
    const rowsH = histPagos.filter((h: any) => h.created_at && pred(h.created_at)).map((h: any) => {
      const fat = Number(h.valor_recebido || 0);
      const desp = Number(h.custo || 0);
      const val = kind === "fat" ? fat : kind === "desp" ? desp : fat - desp;
      return { data: fmt(h.created_at), origem: "Cliente", descricao: h.cliente_nome ?? h.cliente?.nome ?? "-", valor: val };
    });
    const rowsR = revPagos.filter((r: any) => r.data_recarga && pred(r.data_recarga)).map((r: any) => {
      const fat = Number(r.valor_venda || 0);
      const desp = Number(r.custo || 0);
      const val = kind === "fat" ? fat : kind === "desp" ? desp : fat - desp;
      return { data: fmt(r.data_recarga), origem: "Revendedor", descricao: r.revendedor_nome ?? r.revendedor?.nome ?? r.nome ?? "-", valor: val };
    });
    const rowsA = ativLinhas.filter((a) => a.data && pred(a.data)).map((a) => {
      const val = kind === "fat" ? a.valor : kind === "desp" ? a.custo : a.valor - a.custo;
      return { data: fmt(a.data), origem: "Ativação de app", descricao: a.nome, valor: val };
    });
    return [...rowsH, ...rowsR, ...rowsA].sort((a, b) => (a.data < b.data ? 1 : -1));
  };
  const openDetail = (label: string, period: "dia" | "semana" | "mes" | "ano", kind: "fat" | "desp" | "lucro") => {
    const pred = period === "dia" ? inDay : period === "semana" ? inWeek : period === "mes" ? inMonth : inYear;
    const tone = kind === "fat" ? "green" : kind === "desp" ? "red" : "blue";
    setDetail({ title: label, rows: buildRows(pred, kind), tone });
  };

  // ===== Indicadores de créditos e revendedores =====
  const creditosDisponiveis = Object.values(saldos).reduce((s: number, v: any) => s + Number(v || 0), 0);
  const creditosConsumidosClientes = movsCredF
    .filter((m: any) => ["ativacao", "renovacao"].includes(m.tipo))
    .reduce((s: number, m: any) => s + Math.abs(Number(m.quantidade || 0)), 0);
  const creditosVendidosRevendedores = movsCredF
    .filter((m: any) => m.tipo === "venda_revendedor")
    .reduce((s: number, m: any) => s + Math.abs(Number(m.quantidade || 0)), 0);

  // Receita revendedores (hoje e total)
  const isSameDay = (a: string, b: Date) => new Date(a).toDateString() === b.toDateString();
  const revsHojeVenda = revVendas
    .filter((r: any) => r.data_recarga && new Date(r.data_recarga).toDateString() === today.toDateString())
    .reduce((s: number, r: any) => s + Number(r.valor_venda || 0), 0);
  const revsHojeLucro = revVendas
    .filter((r: any) => r.data_recarga && new Date(r.data_recarga).toDateString() === today.toDateString())
    .reduce((s: number, r: any) => s + Number(r.lucro || 0), 0);
  const receitaRevTotal = revVendas.reduce((s: number, r: any) => s + Number(r.valor_venda || 0), 0);
  const lucroRevTotal = revVendas.reduce((s: number, r: any) => s + Number(r.lucro || 0), 0);

  const faturamentoDiaConsolidado = fatHoje + revsHojeVenda;
  const lucroDiaClientes = historicoF
    .filter((h: any) => sameDay(today, new Date(h.created_at)))
    .reduce((s: number, h: any) => s + Number(h.lucro || 0), 0);
  const lucroDiaConsolidado = lucroDiaClientes + revsHojeLucro;

  const totalCompras = movsCredF
    .filter((m: any) => m.tipo === "compra")
    .reduce((s: number, m: any) => s + Number(m.quantidade || 0), 0);
  const totalConsumidoClientes = creditosConsumidosClientes;
  const totalVendidoRev = creditosVendidosRevendedores;
  const saldoFinal = creditosDisponiveis;

  // Investimento e lucro acumulados a partir do marco atual.
  const investimentoCreditos = historicoF.reduce((s: number, h: any) => s + Number(h.custo || 0), 0)
    + revVendas.reduce((s: number, r: any) => s + Number(r.custo || 0), 0);
  const lucroAcumulado = historicoF.reduce((s: number, h: any) => s + Number(h.lucro || 0), 0) + lucroRevTotal;

  // ============================================================
  //  CENTRAL DE GESTÃO COMERCIAL
  // ============================================================
  const inPeriod = (iso: string | null | undefined, pred: (iso: string) => boolean) => !!iso && pred(iso);

  // ---- Renovações ----
  const renovDia = historicoF.filter((h: any) => inPeriod(h.created_at, inDay)).length;
  const renovMes = historicoF.filter((h: any) => inPeriod(h.created_at, inMonth)).length;
  const renovAno = historicoF.filter((h: any) => inPeriod(h.created_at, inYear)).length;
  const receitaRenov = histPagos.reduce((s: number, h: any) => s + Number(h.valor_recebido || 0), 0);
  const lucroRenov = histPagos.reduce((s: number, h: any) => s + Number(h.lucro || 0), 0);
  const mediaRenovDia = diaMes > 0 ? renovMes / diaMes : 0;
  const clientesRenovadosHoje = new Set(
    historicoF.filter((h: any) => inPeriod(h.created_at, inDay)).map((h: any) => h.cliente_id).filter(Boolean)
  ).size;
  const proximosVencer = clientes.filter((c: any) => {
    const d = diasParaVencer(c.data_vencimento);
    return d !== null && d >= 0 && d <= 7;
  }).length;

  // ---- Créditos ----
  const creditosComprados = movsCredF
    .filter((m: any) => m.tipo === "compra")
    .reduce((s: number, m: any) => s + Number(m.quantidade || 0), 0);
  const creditosPosseRev = revendedores.reduce((s: number, r: any) => s + Number(r.creditos || 0), 0);
  const consumoCredDia = movsCredF
    .filter((m: any) => ["ativacao", "renovacao"].includes(m.tipo) && inPeriod(m.created_at, inDay))
    .reduce((s: number, m: any) => s + Math.abs(Number(m.quantidade || 0)), 0);
  const consumoCredMes = movsCredF
    .filter((m: any) => ["ativacao", "renovacao"].includes(m.tipo) && inPeriod(m.created_at, inMonth))
    .reduce((s: number, m: any) => s + Math.abs(Number(m.quantidade || 0)), 0);
  const consumoCredAno = movsCredF
    .filter((m: any) => ["ativacao", "renovacao"].includes(m.tipo) && inPeriod(m.created_at, inYear))
    .reduce((s: number, m: any) => s + Math.abs(Number(m.quantidade || 0)), 0);
  // Custo real das compras vem da tabela creditos_compras (valor_total gerado
  // por quantidade * valor_unitario). As movimentações não carregam valor.
  const custoTotalCred = (comprasCred as any[]).reduce(
    (s: number, c: any) => s + Number(c.valor_total ?? Number(c.quantidade || 0) * Number(c.valor_unitario || 0)),
    0,
  );
  const totalCompradoReal = (comprasCred as any[]).reduce((s: number, c: any) => s + Number(c.quantidade || 0), 0);
  const valorMedioCred = totalCompradoReal > 0 ? custoTotalCred / totalCompradoReal : 0;
  // Preço médio de venda ao revendedor e lucro médio por crédito.
  const receitaVendaRevTotal = revVendas.reduce((s: number, r: any) => s + Number(r.valor_venda || 0), 0);
  const precoMedioVendaCred = creditosVendidosRevendedores > 0 ? receitaVendaRevTotal / creditosVendidosRevendedores : 0;
  const lucroMedioCred = precoMedioVendaCred > 0 ? precoMedioVendaCred - valorMedioCred : 0;
  const consumoMedioDia = diaMes > 0 ? consumoCredMes / diaMes : 0;
  const projecaoDuracaoDias = consumoMedioDia > 0 ? Math.floor(creditosDisponiveis / consumoMedioDia) : 0;

  // ---- Revendedores ----
  const revAtivos = revendedores.filter((r: any) => r.status === "ativo" || !r.status).length;
  const revInativos = revendedores.filter((r: any) => r.status === "inativo").length;
  const credVendDia = movsCredF
    .filter((m: any) => m.tipo === "venda_revendedor" && inPeriod(m.created_at, inDay))
    .reduce((s: number, m: any) => s + Math.abs(Number(m.quantidade || 0)), 0);
  const credVendMes = movsCredF
    .filter((m: any) => m.tipo === "venda_revendedor" && inPeriod(m.created_at, inMonth))
    .reduce((s: number, m: any) => s + Math.abs(Number(m.quantidade || 0)), 0);
  const credVendAno = movsCredF
    .filter((m: any) => m.tipo === "venda_revendedor" && inPeriod(m.created_at, inYear))
    .reduce((s: number, m: any) => s + Math.abs(Number(m.quantidade || 0)), 0);
  const vendasRevDia = revVendas.filter((r: any) => r.data_recarga && new Date(r.data_recarga).toDateString() === today.toDateString()).length;
  const rankingRev = (() => {
    const map = new Map<string, { nome: string; total: number; receita: number }>();
    revVendas.forEach((r: any) => {
      const id = r.revendedor_id ?? "?";
      const nome = r.revendedor?.nome ?? r.nome ?? "—";
      const cur = map.get(id) ?? { nome, total: 0, receita: 0 };
      cur.total += 1;
      cur.receita += Number(r.valor_venda || 0);
      map.set(id, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.receita - a.receita).slice(0, 5);
  })();
  const nowMs = today.getTime();
  const ultimaMovRev = (rid: string) => {
    const t = revMovs
      .filter((m: any) => m.revendedor_id === rid && m.created_at)
      .map((m: any) => new Date(m.created_at).getTime());
    return t.length ? Math.max(...t) : 0;
  };
  const semMov30 = revendedores.filter((r: any) => {
    const u = ultimaMovRev(r.id);
    const diff = (nowMs - u) / 86400000;
    return diff >= 30 && diff < 60;
  }).length;
  const semMov60 = revendedores.filter((r: any) => {
    const u = ultimaMovRev(r.id);
    const diff = (nowMs - u) / 86400000;
    return diff >= 60;
  }).length;

  // ---- Consolidado ----
  const receitaTotalCentral = receitaRenov + receitaRevTotal;
  const investimentoTotal = investimentoCreditos;
  const lucroTotalCentral = lucroRenov + lucroRevTotal;

  // ---- Gráficos ----
  const monthlyCred = (() => {
    const map = new Map<string, { compras: number; consumo: number; venda: number; saldo: number }>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      map.set(monthKey(d), { compras: 0, consumo: 0, venda: 0, saldo: 0 });
    }
    movsCredF.forEach((m: any) => {
      const key = monthKey(new Date(m.created_at));
      if (!map.has(key)) return;
      const cur = map.get(key)!;
      if (m.tipo === "compra") cur.compras += Number(m.quantidade || 0);
      if (["ativacao", "renovacao"].includes(m.tipo)) cur.consumo += Math.abs(Number(m.quantidade || 0));
      if (m.tipo === "venda_revendedor") cur.venda += Math.abs(Number(m.quantidade || 0));
    });
    // Saldo acumulado ao longo dos meses (compras − consumo − vendas p/ rev.)
    let acc = 0;
    return Array.from(map.entries()).map(([k, v]) => {
      acc += v.compras - v.consumo - v.venda;
      return { mes: monthLabel(k), ...v, saldo: acc };
    });
  })();

  // ---- Exportações ----
  const download = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  const toCSV = (rows: Record<string, any>[]) => {
    if (!rows.length) return "";
    const headers = Object.keys(rows[0]);
    const esc = (v: any) => {
      const s = String(v ?? "");
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [headers.join(";"), ...rows.map((r) => headers.map((h) => esc(r[h])).join(";"))].join("\n");
  };
  const rowsRenov = () => histPagos.map((h: any) => ({
    Data: h.created_at ? new Date(h.created_at).toLocaleString("pt-BR") : "-",
    Cliente: h.cliente_nome ?? h.cliente?.nome ?? "-",
    Dias: h.dias_adicionados ?? h.dias ?? "-",
    ValorRecebido: Number(h.valor_recebido || 0),
    Custo: Number(h.custo || 0),
    Lucro: Number(h.lucro || 0),
  }));
  const rowsCred = () => movsCredF.map((m: any) => ({
    Data: m.created_at ? new Date(m.created_at).toLocaleString("pt-BR") : "-",
    Tipo: m.tipo,
    Servidor: m.servidor?.nome ?? "-",
    Quantidade: Number(m.quantidade || 0),
    Valor: Number(m.valor_total || m.valor || 0),
    Observacao: m.observacao ?? "",
  }));
  const rowsRev = () => revMovs.map((m: any) => ({
    Data: m.created_at ? new Date(m.created_at).toLocaleString("pt-BR") : "-",
    Revendedor: m.revendedor?.nome ?? "-",
    Tipo: m.tipo,
    Creditos: Number(m.quantidade || 0),
    ValorPago: Number(m.valor_pago || 0),
    Custo: Number(m.custo || 0),
    Lucro: Number(m.lucro || 0),
  }));
  const resumoCentralRows = [
    { Grupo: "Renovações", Indicador: "Dia", Valor: renovDia },
    { Grupo: "Renovações", Indicador: "Mês", Valor: renovMes },
    { Grupo: "Renovações", Indicador: "Ano", Valor: renovAno },
    { Grupo: "Renovações", Indicador: "Receita", Valor: receitaRenov },
    { Grupo: "Renovações", Indicador: "Lucro", Valor: lucroRenov },
    { Grupo: "Créditos", Indicador: "Disponíveis", Valor: creditosDisponiveis },
    { Grupo: "Créditos", Indicador: "Comprados", Valor: creditosComprados },
    { Grupo: "Créditos", Indicador: "Consumidos Clientes", Valor: creditosConsumidosClientes },
    { Grupo: "Créditos", Indicador: "Vendidos p/ Revendedores", Valor: creditosVendidosRevendedores },
    { Grupo: "Créditos", Indicador: "Custo Investido", Valor: custoTotalCred },
    { Grupo: "Créditos", Indicador: "Preço Médio Compra", Valor: valorMedioCred },
    { Grupo: "Créditos", Indicador: "Preço Médio Venda", Valor: precoMedioVendaCred },
    { Grupo: "Revendedores", Indicador: "Ativos", Valor: revAtivos },
    { Grupo: "Revendedores", Indicador: "Inativos", Valor: revInativos },
    { Grupo: "Revendedores", Indicador: "Vendas Créditos (mês)", Valor: credVendMes },
    { Grupo: "Revendedores", Indicador: "Receita", Valor: receitaRevTotal },
    { Grupo: "Revendedores", Indicador: "Lucro", Valor: lucroRevTotal },
    { Grupo: "Resultado Total", Indicador: "Receita", Valor: receitaTotalCentral },
    { Grupo: "Resultado Total", Indicador: "Investimento", Valor: investimentoTotal },
    { Grupo: "Resultado Total", Indicador: "Lucro", Valor: lucroTotalCentral },
  ];

  const exportCentralExcel = (which: "renovacoes" | "creditos" | "revendedores" | "consolidado") => {
    const wb = XLSX.utils.book_new();
    if (which === "consolidado" || which === "renovacoes")
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rowsRenov()), "Renovações");
    if (which === "consolidado" || which === "creditos")
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rowsCred()), "Créditos");
    if (which === "consolidado" || which === "revendedores")
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rowsRev()), "Revendedores");
    if (which === "consolidado")
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumoCentralRows), "Resumo");
    XLSX.writeFile(wb, `central-comercial-${which}-${stampFile()}.xlsx`);
  };
  const exportCentralCSV = (which: "renovacoes" | "creditos" | "revendedores" | "consolidado") => {
    const map: Record<string, Record<string, any>[]> = {
      renovacoes: rowsRenov(), creditos: rowsCred(), revendedores: rowsRev(), consolidado: resumoCentralRows,
    };
    download(new Blob([toCSV(map[which])], { type: "text/csv;charset=utf-8" }), `central-comercial-${which}-${stampFile()}.csv`);
  };
  const exportCentralPDF = (which: "renovacoes" | "creditos" | "revendedores" | "consolidado") => {
    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const margin = 12; const pageH = pdf.internal.pageSize.getHeight();
    let y = margin;
    const nextLine = (h: number) => { if (y + h > pageH - margin) { pdf.addPage(); y = margin; } };
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(14); pdf.setTextColor(37, 99, 235);
    pdf.text(`Central Comercial — ${which}`, margin, y); y += 7;
    pdf.setFontSize(9); pdf.setTextColor(120); pdf.text(new Date().toLocaleString("pt-BR"), margin, y); y += 7;
    const printTable = (title: string, rows: Record<string, any>[]) => {
      if (!rows.length) return;
      nextLine(8);
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(11); pdf.setTextColor(37, 99, 235);
      pdf.text(title, margin, y); y += 5;
      const headers = Object.keys(rows[0]);
      const colW = (185 - margin) / headers.length;
      pdf.setFontSize(8); pdf.setTextColor(80);
      headers.forEach((h, i) => pdf.text(String(h), margin + i * colW, y));
      y += 3; pdf.setDrawColor(200); pdf.line(margin, y, 185, y); y += 3;
      pdf.setTextColor(20); pdf.setFont("helvetica", "normal");
      rows.forEach((r) => {
        nextLine(4);
        headers.forEach((h, i) => {
          const v = r[h]; const s = typeof v === "number" ? (h.toLowerCase().includes("valor") || h.toLowerCase().includes("custo") || h.toLowerCase().includes("lucro") || h.toLowerCase().includes("receita") ? currencyBRL(v) : String(v)) : String(v ?? "");
          pdf.text(s.slice(0, Math.floor(colW / 1.6)), margin + i * colW, y);
        });
        y += 4;
      });
      y += 4;
    };
    if (which === "consolidado") {
      printTable("Resumo", resumoCentralRows);
      printTable("Renovações", rowsRenov());
      printTable("Créditos", rowsCred());
      printTable("Revendedores", rowsRev());
    } else if (which === "renovacoes") printTable("Renovações", rowsRenov());
    else if (which === "creditos") printTable("Créditos", rowsCred());
    else printTable("Revendedores", rowsRev());
    pdf.save(`central-comercial-${which}-${stampFile()}.pdf`);
  };

  return (
    <div className="p-4 space-y-3">
      <Tabs defaultValue="dashboard" className="w-full space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-border/40">
          <div>
            <h1 className="text-xl font-bold leading-tight">Painel Principal</h1>
            <p className="text-xs text-muted-foreground">Visão geral do sistema e indicadores consolidados</p>
          </div>
          <TabsList className="bg-muted/60 p-1">
            <TabsTrigger value="dashboard" className="gap-2 text-xs">
              <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="central" className="gap-2 text-xs">
              <Target className="h-3.5 w-3.5 text-primary" /> Central de Gestão
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="dashboard" className="mt-0 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold leading-tight">Dashboard de Clientes</h2>
              <p className="text-xs text-muted-foreground">Visão geral dos seus clientes e faturamento</p>
            </div>
            <Button size="sm" variant="outline" onClick={refreshAll} disabled={refreshing}>
              <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} /> {refreshing ? "Atualizando..." : "Atualizar"}
            </Button>
          </div>

      {baixos.length > 0 && (
        <Card className="p-2.5 border-red-500/40 bg-red-500/5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-red-400 flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5" /> Créditos baixos
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {baixos.map((s: any) => `${s.nome} (${saldos[s.id] ?? 0})`).join(" · ")}
              </div>
            </div>
            <Link to="/creditos" className="text-xs text-primary hover:underline shrink-0">Repor →</Link>
          </div>
        </Card>
      )}

      <GlobalClienteSearch />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-1.5">💰 Resumo Financeiro</h2>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-7 px-2" onClick={exportResumoPDF}>
            <FileText className="h-3 w-3 mr-1" /> PDF
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2" onClick={exportResumoPNG}>
            <FileImage className="h-3 w-3 mr-1" /> PNG
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2" onClick={exportResumoExcel}>
            <FileSpreadsheet className="h-3 w-3 mr-1" /> Excel
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* ===== Faturamento Diário ===== */}
        <Card className="p-3 space-y-2 border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-5 w-5 text-emerald-400" />
              <h3 className="text-base font-semibold">Faturamento Diário</h3>
            </div>
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Hoje</span>
          </div>
          <FinCell label="Faturamento" value={fatDia} tone="green" onClick={() => openDetail("Faturamento do Dia", "dia", "fat")} />
          <FinCell label="Despesas" value={despDia} tone="red" onClick={() => openDetail("Despesa do Dia", "dia", "desp")} />
          <FinCell label="Lucro Líquido" value={lucroDia} tone="blue" onClick={() => openDetail("Lucro do Dia", "dia", "lucro")} />
          <div className="pt-1 border-t border-border/40 space-y-1 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>Ontem</span><span className="tabular-nums">{currencyBRL(fatOntemFin)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Variação</span>
              <span className={cn("font-semibold tabular-nums flex items-center gap-0.5",
                pct(fatDia, fatOntemFin) >= 0 ? "text-emerald-400" : "text-red-400")}>
                {pct(fatDia, fatOntemFin) >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {pct(fatDia, fatOntemFin).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Lucro ontem</span>
              <span className="tabular-nums">{currencyBRL(lucroOntemFin)}</span>
            </div>
          </div>
        </Card>

        {/* ===== Faturamento Semanal ===== */}
        <Card className="p-3 space-y-2 border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <CalendarClock className="h-5 w-5 text-amber-400" />
              <h3 className="text-base font-semibold">Faturamento Semanal</h3>
            </div>
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Semana atual</span>
          </div>
          <FinCell label="Faturamento" value={fatSemana} tone="green" onClick={() => openDetail("Faturamento da Semana", "semana", "fat")} />
          <FinCell label="Despesas" value={despSemana} tone="red" onClick={() => openDetail("Despesa da Semana", "semana", "desp")} />
          <FinCell label="Lucro Líquido" value={lucroSemana} tone="blue" onClick={() => openDetail("Lucro da Semana", "semana", "lucro")} />
          <div className="rounded-md border border-border/60 bg-background/40">
            <div className="flex items-center justify-between px-2 py-1 text-xs font-semibold border-b border-border/60">
              <span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5 text-amber-400" /> Fechamento da semana</span>
              <span className="text-muted-foreground">Fat. · Desp. · Lucro</span>
            </div>
            <div className="max-h-[160px] overflow-auto divide-y divide-border/40">
              {diasSemana.map((d) => (
                <div key={d.label} className="flex items-center justify-between gap-2 px-2 py-1 text-xs tabular-nums">
                  <span className="text-muted-foreground w-16 shrink-0 capitalize">{d.label}</span>
                  <span className="flex-1 text-right text-emerald-400">{currencyBRL(d.fat)}</span>
                  <span className="flex-1 text-right text-red-400">{currencyBRL(d.desp)}</span>
                  <span className={cn("flex-1 text-right font-semibold", d.lucro >= 0 ? "text-blue-400" : "text-red-400")}>{currencyBRL(d.lucro)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="pt-1 border-t border-border/40 space-y-1 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>Semana anterior</span><span className="tabular-nums">{currencyBRL(fatSemanaAnt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Variação</span>
              <span className={cn("font-semibold tabular-nums flex items-center gap-0.5",
                pct(fatSemana, fatSemanaAnt) >= 0 ? "text-emerald-400" : "text-red-400")}>
                {pct(fatSemana, fatSemanaAnt) >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {pct(fatSemana, fatSemanaAnt).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Lucro semana anterior</span><span className="tabular-nums">{currencyBRL(lucroSemanaAnt)}</span>
            </div>
          </div>
        </Card>

        {/* ===== Faturamento Mensal ===== */}
        <Card className="p-3 space-y-2 border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <CalendarClock className="h-5 w-5 text-blue-400" />
              <h3 className="text-base font-semibold">Faturamento Mensal</h3>
            </div>
            <div className="flex items-center gap-1">
              <select
                value={mesSel}
                onChange={(e) => setMesSel(Number(e.target.value))}
                className="h-7 rounded-md border border-border/60 bg-background/60 px-1.5 text-xs capitalize"
                aria-label="Mês"
              >
                {Array.from({ length: 12 }, (_, m) => (
                  <option key={m} value={m} className="capitalize">
                    {new Date(2020, m, 1).toLocaleDateString("pt-BR", { month: "long" })}
                  </option>
                ))}
              </select>
              <select
                value={anoSel}
                onChange={(e) => setAnoSel(Number(e.target.value))}
                className="h-7 rounded-md border border-border/60 bg-background/60 px-1.5 text-xs"
                aria-label="Ano"
              >
                {Array.from({ length: 5 }, (_, i) => today.getFullYear() - i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
          <FinCell label="Faturamento" value={fatMes} tone="green" onClick={() => openDetail("Faturamento do Mês", "mes", "fat")} />
          <FinCell label="Despesas" value={despMes} tone="red" onClick={() => openDetail("Despesa do Mês", "mes", "desp")} />
          <FinCell label="Lucro Líquido" value={lucroMes} tone="blue" onClick={() => openDetail("Lucro do Mês", "mes", "lucro")} />
          <div className="pt-1 border-t border-border/40 space-y-1">
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                <TrendingUp className="h-3 w-3" /> 🟢 Maior dia
              </span>
              <span className="tabular-nums text-emerald-400 font-bold">
                {maiorDia ? `${mesNomeBR(maiorDia.date)} · ${currencyBRL(maiorDia.valor)}` : "—"}
              </span>
            </div>
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-red-400 font-semibold">
                <TrendingDown className="h-3 w-3" /> 🔴 Menor dia
              </span>
              <span className="tabular-nums text-red-400 font-bold">
                {menorDia ? `${mesNomeBR(menorDia.date)} · ${currencyBRL(menorDia.valor)}` : "—"}
              </span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground px-1">
              <span>Média/dia ativo</span>
              <span className="tabular-nums">{currencyBRL(mediaDiaMes)}</span>
            </div>
            <div className="rounded-md border border-border/60 bg-background/40">
              <div className="flex items-center justify-between px-2 py-1 text-xs font-semibold border-b border-border/60">
                <span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5 text-blue-400" /> Fechamento diário</span>
                <span className="text-muted-foreground">Fat. · Desp. · Lucro</span>
              </div>
              <div className="max-h-[160px] overflow-auto divide-y divide-border/40">
                {fechamentoDiario.map((d) => (
                  <div key={d.dia} className="flex items-center justify-between gap-2 px-2 py-1 text-xs tabular-nums">
                    <span className="text-muted-foreground w-8 shrink-0">{String(d.dia).padStart(2, "0")}</span>
                    <span className="flex-1 text-right text-emerald-400">{currencyBRL(d.fat)}</span>
                    <span className="flex-1 text-right text-red-400">{currencyBRL(d.desp)}</span>
                    <span className={cn("flex-1 text-right font-semibold", d.lucro >= 0 ? "text-blue-400" : "text-red-400")}>{currencyBRL(d.lucro)}</span>
                  </div>
                ))}
                {fechamentoDiario.length === 0 && (
                  <div className="px-2 py-2 text-xs text-muted-foreground text-center">Sem lançamentos no mês.</div>
                )}
              </div>
            </div>
          </div>
        </Card>

      </div>

      <IndicadoresBasePanel />

      {/* ===== Destaques do ano ===== */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-3">Destaques do ano</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {([
            { titulo: "3 maiores vendas diárias", itens: top3Maiores, max: maxDiaAno, cor: "emerald", Icon: TrendingUp },
            { titulo: "3 piores vendas diárias", itens: top3Menores, max: maxDiaAno, cor: "orange", Icon: TrendingDown },
            { titulo: "3 dias de maior lucro", itens: top3Lucros, max: maxLucroAno, cor: "blue", Icon: TrendingUp },
            { titulo: "3 dias de maior despesa", itens: top3Despesas, max: maxDespAno, cor: "red", Icon: TrendingDown },
          ] as const).map((bloco) => {
            const texto = { emerald: "text-emerald-400", orange: "text-orange-400", blue: "text-blue-400", red: "text-red-400" }[bloco.cor];
            const borda = { emerald: "border-emerald-500/40 bg-emerald-500/10", orange: "border-orange-500/40 bg-orange-500/10", blue: "border-blue-500/40 bg-blue-500/10", red: "border-red-500/40 bg-red-500/10" }[bloco.cor];
            const barra = { emerald: "bg-emerald-400", orange: "bg-orange-400", blue: "bg-blue-400", red: "bg-red-400" }[bloco.cor];
            const badge = { emerald: "bg-emerald-500/25", orange: "bg-orange-500/25", blue: "bg-blue-500/25", red: "bg-red-500/25" }[bloco.cor];
            return (
              <div key={bloco.titulo} className="space-y-2">
                <div className={cn("flex items-center gap-1 text-sm font-semibold", texto)}>
                  <bloco.Icon className="h-4 w-4" /> {bloco.titulo}
                </div>
                <div className="space-y-1.5">
                  {bloco.itens.length === 0 && <div className="text-sm text-muted-foreground">Sem lançamentos no ano.</div>}
                  {bloco.itens.map((d, i) => (
                    <div key={d.date.toISOString()} className={cn("rounded-md border px-2 py-1.5", borda)}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("flex items-center gap-1 text-sm font-semibold", texto)}>
                          <span className={cn("h-5 w-5 rounded-full grid place-items-center text-[10px]", badge)}>{i + 1}</span>
                          {dataLongaBR(d.date)}
                        </span>
                        <span className={cn("tabular-nums text-base font-bold", texto)}>{currencyBRL(d.valor)}</span>
                      </div>
                      <div className="text-xs capitalize text-muted-foreground mt-0.5">{mesAnoBR(d.date)}</div>
                      <div className="mt-1 h-1.5 rounded bg-background/60 overflow-hidden">
                        <div className={cn("h-full", barra)} style={{ width: `${bloco.max ? (Math.abs(d.valor) / Math.abs(bloco.max)) * 100 : 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      </TabsContent>

      <TabsContent value="central" className="mt-0">
        <CentralGestao />
      </TabsContent>
    </Tabs>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{detail?.title}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(detail?.rows ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sem lançamentos no período.</TableCell></TableRow>
                ) : detail!.rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="whitespace-nowrap">{r.data}</TableCell>
                    <TableCell>{r.origem}</TableCell>
                    <TableCell>{r.descricao}</TableCell>
                    <TableCell className={cn("text-right font-semibold", detail!.tone === "green" && "text-emerald-400", detail!.tone === "red" && "text-red-400", detail!.tone === "blue" && "text-blue-400")}>{currencyBRL(r.valor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {detail && detail.rows.length > 0 && (
            <div className="flex justify-end pt-2 border-t text-sm">
              <span className="text-muted-foreground mr-2">Total:</span>
              <span className={cn("font-bold", detail.tone === "green" && "text-emerald-400", detail.tone === "red" && "text-red-400", detail.tone === "blue" && "text-blue-400")}>
                {currencyBRL(detail.rows.reduce((s, r) => s + r.valor, 0))}
              </span>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-bold ${tone}`}>{value}</div>
    </div>
  );
}

function ResumoItem({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-bold ${tone}`}>{value}</div>
    </div>
  );
}

function FinCell({ label, value, tone, onClick }: { label: string; value: number; tone: "green" | "red" | "blue"; onClick: () => void }) {
  const toneClass = tone === "green" ? "text-emerald-400 hover:border-emerald-500/60 hover:bg-emerald-500/5"
    : tone === "red" ? "text-red-400 hover:border-red-500/60 hover:bg-red-500/5"
    : "text-blue-400 hover:border-blue-500/60 hover:bg-blue-500/5";
  return (
    <button type="button" onClick={onClick} className={`w-full rounded-md border border-border/60 px-2 py-1.5 text-left transition flex items-baseline justify-between gap-2 ${toneClass}`}>
      <span className="text-xs text-muted-foreground uppercase">{label}</span>
      <span className={`text-lg font-bold tabular-nums ${tone === "green" ? "text-emerald-400" : tone === "red" ? "text-red-400" : "text-blue-400"}`}>{currencyBRL(value)}</span>
    </button>
  );
}

