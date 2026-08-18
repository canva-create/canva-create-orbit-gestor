import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { fetchClientes } from "@/lib/queries";
import { diasParaVencer } from "@/lib/iptv";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { Users, AlertTriangle, CalendarClock, CalendarDays, CalendarPlus, Clock, History } from "lucide-react";

type Tone = "green" | "red" | "orange" | "amber" | "blue" | "purple";

const tones: Record<Tone, { border: string; text: string; bg: string }> = {
  green: { border: "border-emerald-500/40", text: "text-emerald-400", bg: "bg-emerald-500/10" },
  red: { border: "border-red-500/40", text: "text-red-400", bg: "bg-red-500/10" },
  orange: { border: "border-orange-500/40", text: "text-orange-400", bg: "bg-orange-500/10" },
  amber: { border: "border-amber-500/40", text: "text-amber-400", bg: "bg-amber-500/10" },
  blue: { border: "border-blue-500/40", text: "text-blue-400", bg: "bg-blue-500/10" },
  purple: { border: "border-purple-500/40", text: "text-purple-400", bg: "bg-purple-500/10" },
};

function Bloco({ label, value, sub, tone, Icon, to, total }: {
  label: string; value: number; sub: string; tone: Tone; Icon: any; to: string; total: number;
}) {
  const t = tones[tone];
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <Link to={to} className={cn("block rounded-xl border p-3 transition hover:brightness-125", t.border, t.bg)}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground leading-tight">{label}</div>
        <Icon className={cn("h-5 w-5 shrink-0", t.text)} />
      </div>
      <div className={cn("mt-1 text-3xl font-extrabold tabular-nums leading-none", t.text)}>{value}</div>
      <div className="mt-1.5 h-1.5 rounded bg-background/60 overflow-hidden">
        <div className={cn("h-full", t.text.replace("text-", "bg-"))} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </Link>
  );
}

export function IndicadoresBasePanel() {
  const { data: clientes = [] } = useQuery({ queryKey: ["clientes"], queryFn: fetchClientes });

  const lista = clientes as any[];
  const dias = lista.map((c) => ({ c, d: diasParaVencer(c.data_vencimento) }));

  const ativos = dias.filter(({ c, d }) => d !== null && d >= 0 && c.status === "ativo").length;
  const vencidos = dias.filter(({ c, d }) => d !== null && d < 0 && c.status !== "cancelado").length;
  const venceuHa = (n: number) => dias.filter(({ c, d }) => d === -n && c.status !== "cancelado").length;
  const venceEm = (n: number) => dias.filter(({ c, d }) => d === n && c.status === "ativo").length;

  const total = Math.max(1, ativos + vencidos);

  const itens = [
    { label: "Clientes ativos", value: ativos, sub: "Em dia com o vencimento", tone: "green" as Tone, Icon: Users, to: "/clientes" },
    { label: "Clientes vencidos", value: vencidos, sub: "Total da base vencida", tone: "red" as Tone, Icon: AlertTriangle, to: "/vencidos" },
    { label: "Vencidos há 1 dia", value: venceuHa(1), sub: "Prioridade de contato", tone: "orange" as Tone, Icon: History, to: "/vencidos" },
    { label: "Vencidos há 2 dias", value: venceuHa(2), sub: "Risco de perda", tone: "orange" as Tone, Icon: Clock, to: "/vencidos" },
    { label: "Vencem hoje", value: venceEm(0), sub: "Renovar ainda hoje", tone: "amber" as Tone, Icon: CalendarClock, to: "/clientes" },
    { label: "Vencem amanhã", value: venceEm(1), sub: "Aviso antecipado", tone: "blue" as Tone, Icon: CalendarDays, to: "/clientes" },
    { label: "Vencem em 2 dias", value: venceEm(2), sub: "Planejar cobrança", tone: "purple" as Tone, Icon: CalendarPlus, to: "/clientes" },
  ];

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h2 className="text-lg font-semibold flex items-center gap-1.5">📊 Indicadores da base de clientes</h2>
        <span className="text-sm text-muted-foreground">
          Base considerada: <strong className="text-foreground">{ativos + vencidos}</strong> cliente(s)
        </span>
      </div>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
        {itens.map((i) => (
          <Bloco key={i.label} {...i} total={total} />
        ))}
      </div>
    </Card>
  );
}
