import { ServidorSelectItems } from "@/lib/servidores-ui";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchServidores, fetchAtivacoesApps } from "@/lib/queries";
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
} from "lucide-react";
import { toast } from "sonner";
import { currencyBRL, maskMAC } from "@/lib/iptv";
import { logAudit } from "@/lib/audit";
import { confirmDialog } from "@/lib/confirm";
import { ComprovanteAtivacaoModal } from "@/components/comprovante-ativacao-modal";
import { findAtivaAppServer, add365Days } from "@/lib/comprovante-ativacao-generator";
import { registrarMovimentacaoCredito } from "@/lib/creditos";

export const Route = createFileRoute("/_authenticated/ativacoes")({
  component: AtivacoesPage,
  head: () => ({
    meta: [
      { title: "Ativação de Aplicativos | ORBIT" },
      { name: "description", content: "Cadastre e controle ativações de aplicativos com servidor, MAC, device, validade, catálogo de preços e impacto financeiro do dia." },
      { property: "og:title", content: "Ativação de Aplicativos | ORBIT" },
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
  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [busca, setBusca] = useState("");
  const [detalhe, setDetalhe] = useState<any | null>(null);

  const [tabAtiva, setTabAtiva] = useState<string>("ativacoes");

  const hoje = new Date();
  const mesmoDia = (iso: string) => {
    const d = new Date(iso);
    return d.getFullYear() === hoje.getFullYear() && d.getMonth() === hoje.getMonth() && d.getDate() === hoje.getDate();
  };
  const doDia = (ativacoes as any[]).filter((a) => mesmoDia(a.ativado_em));
  const fatHoje = doDia.reduce((s, a) => s + Number(a.valor || 0), 0);
  const despHoje = doDia.reduce((s, a) => s + Number(a.custo || 0), 0);

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return ativacoes as any[];
    return (ativacoes as any[]).filter((a) =>
      [a.cliente_nome, a.mac, a.device, a.aplicativo, a.servidor?.nome].some((v: any) => String(v ?? "").toLowerCase().includes(t)),
    );
  }, [ativacoes, busca]);

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
    await logAudit({ categoria: "outro", acao: "excluir", descricao: `Ativação de aplicativo removida (${a.device ?? a.mac ?? "sem device"})`, entidade: "ativacoes_apps", entidade_id: a.id });
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
              Ativações realizadas pela plataforma {PLATAFORMA}, com tabela de preços e catálogo de aplicativos.
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
                    <TableHead>Cliente</TableHead>
                    <TableHead>Servidor</TableHead>
                    <TableHead>Aplicativo</TableHead>
                    <TableHead>MAC</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead className="text-right">Valor pago</TableHead>
                    <TableHead className="text-right">Valor do crédito</TableHead>
                    <TableHead>Ativado em</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead className="text-right pr-4">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                        Nenhuma ativação registrada.
                      </TableCell>
                    </TableRow>
                  )}
                  {lista.map((a: any) => {
                    const vencida = new Date(a.expira_em).getTime() < Date.now();
                    return (
                      <TableRow key={a.id} className="hover:bg-muted/40 transition-colors">
                        <TableCell className="font-medium">{a.cliente_nome || "—"}</TableCell>
                        <TableCell>{a.servidor?.nome ?? "—"}</TableCell>
                        <TableCell>{a.aplicativo || "—"}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{a.mac || "—"}</TableCell>
                        <TableCell>{a.device || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold text-emerald-400">
                          {currencyBRL(Number(a.valor || 0))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {currencyBRL(Number(a.custo || 0))}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {fullDateTime(a.ativado_em)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant={vencida ? "destructive" : "secondary"}>{fullDateTime(a.expira_em)}</Badge>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap pr-2">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setDetalhe(a)} title="Ver comprovante (PDF / PNG)" className="h-8 px-2 text-xs font-medium text-primary hover:bg-primary/10">
                              <Eye className="h-3.5 w-3.5 mr-1" /> Comprovante
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
        editingItem={editItem}
        onCreated={(a) => {
          setDetalhe(a);
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
  onCreated,
  editingItem,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  servidores: any[];
  onCreated: (a: any) => void;
  editingItem?: any;
}) {
  const { data: catalogoApps = [] } = useQuery<AplicativoCatalogo[]>({
    queryKey: ["aplicativos_catalogo"],
    queryFn: fetchAplicativosCatalogo,
  });

  const [servidorId, setServidorId] = useState<string>("");
  const [clienteNome, setClienteNome] = useState("");
  const [mac, setMac] = useState("");
  const [device, setDevice] = useState("");
  const [aplicativo, setAplicativo] = useState("");
  const [valorPago, setValorPago] = useState("");
  const [fracao, setFracao] = useState("1");
  const [ativadoEmStr, setAtivadoEmStr] = useState("");
  const [expiraEmStr, setExpiraEmStr] = useState("");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingItem) {
      setServidorId(editingItem.servidor_id || "");
      setClienteNome(editingItem.cliente_nome || "");
      setMac(editingItem.mac || "");
      setDevice(editingItem.device || "");
      setAplicativo(editingItem.aplicativo || "");
      setValorPago(String(editingItem.valor ?? "25"));
      const fr = editingItem.servidor?.custo_mensal ? (editingItem.custo / editingItem.servidor.custo_mensal).toFixed(2) : "1";
      setFracao(fr);
      setAtivadoEmStr(toLocalInput(new Date(editingItem.ativado_em)));
      setExpiraEmStr(toLocalInput(new Date(editingItem.expira_em)));
      setObs(editingItem.observacao || "");
    } else if (open) {
      const ativaServer = servidores.find((s) => s?.nome?.trim().toUpperCase() === "ATIVA APP") || findAtivaAppServer(servidores);
      setServidorId(ativaServer?.id || (servidores[0]?.id ?? ""));
      setClienteNome("");
      setMac("");
      setDevice("");
      setAplicativo("");
      setValorPago("25");
      setFracao("1");
      const agora = new Date();
      setAtivadoEmStr(toLocalInput(agora));
      setExpiraEmStr(toLocalInput(add365Days(agora)));
      setObs("");
    }
  }, [editingItem, open, servidores]);

  const appMatched = useMemo(() => {
    const norm = aplicativo.trim().toUpperCase();
    if (!norm) return null;
    return catalogoApps.find((a) => a.nome.trim().toUpperCase() === norm) || null;
  }, [aplicativo, catalogoApps]);

  const servidor = servidores.find((s) => s.id === servidorId);
  const custoMensal = Number(servidor?.custo_mensal || 0);
  const fracaoNum = Number(String(fracao).replace(",", ".")) || 0;

  // Custo base vem do catálogo do app se existente; senão, do servidor
  const custoUnitario = appMatched && appMatched.custo !== undefined ? Number(appMatched.custo) : custoMensal;
  const custoProporcional = custoUnitario * fracaoNum;
  const lucroEstimado = (Number(valorPago) || 0) - custoProporcional;

  const reset = () => {
    const ativaServer = servidores.find((s) => s?.nome?.trim().toUpperCase() === "ATIVA APP") || findAtivaAppServer(servidores);
    setServidorId(ativaServer?.id || (servidores[0]?.id ?? ""));
    setClienteNome("");
    setMac("");
    setDevice("");
    setAplicativo("");
    setValorPago("25");
    setFracao("1");
    const agora = new Date();
    setAtivadoEmStr(toLocalInput(agora));
    setExpiraEmStr(toLocalInput(add365Days(agora)));
    setObs("");
  };

  const selecionarAppCatalogo = (app: any) => {
    if (!app) return;
    setAplicativo(app.nome);
    setValorPago(String(app.valor_venda));
    if (app.fracao_creditos !== undefined && app.fracao_creditos !== null) {
      setFracao(String(app.fracao_creditos));
    }
  };

  const salvar = async () => {
    if (!servidorId) return toast.error("Selecione o servidor");
    if (!device.trim() && !mac.trim()) return toast.error("Informe o MAC ou o Device");
    const ativadoEm = new Date(ativadoEmStr);
    const expira = new Date(expiraEmStr);
    if (isNaN(expira.getTime())) return toast.error("Informe uma data de vencimento válida");
    if (expira <= ativadoEm) return toast.error("O vencimento deve ser após a ativação");
    if (!(fracaoNum > 0)) return toast.error("Informe a fração de crédito utilizada");
    setSaving(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Não autenticado");
      const dias = Math.max(1, Math.round((expira.getTime() - ativadoEm.getTime()) / 86400000));
      const payload = {
        user_id: user.id,
        servidor_id: servidorId,
        cliente_nome: clienteNome.trim() || null,
        mac: mac.trim() || null,
        device: device.trim() || null,
        aplicativo: aplicativo.trim() || null,
        valor: Number(valorPago) || 0,
        custo: Number(custoProporcional.toFixed(2)),
        dias_validade: dias,
        ativado_em: ativadoEm.toISOString(),
        expira_em: expira.toISOString(),
        observacao: obs.trim() || null,
      };
      const { data, error } = editingItem
        ? await supabase.from("ativacoes_apps").update(payload).eq("id", editingItem.id).select("*, servidor:servidores(id, nome, categoria, custo_mensal)").single()
        : await supabase.from("ativacoes_apps").insert(payload).select("*, servidor:servidores(id, nome, categoria, custo_mensal)").single();

      if (error) throw error;

      if (!editingItem) {
        await supabase.from("historico_financeiro").insert({
          user_id: user.id,
          tipo: "ativacao_app",
          valor: payload.valor,
          custo: payload.custo,
          lucro: payload.valor - payload.custo,
          descricao: `Ativação de aplicativo ${payload.aplicativo ?? ""} (${payload.device ?? payload.mac}) — ${servidor?.nome ?? ""}`,
        });

        // Registra desconto proporcional/fracionado de créditos no servidor
        await registrarMovimentacaoCredito({
          servidor_id: servidorId,
          quantidade: -fracaoNum,
          tipo: "ativacao",
          motivo: `Ativação de app ${payload.aplicativo ?? ""} (${payload.device ?? payload.mac})`,
        });
      }

      toast.success(editingItem ? "Ativação atualizada" : "Ativação registrada");
      await logAudit({
        categoria: "outro",
        acao: editingItem ? "editar" : "criar",
        descricao: `${editingItem ? "Edição" : "Criação"} de ativação de aplicativo ${payload.aplicativo ?? ""} para ${payload.device ?? payload.mac} no servidor ${servidor?.nome ?? "-"}`,
        entidade: "ativacoes_apps",
        entidade_id: (data as any)?.id,
        metadata: { valor: payload.valor, custo: payload.custo },
      });
      reset();
      onOpenChange(false);
      onCreated(data);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao processar ativação");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            {editingItem ? "Editar ativação" : "Nova ativação de aplicativo"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3 pt-2">
          <div className="space-y-1.5 sm:col-span-3">
            <Label className="text-xs font-semibold">Servidor *</Label>
            <Select value={servidorId} onValueChange={setServidorId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Selecione o servidor" />
              </SelectTrigger>
              <SelectContent>
                <ServidorSelectItems servidores={servidores as any[]} />
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <div className="h-5 flex items-center">
              <Label className="text-xs font-medium">Cliente</Label>
            </div>
            <Input
              value={clienteNome}
              onChange={(e) => setClienteNome(e.target.value)}
              placeholder="Nome do cliente"
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <div className="h-5 flex items-center justify-between">
              <Label className="text-xs font-medium">Aplicativo</Label>
              {catalogoApps.length > 0 && (
                <Select
                  value=""
                  onValueChange={(val) => {
                    const found = catalogoApps.find((a) => a.nome === val);
                    if (found) selecionarAppCatalogo(found);
                  }}
                >
                  <SelectTrigger className="h-5 text-[11px] px-1.5 py-0 border-dashed text-primary font-medium w-auto gap-0.5">
                    <SelectValue placeholder="Catálogo" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {catalogoApps.map((a) => (
                      <SelectItem key={a.id} value={a.nome}>
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="font-semibold">{a.nome}</span>
                          <span className="text-muted-foreground">
                            Venda: {currencyBRL(a.valor_venda)} • Custo: {currencyBRL(a.custo)}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <Input
              list="catalogo-apps-datalist-modal"
              value={aplicativo}
              onChange={(e) => {
                const val = e.target.value.toUpperCase();
                setAplicativo(val);
                const found = catalogoApps.find((a) => a.nome.toUpperCase() === val.trim());
                if (found) {
                  setValorPago(String(found.valor_venda));
                  if (found.fracao_creditos !== undefined && found.fracao_creditos !== null) {
                    setFracao(String(found.fracao_creditos));
                  }
                }
              }}
              placeholder="Ex.: IBO PLAYER"
              className="h-9 uppercase"
            />
            <datalist id="catalogo-apps-datalist-modal">
              {catalogoApps.map((a) => (
                <option key={a.id} value={a.nome}>
                  Venda: {currencyBRL(a.valor_venda)} (Custo: {currencyBRL(a.custo)})
                </option>
              ))}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <div className="h-5 flex items-center">
              <Label className="text-xs font-medium">MAC</Label>
            </div>
            <Input
              value={mac}
              onChange={(e) => setMac(maskMAC(e.target.value))}
              placeholder="00:1A:2B:3C:4D:5E"
              className="h-9 font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <div className="h-5 flex items-center">
              <Label className="text-xs font-medium">Device</Label>
            </div>
            <Input
              value={device}
              onChange={(e) => setDevice(e.target.value)}
              placeholder="123456"
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <div className="h-5 flex items-center">
              <Label className="text-xs font-medium whitespace-nowrap">Data de ativação</Label>
            </div>
            <Input
              type="datetime-local"
              value={ativadoEmStr}
              onChange={(e) => {
                const val = e.target.value;
                setAtivadoEmStr(val);
                if (val) {
                  const d = new Date(val);
                  if (!isNaN(d.getTime())) {
                    setExpiraEmStr(toLocalInput(add365Days(d)));
                  }
                }
              }}
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <div className="h-5 flex items-center">
              <Label className="text-xs font-medium whitespace-nowrap">Vencimento (1 ano)</Label>
            </div>
            <Input
              type="datetime-local"
              value={expiraEmStr}
              onChange={(e) => setExpiraEmStr(e.target.value)}
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <div className="h-5 flex items-center">
              <Label className="text-xs font-medium whitespace-nowrap">Crédito (fração)</Label>
            </div>
            <Input
              type="number"
              step="0.1"
              min="0"
              value={fracao}
              onChange={(e) => setFracao(e.target.value)}
              placeholder="1"
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <div className="h-5 flex items-center">
              <Label className="text-xs font-medium whitespace-nowrap">Valor cobrado (R$)</Label>
            </div>
            <Input
              type="number"
              step="0.01"
              value={valorPago}
              onChange={(e) => setValorPago(e.target.value)}
              placeholder="0,00"
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <div className="h-5 flex items-center">
              <Label className="text-xs font-medium whitespace-nowrap">Custo (R$)</Label>
            </div>
            <Input
              value={currencyBRL(custoProporcional)}
              readOnly
              className="h-9 bg-muted/50 font-medium text-muted-foreground"
            />
          </div>

          <div className="sm:col-span-3 space-y-1.5">
            <div className="h-5 flex items-center">
              <Label className="text-xs font-medium">Observação</Label>
            </div>
            <Textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              rows={2}
              placeholder="Observações adicionais..."
              className="resize-none"
            />
          </div>

          <div className="sm:col-span-3 text-xs bg-muted/40 p-3 rounded-lg border border-border/50 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {appMatched ? (
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
                  <span>Catálogo: Custo <strong>{currencyBRL(appMatched.custo)}</strong> • Venda sugerida <strong>{currencyBRL(appMatched.valor_venda)}</strong></span>
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Servidor: <strong>{servidor?.nome || "ATIVA APP"}</strong>
                </span>
              )}
            </div>
            <div className="text-right">
              <span className="text-muted-foreground mr-1">Lucro estimado:</span>
              <span className="font-semibold text-emerald-400 text-sm">{currencyBRL(lucroEstimado)}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-row items-center justify-end gap-2 pt-3 border-t border-border/50">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-9 px-4 text-xs font-medium">
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={saving} className="h-9 px-5 text-xs font-medium gap-1.5">
            <Smartphone className="h-3.5 w-3.5" />
            {saving ? "Salvando..." : (editingItem ? "Salvar Alterações" : "Ativar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}