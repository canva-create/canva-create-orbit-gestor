import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  fetchClientes,
  fetchServidores,
  fetchHistorico,
  fetchRevendedores,
  fetchRevendedoresMovs,
} from "@/lib/queries";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { currencyBRL, diasParaVencer } from "@/lib/iptv";
import { cn } from "@/lib/utils";
import { ExportConsolidado } from "@/components/export-consolidado";
import { RevendedoresPanorama } from "@/components/revendedores-panorama";
import { CreditosPanorama } from "@/components/creditos-panorama";
import { FaturamentoAnualCard } from "@/components/faturamento-anual-card";
import { EntradaClientesPanel } from "@/components/entrada-clientes-panel";
import { EvolucaoClientesChart } from "@/components/evolucao-clientes-chart";
import { BaseClientesPanel } from "@/components/base-clientes-panel";
import { DestaquesAnoCard } from "@/components/destaques-ano-card";
import type { ExportSection } from "@/lib/central-export";
import {
  RefreshCw, TrendingUp, TrendingDown, DollarSign, Target, CalendarClock,
  Layers, Users, Crown, Trophy, Server as ServerIcon, Wallet, Activity,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/central")({
  head: () => ({
    meta: [
      { title: "Central de Gestão — Orbit" },
      { name: "description", content: "Indicadores gerenciais: renovações, receita, lucro, clientes por servidor e rankings." },
      { property: "og:title", content: "Central de Gestão — Orbit" },
      { property: "og:description", content: "Indicadores gerenciais consolidados do Orbit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CentralGestao,
});

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

export function CentralGestao() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const { data: clientes = [] } = useQuery({ queryKey: ["clientes"], queryFn: fetchClientes });
  const { data: servidores = [] } = useQuery({ queryKey: ["servidores"], queryFn: fetchServidores });
  const { data: historico = [] } = useQuery({ queryKey: ["historico"], queryFn: fetchHistorico });
  const { data: revendedores = [] } = useQuery({ queryKey: ["revendedores"], queryFn: fetchRevendedores });
  const { data: revMovs = [] } = useQuery({ queryKey: ["revendedores_movs"], queryFn: fetchRevendedoresMovs });

  const refreshAll = async () => {
    if (refreshing) return;
    setRefreshing(true);
    const t = toast.loading("Sincronizando indicadores...");
    try {
      await qc.invalidateQueries();
      await qc.refetchQueries({ type: "active" });
      toast.success("Indicadores atualizados", { id: t });
    } catch (e: any) {
      toast.error(e?.message || "Falha ao atualizar", { id: t });
    } finally { setRefreshing(false); }
  };

  const d = useMemo(() => {
    const today = startOfDay(new Date());
    const sameDay = (a: Date, b: Date) => a.getTime() === startOfDay(b).getTime();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    const inDay = (iso: string) => sameDay(today, new Date(iso));
    const inMonth = (iso: string) => { const x = new Date(iso); return x >= startOfMonth; };
    const inYear = (iso: string) => new Date(iso) >= startOfYear;

    const hist = (historico as any[]).filter((h) => h.created_at && h.status !== "cancelada");
    const pagos = hist.filter((h) => (h.status_pagamento ? h.status_pagamento === "pago" : true));
    const vendas = (revMovs as any[]).filter(
      (m) => m.tipo === "venda" && m.status_venda !== "cancelada" && String(m.status_venda).toUpperCase() !== "CANCELADA",
    );
    const vendasPagas = vendas.filter((m) => m.status_pagamento === "pago");

    const cnt = (p: (iso: string) => boolean) => hist.filter((h) => p(h.created_at)).length;
    const receita = (p: (iso: string) => boolean) =>
      pagos.filter((h) => p(h.created_at)).reduce((s, h) => s + Number(h.valor_recebido || 0), 0) +
      vendasPagas.filter((m) => m.created_at && p(m.created_at)).reduce((s, m) => s + Number(m.valor_pago || 0), 0);
    const custo = (p: (iso: string) => boolean) =>
      hist.filter((h) => p(h.created_at)).reduce((s, h) => s + Number(h.custo || 0), 0) +
      vendas.filter((m) => m.created_at && p(m.created_at)).reduce((s, m) => s + Number(m.custo || 0), 0);

    const renovDia = cnt(inDay), renovMes = cnt(inMonth), renovAno = cnt(inYear);
    const recDia = receita(inDay), recMes = receita(inMonth), recAno = receita(inYear);
    const lucDia = recDia - custo(inDay), lucMes = recMes - custo(inMonth), lucAno = recAno - custo(inYear);
    const ticketDia = renovDia ? recDia / renovDia : 0;
    const ticketMes = renovMes ? recMes / renovMes : 0;
    const ticketAno = renovAno ? recAno / renovAno : 0;

    const clientesRenovadosHoje = new Set(
      hist.filter((h) => inDay(h.created_at)).map((h) => h.cliente_id).filter(Boolean),
    ).size;

    const venceEm = (max: number) =>
      (clientes as any[]).filter((c) => {
        const dd = diasParaVencer(c.data_vencimento);
        return dd !== null && dd >= 0 && dd <= max;
      }).length;

    // ---- Clientes por servidor ----
    const totalClientes = (clientes as any[]).length || 1;
    const trintaDias = Date.now() - 30 * 86400000;
    const sessentaDias = Date.now() - 60 * 86400000;
    const porServidor = (servidores as any[])
      .map((s) => {
        const lista = (clientes as any[]).filter((c) => c.servidor_id === s.id);
        const ativos = lista.filter((c) => { const dd = diasParaVencer(c.data_vencimento); return dd === null || dd >= 0; }).length;
        const vencidos = lista.filter((c) => { const dd = diasParaVencer(c.data_vencimento); return dd !== null && dd < 0; }).length;
        const novos30 = lista.filter((c) => c.created_at && new Date(c.created_at).getTime() >= trintaDias).length;
        const novos30ant = lista.filter((c) => {
          const t = c.created_at ? new Date(c.created_at).getTime() : 0;
          return t >= sessentaDias && t < trintaDias;
        }).length;
        const cresc = novos30ant === 0 ? (novos30 > 0 ? 100 : 0) : ((novos30 - novos30ant) / novos30ant) * 100;
        return {
          id: s.id, nome: s.nome, qtd: lista.length, ativos, vencidos, novos30, cresc,
          pct: (lista.length / totalClientes) * 100,
        };
      })
      .filter((s) => s.qtd > 0)
      .sort((a, b) => b.qtd - a.qtd);

    // ---- Rankings ----
    const topAntigos = (clientes as any[])
      .filter((c) => { const dd = diasParaVencer(c.data_vencimento); return dd !== null && dd >= 0 && c.data_inicio; })
      .sort((a, b) => new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime())
      .slice(0, 25)
      .map((c) => ({
        nome: c.nome ?? "—",
        desde: new Date(c.data_inicio).toLocaleDateString("pt-BR"),
        dias: Math.floor((Date.now() - new Date(c.data_inicio).getTime()) / 86400000),
        servidor: c.servidor?.nome ?? "—",
        vence: c.data_vencimento ? new Date(c.data_vencimento).toLocaleDateString("pt-BR") : "—",
      }));

    const mapRev = new Map<string, { total: number; vendas: number; creditos: number; ultima: number }>();
    vendas.forEach((m) => {
      const id = m.revendedor_id ?? m.revendedor?.id;
      if (!id) return;
      const cur = mapRev.get(id) ?? { total: 0, vendas: 0, creditos: 0, ultima: 0 };
      cur.total += Number(m.valor_pago ?? m.valor_total ?? 0);
      cur.vendas += 1;
      cur.creditos += Math.abs(Number(m.quantidade || 0));
      const t = m.created_at ? new Date(m.created_at).getTime() : 0;
      if (t > cur.ultima) cur.ultima = t;
      mapRev.set(id, cur);
    });
    const topRevendas = (revendedores as any[])
      .map((r) => ({ nome: r.nome ?? "—", ...(mapRev.get(r.id) ?? { total: 0, vendas: 0, creditos: 0, ultima: 0 }) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 25);

    return {
      renovDia, renovMes, renovAno, recDia, recMes, recAno, lucDia, lucMes, lucAno,
      ticketDia, ticketMes, ticketAno, clientesRenovadosHoje,
      vence7: venceEm(7), vence15: venceEm(15), vence30: venceEm(30),
      porServidor, topAntigos, topRevendas, totalClientes: (clientes as any[]).length,
    };
  }, [clientes, servidores, historico, revendedores, revMovs]);

  /* ------------------------- Seções de exportação ------------------------- */
  const secComercial = (): ExportSection[] => [
    {
      title: "Central de Gestão Comercial",
      description:
        "Indicadores comerciais consolidados: quantidade de renovações, receita, lucro e ticket médio nos períodos dia, mês e ano, além de clientes renovados hoje e vencimentos previstos para 7, 15 e 30 dias.",
      columns: ["Indicador", "Dia", "Mês", "Ano"],
      rows: [
        ["Renovações", d.renovDia, d.renovMes, d.renovAno],
        ["Receita", currencyBRL(d.recDia), currencyBRL(d.recMes), currencyBRL(d.recAno)],
        ["Lucro", currencyBRL(d.lucDia), currencyBRL(d.lucMes), currencyBRL(d.lucAno)],
        ["Ticket médio", currencyBRL(d.ticketDia), currencyBRL(d.ticketMes), currencyBRL(d.ticketAno)],
        ["Clientes renovados hoje", d.clientesRenovadosHoje, "-", "-"],
        ["Vencimentos 7 dias", d.vence7, "-", "-"],
        ["Vencimentos 15 dias", d.vence15, "-", "-"],
        ["Vencimentos 30 dias", d.vence30, "-", "-"],
      ],
    },
  ];
  const secServidores = (): ExportSection[] => [
    {
      title: "Clientes por Servidor",
      description:
        "Distribuição da base de clientes por servidor, contendo total de clientes, percentual de participação sobre a base, clientes ativos, clientes vencidos, novos clientes nos últimos 30 dias e a variação de crescimento em relação aos 30 dias anteriores.",
      columns: ["Servidor", "Clientes", "% Participação", "Ativos", "Vencidos", "Novos 30d", "Crescimento"],
      rows: d.porServidor.map((s) => [
        s.nome, s.qtd, `${s.pct.toFixed(1)}%`, s.ativos, s.vencidos, s.novos30, `${s.cresc >= 0 ? "+" : ""}${s.cresc.toFixed(1)}%`,
      ]),
    },
  ];
  const secRankings = (): ExportSection[] => [
    {
      title: "Top 25 Clientes Mais Antigos",
      description:
        "Ranking dos 25 clientes ativos com maior tempo de casa, indicando data de início, tempo de permanência em dias, servidor vinculado e data de vencimento atual.",
      columns: ["#", "Cliente", "Cliente desde", "Dias", "Servidor", "Vencimento"],
      rows: d.topAntigos.map((c, i) => [i + 1, c.nome, c.desde, c.dias, c.servidor, c.vence]),
    },
    {
      title: "Top 25 Revendas",
      description:
        "Ranking dos 25 revendedores por valor total vendido (vendas não canceladas), com quantidade de vendas, créditos adquiridos, ticket médio por venda e data da última compra.",
      columns: ["#", "Revendedor", "Total vendido", "Vendas", "Créditos", "Ticket médio", "Última compra"],
      rows: d.topRevendas.map((r, i) => [
        i + 1, r.nome, currencyBRL(r.total), r.vendas, r.creditos,
        currencyBRL(r.vendas ? r.total / r.vendas : 0),
        r.ultima ? new Date(r.ultima).toLocaleDateString("pt-BR") : "—",
      ]),
    },
  ];
  const secTudo = (): ExportSection[] => [...secComercial(), ...secServidores(), ...secRankings()];

  const chartData = d.porServidor.slice(0, 10).map((s) => ({ nome: s.nome, ativos: s.ativos, vencidos: s.vencidos }));
  const maxQtd = Math.max(...d.porServidor.map((s) => s.qtd), 1);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold leading-tight flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" /> Central de Gestão
          </h1>
          <p className="text-xs text-muted-foreground">Indicadores gerenciais consolidados do sistema</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportConsolidado reportName="Central de Gestão" sections={secTudo} label="Exportar Consolidado (tudo)" />
          <Button size="sm" variant="outline" onClick={refreshAll} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
            {refreshing ? "Atualizando..." : "Atualizar"}
          </Button>
        </div>
      </div>

      <DestaquesAnoCard />

      <FaturamentoAnualCard />

      <EntradaClientesPanel />

      <EvolucaoClientesChart />

      <BaseClientesPanel />

      {/* ==================== CENTRAL DE GESTÃO COMERCIAL ==================== */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold flex items-center gap-2">📊 Central de Gestão Comercial</h2>
          <ExportConsolidado reportName="Central de Gestão Comercial" sections={secComercial} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <PeriodCard
            title="Hoje" icon={DollarSign} tone="emerald"
            renov={d.renovDia} receita={d.recDia} lucro={d.lucDia} ticket={d.ticketDia}
          />
          <PeriodCard
            title="Mês atual" icon={CalendarClock} tone="blue"
            renov={d.renovMes} receita={d.recMes} lucro={d.lucMes} ticket={d.ticketMes}
          />
          <PeriodCard
            title={String(new Date().getFullYear())} icon={TrendingUp} tone="purple"
            renov={d.renovAno} receita={d.recAno} lucro={d.lucAno} ticket={d.ticketAno}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniStat label="Clientes renovados hoje" value={d.clientesRenovadosHoje} icon={RefreshCw} tone="emerald" />
          <MiniStat label="Vencem em 7 dias" value={d.vence7} icon={Target} tone="orange"
            pct={(d.vence7 / Math.max(d.totalClientes, 1)) * 100} />
          <MiniStat label="Vencem em 15 dias" value={d.vence15} icon={Target} tone="yellow"
            pct={(d.vence15 / Math.max(d.totalClientes, 1)) * 100} />
          <MiniStat label="Vencem em 30 dias" value={d.vence30} icon={Target} tone="blue"
            pct={(d.vence30 / Math.max(d.totalClientes, 1)) * 100} />
        </div>
      </Card>

      {/* ========================= CLIENTES POR SERVIDOR ========================= */}
      <RevendedoresPanorama />

      {/* ============================== CRÉDITOS ============================== */}
      <CreditosPanorama />

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" /> Clientes por Servidor
          </h2>
          <ExportConsolidado reportName="Clientes por Servidor" sections={secServidores} />
        </div>

        {chartData.length > 0 && (
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="nome" tick={{ fontSize: 10 }} interval={0} angle={-18} textAnchor="end" height={48} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="ativos" name="Ativos" fill="hsl(160 84% 45%)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="vencidos" name="Vencidos" fill="hsl(0 84% 60%)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="space-y-2 max-h-[320px] overflow-auto pr-1">
          {d.porServidor.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-6">Sem clientes vinculados a servidores.</div>
          )}
          {d.porServidor.map((s, i) => (
            <div key={s.id ?? i} className="rounded-lg border border-border/60 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] text-muted-foreground tabular-nums w-4">{i + 1}.</span>
                  <ServerIcon className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-sm font-semibold truncate">{s.nome}</span>
                  <Badge variant="secondary" className="text-[10px]">{s.pct.toFixed(1)}%</Badge>
                </div>
                <div className="flex items-center gap-3 text-xs shrink-0">
                  <span className="text-emerald-400 font-semibold tabular-nums">{s.ativos} ativos</span>
                  <span className="text-red-400 font-semibold tabular-nums">{s.vencidos} vencidos</span>
                  <span className={cn("font-semibold tabular-nums flex items-center gap-0.5",
                    s.cresc >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {s.cresc >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {s.cresc.toFixed(1)}%
                  </span>
                  <span className="text-muted-foreground tabular-nums">{s.qtd} total</span>
                </div>
              </div>
              <Progress value={(s.qtd / maxQtd) * 100} className="h-1.5" />
            </div>
          ))}
        </div>
      </Card>

      {/* ============================== RANKINGS ============================== */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Trophy className="h-4 w-4 text-yellow-400" /> Rankings
          </h2>
          <ExportConsolidado reportName="Rankings" sections={secRankings} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider flex items-center gap-1">
              <Users className="h-3 w-3" /> Top 25 Clientes Mais Antigos
            </div>
            <div className="space-y-1 max-h-[320px] overflow-auto pr-1">
              {d.topAntigos.length === 0 && <Empty text="Sem clientes cadastrados." />}
              {d.topAntigos.map((c, i) => (
                <RankRow
                  key={i} pos={i + 1} title={c.nome}
                  subtitle={`${c.servidor} · desde ${c.desde} · vence ${c.vence}`}
                  value={`${c.dias}d`} tone="text-blue-400"
                />
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
              <Wallet className="h-3 w-3" /> Top 25 Revendas
            </div>
            <div className="space-y-1 max-h-[320px] overflow-auto pr-1">
              {d.topRevendas.length === 0 && <Empty text="Sem revendas registradas." />}
              {d.topRevendas.map((r, i) => (
                <RankRow
                  key={i} pos={i + 1} title={r.nome}
                  subtitle={`${r.vendas} venda(s) · ${r.creditos} créditos${r.ultima ? ` · última ${new Date(r.ultima).toLocaleDateString("pt-BR")}` : ""}`}
                  value={currencyBRL(r.total)} tone="text-emerald-400"
                />
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------ Subcomponentes ------------------------------ */

const TONES: Record<string, { border: string; text: string; bg: string }> = {
  emerald: { border: "border-emerald-500/30", text: "text-emerald-400", bg: "from-emerald-500/10" },
  blue: { border: "border-blue-500/30", text: "text-blue-400", bg: "from-blue-500/10" },
  purple: { border: "border-purple-500/30", text: "text-purple-400", bg: "from-purple-500/10" },
  orange: { border: "border-orange-500/30", text: "text-orange-400", bg: "from-orange-500/10" },
  yellow: { border: "border-yellow-500/30", text: "text-yellow-400", bg: "from-yellow-500/10" },
};

function PeriodCard({
  title, icon: Icon, tone, renov, receita, lucro, ticket,
}: { title: string; icon: any; tone: keyof typeof TONES; renov: number; receita: number; lucro: number; ticket: number }) {
  const t = TONES[tone];
  const margem = receita > 0 ? (lucro / receita) * 100 : 0;
  return (
    <div className={cn("rounded-lg border p-3 space-y-2 bg-gradient-to-br to-transparent", t.border, t.bg)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className={cn("h-4 w-4", t.text)} />
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        <span className={cn("text-lg font-bold tabular-nums", t.text)}>{renov}</span>
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground -mt-1">Renovações no período</div>
      <Line label="Receita" value={currencyBRL(receita)} tone="text-emerald-400" />
      <Line label="Lucro" value={currencyBRL(lucro)} tone={lucro >= 0 ? "text-blue-400" : "text-red-400"} />
      <Line label="Ticket médio" value={currencyBRL(ticket)} />
      <div className="pt-1 border-t border-border/40 space-y-1">
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Margem de lucro</span>
          <span className="tabular-nums">{margem.toFixed(1)}%</span>
        </div>
        <Progress value={Math.max(0, Math.min(100, margem))} className="h-1.5" />
      </div>
    </div>
  );
}

function Line({ label, value, tone = "text-foreground" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-semibold tabular-nums", tone)}>{value}</span>
    </div>
  );
}

function MiniStat({
  label, value, icon: Icon, tone, pct,
}: { label: string; value: number; icon: any; tone: keyof typeof TONES; pct?: number }) {
  const t = TONES[tone];
  return (
    <div className={cn("rounded-lg border p-2.5 space-y-1.5 bg-gradient-to-br to-transparent", t.border, t.bg)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className={cn("h-3.5 w-3.5 shrink-0", t.text)} />
      </div>
      <div className={cn("text-xl font-bold tabular-nums", t.text)}>{value}</div>
      {pct !== undefined && <Progress value={Math.min(100, pct)} className="h-1" />}
    </div>
  );
}

function RankRow({ pos, title, subtitle, value, tone }: { pos: number; title: string; subtitle: string; value: string; tone: string }) {
  const medal = pos === 1 ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40"
    : pos === 2 ? "bg-slate-400/20 text-slate-300 border-slate-400/40"
    : pos === 3 ? "bg-orange-500/20 text-orange-400 border-orange-500/40"
    : "bg-muted text-muted-foreground border-border";
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/50 px-2 py-1.5">
      <span className={cn("h-6 w-6 shrink-0 grid place-items-center rounded-full border text-[10px] font-bold tabular-nums", medal)}>
        {pos <= 3 ? <Crown className="h-3 w-3" /> : pos}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium truncate">{title}</div>
        <div className="text-[10px] text-muted-foreground truncate">{subtitle}</div>
      </div>
      <span className={cn("text-xs font-bold tabular-nums shrink-0", tone)}>{value}</span>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-xs text-muted-foreground text-center py-6">{text}</div>;
}
