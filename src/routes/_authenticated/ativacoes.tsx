import { ServidorSelectItems } from "@/lib/servidores-ui";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchServidores, fetchAtivacoesApps, fetchRevendedores, fetchClientes } from "@/lib/queries";
import { fetchAplicativosCatalogo, AplicativoCatalogo } from "@/lib/aplicativos";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COMPACT_TABLE_CLASS } from "@/components/density-toggle";
import { StatCard } from "@/components/stat-card";
import { CatalogoAplicativosTab } from "@/components/catalogo-aplicativos-tab";
import { AplicativosSitesTab } from "@/components/aplicativos-sites-tab";
import {
  Smartphone,
  Plus,
  Trash2,
  Wallet,
  TrendingUp,
  CheckCircle2,
  Pencil,
  Eye,
  Search,
  Tv,
  Globe,
  AlertCircle,
  Undo2,
  Users,
  User,
  DollarSign,
  Handshake,
} from "lucide-react";
import { toast } from "sonner";
import { currencyBRL, maskMAC } from "@/lib/iptv";
import { cn } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import { confirmDialog } from "@/lib/confirm";
import { ComprovanteAtivacaoModal } from "@/components/comprovante-ativacao-modal";
import { findAtivaAppServer, add365Days } from "@/lib/comprovante-ativacao-generator";
import { registrarMovimentacaoCredito } from "@/lib/creditos";
import { marcarAtivacaoComoPaga } from "@/lib/pagamento";

