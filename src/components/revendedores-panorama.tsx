import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchRevendedores, fetchRevendedoresMovs } from "@/lib/queries";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { currencyBRL } from "@/lib/iptv";
import { cn } from "@/lib/utils";
import { ExportConsolidado } from "@/components/export-consolidado";
import type { ExportSection } from "@/lib/central-export";
import {
  Handshake, Users, UserCheck, UserX, DollarSign, Wallet, TrendingUp, TrendingDown,
  Package, CalendarDays, ShoppingCart, Percent, AlertTriangle,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const PIE_COLORS = ["hsl(160 84% 45%)", "hsl(38 92% 55%)", "hsl(0 84% 60%)"];

export function RevendedoresPanorama() {
  const { data: revs = [] } = useQuery({ queryKey: ["revendedores"], queryFn: fetchRevendedores });
  const { data: movs = [] } = useQuery({ queryKey: ["revendedores_movs"], queryFn: fetchRevendedoresMovs });

  const d = useMemo(() => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const d30 = new Date(now.getTime() - 30 * 86400000);
    const d60 = new Date(now.getTime() - 60 * 86400000);
    const ativosMovs = (movs as any[]).filter((m) => m?.status_venda !== "cancelada");
    const vendas = ativosMovs.filter((m) => m.tipo === "venda" && Number(m.quantidade) > 0);

    const lastByRev = new Map<string, number>();
    ativosMovs.forEach((m) => {
      if (!m.revendedor_id) return;
      const t = new Date(m.created_at).getTime();
      if (t > (lastByRev.get(m.revendedor_id) ?? 0)) lastByRev.set(m.revendedor_id, t);
    });

    const sum = (list: any[], f: (m: any) => number) => list.reduce((s, m) => s + Number(f(m) || 0), 0);
    const since = (dt: Date) => vendas.filter((m) => new Date(m.created_at) >= dt);

    const total = (revs as any[]).length;
    const ativos = (revs as any[]).filter((r) => (lastByRev.get(r.id) ?? 0) >= d60.getTime()).length;
    const inativos = total - ativos;
    const semMov30 = (revs as any[]).filter((r) => (lastByRev.get(r.id) ?? 0) < d30.getTime()).length;
    const semMov60 = inativos;

    const receitaTotal = sum(vendas, (m) => m.valor_pago);
    const custoTotal = sum(vendas, (m) => m.custo);
    const lucroTotal = sum(vendas, (m) => m.lucro);
    const credTotal = sum(vendas, (m) => m.quantidade);
    const margem = receitaTotal > 0 ? (lucroTotal / receitaTotal) * 100 : 0;
    const ticket = vendas.length ? receitaTotal / vendas.length : 0;

    const per = (dt: Date) => {
      const l = since(dt);
      return {
        vendas: l.length,
        creditos: sum(l, (m) => m.quantidade),
        receita: sum(l, (m) => m.valor_pago),
        custo: sum(l, (m) => m.custo),
        lucro: sum(l, (m) => m.lucro),
      };
    };
    const dia = per(startOfDay), mes = per(startOfMonth), ano = per(startOfYear);

    // Evolução últimos 6 meses
    const meses: { mes: string; receita: number; lucro: number; creditos: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const ini = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const fim = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const l = vendas.filter((m) => { const t = new Date(m.created_at); return t >= ini && t < fim; });
      meses.push({
        mes: ini.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
        receita: sum(l, (m) => m.valor_pago),
        lucro: sum(l, (m) => m.lucro),
        creditos: sum(l, (m) => m.quantidade),
      });
    }

    // Top revendedores
    const map = new Map<string, { nome: string; receita: number; lucro: number; creditos: number; vendas: number; ultima: number }>();
    vendas.forEach((m) => {
      const id = m.revendedor_id;
      if (!id) return;
      const cur = map.get(id) ?? {
        nome: m.revendedor?.nome ?? (revs as any[]).find((r) => r.id === id)?.nome ?? "—",
        receita: 0, lucro: 0, creditos: 0, vendas: 0, ultima: 0,
      };
      cur.receita += Number(m.valor_pago || 0);
      cur.lucro += Number(m.lucro || 0);
      cur.creditos += Number(m.quantidade || 0);
      cur.vendas += 1;
      cur.ultima = Math.max(cur.ultima, new Date(m.created_at).getTime());
      map.set(id, cur);
    });
    const top = [...map.values()].sort((a, b) => b.receita - a.receita);

    const pagos = vendas.filter((m) => m.status_pagamento === "pago");
    const recebido = sum(pagos, (m) => m.valor_pago);
    const aReceber = receitaTotal - recebido;

    return {
      total, ativos, inativos, semMov30, semMov60,
      receitaTotal, custoTotal, lucroTotal, credTotal, margem, ticket,
      qtdVendas: vendas.length, dia, mes, ano, meses, top, recebido, aReceber,
      precoMedio: credTotal ? receitaTotal / credTotal : 0,
      custoMedio: credTotal ? custoTotal / credTotal : 0,
      lucroMedioCred: credTotal ? lucroTotal / credTotal : 0,
    };
  }, [revs, movs]);

  const secoes = (): ExportSection[] => [
    {
      title: "Panorama de Revendedores",
      description:
        "Indicadores consolidados da operação de revenda: total de revendedores cadastrados, ativos e inativos nos últimos 60 dias, receita, custo, lucro, créditos vendidos, margem de lucro, ticket médio e valores recebidos ou a receber.",
      columns: ["Indicador", "Valor"],
      rows: [
        ["Revendedores cadastrados", d.total],
        ["Ativos (60 dias)", d.ativos],
        ["Inativos (60 dias+)", d.inativos],
        ["Sem movimentação 30 dias+", d.semMov30],
        ["Total de vendas", d.qtdVendas],
        ["Créditos vendidos", d.credTotal],
        ["Receita total", currencyBRL(d.receitaTotal)],
        ["Custo total", currencyBRL(d.custoTotal)],
        ["Lucro total", currencyBRL(d.lucroTotal)],
        ["Margem de lucro", `${d.margem.toFixed(1)}%`],
        ["Ticket médio por venda", currencyBRL(d.ticket)],
        ["Preço médio por crédito", currencyBRL(d.precoMedio)],
        ["Custo médio por crédito", currencyBRL(d.custoMedio)],
        ["Lucro médio por crédito", currencyBRL(d.lucroMedioCred)],
        ["Valor recebido", currencyBRL(d.recebido)],
        ["Valor a receber", currencyBRL(d.aReceber)],
      ],
    },
    {
      title: "Revendedores por Período",
      description:
        "Comparativo da operação de revenda nos períodos dia, mês e ano corrente, apresentando quantidade de vendas, créditos vendidos, receita, custo e lucro obtidos em cada período.",
      columns: ["Período", "Vendas", "Créditos", "Receita", "Custo", "Lucro"],
      rows: [
        ["Hoje", d.dia.vendas, d.dia.creditos, currencyBRL(d.dia.receita), currencyBRL(d.dia.custo), currencyBRL(d.dia.lucro)],
        ["Mês atual", d.mes.vendas, d.mes.creditos, currencyBRL(d.mes.receita), currencyBRL(d.mes.custo), currencyBRL(d.mes.lucro)],
        ["Ano atual", d.ano.vendas, d.ano.creditos, currencyBRL(d.ano.receita), currencyBRL(d.ano.custo), currencyBRL(d.ano.lucro)],
      ],
    },
    {
      title: "Desempenho por Revendedor",
      description:
        "Ranking dos revendedores por receita gerada, contendo quantidade de vendas realizadas, créditos adquiridos, receita, lucro, margem percentual de lucro e data da última compra registrada.",
      columns: ["#", "Revendedor", "Vendas", "Créditos", "Receita", "Lucro", "Margem", "Última compra"],
      rows: d.top.map((r, i) => [
        i + 1, r.nome, r.vendas, r.creditos, currencyBRL(r.receita), currencyBRL(r.lucro),
        `${r.receita > 0 ? ((r.lucro / r.receita) * 100).toFixed(1) : "0.0"}%`,
        r.ultima ? new Date(r.ultima).toLocaleDateString("pt-BR") : "—",
      ]),
    },
  ];

  const pieData = [
    { name: "Ativos (60d)", value: d.ativos },
    { name: "Sem mov. 30d+", value: Math.max(0, d.semMov30 - d.semMov60) },
    { name: "Inativos (60d+)", value: d.inativos },
  ].filter((x) => x.value > 0);

  const maxTop = Math.max(...d.top.map((t) => t.receita), 1);

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Handshake className="h-4 w-4 text-primary" /> Panorama de Revendedores
          </h2>
          <p className="text-[11px] text-muted-foreground">Desempenho, lucratividade e atividade da rede de revenda</p>
        </div>
        <ExportConsolidado reportName="Panorama de Revendedores" sections={secoes} />
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        <Kpi label="Revendedores" value={String(d.total)} icon={Users} tone="blue" />
        <Kpi label="Ativos (60d)" value={String(d.ativos)} icon={UserCheck} tone="emerald"
          pct={d.total ? (d.ativos / d.total) * 100 : 0} />
        <Kpi label="Inativos" value={String(d.inativos)} icon={UserX} tone="red"
          pct={d.total ? (d.inativos / d.total) * 100 : 0} />
        <Kpi label="Receita total" value={currencyBRL(d.receitaTotal)} icon={DollarSign} tone="emerald" />
        <Kpi label="Custo total" value={currencyBRL(d.custoTotal)} icon={Wallet} tone="orange" />
        <Kpi label="Lucro total" value={currencyBRL(d.lucroTotal)} icon={TrendingUp} tone="purple"
          pct={Math.max(0, Math.min(100, d.margem))} sub={`Margem ${d.margem.toFixed(1)}%`} />
      </div>

      {/* Períodos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <PeriodoCard title="Hoje" icon={ShoppingCart} tone="emerald" p={d.dia} />
        <PeriodoCard title="Mês atual" icon={CalendarDays} tone="blue" p={d.mes} />
        <PeriodoCard title={String(new Date().getFullYear())} icon={TrendingUp} tone="purple" p={d.ano} />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 rounded-lg border border-border/60 p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            Evolução (últimos 6 meses)
          </div>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.meses} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(v: any, n: any) => (n === "creditos" ? v : currencyBRL(Number(v)))}
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="receita" name="Receita" fill="hsl(160 84% 45%)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="lucro" name="Lucro" fill="hsl(217 91% 60%)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-lg border border-border/60 p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            Atividade da rede
          </div>
          <div className="h-[200px] w-full">
            {pieData.length === 0 ? (
              <div className="h-full grid place-items-center text-xs text-muted-foreground">Sem dados.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={38} outerRadius={62} paddingAngle={2}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Médias e recebíveis */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        <Kpi label="Créditos vendidos" value={String(d.credTotal)} icon={Package} tone="blue" />
        <Kpi label="Preço médio/créd." value={currencyBRL(d.precoMedio)} icon={DollarSign} tone="emerald" />
        <Kpi label="Custo médio/créd." value={currencyBRL(d.custoMedio)} icon={Wallet} tone="orange" />
        <Kpi label="Lucro médio/créd." value={currencyBRL(d.lucroMedioCred)} icon={TrendingUp} tone="purple" />
        <Kpi label="Ticket médio" value={currencyBRL(d.ticket)} icon={Percent} tone="blue" />
        <Kpi label="A receber" value={currencyBRL(d.aReceber)} icon={AlertTriangle} tone={d.aReceber > 0 ? "red" : "emerald"} />
      </div>

      {/* Ranking com barras */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
          Desempenho por revendedor
        </div>
        <div className="space-y-1.5 max-h-[300px] overflow-auto pr-1">
          {d.top.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-6">Sem vendas registradas.</div>
          )}
          {d.top.map((r, i) => {
            const m = r.receita > 0 ? (r.lucro / r.receita) * 100 : 0;
            return (
              <div key={i} className="rounded-lg border border-border/60 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] text-muted-foreground tabular-nums w-4">{i + 1}.</span>
                    <span className="text-sm font-semibold truncate">{r.nome}</span>
                    <Badge variant="secondary" className="text-[10px]">{r.creditos} créd.</Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs shrink-0">
                    <span className="text-emerald-400 font-semibold tabular-nums">{currencyBRL(r.receita)}</span>
                    <span className={cn("font-semibold tabular-nums", r.lucro >= 0 ? "text-blue-400" : "text-red-400")}>
                      {currencyBRL(r.lucro)}
                    </span>
                    <span className={cn("font-semibold tabular-nums flex items-center gap-0.5", m >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {m >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {m.toFixed(1)}%
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {r.ultima ? new Date(r.ultima).toLocaleDateString("pt-BR") : "—"}
                    </span>
                  </div>
                </div>
                <Progress value={(r.receita / maxTop) * 100} className="h-1.5" />
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

const TONES: Record<string, { border: string; text: string; bg: string }> = {
  emerald: { border: "border-emerald-500/30", text: "text-emerald-400", bg: "from-emerald-500/10" },
  blue: { border: "border-blue-500/30", text: "text-blue-400", bg: "from-blue-500/10" },
  purple: { border: "border-purple-500/30", text: "text-purple-400", bg: "from-purple-500/10" },
  orange: { border: "border-orange-500/30", text: "text-orange-400", bg: "from-orange-500/10" },
  red: { border: "border-red-500/30", text: "text-red-400", bg: "from-red-500/10" },
};

function Kpi({ label, value, icon: Icon, tone, pct, sub }: {
  label: string; value: string; icon: any; tone: keyof typeof TONES; pct?: number; sub?: string;
}) {
  const t = TONES[tone];
  return (
    <div className={cn("rounded-lg border p-2.5 space-y-1 bg-gradient-to-br to-transparent", t.border, t.bg)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{label}</span>
        <Icon className={cn("h-3.5 w-3.5 shrink-0", t.text)} />
      </div>
      <div className={cn("text-base font-bold tabular-nums truncate", t.text)}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
      {pct !== undefined && <Progress value={Math.max(0, Math.min(100, pct))} className="h-1" />}
    </div>
  );
}

function PeriodoCard({ title, icon: Icon, tone, p }: {
  title: string; icon: any; tone: keyof typeof TONES;
  p: { vendas: number; creditos: number; receita: number; custo: number; lucro: number };
}) {
  const t = TONES[tone];
  const margem = p.receita > 0 ? (p.lucro / p.receita) * 100 : 0;
  return (
    <div className={cn("rounded-lg border p-3 space-y-1.5 bg-gradient-to-br to-transparent", t.border, t.bg)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className={cn("h-4 w-4", t.text)} />
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        <span className={cn("text-lg font-bold tabular-nums", t.text)}>{p.vendas}</span>
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground -mt-1">Vendas no período</div>
      <Row label="Créditos" value={String(p.creditos)} />
      <Row label="Receita" value={currencyBRL(p.receita)} tone="text-emerald-400" />
      <Row label="Custo" value={currencyBRL(p.custo)} tone="text-orange-400" />
      <Row label="Lucro" value={currencyBRL(p.lucro)} tone={p.lucro >= 0 ? "text-blue-400" : "text-red-400"} />
      <div className="pt-1 border-t border-border/40 space-y-1">
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Margem</span><span className="tabular-nums">{margem.toFixed(1)}%</span>
        </div>
        <Progress value={Math.max(0, Math.min(100, margem))} className="h-1.5" />
      </div>
    </div>
  );
}

function Row({ label, value, tone = "text-foreground" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-semibold tabular-nums", tone)}>{value}</span>
    </div>
  );
}
