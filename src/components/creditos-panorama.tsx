import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { currencyBRL } from "@/lib/iptv";
import { ExportConsolidado } from "@/components/export-consolidado";
import type { ExportSection } from "@/lib/central-export";
import {
  Package, TrendingUp, TrendingDown, AlertTriangle, ShoppingCart, Gauge,
  Server as ServerIcon, Wallet, Users, Timer, Percent, Activity,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from "recharts";
import {
  fetchSaldosCreditos, fetchMovimentacoesCreditos, fetchComprasCreditos,
  fetchRevendedores, fetchServidores, fetchRevendedoresMovs,
} from "@/lib/queries";

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export function CreditosPanorama() {
  const { data: saldos = {} } = useQuery({ queryKey: ["creditos_saldos"], queryFn: fetchSaldosCreditos });
  const { data: movs = [] } = useQuery({ queryKey: ["creditos_movs"], queryFn: fetchMovimentacoesCreditos });
  const { data: compras = [] } = useQuery({ queryKey: ["creditos_compras"], queryFn: fetchComprasCreditos });
  const { data: revendedores = [] } = useQuery({ queryKey: ["revendedores"], queryFn: fetchRevendedores });
  const { data: servidores = [] } = useQuery({ queryKey: ["servidores"], queryFn: fetchServidores });
  const { data: revMovs = [] } = useQuery({ queryKey: ["revendedores_movs"], queryFn: fetchRevendedoresMovs });

  const d = useMemo(() => {
    const M = movs as any[], C = compras as any[], S = servidores as any[], R = revendedores as any[];
    const today = new Date();
    const inDay = (iso: string) => new Date(iso).toDateString() === today.toDateString();
    const inMonth = (iso: string) => {
      const x = new Date(iso);
      return x.getMonth() === today.getMonth() && x.getFullYear() === today.getFullYear();
    };
    const inYear = (iso: string) => new Date(iso).getFullYear() === today.getFullYear();

    const saida = M.filter((m) => ["ativacao", "renovacao", "venda_revendedor"].includes(m.tipo));
    const consumoClientes = M.filter((m) => ["ativacao", "renovacao"].includes(m.tipo));
    const sum = (arr: any[]) => arr.reduce((s, m) => s + Math.abs(Number(m.quantidade || 0)), 0);

    const disponiveis = Object.values(saldos as any).reduce((s: number, v: any) => s + Number(v || 0), 0);
    const comprados = C.reduce((s, c) => s + Number(c.quantidade || 0), 0);
    const utilizados = sum(saida);
    const consumidosClientes = sum(consumoClientes);
    const vendidosRev = sum(M.filter((m) => m.tipo === "venda_revendedor"));
    const posseRev = R.reduce((s, r) => s + Number(r.creditos || 0), 0);

    const consumoDia = sum(saida.filter((m) => m.created_at && inDay(m.created_at)));
    const consumoMes = sum(saida.filter((m) => m.created_at && inMonth(m.created_at)));
    const consumoAno = sum(saida.filter((m) => m.created_at && inYear(m.created_at)));

    // média diária real (últimos 30 dias com base nas saídas)
    const lim30 = Date.now() - 30 * 86400000;
    const ult30 = sum(saida.filter((m) => m.created_at && new Date(m.created_at).getTime() >= lim30));
    const mediaDiaria = ult30 / 30;
    const mediaMensal = mediaDiaria * 30;
    const diasAno = Math.max(1, Math.floor((Date.now() - new Date(today.getFullYear(), 0, 1).getTime()) / 86400000));
    const mediaAnual = (consumoAno / diasAno) * 365;
    const projecaoDias = mediaDiaria > 0 ? Math.floor(disponiveis / mediaDiaria) : null;

    const custoTotal = C.reduce(
      (s, c) => s + Number(c.valor_total ?? Number(c.quantidade || 0) * Number(c.valor_unitario || 0)), 0);
    const precoMedioCompra = comprados > 0 ? custoTotal / comprados : 0;
    const vendas = (revMovs as any[]).filter(
      (m) => m.tipo === "venda" && String(m.status_venda).toUpperCase() !== "CANCELADA");
    const receitaVendas = vendas.reduce((s, m) => s + Number(m.valor_pago || 0), 0);
    const credVendidos = vendas.reduce((s, m) => s + Math.abs(Number(m.quantidade || 0)), 0);
    const precoMedioVenda = credVendidos > 0 ? receitaVendas / credVendidos : 0;
    const lucroPorCredito = precoMedioVenda - precoMedioCompra;
    const margem = precoMedioVenda > 0 ? (lucroPorCredito / precoMedioVenda) * 100 : 0;
    const valorEstoque = disponiveis * precoMedioCompra;
    const eficiencia = comprados > 0 ? (utilizados / comprados) * 100 : 0;

    // por servidor
    const porServidor = S.map((s) => {
      const saldo = Number((saldos as any)[s.id] || 0);
      const compradosS = C.filter((c) => c.servidor_id === s.id).reduce((a, c) => a + Number(c.quantidade || 0), 0);
      const custoS = C.filter((c) => c.servidor_id === s.id).reduce(
        (a, c) => a + Number(c.valor_total ?? Number(c.quantidade || 0) * Number(c.valor_unitario || 0)), 0);
      const usadosS = sum(saida.filter((m) => m.servidor_id === s.id));
      const usados30 = sum(saida.filter((m) => m.servidor_id === s.id && m.created_at && new Date(m.created_at).getTime() >= lim30));
      const mdS = usados30 / 30;
      return {
        id: s.id, nome: s.nome, categoria: s.categoria ?? "—",
        saldo, comprados: compradosS, usados: usadosS, custo: custoS,
        unit: compradosS > 0 ? custoS / compradosS : Number(s.custo_mensal || 0),
        mediaDiaria: mdS,
        projecao: mdS > 0 ? Math.floor(saldo / mdS) : null,
        alerta: saldo <= 0 ? "critico" : mdS > 0 && saldo / mdS < 7 ? "baixo" : saldo < 10 ? "baixo" : "ok",
      };
    }).sort((a, b) => b.saldo - a.saldo);

    const alertas = porServidor.filter((s) => s.alerta !== "ok");
    const maxSaldo = Math.max(...porServidor.map((s) => s.saldo), 1);

    // histórico de consumo — últimos 14 dias
    const serie: { dia: string; consumo: number; compras: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const dt = new Date(); dt.setHours(0, 0, 0, 0); dt.setDate(dt.getDate() - i);
      const k = dayKey(dt);
      serie.push({
        dia: dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        consumo: sum(saida.filter((m) => m.created_at && dayKey(new Date(m.created_at)) === k)),
        compras: C.filter((c) => (c.data_compra ?? String(c.created_at).slice(0, 10)) === k)
          .reduce((a, c) => a + Number(c.quantidade || 0), 0),
      });
    }

    const ultimasCompras = C.slice(0, 10).map((c) => ({
      data: c.data_compra ?? (c.created_at ? String(c.created_at).slice(0, 10) : ""),
      servidor: c.servidor?.nome ?? "—",
      qtd: Number(c.quantidade || 0),
      unit: Number(c.valor_unitario || 0),
      total: Number(c.valor_total ?? Number(c.quantidade || 0) * Number(c.valor_unitario || 0)),
    }));

    return {
      disponiveis, comprados, utilizados, consumidosClientes, vendidosRev, posseRev,
      consumoDia, consumoMes, consumoAno, mediaDiaria, mediaMensal, mediaAnual, projecaoDias,
      custoTotal, precoMedioCompra, precoMedioVenda, lucroPorCredito, margem, valorEstoque,
      eficiencia, porServidor, alertas, maxSaldo, serie, ultimasCompras, receitaVendas,
    };
  }, [saldos, movs, compras, revendedores, servidores, revMovs]);

  const sections = (): ExportSection[] => [
    {
      title: "Resumo Geral de Créditos",
      description:
        "Panorama consolidado do estoque de créditos: quantidades compradas, utilizadas e disponíveis, consumo por período, médias de consumo, projeção de duração do estoque e indicadores financeiros de custo, venda e margem.",
      columns: ["Indicador", "Valor"],
      rows: [
        ["Créditos disponíveis (estoque)", d.disponiveis],
        ["Créditos comprados (total)", d.comprados],
        ["Créditos utilizados (total)", d.utilizados],
        ["Consumidos por clientes", d.consumidosClientes],
        ["Vendidos a revendedores", d.vendidosRev],
        ["Em posse de revendedores", d.posseRev],
        ["Consumo do dia", d.consumoDia],
        ["Consumo do mês", d.consumoMes],
        ["Consumo do ano", d.consumoAno],
        ["Média diária (30d)", d.mediaDiaria.toFixed(2)],
        ["Média mensal projetada", d.mediaMensal.toFixed(2)],
        ["Média anual projetada", d.mediaAnual.toFixed(2)],
        ["Projeção de duração do estoque", d.projecaoDias === null ? "—" : `${d.projecaoDias} dias`],
        ["Custo total investido", currencyBRL(d.custoTotal)],
        ["Valor do estoque atual", currencyBRL(d.valorEstoque)],
        ["Preço médio de compra", currencyBRL(d.precoMedioCompra)],
        ["Preço médio de venda", currencyBRL(d.precoMedioVenda)],
        ["Lucro médio por crédito", currencyBRL(d.lucroPorCredito)],
        ["Margem média", `${d.margem.toFixed(1)}%`],
        ["Eficiência de uso (utilizados/comprados)", `${d.eficiencia.toFixed(1)}%`],
      ],
    },
    {
      title: "Estoque e Custos por Servidor",
      description:
        "Comparativo entre servidores contendo estoque atual de créditos, total comprado, total utilizado, custo acumulado, custo unitário médio, média de consumo diário, projeção de duração e situação do estoque.",
      columns: ["Servidor", "Categoria", "Estoque", "Comprados", "Utilizados", "Custo total", "Custo unitário", "Média diária", "Projeção (dias)", "Situação"],
      rows: d.porServidor.map((s) => [
        s.nome, s.categoria, s.saldo, s.comprados, s.usados, currencyBRL(s.custo), currencyBRL(s.unit),
        s.mediaDiaria.toFixed(2), s.projecao === null ? "—" : s.projecao,
        s.alerta === "ok" ? "Normal" : s.alerta === "baixo" ? "Estoque baixo" : "Crítico / zerado",
      ]),
    },
    {
      title: "Histórico de Consumo (14 dias)",
      description: "Evolução diária dos créditos consumidos (ativações, renovações e vendas a revendedores) e dos créditos adquiridos nos últimos 14 dias.",
      columns: ["Dia", "Consumo", "Compras"],
      rows: d.serie.map((s) => [s.dia, s.consumo, s.compras]),
    },
    {
      title: "Últimas Compras de Créditos",
      description: "Últimas aquisições de créditos registradas, com data, servidor, quantidade, valor unitário e valor total investido.",
      columns: ["Data", "Servidor", "Quantidade", "Valor unitário", "Valor total"],
      rows: d.ultimasCompras.map((c) => [
        c.data ? new Date(c.data + "T00:00:00").toLocaleDateString("pt-BR") : "—",
        c.servidor, c.qtd, currencyBRL(c.unit), currencyBRL(c.total),
      ]),
    },
  ];

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Package className="h-4 w-4 text-blue-400" /> Gestão de Créditos
          </h2>
          <p className="text-[11px] text-muted-foreground">Estoque, consumo, custos, projeções e desempenho por servidor</p>
        </div>
        <ExportConsolidado reportName="Gestão de Créditos" sections={sections} />
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        <Kpi label="Estoque atual" value={d.disponiveis} icon={Package} tone="blue" sub={currencyBRL(d.valorEstoque)} />
        <Kpi label="Comprados" value={d.comprados} icon={ShoppingCart} tone="slate" sub={currencyBRL(d.custoTotal)} />
        <Kpi label="Utilizados" value={d.utilizados} icon={Activity} tone="orange" sub={`${d.eficiencia.toFixed(0)}% de uso`} />
        <Kpi label="Vendidos a revendas" value={d.vendidosRev} icon={Users} tone="purple" sub={`${d.posseRev} em posse`} />
        <Kpi label="Média diária (30d)" value={d.mediaDiaria.toFixed(1)} icon={Gauge} tone="yellow" sub={`${d.mediaMensal.toFixed(0)}/mês`} />
        <Kpi
          label="Projeção do estoque"
          value={d.projecaoDias === null ? "—" : `${d.projecaoDias}d`}
          icon={Timer}
          tone={d.projecaoDias !== null && d.projecaoDias < 7 ? "red" : "emerald"}
          sub={d.projecaoDias === null ? "sem consumo" : "até acabar"}
        />
      </div>

      {/* Indicadores financeiros */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Kpi label="Preço médio compra" value={currencyBRL(d.precoMedioCompra)} icon={Wallet} tone="red" />
        <Kpi label="Preço médio venda" value={currencyBRL(d.precoMedioVenda)} icon={TrendingUp} tone="emerald" />
        <Kpi
          label="Lucro médio / crédito"
          value={currencyBRL(d.lucroPorCredito)}
          icon={d.lucroPorCredito >= 0 ? TrendingUp : TrendingDown}
          tone={d.lucroPorCredito >= 0 ? "emerald" : "red"}
        />
        <Kpi label="Margem média" value={`${d.margem.toFixed(1)}%`} icon={Percent} tone="blue" />
      </div>

      {/* Alertas */}
      {d.alertas.length > 0 && (
        <div className="rounded-lg border border-orange-500/40 bg-orange-500/10 p-2.5 space-y-1.5">
          <div className="text-xs font-semibold text-orange-400 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Alertas de estoque baixo ({d.alertas.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {d.alertas.map((s) => (
              <Badge
                key={s.id}
                variant="outline"
                className={cn("text-[10px]", s.alerta === "critico" ? "border-red-500/50 text-red-400" : "border-orange-500/50 text-orange-400")}
              >
                {s.nome}: {s.saldo} créd.{s.projecao !== null && ` · ~${s.projecao}d`}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Histórico de consumo (14 dias)</div>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={d.serie} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="dia" tick={{ fontSize: 9 }} interval={1} />
                <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="consumo" name="Consumo" stroke="hsl(25 95% 55%)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="compras" name="Compras" stroke="hsl(217 91% 60%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Comparativo entre servidores</div>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.porServidor.slice(0, 8)} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="nome" tick={{ fontSize: 9 }} interval={0} angle={-18} textAnchor="end" height={44} />
                <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="saldo" name="Estoque" fill="hsl(217 91% 60%)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="usados" name="Utilizados" fill="hsl(25 95% 55%)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Estoque por servidor */}
      <div className="space-y-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Estoque e custos por servidor</div>
        <div className="space-y-2 max-h-[280px] overflow-auto pr-1">
          {d.porServidor.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-6">Nenhum servidor cadastrado.</div>
          )}
          {d.porServidor.map((s) => (
            <div key={s.id} className="rounded-lg border border-border/60 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <ServerIcon className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-sm font-semibold truncate">{s.nome}</span>
                  <Badge variant="secondary" className="text-[10px]">{s.categoria}</Badge>
                  {s.alerta !== "ok" && (
                    <Badge variant="outline" className={cn("text-[10px]", s.alerta === "critico" ? "border-red-500/50 text-red-400" : "border-orange-500/50 text-orange-400")}>
                      {s.alerta === "critico" ? "crítico" : "baixo"}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs shrink-0 flex-wrap">
                  <span className="text-blue-400 font-semibold tabular-nums">{s.saldo} estoque</span>
                  <span className="text-orange-400 font-semibold tabular-nums">{s.usados} usados</span>
                  <span className="text-muted-foreground tabular-nums">{s.comprados} comprados</span>
                  <span className="text-muted-foreground tabular-nums">unit. {currencyBRL(s.unit)}</span>
                  <span className="text-red-400 font-semibold tabular-nums">{currencyBRL(s.custo)}</span>
                  <span className="text-muted-foreground tabular-nums">{s.projecao === null ? "—" : `~${s.projecao}d`}</span>
                </div>
              </div>
              <Progress value={(s.saldo / d.maxSaldo) * 100} className="h-1.5" />
            </div>
          ))}
        </div>
      </div>

      {/* Últimas compras */}
      <div className="space-y-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Últimas compras de créditos</div>
        <div className="max-h-[200px] overflow-auto pr-1 space-y-1">
          {d.ultimasCompras.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-4">Nenhuma compra registrada.</div>
          )}
          {d.ultimasCompras.map((c, i) => (
            <div key={i} className="flex items-center justify-between gap-2 rounded-md border border-border/50 px-2.5 py-1.5 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <ShoppingCart className="h-3 w-3 text-blue-400 shrink-0" />
                <span className="text-muted-foreground tabular-nums">
                  {c.data ? new Date(c.data + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                </span>
                <span className="font-medium truncate">{c.servidor}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0 tabular-nums">
                <span className="text-blue-400 font-semibold">+{c.qtd}</span>
                <span className="text-muted-foreground">{currencyBRL(c.unit)}</span>
                <span className="text-red-400 font-semibold">{currencyBRL(c.total)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

const tones: Record<string, string> = {
  blue: "from-blue-500/15 to-transparent border-blue-500/30 text-blue-400",
  emerald: "from-emerald-500/15 to-transparent border-emerald-500/30 text-emerald-400",
  red: "from-red-500/15 to-transparent border-red-500/30 text-red-400",
  orange: "from-orange-500/15 to-transparent border-orange-500/30 text-orange-400",
  purple: "from-purple-500/15 to-transparent border-purple-500/30 text-purple-400",
  yellow: "from-yellow-500/15 to-transparent border-yellow-500/30 text-yellow-400",
  slate: "from-muted to-transparent border-border text-muted-foreground",
};

function Kpi({ label, value, icon: Icon, tone = "blue", sub }: {
  label: string; value: React.ReactNode; icon: any; tone?: string; sub?: string;
}) {
  return (
    <div className={cn("rounded-lg border bg-gradient-to-br px-2.5 py-2", tones[tone])}>
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{label}</span>
        <Icon className="h-3.5 w-3.5 shrink-0" />
      </div>
      <div className="text-lg font-bold text-foreground tabular-nums leading-tight truncate">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground truncate">{sub}</div>}
    </div>
  );
}
