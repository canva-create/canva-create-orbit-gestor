import { ServidorSelectItems } from "@/lib/servidores-ui";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchServidores, fetchAtivacoesApps } from "@/lib/queries";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COMPACT_TABLE_CLASS } from "@/components/density-toggle";
import { StatCard } from "@/components/stat-card";
import {
  Smartphone,
  Plus,
  ClipboardCopy,
  Trash2,
  Wallet,
  TrendingUp,
  CheckCircle2,
  Pencil,
  Eye,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { currencyBRL, maskMAC } from "@/lib/iptv";
import { logAudit } from "@/lib/audit";
import { confirmDialog } from "@/lib/confirm";

export const Route = createFileRoute("/_authenticated/ativacoes")({
  component: AtivacoesPage,
  head: () => ({
    meta: [
      { title: "Ativação de Aplicativos | ORBIT" },
      { name: "description", content: "Cadastre e controle ativações de aplicativos com servidor, MAC, device, validade e impacto financeiro do dia." },
      { property: "og:title", content: "Ativação de Aplicativos | ORBIT" },
      { property: "og:description", content: "Ativações de aplicativos com comprovante pronto para copiar e integração ao faturamento." },
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
  const { data: ativacoes = [] } = useQuery({ queryKey: ["ativacoes_apps"], queryFn: fetchAtivacoesApps });
  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [busca, setBusca] = useState("");
  const [detalhe, setDetalhe] = useState<any | null>(null);

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

  const copiar = async (a: any) => {
    await navigator.clipboard.writeText(comprovanteAtivacao(a));
    toast.success("Informações da ativação copiadas");
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
    await logAudit({ categoria: "outro", acao: "excluir", descricao: `Ativação de aplicativo removida (${a.device ?? a.mac ?? "sem device"})`, entidade: "ativacoes_apps", entidade_id: a.id });
    qc.invalidateQueries({ queryKey: ["ativacoes_apps"] });
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Smartphone className="h-6 w-6 text-primary" /> Ativação de Aplicativos
          </h1>
          <p className="text-sm text-muted-foreground">
            Ativações realizadas pela plataforma {PLATAFORMA}, contabilizadas no faturamento e na despesa do dia.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Nova ativação
        </Button>
      </div>

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
                        <Button size="sm" variant="ghost" onClick={() => setDetalhe(a)} title="Ver detalhes" className="h-8 px-2 text-xs">
                          <Eye className="h-3.5 w-3.5 mr-1" /> Ver
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditItem(a)} title="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => copiar(a)} title="Copiar informações">
                          <ClipboardCopy className="h-3.5 w-3.5" />
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
          qc.invalidateQueries({ queryKey: ["ativacoes_apps"] });
        }}
      />

      <Dialog open={!!detalhe} onOpenChange={(v) => !v && setDetalhe(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" /> Informações da ativação
            </DialogTitle>
          </DialogHeader>
          <pre className="whitespace-pre-wrap text-sm bg-muted/50 border rounded-md p-3.5 font-mono leading-relaxed select-all">
            {detalhe ? comprovanteAtivacao(detalhe) : ""}
          </pre>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDetalhe(null)}>Fechar</Button>
            <Button onClick={() => detalhe && copiar(detalhe)} className="gap-1.5">
              <ClipboardCopy className="h-4 w-4" /> Copiar informações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

  useMemo(() => {
    if (editingItem) {
      setServidorId(editingItem.servidor_id || "");
      setClienteNome(editingItem.cliente_nome || "");
      setMac(editingItem.mac || "");
      setDevice(editingItem.device || "");
      setAplicativo(editingItem.aplicativo || "");
      setValorPago(String(editingItem.valor || "0"));
      const fr = editingItem.servidor?.custo_mensal ? (editingItem.custo / editingItem.servidor.custo_mensal).toFixed(2) : "1";
      setFracao(fr);
      setAtivadoEmStr(toLocalInput(new Date(editingItem.ativado_em)));
      setExpiraEmStr(toLocalInput(new Date(editingItem.expira_em)));
      setObs(editingItem.observacao || "");
    } else {
      setServidorId("");
      setClienteNome("");
      setMac("");
      setDevice("");
      setAplicativo("");
      setValorPago("");
      setFracao("1");
      setAtivadoEmStr(toLocalInput(new Date()));
      setExpiraEmStr(toLocalInput(new Date(Date.now() + 30 * 86400000)));
      setObs("");
    }
  }, [editingItem, open]);

  const servidor = servidores.find((s) => s.id === servidorId);
  const custoMensal = Number(servidor?.custo_mensal || 0);
  const fracaoNum = Number(String(fracao).replace(",", ".")) || 0;
  const custoProporcional = custoMensal * fracaoNum;
  const lucroEstimado = (Number(valorPago) || 0) - custoProporcional;

  const reset = () => {
    setServidorId("");
    setClienteNome("");
    setMac("");
    setDevice("");
    setAplicativo("");
    setValorPago("");
    setFracao("1");
    setAtivadoEmStr(toLocalInput(new Date()));
    setExpiraEmStr(toLocalInput(new Date(Date.now() + 30 * 86400000)));
    setObs("");
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
            <Label>Servidor *</Label>
            <Select value={servidorId} onValueChange={setServidorId}>
              <SelectTrigger><SelectValue placeholder="Selecione o servidor" /></SelectTrigger>
              <SelectContent>
                <ServidorSelectItems servidores={servidores as any[]} />
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Cliente (opcional)</Label>
            <Input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} placeholder="Nome do cliente" />
          </div>
          <div className="space-y-1.5">
            <Label>Aplicativo</Label>
            <Input value={aplicativo} onChange={(e) => setAplicativo(e.target.value)} placeholder="Ex.: IBO PLAYER" />
          </div>
          <div className="space-y-1.5">
            <Label>MAC (quando disponível)</Label>
            <Input value={mac} onChange={(e) => setMac(maskMAC(e.target.value))} placeholder="00:1A:2B:3C:4D:5E" className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label>Device</Label>
            <Input value={device} onChange={(e) => setDevice(e.target.value)} placeholder="123456" />
          </div>
          <div className="space-y-1.5">
            <Label>Data de ativação</Label>
            <Input type="datetime-local" value={ativadoEmStr} onChange={(e) => setAtivadoEmStr(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Data de vencimento</Label>
            <Input type="datetime-local" value={expiraEmStr} onChange={(e) => setExpiraEmStr(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Crédito utilizado (fracionado)</Label>
            <Input type="number" step="0.1" min="0" value={fracao} onChange={(e) => setFracao(e.target.value)} placeholder="1" />
          </div>
          <div className="space-y-1.5">
            <Label>Valor pago pelo cliente</Label>
            <Input type="number" step="0.01" value={valorPago} onChange={(e) => setValorPago(e.target.value)} placeholder="0,00" />
          </div>
          <div className="space-y-1.5">
            <Label>Custo proporcional</Label>
            <Input value={currencyBRL(custoProporcional)} readOnly className="bg-muted/50 font-medium" />
          </div>
          <div className="sm:col-span-3 space-y-1.5">
            <Label>Observação</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} placeholder="Observações adicionais..." />
          </div>
          <div className="sm:col-span-3 text-sm text-muted-foreground bg-muted/40 p-3 rounded-lg border border-border/50">
            Lucro estimado desta ativação:{" "}
            <span className="font-semibold text-emerald-400">{currencyBRL(lucroEstimado)}</span>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>
            {saving ? "Salvando..." : (editingItem ? "Salvar Alterações" : "Ativar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}