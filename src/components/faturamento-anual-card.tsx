import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { currencyBRL } from "@/lib/iptv";
import { cn } from "@/lib/utils";
import { fetchFinanceiro } from "@/lib/faturamento";
import { TrendingUp, TrendingDown, CalendarClock } from "lucide-react";
import { useState } from "react";

/** Faturamento Anual (movido da Dashboard para a Central de Gestão). */
export function FaturamentoAnualCard() {
  const { data: linhas = [] } = useQuery({ queryKey: ["financeiro_lancamentos"], queryFn: fetchFinanceiro });
  const [mesAberto, setMesAberto] = useState<number | null>(null);

  const hoje = new Date();
  const ano = hoje.getFullYear();
  const anoAnt = ano - 1;

  const dados = (linhas as any[]).filter((l) => !!l.created_at);
  const doAno = (a: number) => dados.filter((l) => new Date(l.created_at).getFullYear() === a);

  const soma = (rows: any[], k: "valor" | "custo") => rows.reduce((s, r) => s + Number(r[k] || 0), 0);
  const rowsAno = doAno(ano);
  const rowsAnt = doAno(anoAnt);
  const fatAno = soma(rowsAno, "valor");
  const despAno = soma(rowsAno, "custo");
  const lucroAno = fatAno - despAno;
  const fatAnt = soma(rowsAnt, "valor");
  const lucroAnt = fatAnt - soma(rowsAnt, "custo");
  const pct = (a: number, b: number) => (b === 0 ? (a > 0 ? 100 : 0) : ((a - b) / b) * 100);
  const mediaMensal = fatAno / (hoje.getMonth() + 1);

  const meses = Array.from({ length: 12 }, (_, m) => {
    const doMes = rowsAno.filter((l) => new Date(l.created_at).getMonth() === m);
    const totalDias = new Date(ano, m + 1, 0).getDate();
    const dias = Array.from({ length: totalDias }, (_, i) => {
      const dia = i + 1;
      const rs = doMes.filter((l) => new Date(l.created_at).getDate() === dia);
      const fat = soma(rs, "valor");
      const desp = soma(rs, "custo");
      return { dia, fat, desp, lucro: fat - desp };
    }).filter((d) => d.fat !== 0 || d.desp !== 0);
    const fat = soma(doMes, "valor");
    const desp = soma(doMes, "custo");
    return { mes: m, nome: new Date(ano, m, 1).toLocaleDateString("pt-BR", { month: "long" }), fat, desp, lucro: fat - desp, dias };
  }).filter((m) => m.dias.length > 0);

  return (
    <Card className="p-4 space-y-2 border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-transparent">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-purple-400" /> Faturamento Anual
        </h2>
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{ano}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Item label="Faturamento" value={fatAno} tone="text-emerald-400" />
        <Item label="Despesas" value={despAno} tone="text-red-400" />
        <Item label="Lucro Líquido" value={lucroAno} tone="text-blue-400" />
      </div>

      <div className="rounded-md border border-border/60 bg-background/40">
        <div className="flex items-center justify-between px-2 py-1 text-xs font-semibold border-b border-border/60">
          <span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5 text-purple-400" /> Acumulado diário por mês</span>
          <span className="text-muted-foreground">Fat. · Desp. · Lucro</span>
        </div>
        <div className="max-h-[280px] overflow-auto divide-y divide-border/40">
          {meses.length === 0 && <div className="px-2 py-2 text-xs text-muted-foreground text-center">Sem lançamentos no ano.</div>}
          {meses.map((m) => (
            <div key={m.mes}>
              <button
                type="button"
                onClick={() => setMesAberto(mesAberto === m.mes ? null : m.mes)}
                className="w-full flex items-center justify-between gap-2 px-2 py-1.5 text-xs tabular-nums hover:bg-purple-500/5 transition"
              >
                <span className="capitalize font-semibold w-20 text-left shrink-0">{m.nome}</span>
                <span className="flex-1 text-right text-emerald-400 font-semibold">{currencyBRL(m.fat)}</span>
                <span className="flex-1 text-right text-red-400 font-semibold">{currencyBRL(m.desp)}</span>
                <span className={cn("flex-1 text-right font-bold", m.lucro >= 0 ? "text-blue-400" : "text-red-400")}>{currencyBRL(m.lucro)}</span>
              </button>
              {mesAberto === m.mes && (
                <div className="bg-background/60 divide-y divide-border/30">
                  {m.dias.map((d) => (
                    <div key={d.dia} className="flex items-center justify-between gap-2 pl-4 pr-2 py-1 text-xs tabular-nums">
                      <span className="text-muted-foreground w-8 shrink-0">{String(d.dia).padStart(2, "0")}</span>
                      <span className="flex-1 text-right text-emerald-400">{currencyBRL(d.fat)}</span>
                      <span className="flex-1 text-right text-red-400">{currencyBRL(d.desp)}</span>
                      <span className={cn("flex-1 text-right font-semibold", d.lucro >= 0 ? "text-blue-400" : "text-red-400")}>{currencyBRL(d.lucro)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="pt-1 border-t border-border/40 space-y-1 text-xs">
        <div className="flex justify-between text-muted-foreground"><span>{anoAnt}</span><span className="tabular-nums">{currencyBRL(fatAnt)}</span></div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Variação anual</span>
          <span className={cn("font-semibold tabular-nums flex items-center gap-0.5", pct(fatAno, fatAnt) >= 0 ? "text-emerald-400" : "text-red-400")}>
            {pct(fatAno, fatAnt) >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {pct(fatAno, fatAnt).toFixed(1)}%
          </span>
        </div>
        <div className="flex justify-between text-muted-foreground"><span>Média mensal</span><span className="tabular-nums">{currencyBRL(mediaMensal)}</span></div>
        <div className="flex justify-between text-muted-foreground"><span>Lucro {anoAnt}</span><span className="tabular-nums">{currencyBRL(lucroAnt)}</span></div>
      </div>
    </Card>
  );
}

function Item({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-md border border-border/60 px-2 py-1.5 flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted-foreground uppercase">{label}</span>
      <span className={cn("text-lg font-bold tabular-nums", tone)}>{currencyBRL(value)}</span>
    </div>
  );
}
