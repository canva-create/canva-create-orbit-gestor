import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchClientes, fetchServidores, fetchHistorico, fetchSaldosCreditos, fetchRevendedores, fetchMovimentacoesCreditos, fetchRevendedoresMovs, fetchComprasCreditos, fetchAtivacoesApps, limparCacheLocal } from "@/lib/queries";
import { fetchFinanceiro } from "@/lib/faturamento";
import { Link } from "@tanstack/react-router";
import { StatCard } from "@/components/stat-card";
import { Users, AlertTriangle, Clock, CalendarClock, DollarSign, TrendingUp, Wallet, Layers, RefreshCw, CreditCard, Package, Flame, ShoppingCart, TrendingDown, Undo2 } from "lucide-react";
import { currencyBRL, diasParaVencer } from "@/lib/iptv";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { FileText, FileImage, FileSpreadsheet } from "lucide-react";
import { GlobalClienteSearch } from "@/components/global-cliente-search";
import { FaturamentoDetalhadoPanel } from "@/components/faturamento-detalhado-panel";
import { AnaliseBaseDialog } from "@/components/analise-base-dialog";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { reverterLancamentoFaturamento } from "@/lib/reverter-renovacao";

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
  const { data: financeiro = [] } = useQuery({ queryKey: ["faturamento_bruto_dia"], queryFn: fetchFinanceiro });
  const [detail, setDetail] = useState<null | {
    title: string;
    rows: Array<{ id?: string; tipo?: "cliente" | "revendedor" | "ativacao" | "ativacao_app"; raw?: any; data: string; origem: string; descricao: string; valor: number }>;
    tone: "green" | "red" | "blue";
  }>(null);
  const [revertingId, setRevertingId] = useState<string | null>(null);
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
      // Invalida as queries ativas na tela para sincronização total
      await queryClient.invalidateQueries({
        predicate: (query) => [
          "clientes",
          "servidores",
          "historico",
          "creditos_saldos",
          "revendedores",
          "creditos_movs",
          "revendedores_movs",
          "creditos_compras",
          "ativacoes_apps",
          "faturamento_bruto_dia",
        ].includes(query.queryKey[0] as string),
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

  const toLocalDateStr = (d: Date | string | null | undefined): string => {
    if (!d) return "";
    const dt = typeof d === "string" ? new Date(d) : d;
    if (isNaN(dt.getTime())) return "";
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const afterCutoff = (iso: string | null | undefined) => !!iso;
  const historicoF = historico.filter((h: any) => afterCutoff(h.created_at) && h.status !== "cancelada");

  // Unificação e normalização completa de todos os lançamentos financeiros a partir de fetchFinanceiro
  const financialRecords = (financeiro as any[]).map((r: any) => ({
    id: r.id,
    tipo: (r.tipo === "ativacao_app" ? "ativacao" : r.tipo) as "cliente" | "revendedor" | "ativacao",
    origem: (r.tipo === "cliente" ? "Cliente" : r.tipo === "revendedor" ? "Revendedor" : "Ativação de app") as "Cliente" | "Revendedor" | "Ativação de app",
    descricao: r.descricao || r.cliente_nome || "—",
    data: r.created_at,
    dataStr: toLocalDateStr(r.created_at),
    valor: Number(r.valor || 0),
    custo: Number(r.custo || 0),
    lucro: Number(r.lucro || 0),
    status_pagamento: (r.status_pagamento || "pago") as "pago" | "devendo",
    raw: r.raw ?? r,
  }));

  // Estruturas derivadas compatíveis
  const revVendas = financialRecords
    .filter((r) => r.tipo === "revendedor")
    .map((r) => ({
      id: r.id,
      data_recarga: r.data,
      valor_venda: r.valor,
      custo: r.custo,
      lucro: r.lucro,
      revendedor_id: r.raw?.revendedor_id,
      revendedor: r.raw?.revendedor,
      nome: r.descricao,
    }));

  const ativLinhas = financialRecords
    .filter((r) => r.tipo === "ativacao")
    .map((r) => ({
      id: r.id,
      data: r.data,
      valor: r.valor,
      custo: r.custo,
      lucro: r.lucro,
      nome: r.descricao,
    }));

  const movsCredF = movsCred.filter((m: any) => afterCutoff(m.created_at));

  const ativos = clientes.filter((c: any) => {
    const d = diasParaVencer(c.data_vencimento);
    return (d === null || d >= 0) && c.status !== "cancelado" && c.status !== "suspenso";
  }).length;
  const vencidos = clientes.filter((c: any) => {
    if (c.status === "cancelado" || c.status === "suspenso") return false;
    const d = diasParaVencer(c.data_vencimento);
    const isArquivado = d !== null && d < -365;
    if (isArquivado) return false;
    return (d !== null && d < 0) || (c.status === "vencido" && (d === null || d < 0));
  }).length;
  const total = ativos + vencidos;
  const hoje = clientes.filter((c: any) => diasParaVencer(c.data_vencimento) === 0).length;
  const amanha = clientes.filter((c: any) => diasParaVencer(c.data_vencimento) === 1).length;
  const pendentes = clientes.filter((c: any) => c.status_pagamento === "devendo").length;

  const porServidor = servidores.map((s: any) => {
    const doServidor = clientes.filter((c: any) => c.servidor_id === s.id);
    const ativos = doServidor.filter((c: any) => {
      const d = diasParaVencer(c.data_vencimento);
      return (d === null || d >= 0) && c.status !== "cancelado" && c.status !== "suspenso";
    }).length;
    const vencidos = doServidor.filter((c: any) => {
      if (c.status === "cancelado" || c.status === "suspenso") return false;
      const d = diasParaVencer(c.data_vencimento);
      const isArquivado = d !== null && d < -365;
      if (isArquivado) return false;
      return (d !== null && d < 0) || (c.status === "vencido" && (d === null || d < 0));
    }).length;
    return { nome: s.nome, qtd: doServidor.length, ativos, vencidos };
  });

  // ===== Filtros de Período e Agregações =====
  const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const today = startOfDay(new Date());
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const dayBefore = new Date(today); dayBefore.setDate(today.getDate() - 2);

  const todayStr = toLocalDateStr(today);
  const yesterdayStr = toLocalDateStr(yesterday);
  const dayBeforeStr = toLocalDateStr(dayBefore);

  const inDay = (iso: string) => toLocalDateStr(iso) === todayStr;
  const inYesterday = (iso: string) => toLocalDateStr(iso) === yesterdayStr;
  const inDayBefore = (iso: string) => toLocalDateStr(iso) === dayBeforeStr;

  const selMonthPrefix = `${anoSel}-${String(mesSel + 1).padStart(2, "0")}`;
  const inMonth = (iso: string) => toLocalDateStr(iso).startsWith(selMonthPrefix);

  const selYearPrefix = `${anoSel}-`;
  const inYear = (iso: string) => toLocalDateStr(iso).startsWith(selYearPrefix);

  const prevYearPrefix = `${today.getFullYear() - 1}-`;
  const inPrevYear = (iso: string) => toLocalDateStr(iso).startsWith(prevYearPrefix);

  // Semanas
  const startOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay(), 0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek.getTime() + 7 * 86400000 - 1);
  const startOfPrevWeek = new Date(startOfWeek.getTime() - 7 * 86400000);
  const endOfPrevWeek = new Date(startOfWeek.getTime() - 1);

  const inWeek = (iso: string) => {
    if (!iso) return false;
    const d = new Date(iso);
    return d >= startOfWeek && d <= endOfWeek;
  };
  const inPrevWeek = (iso: string) => {
    if (!iso) return false;
    const d = new Date(iso);
    return d >= startOfPrevWeek && d <= endOfPrevWeek;
  };

  // Funções de soma
  const sumFat = (pred: (iso: string) => boolean) =>
    financialRecords.filter((r) => r.data && pred(r.data)).reduce((s, r) => s + r.valor, 0);
  const sumDesp = (pred: (iso: string) => boolean) =>
    financialRecords.filter((r) => r.data && pred(r.data)).reduce((s, r) => s + r.custo, 0);
  const sumLucro = (pred: (iso: string) => boolean) =>
    financialRecords.filter((r) => r.data && pred(r.data)).reduce((s, r) => s + r.lucro, 0);

  // Totais do Resumo Financeiro
  const fatDia = sumFat(inDay), fatMes = sumFat(inMonth), fatAno = sumFat(inYear);
  const despDia = sumDesp(inDay), despMes = sumDesp(inMonth), despAno = sumDesp(inYear);
  const lucroDia = fatDia - despDia, lucroMes = fatMes - despMes, lucroAno = fatAno - despAno;

  // Semanal e Médias
  const fatSemana = sumFat(inWeek), despSemana = sumDesp(inWeek), lucroSemana = sumLucro(inWeek);
  const diasDecorridosSemana = Math.max(1, today.getDay() + 1); // Domingo = 1, Segunda = 2 ... Sábado = 7
  const renovHoje = financialRecords.filter((r) => r.tipo === "cliente" && inDay(r.data)).length;
  const renovOntem = financialRecords.filter((r) => r.tipo === "cliente" && inYesterday(r.data)).length;
  const renovAnteontem = financialRecords.filter((r) => r.tipo === "cliente" && inDayBefore(r.data)).length;
  const renovSemana = financialRecords.filter((r) => r.tipo === "cliente" && inWeek(r.data)).length;
  const mediaRenovSemana = diasDecorridosSemana > 0 ? renovSemana / diasDecorridosSemana : 0;
  const mediaFatSemanal = diasDecorridosSemana > 0 ? fatSemana / diasDecorridosSemana : 0;
  const mediaLucroSemanal = diasDecorridosSemana > 0 ? lucroSemana / diasDecorridosSemana : 0;
  const ticketMedioSemana = renovSemana > 0 ? fatSemana / renovSemana : 0;
  const revVendasSemana = financialRecords.filter((r) => r.tipo === "revendedor" && inWeek(r.data)).length;
  const ativAppsSemana = financialRecords.filter((r) => r.tipo === "ativacao" && inWeek(r.data)).length;

  const fatHoje = fatDia;
  const fatOntem = sumFat(inYesterday);

  // Média mensal de faturamento (últimos 6 meses com dados)
  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const monthLabel = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
  };

  const monthsMap = new Map<string, { renovacoes: number; faturamento: number; lucro: number }>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    monthsMap.set(monthKey(d), { renovacoes: 0, faturamento: 0, lucro: 0 });
  }
  financialRecords.forEach((r) => {
    const key = monthKey(new Date(r.data));
    if (!monthsMap.has(key)) return;
    const cur = monthsMap.get(key)!;
    if (r.tipo === "cliente") cur.renovacoes += 1;
    cur.faturamento += r.valor;
    cur.lucro += r.lucro;
  });
  const monthlyData = Array.from(monthsMap.entries()).map(([k, v]) => ({
    mes: monthLabel(k),
    ...v,
  }));

  const mesesComFat = monthlyData.filter((m) => m.faturamento > 0);
  const fatMedioMensal = mesesComFat.length
    ? mesesComFat.reduce((s, m) => s + m.faturamento, 0) / mesesComFat.length
    : 0;

  // Projeção de lucro do mês corrente
  const curMonthKey = monthKey(today);
  const curMonth = monthsMap.get(curMonthKey) ?? { renovacoes: 0, faturamento: 0, lucro: 0 };
  const diaMes = today.getDate();
  const diasNoMes = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const projecaoLucro = diaMes > 0 ? (curMonth.lucro / diaMes) * diasNoMes : 0;

  const receita = fatMes;
  const custoTotal = despMes;
  const lucro = lucroMes;


  // ===== Indicadores Diários =====
  const fatOntemFin = fatOntem;
  const despOntemFin = sumDesp(inYesterday);
  const lucroOntemFin = fatOntemFin - despOntemFin;
  const pct = (atual: number, ant: number) => (ant === 0 ? (atual > 0 ? 100 : 0) : ((atual - ant) / ant) * 100);

  // ===== Fechamento Diário do Mês Selecionado (1 a totalDiasMes) =====
  const totalDiasMes = new Date(anoSel, mesSel + 1, 0).getDate();
  const fechamentoDiario = Array.from({ length: totalDiasMes }, (_, i) => {
    const dia = i + 1;
    const dayStr = `${selMonthPrefix}-${String(dia).padStart(2, "0")}`;
    const dRecs = financialRecords.filter((r) => r.dataStr === dayStr);
    const fat = dRecs.reduce((s, r) => s + r.valor, 0);
    const desp = dRecs.reduce((s, r) => s + r.custo, 0);
    return {
      dia,
      date: new Date(anoSel, mesSel, dia),
      valor: fat,
      fat,
      desp,
      lucro: fat - desp,
      count: dRecs.length,
    };
  }).reverse();

  // Maior e Menor dia com faturamento do mês selecionado
  const diasComFat = fechamentoDiario.filter((d) => d.fat > 0);
  const maiorDia = diasComFat.length
    ? diasComFat.reduce((a, b) => (b.fat > a.fat ? b : a))
    : null;
  const menorDia = diasComFat.length
    ? diasComFat.reduce((a, b) => (b.fat < a.fat ? b : a))
    : null;
  const mediaDiaMes = diasComFat.length ? fatMes / diasComFat.length : 0;

  // Anual: comparação com ano anterior + média mensal
  const fatAnoAnt = sumFat(inPrevYear);
  const despAnoAnt = sumDesp(inPrevYear);
  const lucroAnoAnt = fatAnoAnt - despAnoAnt;
  const mesAtualIdx = today.getMonth() + 1;
  const mediaMensalFat = mesAtualIdx > 0 ? fatAno / mesAtualIdx : 0;
  const mesNomeBR = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

  const mesesAno = Array.from({ length: 12 }, (_, m) => {
    const mPrefix = `${anoSel}-${String(m + 1).padStart(2, "0")}`;
    const totalDias = new Date(anoSel, m + 1, 0).getDate();
    const mRecords = financialRecords.filter((r) => r.dataStr.startsWith(mPrefix));
    const fat = mRecords.reduce((s, r) => s + r.valor, 0);
    const desp = mRecords.reduce((s, r) => s + r.custo, 0);
    const dias = Array.from({ length: totalDias }, (_, i) => {
      const dia = i + 1;
      const dStr = `${mPrefix}-${String(dia).padStart(2, "0")}`;
      const dRecs = mRecords.filter((r) => r.dataStr === dStr);
      const dFat = dRecs.reduce((s, r) => s + r.valor, 0);
      const dDesp = dRecs.reduce((s, r) => s + r.custo, 0);
      return { dia, fat: dFat, desp: dDesp, lucro: dFat - dDesp };
    }).filter((d) => d.fat !== 0 || d.desp !== 0);

    return {
      mes: m,
      nome: new Date(anoSel, m, 1).toLocaleDateString("pt-BR", { month: "long" }),
      fat,
      desp,
      lucro: fat - desp,
      dias,
    };
  }).filter((x) => x.dias.length > 0 || x.fat > 0 || x.desp > 0);

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
    return financialRecords
      .filter((r) => r.data && pred(r.data))
      .filter((r) => {
        if (kind === "fat") return r.valor > 0;
        if (kind === "desp") return r.custo > 0;
        return true;
      })
      .map((r) => ({
        id: r.id,
        tipo: r.tipo,
        raw: r.raw,
        data: fmt(r.data),
        origem: r.origem,
        descricao: r.descricao,
        valor: kind === "fat" ? r.valor : kind === "desp" ? r.custo : r.lucro,
      }))
      .sort((a, b) => (a.data < b.data ? 1 : -1));
  };

  const openDetail = (label: string, period: "dia" | "semana" | "mes" | "ano", kind: "fat" | "desp" | "lucro") => {
    const pred = period === "dia" ? inDay : period === "semana" ? inWeek : period === "mes" ? inMonth : inYear;
    const tone = kind === "fat" ? "green" : kind === "desp" ? "red" : "blue";
    setDetail({ title: label, rows: buildRows(pred, kind), tone });
  };

  async function handleReverterLancamento(row: any) {
    if (!row?.id || !row?.tipo) return;
    setRevertingId(row.id);
    try {
      const ok = await reverterLancamentoFaturamento({
        id: row.id,
        tipo: row.tipo,
        raw: row.raw,
        descricao: row.descricao,
        valor: row.valor,
      });
      if (ok) {
        await queryClient.invalidateQueries();
        setDetail((prev) => prev ? {
          ...prev,
          rows: prev.rows.filter((r: any) => r.id !== row.id),
        } : null);
      }
    } finally {
      setRevertingId(null);
    }
  }

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
    .filter((r: any) => r.data_recarga && inDay(r.data_recarga))
    .reduce((s: number, r: any) => s + Number(r.valor_venda || 0), 0);
  const revsHojeLucro = revVendas
    .filter((r: any) => r.data_recarga && inDay(r.data_recarga))
    .reduce((s: number, r: any) => s + Number(r.lucro || 0), 0);
  const receitaRevTotal = revVendas.reduce((s: number, r: any) => s + Number(r.valor_venda || 0), 0);
  const lucroRevTotal = revVendas.reduce((s: number, r: any) => s + Number(r.lucro || 0), 0);

  const faturamentoDiaConsolidado = fatDia;
  const lucroDiaConsolidado = lucroDia;

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
  const renovDia = financialRecords.filter((r) => r.tipo === "cliente" && inDay(r.data)).length;
  const renovMes = financialRecords.filter((r) => r.tipo === "cliente" && inMonth(r.data)).length;
  const renovAno = financialRecords.filter((r) => r.tipo === "cliente" && inYear(r.data)).length;
  const receitaRenov = financialRecords.filter((r) => r.tipo === "cliente").reduce((s, r) => s + r.valor, 0);
  const lucroRenov = financialRecords.filter((r) => r.tipo === "cliente").reduce((s, r) => s + r.lucro, 0);
  const mediaRenovDia = diaMes > 0 ? renovMes / diaMes : 0;
  const clientesRenovadosHoje = new Set(
    financialRecords.filter((r) => r.tipo === "cliente" && inDay(r.data)).map((r) => r.raw?.cliente_id).filter(Boolean)
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
  const rowsRenov = () => financialRecords.filter((r) => r.tipo === "cliente").map((r) => ({
    Data: r.data ? new Date(r.data).toLocaleString("pt-BR") : "-",
    Cliente: r.descricao,
    Dias: r.raw?.dias_adicionados ?? r.raw?.dias ?? "-",
    ValorRecebido: r.valor,
    Custo: r.custo,
    Lucro: r.lucro,
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold leading-tight">Dashboard</h1>
          <p className="text-xs text-muted-foreground">Visão geral dos seus clientes e finanças</p>
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
        <h2 className="text-sm sm:text-base font-semibold flex items-center gap-1.5">💰 Resumo Financeiro</h2>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={exportResumoPDF}>
            <FileText className="h-3 w-3 mr-1" /> PDF
          </Button>
          <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={exportResumoPNG}>
            <FileImage className="h-3 w-3 mr-1" /> PNG
          </Button>
          <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={exportResumoExcel}>
            <FileSpreadsheet className="h-3 w-3 mr-1" /> Excel
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

        {/* ===== Faturamento Diário ===== */}
        <Card className="p-3.5 space-y-3 border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-transparent">
          {/* Topo: Título + Total de Renovações Hoje no lado direito */}
          <div className="flex items-center justify-between flex-wrap gap-2 pb-1 border-b border-border/40">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                <DollarSign className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold leading-none">Faturamento Diário</h3>
                <span className="text-[11px] text-muted-foreground">Movimentações de hoje</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
              <RefreshCw className="h-3.5 w-3.5" />
              <span>{renovDia} {renovDia === 1 ? "renovação hoje" : "renovações hoje"}</span>
            </div>
          </div>

          {/* Parte Superior: Faturamento Hoje, Despesa de Hoje, Lucro de Hoje */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <FinCell label="Faturamento Hoje" value={fatDia} tone="green" onClick={() => openDetail("Faturamento do Dia", "dia", "fat")} />
            <FinCell label="Despesa Hoje" value={despDia} tone="red" onClick={() => openDetail("Despesa do Dia", "dia", "desp")} />
            <FinCell label="Lucro Hoje" value={lucroDia} tone="blue" onClick={() => openDetail("Lucro do Dia", "dia", "lucro")} />
          </div>

          {/* Embaixo: Porcentagem de Vendas, Porcentagem de Lucro e Informações Semelhantes */}
          <div className="pt-2 border-t border-border/40 space-y-2.5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* Porcentagem de Vendas Hoje vs Ontem */}
              <div className="rounded-lg border border-border/60 bg-background/50 p-2.5 space-y-1">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium">
                  <span>Vendas hoje (% vs ontem)</span>
                  {pct(fatDia, fatOntemFin) >= 0 ? <TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> : <TrendingDown className="h-3.5 w-3.5 text-red-400" />}
                </div>
                <div className={cn("text-base font-bold tabular-nums", pct(fatDia, fatOntemFin) >= 0 ? "text-emerald-400" : "text-red-400")}>
                  {pct(fatDia, fatOntemFin) >= 0 ? "+" : ""}{pct(fatDia, fatOntemFin).toFixed(1)}%
                </div>
                <div className="text-[10px] text-muted-foreground truncate">
                  Ontem: {currencyBRL(fatOntemFin)}
                </div>
              </div>

              {/* Porcentagem de Lucro do Dia (Margem Líquida) */}
              <div className="rounded-lg border border-border/60 bg-background/50 p-2.5 space-y-1">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium">
                  <span>Margem de Lucro (% dia)</span>
                  <Flame className="h-3.5 w-3.5 text-blue-400" />
                </div>
                <div className="text-base font-bold tabular-nums text-blue-400">
                  {(fatDia > 0 ? (lucroDia / fatDia) * 100 : 0).toFixed(1)}%
                </div>
                <div className="text-[10px] text-muted-foreground truncate">
                  Lucro / Faturamento
                </div>
              </div>

              {/* Variação do Lucro vs Ontem */}
              <div className="rounded-lg border border-border/60 bg-background/50 p-2.5 space-y-1">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium">
                  <span>Variação de Lucro (% dia)</span>
                  {pct(lucroDia, lucroOntemFin) >= 0 ? <TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> : <TrendingDown className="h-3.5 w-3.5 text-red-400" />}
                </div>
                <div className={cn("text-base font-bold tabular-nums", pct(lucroDia, lucroOntemFin) >= 0 ? "text-emerald-400" : "text-red-400")}>
                  {pct(lucroDia, lucroOntemFin) >= 0 ? "+" : ""}{pct(lucroDia, lucroOntemFin).toFixed(1)}%
                </div>
                <div className="text-[10px] text-muted-foreground truncate">
                  Ontem: {currencyBRL(lucroOntemFin)}
                </div>
              </div>

              {/* Ticket Médio Hoje */}
              <div className="rounded-lg border border-border/60 bg-background/50 p-2.5 space-y-1">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium">
                  <span>Ticket Médio Hoje</span>
                  <ShoppingCart className="h-3.5 w-3.5 text-purple-400" />
                </div>
                <div className="text-base font-bold tabular-nums text-purple-400">
                  {currencyBRL(renovDia > 0 ? fatDia / renovDia : fatDia)}
                </div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {clientesRenovadosHoje} cliente(s) único(s)
                </div>
              </div>
            </div>

            {/* Comparativos e informações adicionais do dia */}
            <div className="rounded-lg border border-border/60 bg-background/40 p-2.5 text-xs space-y-1.5">
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Comprometimento de Despesas hoje:</span>
                <span className="tabular-nums font-medium text-foreground">
                  {(fatDia > 0 ? (despDia / fatDia) * 100 : 0).toFixed(1)}% do faturamento ({currencyBRL(despDia)})
                </span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Faturamento e Lucro de Ontem:</span>
                <span className="tabular-nums font-medium text-foreground">
                  Fat: <span className="text-emerald-400 font-semibold">{currencyBRL(fatOntemFin)}</span> · Lucro: <span className="text-blue-400 font-semibold">{currencyBRL(lucroOntemFin)}</span>
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* ===== Faturamento Mensal ===== */}
        <Card className="p-2.5 space-y-1.5 border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <CalendarClock className="h-4 w-4 text-blue-400" />
              <h3 className="text-sm font-semibold">Faturamento Mensal</h3>
            </div>
            <div className="flex items-center gap-1">
              <select
                value={mesSel}
                onChange={(e) => setMesSel(Number(e.target.value))}
                className="h-6 rounded border border-border/60 bg-background/60 px-1 text-[11px] capitalize"
                aria-label="Mês"
              >
                {Array.from({ length: 12 }, (_, m) => (
                  <option key={m} value={m} className="capitalize">
                    {new Date(2020, m, 1).toLocaleDateString("pt-BR", { month: "short" })}
                  </option>
                ))}
              </select>
              <select
                value={anoSel}
                onChange={(e) => setAnoSel(Number(e.target.value))}
                className="h-6 rounded border border-border/60 bg-background/60 px-1 text-[11px]"
                aria-label="Ano"
              >
                {Array.from({ length: 5 }, (_, i) => today.getFullYear() - i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <FinCell label="Faturamento" value={fatMes} tone="green" onClick={() => openDetail("Faturamento do Mês", "mes", "fat")} />
            <FinCell label="Despesas" value={despMes} tone="red" onClick={() => openDetail("Despesa do Mês", "mes", "desp")} />
            <FinCell label="Lucro Líquido" value={lucroMes} tone="blue" onClick={() => openDetail("Lucro do Mês", "mes", "lucro")} />
          </div>
          <div className="pt-1 border-t border-border/40 space-y-1">
            <div className="grid grid-cols-3 gap-1 text-[11px]">
              <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 flex flex-col justify-center">
                <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-0.5">
                  <TrendingUp className="h-2.5 w-2.5" /> Maior dia
                </span>
                <span className="tabular-nums text-emerald-400 font-bold truncate">
                  {maiorDia ? `${mesNomeBR(maiorDia.date)} · ${currencyBRL(maiorDia.valor)}` : "—"}
                </span>
              </div>
              <div className="rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 flex flex-col justify-center">
                <span className="text-[10px] text-red-400 font-semibold flex items-center gap-0.5">
                  <TrendingDown className="h-2.5 w-2.5" /> Menor dia
                </span>
                <span className="tabular-nums text-red-400 font-bold truncate">
                  {menorDia ? `${mesNomeBR(menorDia.date)} · ${currencyBRL(menorDia.valor)}` : "—"}
                </span>
              </div>
              <div className="rounded border border-border/50 bg-background/50 px-1.5 py-0.5 flex flex-col justify-center">
                <span className="text-[10px] text-muted-foreground">Média/dia ativo</span>
                <span className="tabular-nums font-semibold truncate">{currencyBRL(mediaDiaMes)}</span>
              </div>
            </div>
            <div className="rounded border border-border/60 bg-background/40">
              <div className="flex items-center justify-between px-2 py-0.5 text-[10px] font-semibold border-b border-border/60">
                <span className="flex items-center gap-1"><CalendarClock className="h-3 w-3 text-blue-400" /> Fechamento diário</span>
                <span className="text-muted-foreground">Fat. · Desp. · Lucro</span>
              </div>
              <div className="max-h-[110px] overflow-auto divide-y divide-border/30">
                {fechamentoDiario.map((d) => (
                  <div key={d.dia} className="flex items-center justify-between gap-1.5 px-2 py-0.5 text-[11px] tabular-nums">
                    <span className="text-muted-foreground w-6 shrink-0">{String(d.dia).padStart(2, "0")}</span>
                    <span className="flex-1 text-right text-emerald-400">{currencyBRL(d.fat)}</span>
                    <span className="flex-1 text-right text-red-400">{currencyBRL(d.desp)}</span>
                    <span className={cn("flex-1 text-right font-semibold", d.lucro >= 0 ? "text-blue-400" : "text-red-400")}>{currencyBRL(d.lucro)}</span>
                  </div>
                ))}
                {fechamentoDiario.length === 0 && (
                  <div className="px-2 py-1 text-[11px] text-muted-foreground text-center">Sem lançamentos no mês.</div>
                )}
              </div>
            </div>
          </div>
        </Card>

      </div>

      <FaturamentoDetalhadoPanel />

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
                  <TableHead className="text-right w-24">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(detail?.rows ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Sem lançamentos no período.</TableCell></TableRow>
                ) : detail!.rows.map((r, i) => (
                  <TableRow key={r.id || i}>
                    <TableCell className="whitespace-nowrap">{r.data}</TableCell>
                    <TableCell>{r.origem}</TableCell>
                    <TableCell>{r.descricao}</TableCell>
                    <TableCell className={cn("text-right font-semibold", detail!.tone === "green" && "text-emerald-400", detail!.tone === "red" && "text-red-400", detail!.tone === "blue" && "text-blue-400")}>{currencyBRL(r.valor)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {r.id && r.tipo && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={revertingId === r.id}
                          className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                          title="Reverter / Excluir este faturamento"
                          onClick={() => handleReverterLancamento(r)}
                        >
                          <Undo2 className="h-3.5 w-3.5 mr-1" /> Reverter
                        </Button>
                      )}
                    </TableCell>
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
  const toneClass = tone === "green" ? "text-emerald-400 hover:border-emerald-500/60 hover:bg-emerald-500/10 border-emerald-500/30 bg-emerald-500/5"
    : tone === "red" ? "text-red-400 hover:border-red-500/60 hover:bg-red-500/10 border-red-500/30 bg-red-500/5"
    : "text-blue-400 hover:border-blue-500/60 hover:bg-blue-500/10 border-blue-500/30 bg-blue-500/5";
  return (
    <button type="button" onClick={onClick} className={`w-full rounded-md border px-2 py-1 text-left transition flex flex-col justify-center min-w-0 ${toneClass}`}>
      <span className="text-[10px] text-muted-foreground uppercase font-semibold truncate">{label}</span>
      <span className={`text-sm sm:text-base font-bold tabular-nums truncate ${tone === "green" ? "text-emerald-400" : tone === "red" ? "text-red-400" : "text-blue-400"}`}>{currencyBRL(value)}</span>
    </button>
  );
}

