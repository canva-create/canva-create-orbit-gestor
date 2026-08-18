import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { fetchClientes, fetchClientesExcluidos } from "@/lib/queries";
import { diasParaVencer } from "@/lib/iptv";
import { cn } from "@/lib/utils";
import { Users, UserPlus, UserMinus, TrendingUp, AlertTriangle, LineChart } from "lucide-react";
import { AnaliseBaseDialog } from "./analise-base-dialog";

const DIA = 86400000;

function Item({ label, value, sub, tone, Icon }: { label: string; value: string | number; sub?: string; tone: string; Icon: any }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <Icon className={cn("h-4 w-4", tone)} />
      </div>
      <div className={cn("mt-1 text-2xl font-bold tabular-nums", tone)}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

export function BaseClientesPanel() {
  const { data: clientes = [] } = useQuery({ queryKey: ["clientes"], queryFn: fetchClientes });
  const { data: excluidos = [] } = useQuery({ queryKey: ["clientes_excluidos"], queryFn: fetchClientesExcluidos });

  const agora = Date.now();
  const ativos = clientes.filter((c: any) => {
    const d = diasParaVencer(c.data_vencimento);
    return d !== null && d >= 0 && c.status === "ativo";
  }).length;
  const vencidos = clientes.filter((c: any) => {
    const d = diasParaVencer(c.data_vencimento);
    return (d !== null && d < 0) || (d !== null && d >= 0 && c.status === "vencido");
  }).length;
  const base = clientes.length;

  // Início da apuração: 1 de agosto (do ano vigente; se ainda não chegou, do ano anterior)
  const hoje = new Date();
  const inicioApuracao = new Date(hoje.getFullYear(), 7, 1);
  if (inicioApuracao.getTime() > agora) inicioApuracao.setFullYear(hoje.getFullYear() - 1);
  const inicioTs = inicioApuracao.getTime();

  // Saídas = clientes excluídos (arquivados) + cancelados
  const saidas = [
    ...excluidos.map((c: any) => ({ quando: c.deleted_at })),
    ...clientes.filter((c: any) => c.status === "cancelado").map((c: any) => ({ quando: c.updated_at })),
  ]
    .filter((s) => !!s.quando)
    .filter((s) => new Date(s.quando).getTime() >= inicioTs);

  const todasEntradas = [...clientes, ...excluidos]
    .map((c: any) => c.created_at)
    .filter(Boolean)
    .map((d: string) => new Date(d).getTime())
    .sort((a, b) => a - b);

  // Base já existente antes de 1 de agosto (não conta como entrada nova)
  const baseInicial = todasEntradas.filter((t) => t < inicioTs).length;
  const entradas = todasEntradas.filter((t) => t >= inicioTs);

  const inicio = inicioTs;
  const diasHistorico = Math.max(1, Math.round((agora - inicio) / DIA));
  const mesesHistorico = Math.max(1, diasHistorico / 30);

  const novos30 = entradas.filter((t) => agora - t <= 30 * DIA).length;
  const saidas30 = saidas.filter((s) => agora - new Date(s.quando).getTime() <= 30 * DIA).length;

  const totalEntradas = entradas.length;
  const totalSaidas = saidas.length;
  const crescimentoMensal = (totalEntradas - totalSaidas) / mesesHistorico;
  const taxaMensalPct = base > 0 ? (crescimentoMensal / base) * 100 : 0;

  // A projeção deve acompanhar somente os clientes que estão ativos hoje.
  const entradasAtivas = clientes.filter((c: any) => {
    const criadoEm = c.created_at ? new Date(c.created_at).getTime() : 0;
    const diasRestantes = diasParaVencer(c.data_vencimento);
    return criadoEm >= inicioTs && diasRestantes !== null && diasRestantes >= 0 && c.status === "ativo";
  }).length;
  const liquidoAtivoDia = (entradasAtivas - totalSaidas) / diasHistorico;
  const projecao = (dias: number) => Math.max(0, Math.round(ativos + liquidoAtivoDia * dias));
  const horizontes = [30, 60, 90, 180, 365];

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-lg font-semibold">Base de clientes — indicadores e projeções</h3>
        <div className="flex items-center gap-2">
          <AnaliseBaseDialog />
          <span className="text-xs text-muted-foreground">
            Apuração de {diasHistorico} dia(s) desde {new Date(inicio).toLocaleDateString("pt-BR")} · base inicial {baseInicial}
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Item label="Clientes ativos" value={ativos} tone="text-emerald-400" Icon={Users} sub={`${base} na base total`} />
        <Item label="Clientes vencidos" value={vencidos} tone="text-red-400" Icon={AlertTriangle} />
        <Item label="Novos (30 dias)" value={novos30} tone="text-blue-400" Icon={UserPlus} sub={`${totalEntradas} desde 01/08`} />
        <Item label="Saíram (30 dias)" value={saidas30} tone="text-orange-400" Icon={UserMinus} sub={`${totalSaidas} desde 01/08`} />
        <Item
          label="Crescimento médio"
          value={`${crescimentoMensal >= 0 ? "+" : ""}${crescimentoMensal.toFixed(1)}/mês`}
          tone={crescimentoMensal >= 0 ? "text-emerald-400" : "text-red-400"}
          Icon={TrendingUp}
          sub={`${taxaMensalPct >= 0 ? "+" : ""}${taxaMensalPct.toFixed(1)}% ao mês`}
        />
      </div>

      <div className="mt-4">
        <div className="flex items-center gap-1 text-sm font-semibold text-purple-400 mb-2">
          <LineChart className="h-4 w-4" /> Projeção mantendo o ritmo atual
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
           {horizontes.map((d) => {
             const v = projecao(d);
             const delta = v - ativos;
             return (
               <div key={d} className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-3">
                 <div className="text-xs uppercase tracking-wide text-muted-foreground">Em {d} dias</div>
                 <div className="mt-1 text-2xl font-bold tabular-nums text-purple-300">{v}</div>
                 <div className={cn("text-xs", delta >= 0 ? "text-emerald-400" : "text-red-400")}>
                   {delta >= 0 ? "+" : ""}{delta} ativo(s)
                 </div>
               </div>
             );
           })}
         </div>
         <p className="mt-2 text-xs text-muted-foreground">
           Projeção partindo dos {ativos} clientes ativos atuais. Considera somente a evolução de ativos desde 01/08:
           {" "}{entradasAtivas} entrada(s) que permanecem ativas e {totalSaidas} saída(s) em {diasHistorico} dia(s), resultando em{" "}
           {liquidoAtivoDia >= 0 ? "+" : ""}{liquidoAtivoDia.toFixed(2)} ativo(s) por dia.
         </p>
      </div>
    </Card>
  );
}
