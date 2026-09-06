import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { currencyBRL } from "@/lib/iptv";
import { cn } from "@/lib/utils";
import { fetchHistorico, fetchRevendedoresMovs, fetchAtivacoesApps } from "@/lib/queries";
import { TrendingUp, TrendingDown, Sparkles } from "lucide-react";

/**
 * Seção Destaques do Ano (movida do Dashboard para o topo da Central de Gestão).
 * Exibe os recordes anuais: 3 maiores vendas, 3 piores vendas, 3 maiores lucros e 3 maiores despesas.
 */
export function DestaquesAnoCard() {
  const { data: historico = [] } = useQuery({ queryKey: ["historico"], queryFn: fetchHistorico });
  const { data: revMovs = [] } = useQuery({ queryKey: ["revendedores_movs"], queryFn: fetchRevendedoresMovs });
  const { data: ativacoesApps = [] } = useQuery({ queryKey: ["ativacoes_apps"], queryFn: fetchAtivacoesApps });

  const today = new Date();
  const anoAtual = today.getFullYear();

  const historicoF = (historico as any[]).filter((h: any) => h.status !== "cancelada");
  const histPagos = historicoF.filter((h: any) => (h.status_pagamento ? h.status_pagamento === "pago" : true));

  const revPagos = (revMovs as any[])
    .filter((m: any) => m.tipo === "venda" && m.status_venda !== "cancelada" && m.status_pagamento === "pago")
    .map((m: any) => ({
      data_recarga: m.created_at,
      valor_venda: Number(m.valor_pago || 0),
      custo: Number(m.custo || 0),
    }));

  const ativLinhas = (ativacoesApps as any[]).map((a: any) => ({
    data: a.ativado_em,
    valor: Number(a.valor || 0),
    custo: Number(a.custo || 0),
  }));

  const dailyYearMap = new Map<string, number>();
  const addDayYear = (iso: string, valor: number) => {
    if (!iso) return;
    const d = new Date(iso);
    if (d.getFullYear() !== anoAtual) return;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    dailyYearMap.set(key, (dailyYearMap.get(key) ?? 0) + valor);
  };
  histPagos.forEach((h: any) => addDayYear(h.created_at, Number(h.valor_recebido || 0)));
  revPagos.forEach((r: any) => addDayYear(r.data_recarga, Number(r.valor_venda || 0)));
  ativLinhas.forEach((a: any) => addDayYear(a.data, a.valor));

  const yearDays = Array.from(dailyYearMap.entries())
    .map(([k, v]) => {
      const [y, m, d] = k.split("-").map(Number);
      return { date: new Date(y, m, d), valor: v };
    })
    .filter((e) => e.valor > 0)
    .sort((a, b) => b.valor - a.valor);

  const top3Maiores = yearDays.slice(0, 3);
  const top3Menores = [...yearDays].reverse().slice(0, 3);
  const maxDiaAno = top3Maiores[0]?.valor ?? 0;

  // Acumulado diário de despesas
  const despYearMap = new Map<string, number>();
  const addDespYear = (iso: string, valor: number) => {
    if (!iso) return;
    const d = new Date(iso);
    if (d.getFullYear() !== anoAtual) return;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    despYearMap.set(key, (despYearMap.get(key) ?? 0) + valor);
  };
  historicoF.forEach((h: any) => addDespYear(h.created_at, Number(h.custo || 0)));
  revPagos.forEach((r: any) => addDespYear(r.data_recarga, Number(r.custo || 0)));
  ativLinhas.forEach((a: any) => addDespYear(a.data, a.custo));

  const keyToDate = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m, d);
  };

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

  const dataLongaBR = (d: Date) =>
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const mesAnoBR = (d: Date) =>
    d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <Card className="p-4 space-y-3 border-border/70 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-400" /> Destaques do Ano ({anoAtual})
        </h3>
        <span className="text-xs text-muted-foreground uppercase tracking-wider">Recordes Anuais</span>
      </div>

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
                {bloco.itens.length === 0 && <div className="text-xs text-muted-foreground py-2">Sem lançamentos no ano.</div>}
                {bloco.itens.map((d, i) => (
                  <div key={d.date.toISOString()} className={cn("rounded-md border px-2 py-1.5", borda)}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("flex items-center gap-1 text-sm font-semibold", texto)}>
                        <span className={cn("h-5 w-5 rounded-full grid place-items-center text-[10px]", badge)}>{i + 1}</span>
                        {dataLongaBR(d.date)}
                      </span>
                      <span className={cn("tabular-nums text-sm font-bold", texto)}>{currencyBRL(d.valor)}</span>
                    </div>
                    <div className="text-[11px] capitalize text-muted-foreground mt-0.5">{mesAnoBR(d.date)}</div>
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
  );
}
