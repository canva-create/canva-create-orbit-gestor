import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { fetchClientes, fetchClientesExcluidos } from "@/lib/queries";
import { diasParaVencer } from "@/lib/iptv";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp } from "lucide-react";

const DIA = 86400000;

/**
 * Evolução de Clientes — parte da quantidade EXATA de clientes ativos exibida
 * na aba Clientes Ativos (status "ativo" e vencimento não expirado) e projeta
 * os próximos 365 dias com base no ritmo real da base.
 */
export function EvolucaoClientesChart() {
  const { data: clientes = [] } = useQuery({ queryKey: ["clientes"], queryFn: fetchClientes });
  const { data: excluidos = [] } = useQuery({ queryKey: ["clientes_excluidos"], queryFn: fetchClientesExcluidos });

  const agora = Date.now();
  const ativos = (clientes as any[]).filter((c) => {
    const d = diasParaVencer(c.data_vencimento);
    return d !== null && d >= 0 && c.status === "ativo";
  }).length;

  // Janela histórica: últimos 180 dias (ou desde o primeiro cadastro, se menor).
  const criados = (clientes as any[])
    .concat(excluidos as any[])
    .map((c) => (c.created_at ? new Date(c.created_at).getTime() : 0))
    .filter(Boolean);
  const primeiro = criados.length ? Math.min(...criados) : agora;
  const janelaDias = Math.max(30, Math.min(180, Math.round((agora - primeiro) / DIA) || 30));
  const desde = agora - janelaDias * DIA;

  const entradas = (clientes as any[]).filter((c) => {
    const t = c.created_at ? new Date(c.created_at).getTime() : 0;
    const d = diasParaVencer(c.data_vencimento);
    return t >= desde && d !== null && d >= 0 && c.status === "ativo";
  }).length;
  const saidas =
    (excluidos as any[]).filter((c) => c.deleted_at && new Date(c.deleted_at).getTime() >= desde).length +
    (clientes as any[]).filter((c) => c.status === "cancelado" && c.updated_at && new Date(c.updated_at).getTime() >= desde).length;

  const liquidoDia = (entradas - saidas) / janelaDias;

  const marcos = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 365];
  const dados = marcos.map((d) => {
    const data = new Date(agora + d * DIA);
    return {
      dia: d,
      label: d === 0 ? "Hoje" : data.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
      clientes: Math.max(0, Math.round(ativos + liquidoDia * d)),
    };
  });

  const final = dados[dados.length - 1]!.clientes;
  const delta = final - ativos;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-400" /> Evolução de Clientes — projeção 365 dias
        </h3>
        <span className="text-xs text-muted-foreground">
          Base atual: <strong className="text-emerald-400">{ativos}</strong> ativos · ritmo {liquidoDia >= 0 ? "+" : ""}
          {liquidoDia.toFixed(2)}/dia (últimos {janelaDias} dias)
        </span>
      </div>

      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dados} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
              formatter={(v: any) => [`${v} clientes`, "Projeção"]}
            />
            <Line type="monotone" dataKey="clientes" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Projeção em 365 dias: <strong>{final}</strong> cliente(s) ativos ({delta >= 0 ? "+" : ""}{delta}). Cálculo feito no
        momento da abertura com os mesmos clientes exibidos na aba Clientes Ativos.
      </p>
    </Card>
  );
}
