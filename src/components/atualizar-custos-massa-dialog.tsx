import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sparkles,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Server,
  Coins,
  Search,
  Check,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { currencyBRL, formatDateBR } from "@/lib/iptv";
import { confirmDialog } from "@/lib/confirm";
import {
  analisarBaseClientes,
  atualizarCustosClientesEmMassa,
  ItemAnaliseCustoCliente,
} from "@/lib/recalcular-custos";

interface AtualizarCustosMassaDialogProps {
  clientes: any[];
  servidores: any[];
  historico?: any[];
}

export function AtualizarCustosMassaDialog({
  clientes,
  servidores,
  historico,
}: AtualizarCustosMassaDialogProps) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "discrepantes" | "em_dia">("todos");
  const [servidorFiltro, setServidorFiltro] = useState<string>("todos");
  const [executing, setExecuting] = useState(false);
  const [progress, setProgress] = useState<{ total: number; done: number; pct: number } | null>(null);

  const analise = useMemo(
    () => analisarBaseClientes(clientes, servidores, historico),
    [clientes, servidores, historico],
  );

  const itensFiltrados = useMemo(() => {
    return analise.itens.filter((item) => {
      if (filtroStatus === "discrepantes" && !item.discrepante) return false;
      if (filtroStatus === "em_dia" && item.discrepante) return false;
      if (servidorFiltro !== "todos" && item.servidorId !== servidorFiltro) return false;

      if (search.trim()) {
        const term = search.toLowerCase();
        const matchNome = item.nome.toLowerCase().includes(term);
        const matchServ = item.servidorNome.toLowerCase().includes(term);
        const matchTel = item.telefone ? item.telefone.includes(term) : false;
        if (!matchNome && !matchServ && !matchTel) return false;
      }
      return true;
    });
  }, [analise.itens, filtroStatus, servidorFiltro, search]);

  async function handleExecutarAtualizacao(apenasDiscrepantes: boolean) {
    const qtdAlvos = apenasDiscrepantes ? analise.custosDiscrepantes : analise.totalClientes;
    if (qtdAlvos === 0) {
      toast.info("Nenhum cliente precisa de atualização.");
      return;
    }

    const ok = await confirmDialog({
      title: apenasDiscrepantes
        ? `Atualizar ${qtdAlvos} cliente(s) com custo desatualizado?`
        : `Sincronizar todos os ${qtdAlvos} clientes da base?`,
      description:
        "Essa operação atualizará o custo base (custo_snapshot) dos clientes de acordo com os servidores e regras de proporcionalidade de créditos cadastradas. Nenhuma outra informação do cliente será modificada.",
      confirmText: "Sim, sincronizar custos",
      destructive: false,
    });

    if (!ok) return;

    setExecuting(true);
    setProgress({ total: qtdAlvos, done: 0, pct: 0 });

    try {
      const resultado = await atualizarCustosClientesEmMassa({
        itens: analise.itens,
        apenasDiscrepantes,
        onProgress: (p) => setProgress(p),
      });

      if (resultado.falhas > 0) {
        toast.warning(
          `Sincronização concluída: ${resultado.atualizados} atualizado(s), ${resultado.falhas} falha(s).`,
        );
      } else {
        toast.success(
          `Sucesso! ${resultado.atualizados} cliente(s) sincronizado(s) com as regras de proporcionalidade e servidores.`,
        );
      }

      await qc.invalidateQueries({ queryKey: ["clientes"] });
      await qc.invalidateQueries({ queryKey: ["historico"] });
      await qc.invalidateQueries({ queryKey: ["faturamento_bruto_dia"] });
      await qc.invalidateQueries({ queryKey: ["saldos_creditos"] });
    } catch (err: any) {
      toast.error(`Erro na sincronização: ${err.message || "Erro desconhecido"}`);
    } finally {
      setExecuting(false);
      setProgress(null);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="border-amber-500/30 hover:border-amber-500/60 text-amber-300 hover:text-amber-200 bg-amber-500/10"
        title="Sincronizar e calcular em massa os custos de crédito proporcionais de todos os clientes"
      >
        <Sparkles className="h-4 w-4 mr-1.5 text-amber-400" />
        Sincronizar Custos
        {analise.custosDiscrepantes > 0 && (
          <Badge className="ml-1.5 px-1.5 py-0 text-[10px] bg-amber-500 text-black font-semibold">
            {analise.custosDiscrepantes}
          </Badge>
        )}
      </Button>

      <Dialog open={open} onOpenChange={(v) => !executing && setOpen(v)}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-6 overflow-hidden">
          <DialogHeader className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">
                  Sincronização em Massa de Custos de Créditos
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Aplica a regra automática de proporcionalidade e atualiza os custos de crédito para todos os clientes cadastrados.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Cards de Métricas e Diagnóstico */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-2">
            <Card className="p-3 bg-muted/30 border-muted">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Total Clientes</span>
                <Server className="h-3.5 w-3.5 text-blue-400" />
              </div>
              <p className="text-xl font-bold mt-1 text-foreground">{analise.totalClientes}</p>
              <span className="text-[11px] text-muted-foreground">{analise.comServidor} com servidor</span>
            </Card>

            <Card className="p-3 bg-muted/30 border-muted">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Custos em Dia</span>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              </div>
              <p className="text-xl font-bold mt-1 text-emerald-400">{analise.custosEmDia}</p>
              <span className="text-[11px] text-muted-foreground">100% alinhados</span>
            </Card>

            <Card className="p-3 bg-amber-500/10 border-amber-500/30">
              <div className="flex items-center justify-between text-xs text-amber-400">
                <span>Discrepantes</span>
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
              </div>
              <p className="text-xl font-bold mt-1 text-amber-300">{analise.custosDiscrepantes}</p>
              <span className="text-[11px] text-amber-400/80">Necessitam sincronia</span>
            </Card>

            <Card className="p-3 bg-muted/30 border-muted">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Créditos Totais</span>
                <Coins className="h-3.5 w-3.5 text-purple-400" />
              </div>
              <p className="text-xl font-bold mt-1 text-purple-400">{analise.totalCreditosProporcionais}</p>
              <span className="text-[11px] text-muted-foreground">Consumo proporcional</span>
            </Card>
          </div>

          {/* Banner Explicativo da Regra de Pré-Proporcionalidade */}
          <div className="rounded-md border border-primary/20 bg-primary/5 p-2.5 text-xs text-muted-foreground space-y-1">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Zap className="h-3.5 w-3.5 text-primary" />
              <span>Regra de Pré-Proporcionalidade Automática:</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              <strong>1 mês (até 35d)</strong> = 1 crédito • <strong>2 meses (36-70d)</strong> = 2 créditos • <strong>3 meses (71-110d)</strong> = 3 créditos (Trimestral) • <strong>6 meses (111-210d)</strong> = 6 créditos (Semestral) • <strong>12 meses (211-400d)</strong> = 12 créditos (Anual). O custo proporcional final é o número de créditos multiplicado pelo custo mensal do servidor.
            </p>
          </div>

          {/* Barra de Progresso Durante Execução */}
          {executing && progress && (
            <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 space-y-2 animate-pulse">
              <div className="flex items-center justify-between text-xs font-semibold text-amber-300">
                <span className="flex items-center gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Sincronizando clientes no banco de dados...
                </span>
                <span>
                  {progress.done} de {progress.total} ({progress.pct}%)
                </span>
              </div>
              <Progress value={progress.pct} className="h-2" />
            </div>
          )}

          {/* Barra de Filtros e Busca */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Filtrar por nome, telefone ou servidor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant={filtroStatus === "todos" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setFiltroStatus("todos")}
              >
                Todos ({analise.totalClientes})
              </Button>
              <Button
                variant={filtroStatus === "discrepantes" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 text-xs text-amber-400 hover:text-amber-300"
                onClick={() => setFiltroStatus("discrepantes")}
              >
                Discrepantes ({analise.custosDiscrepantes})
              </Button>
              <Button
                variant={filtroStatus === "em_dia" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 text-xs text-emerald-400 hover:text-emerald-300"
                onClick={() => setFiltroStatus("em_dia")}
              >
                Em dia ({analise.custosEmDia})
              </Button>
            </div>
          </div>

          {/* Tabela de Pré-visualização */}
          <div className="flex-1 overflow-auto border rounded-md mt-2 min-h-[220px]">
            <Table>
              <TableHeader className="bg-muted/50 sticky top-0 z-10 text-[11px]">
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Servidor</TableHead>
                  <TableHead className="text-center">Período / Créditos</TableHead>
                  <TableHead className="text-right">Custo Base Servidor</TableHead>
                  <TableHead className="text-right">Custo Proporcional</TableHead>
                  <TableHead className="text-right">Snapshot Atual</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs">
                {itensFiltrados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-6 text-muted-foreground text-xs">
                      Nenhum cliente encontrado com os filtros selecionados.
                    </TableCell>
                  </TableRow>
                ) : (
                  itensFiltrados.slice(0, 100).map((item) => (
                    <TableRow key={item.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{item.nome}</TableCell>
                      <TableCell className="text-muted-foreground">{item.servidorNome}</TableCell>
                      <TableCell className="text-center">
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {item.diasPeriodo}d
                        </span>
                        <Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0 border-purple-500/30 text-purple-400">
                          {item.creditosProporcionais} {item.creditosProporcionais === 1 ? "créd." : "créds."}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {currencyBRL(item.custoMensalServidor)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-red-400">
                        {currencyBRL(item.custoProporcionalPeriodo)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {currencyBRL(item.custoSnapshotAtual)}
                      </TableCell>
                      <TableCell className="text-center">
                        {item.discrepante ? (
                          <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[10px]">
                            Discrepante
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px]">
                            Em dia
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {itensFiltrados.length > 100 && (
            <p className="text-[11px] text-muted-foreground text-center pt-1">
              Exibindo os primeiros 100 clientes de {itensFiltrados.length}. A sincronização processará todos os clientes selecionados.
            </p>
          )}

          <DialogFooter className="mt-4 gap-2 flex-wrap sm:justify-between items-center">
            <div className="text-xs text-muted-foreground">
              {analise.custosDiscrepantes > 0 ? (
                <span className="text-amber-400 font-medium flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 inline" /> {analise.custosDiscrepantes} registro(s) precisam de atualização
                </span>
              ) : (
                <span className="text-emerald-400 font-medium flex items-center gap-1">
                  <Check className="h-3.5 w-3.5 inline" /> Todos os custos dos clientes estão sincronizados
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={executing}
              >
                Fechar
              </Button>

              {analise.custosDiscrepantes > 0 && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleExecutarAtualizacao(true)}
                  disabled={executing}
                  className="border-amber-500/40 text-amber-300 hover:text-amber-200"
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1 text-amber-400" />
                  Atualizar Discrepantes ({analise.custosDiscrepantes})
                </Button>
              )}

              <Button
                size="sm"
                onClick={() => handleExecutarAtualizacao(false)}
                disabled={executing || analise.totalClientes === 0}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              >
                {executing ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Sincronizando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    Sincronizar Todos ({analise.totalClientes})
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
