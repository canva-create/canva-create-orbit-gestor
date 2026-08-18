import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { fetchClientes, fetchClientesExcluidos } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { UserPlus, CalendarDays, CalendarClock, CalendarRange } from "lucide-react";

/** Evolução de Entrada de Clientes — novos cadastros no dia, semana, mês e ano. */
export function EntradaClientesPanel() {
  const { data: clientes = [] } = useQuery({ queryKey: ["clientes"], queryFn: fetchClientes });
  const { data: excluidos = [] } = useQuery({ queryKey: ["clientes_excluidos"], queryFn: fetchClientesExcluidos });

  const todos = [...(clientes as any[]), ...(excluidos as any[])]
    .map((c) => (c.created_at ? new Date(c.created_at) : null))
    .filter(Boolean) as Date[];

  const hoje = new Date();
  const inicioDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const inicioSemana = new Date(inicioDia);
  inicioSemana.setDate(inicioDia.getDate() - inicioDia.getDay()); // domingo
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const inicioAno = new Date(hoje.getFullYear(), 0, 1);

  const contar = (desde: Date) => todos.filter((d) => d >= desde).length;
  const dia = contar(inicioDia);
  const semana = contar(inicioSemana);
  const mes = contar(inicioMes);
  const ano = contar(inicioAno);

  const primeiro = todos.length ? new Date(Math.min(...todos.map((d) => d.getTime()))) : null;
  const totalHistorico = todos.length;
  // Entradas posteriores ao primeiro registro da base.
  const aposPrimeiro = primeiro ? todos.filter((d) => d.getTime() > primeiro.getTime()).length : 0;

  // Últimos 12 meses para leitura da evolução.
  const meses = Array.from({ length: 12 }, (_, i) => {
    const ref = new Date(hoje.getFullYear(), hoje.getMonth() - (11 - i), 1);
    const fim = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
    return {
      label: ref.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
      qtd: todos.filter((d) => d >= ref && d < fim).length,
    };
  });
  const maxMes = Math.max(1, ...meses.map((m) => m.qtd));

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-emerald-400" /> Evolução de Entrada de Clientes
        </h2>
        <span className="text-xs text-muted-foreground">
          {totalHistorico} cadastro(s) no histórico{primeiro ? ` · desde ${primeiro.toLocaleDateString("pt-BR")}` : ""} · {aposPrimeiro} após o primeiro registro
        </span>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Bloco label="Hoje" value={dia} tone="text-emerald-400" Icon={CalendarDays} />
        <Bloco label="Nesta semana" value={semana} tone="text-blue-400" Icon={CalendarRange} />
        <Bloco label="Neste mês" value={mes} tone="text-purple-400" Icon={CalendarClock} />
        <Bloco label={`Em ${hoje.getFullYear()}`} value={ano} tone="text-orange-400" Icon={UserPlus} />
      </div>

      <div className="rounded-md border border-border/60 bg-background/40 p-2 space-y-1">
        <div className="text-xs font-semibold text-muted-foreground">Novos clientes por mês (últimos 12 meses)</div>
        {meses.map((m) => (
          <div key={m.label} className="flex items-center gap-2 text-xs">
            <span className="w-16 shrink-0 capitalize text-muted-foreground">{m.label}</span>
            <div className="flex-1 h-2 rounded bg-background/60 overflow-hidden">
              <div className="h-full bg-emerald-400" style={{ width: `${(m.qtd / maxMes) * 100}%` }} />
            </div>
            <span className="w-10 text-right tabular-nums font-semibold">{m.qtd}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Bloco({ label, value, tone, Icon }: { label: string; value: number; tone: string; Icon: any }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <Icon className={cn("h-4 w-4", tone)} />
      </div>
      <div className={cn("mt-1 text-2xl font-bold tabular-nums", tone)}>{value}</div>
    </div>
  );
}