export const Route = createFileRoute("/_authenticated/ativacoes")({
  component: AtivacoesPage,
  head: () => ({
    meta: [
      { title: "Ativação de Aplicativos | Rodolfo TV" },
      { name: "description", content: "Cadastre e controle ativações de aplicativos com servidor, MAC, device, validade, catálogo de preços e impacto financeiro do dia." },
      { property: "og:title", content: "Ativação de Aplicativos | Rodolfo TV" },
      { property: "og:description", content: "Ativações de aplicativos com catálogo de preços, comprovante pronto para envio e integração ao faturamento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const PLATAFORMA = "Rodolfo TV";

function fullDateTime(iso: string | Date | null | undefined) {
  if (!iso) return "-";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}

export function comprovanteAtivacao(a: any, servidorNome?: string) {
  void servidorNome;
  const blocos: string[] = [];

  blocos.push(`✅ *Ativado por ${PLATAFORMA}*`);
  blocos.push(`👤 *Cliente:* ${a.cliente_nome || "-"}`);

  const appLinhas = [
    `📺 *Aplicativo:* ${a.aplicativo || "-"} — *ATIVADO*`,
    ...(a.mac ? [`🔗 *MAC:* ${a.mac}`] : []),
    ...(a.device ? [`📱 *Device:* ${a.device}`] : []),
  ];
  blocos.push(appLinhas.join("\n"));

  blocos.push([
    `🗓️ *Ativado em:* ${fullDateTime(a.ativado_em)}`,
    `⏳ *Vence em:* ${fullDateTime(a.expira_em)}`,
  ].join("\n"));

  if (a.observacao) blocos.push(`📝 *Obs.:* ${a.observacao}`);

  return blocos.join("\n\n");
}

function AtivacoesPage() {
  const qc = useQueryClient();
  const { data: servidores = [] } = useQuery({ queryKey: ["servidores"], queryFn: fetchServidores });
  const { data: ativacoes = [] } = useQuery({ queryKey: ["ativacoes_apps"], queryFn: () => fetchAtivacoesApps() });
  const { data: revendedores = [] } = useQuery({ queryKey: ["revendedores"], queryFn: fetchRevendedores });
  const { data: clientes = [] } = useQuery({ queryKey: ["clientes"], queryFn: fetchClientes });

  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [busca, setBusca] = useState("");
  const [detalhe, setDetalhe] = useState<any | null>(null);
  const [processandoId, setProcessandoId] = useState<string | null>(null);

  const [tabAtiva, setTabAtiva] = useState<string>("ativacoes");

  const isDevendo = (a: any) =>
    a.status_pagamento === "devendo" || (a.observacao && a.observacao.includes("[DEVENDO]"));

  const hoje = new Date();
  const mesmoDia = (iso: string) => {
    const d = new Date(iso);
    return d.getFullYear() === hoje.getFullYear() && d.getMonth() === hoje.getMonth() && d.getDate() === hoje.getDate();
  };
  const doDia = (ativacoes as any[]).filter((a) => mesmoDia(a.ativado_em));
  // Vendas pendentes (devendo) não somam faturamento no dia até serem quitadas
  const fatHoje = doDia.reduce((s, a) => s + (isDevendo(a) ? 0 : Number(a.valor || 0)), 0);
  const despHoje = doDia.reduce((s, a) => s + Number(a.custo || 0), 0);

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    let res = ativacoes as any[];
    if (t) {
      res = res.filter((a) =>
        [a.cliente_nome, a.mac, a.device, a.aplicativo, a.servidor?.nome].some((v: any) => String(v ?? "").toLowerCase().includes(t)),
      );
    }
    return [...res].sort((a, b) => {
      const ta = new Date(a.ativado_em || a.created_at || 0).getTime();
      const tb = new Date(b.ativado_em || b.created_at || 0).getTime();
      return tb - ta;
    });
  }, [ativacoes, busca]);

  const handleMarcarPago = async (a: any) => {
    setProcessandoId(a.id);
    try {
      await marcarAtivacaoComoPaga(a, qc);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao marcar ativação como paga");
    } finally {
      setProcessandoId(null);
    }
  };

  const reverterAtivacao = async (a: any) => {
    const ident = a.cliente_nome ? `do cliente "${a.cliente_nome}"` : `(${a.mac || a.device || "aplicativo"})`;
    const ok = await confirmDialog({
      title: "Reverter ativação de aplicativo?",
      description: `Tem certeza que deseja reverter a ativação de ${a.aplicativo || "aplicativo"} ${ident}?\n\n• As saídas de créditos associadas serão canceladas e estornadas no servidor ${a.servidor?.nome ? `"${a.servidor.nome}"` : ""}.\n• Os valores de faturamento (${currencyBRL(Number(a.valor || 0))}) e custo (${currencyBRL(Number(a.custo || 0))}) serão retirados do faturamento do dia e das somas financeiras do sistema.\n• O registro desta ativação será excluído.`,
      confirmText: "Reverter Ativação",
      cancelText: "Cancelar",
      destructive: true,
    });
    if (!ok) return;

    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Não autenticado");

      let creditosEstornados = 0;

      // 1. Reverter saída de créditos no servidor
      if (a.servidor_id) {
        const termoBusca = a.mac || a.device || a.aplicativo || "";
        const { data: movs } = await supabase
          .from("creditos_movimentacoes")
          .select("id, quantidade, motivo, created_at")
          .eq("servidor_id", a.servidor_id)
          .eq("tipo", "ativacao")
          .order("created_at", { ascending: false })
          .limit(20);

        const movMatch = (movs ?? []).find((m: any) => {
          const isNegative = Number(m.quantidade) < 0;
          const hasTerm = termoBusca ? String(m.motivo || "").includes(termoBusca) : true;
          return isNegative && hasTerm;
        });

        if (movMatch) {
          creditosEstornados = Math.abs(Number(movMatch.quantidade));
          await supabase.from("creditos_movimentacoes").delete().eq("id", movMatch.id);
        } else {
          const fracaoEstimada = a.servidor?.custo_mensal && a.custo ? Number((a.custo / a.servidor.custo_mensal).toFixed(2)) : 1;
          if (fracaoEstimada > 0) {
            creditosEstornados = fracaoEstimada;
            await registrarMovimentacaoCredito({
              servidor_id: a.servidor_id,
              quantidade: fracaoEstimada,
              tipo: "ajuste_add",
              motivo: `Reversão/estorno de ativação: ${a.aplicativo || "App"} (${a.mac || a.device || ""})`,
            });
          }
        }
      }

      // 2. Se for revenda, remove ou cancela a movimentação em revendedores_movimentacoes
      if (a.tipo_ativacao === "revenda" || (a.cliente_nome && a.cliente_nome.startsWith("Rev:"))) {
        const { data: revMovs } = await supabase
          .from("revendedores_movimentacoes")
          .select("id, motivo")
          .order("created_at", { ascending: false })
          .limit(20);
        const matchMov = (revMovs ?? []).find((m: any) =>
          String(m.motivo || "").includes(a.mac || a.aplicativo || "")
        );
        if (matchMov) {
          await supabase.from("revendedores_movimentacoes").delete().eq("id", matchMov.id);
        }
      }

      // 3. Retirar registros financeiros em historico_financeiro
      const termoFinanceiro = a.mac || a.device || a.aplicativo || "";
      const { data: histRecords } = await supabase
        .from("historico_financeiro")
        .select("id, descricao, valor, custo, created_at")
        .in("tipo", ["ativacao_app", "revendedor_devendo", "cliente_devendo"])
        .order("created_at", { ascending: false })
        .limit(30);

      const targetHist = (histRecords ?? []).find((h: any) => {
        const descMatch = termoFinanceiro ? String(h.descricao || "").includes(termoFinanceiro) : false;
        const valMatch = Math.abs(Number(h.valor) - Number(a.valor)) < 0.01 && Math.abs(Number(h.custo) - Number(a.custo)) < 0.01;
        return descMatch || valMatch;
      });

      if (targetHist) {
        await supabase.from("historico_financeiro").delete().eq("id", targetHist.id);
      }

      // 4. Excluir a ativação de ativacoes_apps
      const { error: eDel } = await supabase.from("ativacoes_apps").delete().eq("id", a.id);
      if (eDel) throw eDel;

      // 5. Log de auditoria da reversão
      await logAudit({
        categoria: "aplicativo",
        acao: "excluir",
        descricao: `Reversão/Cancelamento de ativação de aplicativo ${a.aplicativo ?? ""} para ${a.cliente_nome || a.device || a.mac || "sem device"} no servidor ${a.servidor?.nome ?? "-"}`,
        entidade: "ativacoes_apps",
        entidade_id: a.id,
        metadata: { valor: a.valor, custo: a.custo, creditos_estornados: creditosEstornados, servidor_id: a.servidor_id },
      });

      toast.success("Ativação revertida com sucesso! Créditos e lançamentos financeiros foram estornados.");
      qc.invalidateQueries({ queryKey: ["ativacoes_apps"] });
      qc.invalidateQueries({ queryKey: ["faturamento_bruto_dia"] });
      qc.invalidateQueries({ queryKey: ["financeiro_lancamentos"] });
      qc.invalidateQueries({ queryKey: ["creditos_movs"] });
      qc.invalidateQueries({ queryKey: ["creditos_saldos"] });
      qc.invalidateQueries({ queryKey: ["historico_financeiro"] });
      qc.invalidateQueries({ queryKey: ["servidores"] });
      qc.invalidateQueries({ queryKey: ["clientes-devedores-count"] });
      qc.invalidateQueries({ queryKey: ["ativacoes-devedores"] });
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao reverter ativação");
    }
  };

  const excluir = async (a: any) => {
    const ok = await confirmDialog({
      title: "Excluir ativação?",
      description: `Tem certeza que deseja excluir a ativação de "${a.cliente_nome || a.device || a.mac || "este item"}"?`,
      confirmText: "Excluir",
      destructive: true,
    });
    if (!ok) return;

    const { error } = await supabase.from("ativacoes_apps").delete().eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success("Ativação excluída");
    await logAudit({ categoria: "aplicativo", acao: "excluir", descricao: `Ativação de aplicativo removida (${a.device ?? a.mac ?? "sem device"})`, entidade: "ativacoes_apps", entidade_id: a.id });
    qc.invalidateQueries({ queryKey: ["ativacoes_apps"] });
    qc.invalidateQueries({ queryKey: ["faturamento_bruto_dia"] });
    qc.invalidateQueries({ queryKey: ["financeiro_lancamentos"] });
    qc.invalidateQueries({ queryKey: ["creditos_movs"] });
    qc.invalidateQueries({ queryKey: ["creditos_saldos"] });
    qc.invalidateQueries({ queryKey: ["clientes-devedores-count"] });
    qc.invalidateQueries({ queryKey: ["ativacoes-devedores"] });
    qc.invalidateQueries();
  };

  return (
    <div className="p-3 sm:p-6 space-y-4">
      <Tabs value={tabAtiva} onValueChange={setTabAtiva} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <Smartphone className="h-5 w-5 sm:h-6 sm:w-6 text-primary" /> Ativação de Aplicativos
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Ativações realizadas pela plataforma {PLATAFORMA}, com catálogo de preços, clientes e revendedores.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <TabsList className="w-full sm:w-auto overflow-x-auto justify-start flex-nowrap h-auto p-1">
              <TabsTrigger value="ativacoes" className="gap-1.5 text-xs sm:text-sm whitespace-nowrap">
                <Smartphone className="h-4 w-4 shrink-0" /> Ativações Realizadas
              </TabsTrigger>
              <TabsTrigger value="catalogo" className="gap-1.5 text-xs sm:text-sm whitespace-nowrap">
                <Tv className="h-4 w-4 shrink-0" /> Catálogo & Preços
              </TabsTrigger>
              <TabsTrigger value="apps_sites" className="gap-1.5 text-xs sm:text-sm whitespace-nowrap">
                <Globe className="h-4 w-4 shrink-0" /> Aplicativos & Sites
              </TabsTrigger>
            </TabsList>
            <Button onClick={() => setOpen(true)} className="gap-2 w-full sm:w-auto mt-2 sm:mt-0">
              <Plus className="h-4 w-4" /> Nova ativação
            </Button>
          </div>
        </div>

        <TabsContent value="ativacoes" className="space-y-4 mt-0">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Ativações hoje" value={String(doDia.length)} icon={CheckCircle2} />
            <StatCard label="Faturamento hoje" value={currencyBRL(fatHoje)} icon={TrendingUp} />
            <StatCard label="Despesa hoje" value={currencyBRL(despHoje)} icon={Wallet} />
          </div>

          <Card className="p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar por cliente, MAC, device ou servidor..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Badge variant="secondary" className="text-xs font-normal">
                {lista.length} {lista.length === 1 ? "ativação" : "ativações"}
              </Badge>
            </div>

            <div className="rounded-md border overflow-x-auto max-h-[560px] overflow-y-auto">
              <Table className={COMPACT_TABLE_CLASS}>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>Destinatário / Cliente</TableHead>
                    <TableHead>Servidor</TableHead>
                    <TableHead>Aplicativo</TableHead>
                    <TableHead>MAC</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead className="text-center">Pagamento</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead className="text-right">Lucro</TableHead>
                    <TableHead>Ativado em</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead className="text-right pr-4">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                        Nenhuma ativação registrada.
                      </TableCell>
                    </TableRow>
                  )}
                  {lista.map((a: any) => {
                    const vencida = new Date(a.expira_em).getTime() < Date.now();
                    const devendo = isDevendo(a);
                    const isRev = a.tipo_ativacao === "revenda" || String(a.cliente_nome || "").startsWith("Rev:");
                    const vValor = Number(a.valor_devendo || a.valor || 0);
                    const vCusto = Number(a.custo || 0);
                    const lucro = devendo ? -vCusto : (vValor - vCusto);
                    const isSalvando = processandoId === a.id;

                    return (
                      <TableRow key={a.id} className="hover:bg-muted/40 transition-colors">
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{a.cliente_nome || "—"}</span>
                            {isRev && (
                              <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-[9px] py-0 font-semibold">
                                REVENDA
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{a.servidor?.nome ?? "—"}</TableCell>
                        <TableCell className="font-semibold">{a.aplicativo || "—"}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{a.mac || "—"}</TableCell>
                        <TableCell>{a.device || "—"}</TableCell>
                        <TableCell className="text-center whitespace-nowrap">
                          {devendo ? (
                            <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/40 text-[10px] font-bold py-0.5 animate-pulse">
                              DEVENDO
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/40 text-[10px] font-bold py-0.5">
                              PAGO
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className={cn("text-right tabular-nums font-semibold", devendo ? "text-amber-400" : "text-emerald-400")}>
                          {currencyBRL(vValor)}
                          {devendo && <span className="block text-[10px] font-normal text-muted-foreground">(pendente)</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {currencyBRL(vCusto)}
                        </TableCell>
                        <TableCell className={cn("text-right tabular-nums font-semibold", lucro >= 0 ? "text-primary" : "text-red-400")}>
                          {currencyBRL(lucro)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {fullDateTime(a.ativado_em)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant={vencida ? "destructive" : "secondary"}>{fullDateTime(a.expira_em)}</Badge>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap pr-2">
                          <div className="flex items-center justify-end gap-1">
                            {devendo && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isSalvando}
                                onClick={() => handleMarcarPago(a)}
                                title="Dar baixa e marcar como PAGO (entra no faturamento hoje)"
                                className="h-8 px-2 text-xs font-semibold text-emerald-400 border-emerald-500/40 hover:text-emerald-300 hover:bg-emerald-500/15 gap-1"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                {isSalvando ? "Salvando..." : "Receber"}
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => setDetalhe(a)} title="Ver comprovante (PDF / PNG)" className="h-8 px-2 text-xs font-medium text-primary hover:bg-primary/10">
                              <Eye className="h-3.5 w-3.5 mr-1" /> Comprovante
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => reverterAtivacao(a)} title="Reverter ativação (estorna créditos e lançamentos)" className="h-8 px-2 text-xs font-medium text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 gap-1">
                              <Undo2 className="h-3.5 w-3.5" /> Reverter
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditItem(a)} title="Editar">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => excluir(a)} title="Excluir">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="catalogo" className="space-y-4 mt-0">
          <CatalogoAplicativosTab />
        </TabsContent>

        <TabsContent value="apps_sites" className="space-y-4 mt-0">
          <AplicativosSitesTab />
        </TabsContent>
      </Tabs>

      <AtivacaoDialog
        open={open || !!editItem}
        onOpenChange={(v) => {
          if (!v) {
            setOpen(false);
            setEditItem(null);
          } else setOpen(true);
        }}
        servidores={servidores as any[]}
        revendedores={revendedores as any[]}
        clientes={clientes as any[]}
        editingItem={editItem}
        onCreated={(a) => {
          setDetalhe(a);
          qc.invalidateQueries({ queryKey: ["ativacoes_apps"] });
          qc.invalidateQueries({ queryKey: ["faturamento_bruto_dia"] });
          qc.invalidateQueries({ queryKey: ["financeiro_lancamentos"] });
          qc.invalidateQueries({ queryKey: ["creditos_movs"] });
          qc.invalidateQueries({ queryKey: ["creditos_saldos"] });
          qc.invalidateQueries({ queryKey: ["historico_financeiro"] });
          qc.invalidateQueries({ queryKey: ["servidores"] });
          qc.invalidateQueries({ queryKey: ["clientes-devedores-count"] });
          qc.invalidateQueries({ queryKey: ["clientes-devedores"] });
          qc.invalidateQueries({ queryKey: ["ativacoes-devedores"] });
          qc.invalidateQueries({ queryKey: ["revendedores"] });
          qc.invalidateQueries();
        }}
      />

      <ComprovanteAtivacaoModal
        open={!!detalhe}
        onOpenChange={(v) => !v && setDetalhe(null)}
        data={detalhe}
      />
    </div>
  );
}

function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function AtivacaoDialog({
  open,
  onOpenChange,
  servidores,
  revendedores = [],
  clientes = [],
  onCreated,
  editingItem,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  servidores: any[];
  revendedores?: any[];
  clientes?: any[];
  onCreated: (a: any) => void;
  editingItem?: any;
}) {
  const { data: catalogoApps = [] } = useQuery<AplicativoCatalogo[]>({
    queryKey: ["aplicativos_catalogo"],
    queryFn: fetchAplicativosCatalogo,
  });

  const [tipoAtivacao, setTipoAtivacao] = useState<"cliente" | "revenda">("cliente");
  const [revendedorId, setRevendedorId] = useState<string>("");
  const [clienteFinal, setClienteFinal] = useState<string>("");

  const [servidorId, setServidorId] = useState<string>("");
  const [clienteNome, setClienteNome] = useState("");
  const [mac, setMac] = useState("");
  const [device, setDevice] = useState("");
  const [aplicativo, setAplicativo] = useState("");
  const [valorPago, setValorPago] = useState("");
  const [fracao, setFracao] = useState("1");
  const [ativadoEmStr, setAtivadoEmStr] = useState("");
  const [expiraEmStr, setExpiraEmStr] = useState("");
  const [statusPagamento, setStatusPagamento] = useState<"pago" | "devendo">("pago");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});

  const limparErro = (campo: string) => {
    if (erros[campo]) {
      setErros((prev) => {
        const next = { ...prev };
        delete next[campo];
        return next;
      });
    }
  };

  useEffect(() => {
    setErros({});
    if (editingItem) {
      const isRev = editingItem.tipo_ativacao === "revenda" || String(editingItem.cliente_nome || "").startsWith("Rev:");
      setTipoAtivacao(isRev ? "revenda" : "cliente");
      setRevendedorId(editingItem.revendedor_id || "");
      if (isRev) {
        const match = String(editingItem.cliente_nome || "").match(/\(([^)]+)\)$/);
        setClienteFinal(match ? match[1] : "");
        setClienteNome(editingItem.cliente_nome || "");
      } else {
        setClienteNome(editingItem.cliente_nome || "");
        setClienteFinal("");
      }
      setServidorId(editingItem.servidor_id || "");
      setMac(editingItem.mac || "");
      setDevice(editingItem.device || "");
      setAplicativo(editingItem.aplicativo || "");
      setValorPago(String(editingItem.valor_devendo || editingItem.valor ?? "25"));
      const isDev = editingItem.status_pagamento === "devendo" || (editingItem.observacao && editingItem.observacao.includes("[DEVENDO]"));
      setStatusPagamento(isDev ? "devendo" : "pago");
      const fr = editingItem.servidor?.custo_mensal ? (editingItem.custo / editingItem.servidor.custo_mensal).toFixed(2) : "1";
      setFracao(fr);
      setAtivadoEmStr(toLocalInput(new Date(editingItem.ativado_em)));
      setExpiraEmStr(toLocalInput(new Date(editingItem.expira_em)));
      setObs((editingItem.observacao || "").replace(/\s*\[DEVENDO\]\s*/g, "").replace(/^Revendedor:\s*[^|]+\|?\s*/i, ""));
    } else if (open) {
      setTipoAtivacao("cliente");
      setRevendedorId(revendedores[0]?.id || "");
      setClienteFinal("");
      const ativaServer = servidores.find((s) => s?.nome?.trim().toUpperCase() === "ATIVA APP") || findAtivaAppServer(servidores);
      setServidorId(ativaServer?.id || (servidores[0]?.id ?? ""));
      setClienteNome("");
      setMac("");
      setDevice("");
      setAplicativo("");
      setValorPago("25");
      setFracao("1");
      setStatusPagamento("pago");
      const agora = new Date();
      setAtivadoEmStr(toLocalInput(agora));
      setExpiraEmStr(toLocalInput(add365Days(agora)));
      setObs("");
    }
  }, [editingItem, open, servidores, revendedores]);

  const appMatched = useMemo(() => {
    const norm = aplicativo.trim().toUpperCase();
    if (!norm) return null;
    return catalogoApps.find((a) => a.nome.trim().toUpperCase() === norm) || null;
  }, [aplicativo, catalogoApps]);

  const servidor = servidores.find((s) => s.id === servidorId);
  const revEscolhido = revendedores.find((r) => r.id === revendedorId);
  const custoMensal = Number(servidor?.custo_mensal || 0);
  const fracaoNum = Number(String(fracao).replace(",", ".")) || 0;

  const custoUnitario = appMatched && appMatched.custo !== undefined ? Number(appMatched.custo) : custoMensal;
  const custoProporcional = custoUnitario * fracaoNum;
  const lucroEstimado = (Number(valorPago) || 0) - custoProporcional;
  const isPago = statusPagamento === "pago";

  const reset = () => {
    setErros({});
    setTipoAtivacao("cliente");
    setRevendedorId(revendedores[0]?.id || "");
    setClienteFinal("");
    const ativaServer = servidores.find((s) => s?.nome?.trim().toUpperCase() === "ATIVA APP") || findAtivaAppServer(servidores);
    setServidorId(ativaServer?.id || (servidores[0]?.id ?? ""));
    setClienteNome("");
    setMac("");
    setDevice("");
    setAplicativo("");
    setValorPago("25");
    setFracao("1");
    setStatusPagamento("pago");
    const agora = new Date();
    setAtivadoEmStr(toLocalInput(agora));
    setExpiraEmStr(toLocalInput(add365Days(agora)));
    setObs("");
  };

  const selecionarAppCatalogo = (app: any) => {
    if (!app) return;
    setAplicativo(app.nome);
    setValorPago(String(app.valor_venda));
    limparErro("aplicativo");
    limparErro("valorPago");
    if (app.fracao_creditos !== undefined && app.fracao_creditos !== null) {
      setFracao(String(app.fracao_creditos));
      limparErro("fracao");
    }
  };

  const handleRevendedorSelect = (id: string) => {
    setRevendedorId(id);
    limparErro("revendedor");
    const rev = revendedores.find((r) => r.id === id);
    if (rev?.servidor_id) {
      setServidorId(rev.servidor_id);
      limparErro("servidor");
    }
  };

  const salvar = async () => {
    const novosErros: Record<string, string> = {};
    const pendentes: string[] = [];

    if (!servidorId) {
      novosErros.servidor = "Selecione o servidor";
      pendentes.push("Servidor");
    }

    if (tipoAtivacao === "cliente") {
      if (!clienteNome.trim()) {
        novosErros.cliente = "Informe o nome do cliente";
        pendentes.push("Cliente");
      }
    } else {
      if (!revendedorId) {
        novosErros.revendedor = "Selecione o revendedor";
        pendentes.push("Revendedor");
      }
    }

    if (!aplicativo.trim()) {
      novosErros.aplicativo = "Informe o nome do aplicativo";
      pendentes.push("Aplicativo");
    }
    if (!mac.trim()) {
      novosErros.mac = "Informe o endereço MAC";
      pendentes.push("MAC");
    }
    if (!ativadoEmStr.trim()) {
      novosErros.ativadoEm = "Informe a data de ativação";
      pendentes.push("Data de ativação");
    }
    if (!expiraEmStr.trim()) {
      novosErros.expiraEm = "Informe a data de vencimento";
      pendentes.push("Vencimento");
    } else {
      const ativadoEm = new Date(ativadoEmStr);
      const expira = new Date(expiraEmStr);
      if (isNaN(expira.getTime())) {
        novosErros.expiraEm = "Data de vencimento inválida";
        pendentes.push("Vencimento (data inválida)");
      } else if (!isNaN(ativadoEm.getTime()) && expira <= ativadoEm) {
        novosErros.expiraEm = "O vencimento deve ser após a ativação";
        pendentes.push("Vencimento (deve ser posterior à ativação)");
      }
    }
    if (!String(fracao).trim() || !(fracaoNum > 0)) {
      novosErros.fracao = "Informe a fração de créditos (maior que zero)";
      pendentes.push("Crédito (fração)");
    }
    if (!String(valorPago).trim() || isNaN(Number(valorPago)) || Number(valorPago) < 0) {
      novosErros.valorPago = "Informe o valor cobrado";
      pendentes.push("Valor cobrado");
    }

    if (pendentes.length > 0) {
      setErros(novosErros);
      toast.error(`Preencha todos os campos obrigatórios: ${pendentes.join(", ")}.`);
      return;
    }

    setErros({});
    const ativadoEm = new Date(ativadoEmStr);
    const expira = new Date(expiraEmStr);
    const dias = Math.max(1, Math.round((expira.getTime() - ativadoEm.getTime()) / 86400000));
    const appNomeLimpo = aplicativo.trim().toUpperCase();
    const macLimpo = maskMAC(mac.trim());
    const deviceLimpo = device.trim();
    const nValor = Number(valorPago) || 0;
    const nCusto = Number(custoProporcional.toFixed(2));
    const qtdInt = Math.max(1, Math.round(fracaoNum));

    const nomeIdentificacao = tipoAtivacao === "revenda"
      ? `Rev: ${revEscolhido?.nome || "Revendedor"}${clienteFinal.trim() ? ` (${clienteFinal.trim()})` : ""}`
      : clienteNome.trim();

    setSaving(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Não autenticado");

      // 1. Desconto de créditos no servidor
      if (!editingItem) {
        await registrarMovimentacaoCredito({
          servidor_id: servidorId,
          quantidade: -qtdInt,
          tipo: "ativacao",
          motivo: tipoAtivacao === "revenda"
            ? `Ativação app ${appNomeLimpo} (${macLimpo}) p/ revendedor ${revEscolhido?.nome || ""} [${fracaoNum} créd]${isPago ? "" : " (DEVENDO)"}`
            : `Ativação de app ${appNomeLimpo} (${macLimpo}) [${fracaoNum} créd]${isPago ? "" : " (DEVENDO)"}`,
        });
      }

      // 2. Se for revenda, registra movimentação em revendedores_movimentacoes
      if (!editingItem && tipoAtivacao === "revenda" && revEscolhido) {
        const motivoMov = `Ativação App: ${appNomeLimpo}${macLimpo ? ` (${macLimpo})` : ""}${clienteFinal.trim() ? ` [${clienteFinal.trim()}]` : ""} [${fracaoNum} créd] — ${dias} dias${isPago ? "" : " (DEVENDO)"}`;
        await supabase
          .from("revendedores_movimentacoes")
          .insert({
            user_id: user.id,
            revendedor_id: revEscolhido.id,
            servidor_id: servidorId || null,
            tipo: "venda",
            quantidade: qtdInt,
            valor_pago: nValor,
            custo: nCusto,
            lucro: isPago ? (nValor - nCusto) : -nCusto,
            motivo: motivoMov,
            status_pagamento: statusPagamento,
            status_venda: "concluida",
          } as any);

        if (!isPago) {
          await supabase.from("revendedores").update({ status_pagamento: "devendo" } as any).eq("id", revEscolhido.id);
        }
      }

      // 3. Se for cliente e marcado como DEVENDO, atualiza o cadastro do cliente correspondente se existir
      if (!editingItem && tipoAtivacao === "cliente" && !isPago) {
        const clienteMatch = clientes.find((c) => c.nome?.trim().toLowerCase() === clienteNome.trim().toLowerCase());
        if (clienteMatch) {
          await supabase.from("clientes").update({ status_pagamento: "devendo" }).eq("id", clienteMatch.id);
        }
      }

      // 4. Salva o registro em ativacoes_apps
      const payload: any = {
        user_id: user.id,
        servidor_id: servidorId,
        cliente_nome: nomeIdentificacao,
        mac: macLimpo,
        device: deviceLimpo || null,
        aplicativo: appNomeLimpo,
        valor: isPago ? nValor : 0,
        custo: nCusto,
        dias_validade: dias,
        ativado_em: ativadoEm.toISOString(),
        expira_em: expira.toISOString(),
        observacao: tipoAtivacao === "revenda"
          ? `Revendedor: ${revEscolhido?.nome || ""}${obs.trim() ? ` | ${obs.trim()}` : ""}${isPago ? "" : " [DEVENDO]"}`
          : `${obs.trim()}${isPago ? "" : " [DEVENDO]"}`,
        status_pagamento: statusPagamento,
        tipo_ativacao: tipoAtivacao,
        revendedor_id: tipoAtivacao === "revenda" ? revendedorId : null,
        valor_devendo: nValor,
      };

      let finalData: any = null;
      try {
        const { data, error } = editingItem
          ? await supabase.from("ativacoes_apps").update(payload).eq("id", editingItem.id).select("*, servidor:servidores(id, nome, categoria, custo_mensal)").single()
          : await supabase.from("ativacoes_apps").insert(payload).select("*, servidor:servidores(id, nome, categoria, custo_mensal)").single();

        if (error) throw error;
        finalData = data;
      } catch (errCol) {
        // Fallback resiliente caso alguma coluna nova não esteja no cache do postgREST
        const basePayload = {
          user_id: user.id,
          servidor_id: servidorId,
          cliente_nome: nomeIdentificacao,
          mac: macLimpo,
          device: deviceLimpo || null,
          aplicativo: appNomeLimpo,
          valor: isPago ? nValor : 0,
          custo: nCusto,
          dias_validade: dias,
          ativado_em: ativadoEm.toISOString(),
          expira_em: expira.toISOString(),
          observacao: payload.observacao,
        };
        const { data, error } = editingItem
          ? await supabase.from("ativacoes_apps").update(basePayload).eq("id", editingItem.id).select("*, servidor:servidores(id, nome, categoria, custo_mensal)").single()
          : await supabase.from("ativacoes_apps").insert(basePayload).select("*, servidor:servidores(id, nome, categoria, custo_mensal)").single();

        if (error) throw error;
        finalData = data;
      }

      // 5. Histórico financeiro
      if (!editingItem) {
        await supabase.from("historico_financeiro").insert({
          user_id: user.id,
          tipo: isPago ? "ativacao_app" : (tipoAtivacao === "revenda" ? "revendedor_devendo" : "cliente_devendo"),
          valor: isPago ? nValor : 0,
          custo: nCusto,
          lucro: isPago ? (nValor - nCusto) : -nCusto,
          descricao: isPago
            ? `Ativação de aplicativo ${appNomeLimpo} (${deviceLimpo || macLimpo}) — ${servidor?.nome ?? ""}`
            : `Ativação de aplicativo ${appNomeLimpo} (${deviceLimpo || macLimpo}) — ${servidor?.nome ?? ""} (DEVENDO — custo debitado)`,
        });
      }

      // 6. Auditoria
      await logAudit({
        categoria: "aplicativo",
        acao: editingItem ? "editar" : "criar",
        descricao: `${editingItem ? "Edição" : "Criação"} de ativação de app ${appNomeLimpo} para ${nomeIdentificacao} (${isPago ? "PAGO" : "DEVENDO"})`,
        entidade: "ativacoes_apps",
        entidade_id: (finalData as any)?.id,
        metadata: { valor: nValor, custo: nCusto, pago: isPago, tipo: tipoAtivacao },
      });

      toast.success(editingItem ? "Ativação atualizada!" : (isPago ? "Ativação registrada como PAGO!" : "Ativação registrada como DEVENDO (listada em Devedores)!"));
      reset();
      onOpenChange(false);
      onCreated(finalData);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao processar ativação");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            {editingItem ? "Editar ativação de aplicativo" : "Nova ativação de aplicativo"}
          </DialogTitle>
        </DialogHeader>

        {/* Seletor Tipo: Cliente vs Revenda */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-muted/60 rounded-xl border border-border/70 mt-1">
          <button
            type="button"
            onClick={() => {
              setTipoAtivacao("cliente");
              limparErro("revendedor");
            }}
            className={cn(
              "flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer",
              tipoAtivacao === "cliente"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <User className="h-3.5 w-3.5" />
            Ativação para Cliente
          </button>
          <button
            type="button"
            onClick={() => {
              setTipoAtivacao("revenda");
              limparErro("cliente");
            }}
            className={cn(
              "flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer",
              tipoAtivacao === "revenda"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Users className="h-3.5 w-3.5" />
            Ativação para Revenda (Revendedor)
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 pt-2">
          {Object.keys(erros).length > 0 && (
            <div className="sm:col-span-3 p-3 rounded-lg bg-destructive/10 border border-destructive/25 text-destructive text-xs flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-semibold">Preencha todos os campos obrigatórios:</p>
                <p className="text-destructive/90">{Object.values(erros).join(" • ")}</p>
              </div>
            </div>
          )}

          {/* Campo específico de Revenda ou Cliente */}
          {tipoAtivacao === "revenda" ? (
            <>
              <div className="space-y-1 sm:col-span-2">
                <div className="h-5 flex items-center justify-between">
                  <Label className="text-xs font-semibold flex items-center gap-1">
                    <Handshake className="h-3.5 w-3.5 text-purple-400" />
                    Revendedor <span className="text-destructive font-bold">*</span>
                  </Label>
                  <span className="text-[10px] text-muted-foreground">{revendedores.length} revendedores</span>
                </div>
                <Select
                  value={revendedorId}
                  onValueChange={handleRevendedorSelect}
                >
                  <SelectTrigger className={cn("h-9", erros.revendedor && "border-destructive")}>
                    <SelectValue placeholder="Selecione o revendedor" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {revendedores.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="font-semibold">{r.nome}</span>
                          <span className="text-muted-foreground">
                            {r.creditos ?? 0} créd {r.servidor?.nome ? `• ${r.servidor.nome}` : ""}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {erros.revendedor && <p className="text-[11px] text-destructive font-medium">{erros.revendedor}</p>}
              </div>

              <div className="space-y-1 sm:col-span-1">
                <div className="h-5 flex items-center">
                  <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    Cliente Final <span className="text-[10px] font-normal">(opcional)</span>
                  </Label>
                </div>
                <Input
                  value={clienteFinal}
                  onChange={(e) => setClienteFinal(e.target.value)}
                  placeholder="Nome do cliente final"
                  className="h-9 text-xs"
                />
              </div>
            </>
          ) : (
            <div className="space-y-1 sm:col-span-3">
              <div className="h-5 flex items-center justify-between">
                <Label className="text-xs font-semibold flex items-center gap-1">
                  <User className="h-3.5 w-3.5 text-blue-400" />
                  Nome do Cliente <span className="text-destructive font-bold">*</span>
                </Label>
                {clientes.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">Digite ou selecione um cliente cadastrado</span>
                )}
              </div>
              <Input
                list="clientes-sugestoes-ativacao"
                value={clienteNome}
                onChange={(e) => {
                  setClienteNome(e.target.value);
                  limparErro("cliente");
                }}
                placeholder="Ex: João da Silva"
                className={cn("h-9", erros.cliente && "border-destructive")}
              />
              <datalist id="clientes-sugestoes-ativacao">
                {clientes.slice(0, 50).map((c) => (
                  <option key={c.id} value={c.nome}>
                    {c.servidor?.nome ? `(${c.servidor.nome})` : ""}
                  </option>
                ))}
              </datalist>
              {erros.cliente && <p className="text-[11px] text-destructive font-medium">{erros.cliente}</p>}
            </div>
          )}

          {/* Servidor */}
          <div className="space-y-1 sm:col-span-3">
            <Label className="text-xs font-semibold flex items-center gap-1">
              Servidor para débito de créditos <span className="text-destructive font-bold">*</span>
            </Label>
            <Select
              value={servidorId}
              onValueChange={(val) => {
                setServidorId(val);
                limparErro("servidor");
              }}
            >
              <SelectTrigger className={cn("h-9", erros.servidor && "border-destructive")}>
                <SelectValue placeholder="Selecione o servidor" />
              </SelectTrigger>
              <SelectContent>
                <ServidorSelectItems servidores={servidores as any[]} />
              </SelectContent>
            </Select>
            {erros.servidor && <p className="text-[11px] text-destructive font-medium">{erros.servidor}</p>}
          </div>

          {/* Pílulas de atalho para Apps do Catálogo */}
          {catalogoApps.length > 0 && (
            <div className="sm:col-span-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium flex items-center gap-1">
                  <Tv className="h-3.5 w-3.5 text-primary" /> Aplicativos Populares
                </span>
                <span className="text-[10px]">{catalogoApps.length} apps no catálogo</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {catalogoApps.slice(0, 8).map((app) => (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => selecionarAppCatalogo(app)}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-md border transition-all cursor-pointer font-semibold",
                      aplicativo.toUpperCase() === app.nome.toUpperCase()
                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                        : "bg-muted/50 hover:bg-muted text-foreground border-border/70"
                    )}
                  >
                    {app.nome} · {currencyBRL(app.valor_venda)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Aplicativo */}
          <div className="space-y-1 sm:col-span-1">
            <div className="h-5 flex items-center justify-between">
              <Label className="text-xs font-semibold flex items-center gap-1">
                Aplicativo <span className="text-destructive font-bold">*</span>
              </Label>
            </div>
            <Input
              value={aplicativo}
              onChange={(e) => {
                const val = e.target.value.toUpperCase();
                setAplicativo(val);
                limparErro("aplicativo");
                const found = catalogoApps.find((a) => a.nome.toUpperCase() === val.trim());
                if (found) {
                  setValorPago(String(found.valor_venda));
                  limparErro("valorPago");
                  if (found.fracao_creditos !== undefined && found.fracao_creditos !== null) {
                    setFracao(String(found.fracao_creditos));
                    limparErro("fracao");
                  }
                }
              }}
              placeholder="Ex: IBO PRO"
              className={cn("h-9 uppercase font-semibold", erros.aplicativo && "border-destructive")}
            />
            {erros.aplicativo && <p className="text-[11px] text-destructive font-medium">{erros.aplicativo}</p>}
          </div>

          {/* Endereço MAC */}
          <div className="space-y-1 sm:col-span-1">
            <div className="h-5 flex items-center">
              <Label className="text-xs font-semibold flex items-center gap-1">
                Endereço MAC <span className="text-destructive font-bold">*</span>
              </Label>
            </div>
            <Input
              value={mac}
              onChange={(e) => {
                setMac(maskMAC(e.target.value));
                limparErro("mac");
              }}
              placeholder="00:00:00:00:00:00"
              className={cn("h-9 font-mono", erros.mac && "border-destructive")}
            />
            {erros.mac && <p className="text-[11px] text-destructive font-medium">{erros.mac}</p>}
          </div>

          {/* Device Key / Chave */}
          <div className="space-y-1 sm:col-span-1">
            <div className="h-5 flex items-center">
              <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                Device Key / Chave <span className="text-[10px] font-normal">(opcional)</span>
              </Label>
            </div>
            <Input
              value={device}
              onChange={(e) => setDevice(e.target.value)}
              placeholder="Device Key ou login"
              className="h-9"
            />
          </div>

          {/* Datas */}
          <div className="space-y-1 sm:col-span-1">
            <div className="h-5 flex items-center">
              <Label className="text-xs font-medium whitespace-nowrap flex items-center gap-1">
                Data de ativação <span className="text-destructive font-bold">*</span>
              </Label>
            </div>
            <Input
              type="datetime-local"
              value={ativadoEmStr}
              onChange={(e) => {
                const val = e.target.value;
                setAtivadoEmStr(val);
                limparErro("ativadoEm");
                if (val) {
                  const d = new Date(val);
                  if (!isNaN(d.getTime())) {
                    setExpiraEmStr(toLocalInput(add365Days(d)));
                    limparErro("expiraEm");
                  }
                }
              }}
              className={cn("h-9 text-xs", erros.ativadoEm && "border-destructive")}
            />
            {erros.ativadoEm && <p className="text-[11px] text-destructive font-medium">{erros.ativadoEm}</p>}
          </div>

          <div className="space-y-1 sm:col-span-1">
            <div className="h-5 flex items-center">
              <Label className="text-xs font-medium whitespace-nowrap flex items-center gap-1">
                Vencimento (1 ano) <span className="text-destructive font-bold">*</span>
              </Label>
            </div>
            <Input
              type="datetime-local"
              value={expiraEmStr}
              onChange={(e) => {
                setExpiraEmStr(e.target.value);
                limparErro("expiraEm");
              }}
              className={cn("h-9 text-xs", erros.expiraEm && "border-destructive")}
            />
            {erros.expiraEm && <p className="text-[11px] text-destructive font-medium">{erros.expiraEm}</p>}
          </div>

          <div className="space-y-1 sm:col-span-1">
            <div className="h-5 flex items-center">
              <Label className="text-xs font-medium whitespace-nowrap flex items-center gap-1">
                Créditos a descontar <span className="text-destructive font-bold">*</span>
              </Label>
            </div>
            <Input
              type="number"
              step="0.1"
              min="0"
              value={fracao}
              onChange={(e) => {
                setFracao(e.target.value);
                limparErro("fracao");
              }}
              placeholder="1"
              className={cn("h-9", erros.fracao && "border-destructive")}
            />
            {erros.fracao && <p className="text-[11px] text-destructive font-medium">{erros.fracao}</p>}
          </div>

          {/* Valores Financeiros */}
          <div className="space-y-1 sm:col-span-1">
            <div className="h-5 flex items-center">
              <Label className="text-xs font-medium whitespace-nowrap flex items-center gap-1">
                Valor cobrado (Venda) <span className="text-destructive font-bold">*</span>
              </Label>
            </div>
            <Input
              type="number"
              step="0.01"
              value={valorPago}
              onChange={(e) => {
                setValorPago(e.target.value);
                limparErro("valorPago");
              }}
              placeholder="25,00"
              className={cn("h-9 font-semibold", erros.valorPago && "border-destructive")}
            />
            {erros.valorPago && <p className="text-[11px] text-destructive font-medium">{erros.valorPago}</p>}
          </div>

          <div className="space-y-1 sm:col-span-1">
            <div className="h-5 flex items-center">
              <Label className="text-xs font-medium whitespace-nowrap text-muted-foreground">Custo (Créditos)</Label>
            </div>
            <Input
              value={currencyBRL(custoProporcional)}
              readOnly
              className="h-9 bg-muted/50 font-medium text-muted-foreground"
            />
          </div>

          <div className="space-y-1 sm:col-span-1">
            <div className="h-5 flex items-center">
              <Label className="text-xs font-medium whitespace-nowrap text-muted-foreground">Lucro Previsto</Label>
            </div>
            <Input
              value={currencyBRL(lucroEstimado)}
              readOnly
              className="h-9 bg-muted/50 font-bold text-emerald-400"
            />
          </div>

          {/* CONDIÇÃO DE PAGAMENTO: PAGO VS DEVENDO */}
          <div className="space-y-1.5 sm:col-span-3 pt-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Condição de Pagamento
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Opção 1: Pago */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setStatusPagamento("pago")}
                className={cn(
                  "p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between gap-1.5",
                  statusPagamento === "pago"
                    ? "border-emerald-500/70 bg-emerald-950/30 ring-1 ring-emerald-500/50 shadow-sm"
                    : "border-border/60 bg-card hover:bg-muted/40 opacity-70"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-400">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>Pago (Recebido agora)</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                    Entra no Faturamento
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Soma {currencyBRL(Number(valorPago) || 0)} no faturamento e lucro do dia de hoje.
                </p>
              </div>

              {/* Opção 2: Devendo */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setStatusPagamento("devendo")}
                className={cn(
                  "p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between gap-1.5",
                  statusPagamento === "devendo"
                    ? "border-rose-500/70 bg-rose-950/30 ring-1 ring-rose-500/50 shadow-sm"
                    : "border-border/60 bg-card hover:bg-muted/40 opacity-70"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-rose-400">
                    <DollarSign className="h-4 w-4 text-rose-400 shrink-0" />
                    <span>Devendo (Fiado / Pendente)</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-medium">
                    Não soma venda
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Desconta crédito e custo. <strong>NÃO soma a venda agora</strong>; entrará no faturamento após dar baixa em "Devedores".
                </p>
              </div>
            </div>
          </div>

          {/* Observação */}
          <div className="sm:col-span-3 space-y-1">
            <div className="h-5 flex items-center">
              <Label className="text-xs font-medium text-muted-foreground">Observação (opcional)</Label>
            </div>
            <Textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              rows={2}
              placeholder="Anotações internas sobre esta ativação..."
              className="resize-none"
            />
          </div>

          <div className="sm:col-span-3 text-xs bg-muted/40 p-3 rounded-lg border border-border/50 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">
                Débito no Servidor:{" "}
                <strong className="text-primary font-mono">
                  -{fracaoNum} créd ({servidor?.nome || "ATIVA APP"})
                </strong>
              </span>
            </div>
            <div className="text-right">
              <span className="text-muted-foreground mr-1">Lucro Estimado:</span>
              <span className="font-semibold text-emerald-400 text-sm">{currencyBRL(lucroEstimado)}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-row items-center justify-end gap-2 pt-3 border-t border-border/50">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-9 px-4 text-xs font-medium">
            Cancelar
          </Button>
          <Button
            onClick={salvar}
            disabled={saving}
            className={cn(
              "h-9 px-5 text-xs font-semibold gap-1.5 text-white",
              isPago
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "bg-rose-600 hover:bg-rose-700"
            )}
          >
            {isPago ? <Smartphone className="h-3.5 w-3.5" /> : <DollarSign className="h-3.5 w-3.5" />}
            {saving
              ? "Salvando..."
              : editingItem
              ? "Salvar Alterações"
              : isPago
              ? "Confirmar e Ativar (Pago)"
              : "Confirmar e Ativar (Devendo / Fiado)"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
