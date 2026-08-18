import { ServidorSelectItems, agruparServidores } from "@/lib/servidores-ui";
import { createFileRoute } from "@tanstack/react-router";
import { COMPACT_TABLE_CLASS } from "@/components/density-toggle";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  fetchServidores,
  fetchComprasCreditos,
  fetchMovimentacoesCreditos,
  fetchSaldosCreditos,
} from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/components/stat-card";
import { CreditCard, Plus, Minus, Pencil, Trash2, ShoppingCart, Wallet, AlertTriangle, ArrowDownRight, ArrowUpRight, Upload, Download, ClipboardCopy, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { currencyBRL, formatDateBR, formatDateTimeBR, toISODate } from "@/lib/iptv";
import { registrarMovimentacaoCredito, type CreditoMovTipo } from "@/lib/creditos";
import { logAudit } from "@/lib/audit";

const LOW_THRESHOLD = 5;

export const Route = createFileRoute("/_authenticated/creditos")({
  component: CreditosPage,
});

export function CreditosPage() {
  const qc = useQueryClient();
  const { data: servidores = [] } = useQuery({ queryKey: ["servidores"], queryFn: fetchServidores });
  const { data: compras = [] } = useQuery({ queryKey: ["creditos_compras"], queryFn: fetchComprasCreditos });
  const { data: movs = [] } = useQuery({ queryKey: ["creditos_movs"], queryFn: fetchMovimentacoesCreditos });
  const { data: saldos = {} } = useQuery({ queryKey: ["creditos_saldos"], queryFn: fetchSaldosCreditos });

  const [compraOpen, setCompraOpen] = useState(false);
  const [compraEditing, setCompraEditing] = useState<any | null>(null);
  const [compraLock, setCompraLock] = useState(false);
  const [ajusteOpen, setAjusteOpen] = useState(false);
  const [ajusteServidorId, setAjusteServidorId] = useState<string | null>(null);
  const [pedidoOpen, setPedidoOpen] = useState(false);
  const [desfazendo, setDesfazendo] = useState(false);

  const hojeISO = toISODate(new Date());
  const gastoHoje = useMemo(
    () => compras
      .filter((c: any) => (c.data_compra ?? "").slice(0, 10) === hojeISO)
      .reduce((s: number, c: any) => s + Number(c.valor_total || 0), 0),
    [compras, hojeISO],
  );
  const creditosHoje = useMemo(
    () => compras
      .filter((c: any) => (c.data_compra ?? "").slice(0, 10) === hojeISO)
      .reduce((s: number, c: any) => s + Number(c.quantidade || 0), 0),
    [compras, hojeISO],
  );
  const totalInvestido = useMemo(
    () => compras.reduce((s: number, c: any) => s + Number(c.valor_total || 0), 0),
    [compras],
  );

  const ultimaCompraPorServidor = useMemo(() => {
    const map = new Map<string, any>();
    compras.forEach((c: any) => {
      if (!map.has(c.servidor_id)) map.set(c.servidor_id, c);
    });
    return map;
  }, [compras]);

  const servidoresAgrupados = useMemo(() => agruparServidores(servidores), [servidores]);
  const baixos = servidores.filter((s: any) => (saldos[s.id] ?? 0) <= LOW_THRESHOLD);

  async function excluirCompra(c: any) {
    const { confirmDialog } = await import("@/lib/confirm");
    const ok = await confirmDialog({ title: `Excluir compra de ${c.quantidade} créditos?`, description: "Também serão removidas as movimentações vinculadas.", confirmText: "Excluir", destructive: true });
    if (!ok) return;
    // Remove movimentações vinculadas primeiro
    await supabase.from("creditos_movimentacoes").delete().eq("compra_id", c.id);
    const { error } = await supabase.from("creditos_compras").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    await logAudit({ categoria: "compra_credito", acao: "excluir", descricao: `Compra de ${c.quantidade} créditos excluída`, entidade: "creditos_compras", entidade_id: c.id, dados_anteriores: c });
    toast.success("Compra excluída");
    qc.invalidateQueries();
  }

  async function desfazerUltimaMovimentacao() {
    const ultima: any = movs[0];
    if (!ultima) return toast.error("Nenhuma movimentação para desfazer");
    const { confirmDialog } = await import("@/lib/confirm");
    const sinal = Number(ultima.quantidade) > 0 ? "+" : "";
    const ok = await confirmDialog({
      title: "Desfazer última movimentação?",
      description:
        `${labelTipo(ultima.tipo)} de ${sinal}${ultima.quantidade} crédito(s) em "${ultima.servidor?.nome ?? "-"}" será revertida e o saldo restaurado.` +
        (ultima.compra_id ? " A compra vinculada também será removida." : ""),
      confirmText: "Desfazer",
      destructive: true,
    });
    if (!ok) return;
    setDesfazendo(true);
    try {
      if (ultima.compra_id) {
        // remove todas as movimentações da compra e a própria compra
        const { error: e1 } = await supabase.from("creditos_movimentacoes").delete().eq("compra_id", ultima.compra_id);
        if (e1) throw e1;
        const { error: e2 } = await supabase.from("creditos_compras").delete().eq("id", ultima.compra_id);
        if (e2) throw e2;
      } else {
        const { error } = await supabase.from("creditos_movimentacoes").delete().eq("id", ultima.id);
        if (error) throw error;
      }
      await logAudit({
        categoria: "credito",
        acao: "cancelar",
        descricao: `Movimentação de créditos desfeita (${labelTipo(ultima.tipo)}, ${sinal}${ultima.quantidade})`,
        entidade: "creditos_movimentacoes",
        entidade_id: ultima.id,
        entidade_nome: ultima.servidor?.nome ?? null,
        dados_anteriores: ultima,
      });
      toast.success("Movimentação desfeita e saldo restaurado");
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao desfazer movimentação");
    } finally {
      setDesfazendo(false);
    }
  }

  const pedidoDoDia = useMemo(() => {
    const hojeCompras = compras.filter((c: any) => (c.data_compra ?? "").slice(0, 10) === hojeISO);
    const map = new Map<string, { servidor: string; login: string; quantidade: number }>();
    hojeCompras.forEach((c: any) => {
      const srv = servidores.find((s: any) => s.id === c.servidor_id);
      const key = c.servidor_id;
      const prev = map.get(key);
      const login = (srv?.observacao ?? "").toString().split("\n")[0] || "-";
      if (prev) prev.quantidade += Number(c.quantidade || 0);
      else map.set(key, { servidor: srv?.nome ?? "-", login, quantidade: Number(c.quantidade || 0) });
    });
    return Array.from(map.values());
  }, [compras, servidores, hojeISO]);

  function pedidoTexto() {
    if (pedidoDoDia.length === 0) return "";
    const dataStr = formatDateBR(hojeISO);
    const blocos = pedidoDoDia.map(
      (p) =>
        `🔹 *Servidor:* ${p.servidor}\n👤 *Login:* \`${p.login}\`\n📦 *Quantidade:* ${p.quantidade} créditos`,
    );
    const total = pedidoDoDia.reduce((s, p) => s + p.quantidade, 0);
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    return (
      `📦 *SOLICITAÇÃO DE COMPRA DE CRÉDITOS*\n` +
      `📅 *Data:* ${dataStr}\n\n` +
      `Solicito a compra dos seguintes créditos:\n\n` +
      `${blocos.join("\n\n")}\n\n` +
      `━━━━━━━━━━━━━━━━━━\n\n` +
      `📊 *RESUMO DO PEDIDO*\n\n` +
      `📦 *Total de Créditos Solicitados:* *${total} créditos*\n\n` +
      `🕒 *Data/Hora da Solicitação:* ${dataStr} - ${hh}:${mm}\n\n` +
      `🙏 Aguardamos a confirmação e liberação dos créditos.\n\n` +
      `💙 *RODOLFO TV*\n` +
      `🚀 _Gestão e Controle de Créditos_ 📺`
    );
  }

  async function copiarPedido() {
    const txt = pedidoTexto();
    if (!txt) return toast.error("Nenhuma compra registrada hoje");
    try {
      await navigator.clipboard.writeText(txt);
      toast.success("Pedido copiado para a área de transferência");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  function exportarCompras() {
    const payload = compras.map((c: any) => ({
      servidor: c.servidor?.nome ?? servidores.find((s: any) => s.id === c.servidor_id)?.nome ?? "",
      servidor_id: c.servidor_id,
      quantidade: c.quantidade,
      valor_unitario: c.valor_unitario,
      valor_total: c.valor_total,
      data_compra: c.data_compra,
      observacao: c.observacao ?? "",
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compras-creditos-${hojeISO}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exportado");
  }

  async function importarCompras(file: File) {
    try {
      const text = await file.text();
      const rows = JSON.parse(text);
      if (!Array.isArray(rows)) throw new Error("Formato inválido");
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;
      let ok = 0;
      for (const r of rows) {
        let sid = r.servidor_id as string | undefined;
        if (!sid && r.servidor) {
          const found = servidores.find((s: any) => s.nome?.toLowerCase() === String(r.servidor).toLowerCase());
          sid = found?.id;
        }
        if (!sid) continue;
        const qtd = Number(r.quantidade) || 0;
        const vu = Number(r.valor_unitario) || 0;
        if (qtd <= 0) continue;
        const { data: c, error } = await supabase.from("creditos_compras").insert({
          user_id: user.id,
          servidor_id: sid,
          quantidade: qtd,
          valor_unitario: vu,
          data_compra: r.data_compra ?? hojeISO,
          observacao: r.observacao ?? null,
        }).select("id").single();
        if (error || !c) continue;
        await registrarMovimentacaoCredito({
          servidor_id: sid, quantidade: qtd, tipo: "compra",
          motivo: `Importação: ${qtd} créditos`, compra_id: c.id,
        });
        ok++;
      }
      toast.success(`${ok} compra(s) importada(s)`);
      await logAudit({ categoria: "importacao", acao: "importar", descricao: `Importação de compras de créditos`, entidade: "creditos_compras", metadata: { total: rows.length, ok } });
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao importar");
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Gestão de Créditos</h1>
          <p className="text-sm text-muted-foreground">Controle de créditos por servidor</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={exportarCompras}>
            <Download className="h-4 w-4 mr-1" /> Exportar
          </Button>
          <label className="inline-flex">
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importarCompras(f);
                e.target.value = "";
              }}
            />
            <Button asChild variant="outline">
              <span><Upload className="h-4 w-4 mr-1" /> Importar</span>
            </Button>
          </label>
          <Button variant="secondary" onClick={() => { setAjusteServidorId(null); setAjusteOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Ajuste manual
          </Button>
          <Button onClick={() => { setCompraEditing(null); setCompraLock(false); setCompraOpen(true); }}>
            <ShoppingCart className="h-4 w-4 mr-1" /> Nova compra
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Gasto Hoje" value={currencyBRL(gastoHoje)} icon={Wallet} tone="orange" />
        <StatCard label="Créditos Comprados Hoje" value={creditosHoje} icon={CreditCard} tone="blue" />
        <StatCard label="Investido Total" value={currencyBRL(totalInvestido)} icon={ShoppingCart} tone="purple" />
        <StatCard label="Servidores com saldo baixo" value={baixos.length} icon={AlertTriangle} tone={baixos.length ? "red" : "green"} />
      </div>

      {baixos.length > 0 && (
        <Card className="p-4 border-red-500/40 bg-red-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-red-400">Reposição necessária</div>
              <div className="text-sm text-muted-foreground">
                Servidores com saldo ≤ {LOW_THRESHOLD} créditos:&nbsp;
                {baixos.map((s: any) => `${s.nome} (${saldos[s.id] ?? 0})`).join(" · ")}
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <CreditCard className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Saldo por servidor</h3>
        </div>
        <div className="space-y-6">
          {servidoresAgrupados.map((grupo) => (
            <div key={grupo.categoria} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-bold uppercase tracking-wider px-3 py-1 text-xs">
                  {grupo.categoria}
                </Badge>
                <div className="h-px flex-1 bg-border/50" />
              </div>
              <div className="overflow-x-auto rounded-md border border-border/40">
                <Table className={COMPACT_TABLE_CLASS}>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="w-[200px]">Servidor</TableHead>
                      <TableHead className="text-right w-[100px]">Saldo</TableHead>
                      <TableHead>Última compra</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                      <TableHead className="text-right">Valor unit.</TableHead>
                      <TableHead className="text-right">Valor total</TableHead>
                      <TableHead className="text-right w-[180px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grupo.itens.map((s: any) => {
                      const saldo = saldos[s.id] ?? 0;
                      const uc = ultimaCompraPorServidor.get(s.id);
                      const baixo = saldo <= LOW_THRESHOLD;
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.nome}</TableCell>
                          <TableCell className={`text-right font-bold ${baixo ? "text-red-400" : "text-emerald-400"}`}>
                            {saldo}
                            {baixo && <AlertTriangle className="h-3.5 w-3.5 inline ml-1" />}
                          </TableCell>
                          <TableCell>{uc ? formatDateBR(uc.data_compra) : "-"}</TableCell>
                          <TableCell className="text-right">{uc?.quantidade ?? "-"}</TableCell>
                          <TableCell className="text-right">{uc ? currencyBRL(uc.valor_unitario) : "-"}</TableCell>
                          <TableCell className="text-right">{uc ? currencyBRL(uc.valor_total) : "-"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center gap-1 justify-end">
                              <Button size="sm" variant="secondary" className="h-7 px-2"
                                onClick={() => { setCompraEditing({ servidor_id: s.id }); setCompraLock(true); setCompraOpen(true); }}>
                                <ShoppingCart className="h-3.5 w-3.5 mr-1" /> Comprar
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                                onClick={() => { setAjusteServidorId(s.id); setAjusteOpen(true); }}>
                                <div className="flex flex-col items-center -space-y-1">
                                  <Plus className="h-3 w-3" />
                                  <Minus className="h-3 w-3" />
                                </div>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}

          {servidores.length === 0 && (
            <div className="text-center text-muted-foreground py-12 border-2 border-dashed rounded-lg bg-muted/20">
              <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p>Cadastre servidores para visualizar os saldos.</p>
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <ShoppingCart className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Últimas compras</h3>
            <div className="ml-auto flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 px-3 py-1.5 shadow-sm">
              <Wallet className="h-4 w-4 text-emerald-400" />
              <div className="flex flex-col leading-tight">
                <span className="text-[10px] uppercase tracking-wider text-emerald-300/80 font-medium">Gasto hoje</span>
                <span className="text-base font-bold text-emerald-300">{currencyBRL(gastoHoje)}</span>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setPedidoOpen(true)}>
              <ClipboardCopy className="h-4 w-4 mr-1" /> Copiar pedido
            </Button>
          </div>
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <Table className={COMPACT_TABLE_CLASS}>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Servidor</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Unit.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {compras.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell>{formatDateBR(c.data_compra)}</TableCell>
                    <TableCell>{c.servidor?.nome ?? "-"}</TableCell>
                    <TableCell className="text-right">{c.quantidade}</TableCell>
                    <TableCell className="text-right">{currencyBRL(c.valor_unitario)}</TableCell>
                    <TableCell className="text-right font-semibold">{currencyBRL(c.valor_total)}</TableCell>
                    <TableCell className="text-right">
                      <button title="Editar" className="h-7 w-7 rounded-md grid place-items-center hover:bg-accent inline-flex"
                        onClick={() => { setCompraEditing(c); setCompraLock(false); setCompraOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button title="Excluir" className="h-7 w-7 rounded-md grid place-items-center hover:bg-accent inline-flex"
                        onClick={() => excluirCompra(c)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
                {compras.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma compra registrada.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Movimentações</h3>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              disabled={movs.length === 0 || desfazendo}
              onClick={desfazerUltimaMovimentacao}
            >
              <Undo2 className="h-4 w-4 mr-1" /> Desfazer última
            </Button>
          </div>
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <Table className={COMPACT_TABLE_CLASS}>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Servidor</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movs.map((m: any) => {
                  const positivo = Number(m.quantidade) > 0;
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs">{formatDateTimeBR(m.created_at)}</TableCell>
                      <TableCell>{m.servidor?.nome ?? "-"}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{labelTipo(m.tipo)}</Badge></TableCell>
                      <TableCell className={`text-right font-semibold ${positivo ? "text-emerald-400" : "text-red-400"}`}>
                        {positivo ? <ArrowUpRight className="h-3 w-3 inline" /> : <ArrowDownRight className="h-3 w-3 inline" />}
                        {" "}{positivo ? "+" : ""}{m.quantidade}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{m.motivo ?? "-"}</TableCell>
                    </TableRow>
                  );
                })}
                {movs.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Sem movimentações.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      <CompraDialog
        open={compraOpen}
        onOpenChange={setCompraOpen}
        editing={compraEditing}
        servidores={servidores}
        saldos={saldos}
        compras={compras}
        movs={movs}
        lockServidor={compraLock}
      />
      <AjusteDialog
        open={ajusteOpen}
        onOpenChange={setAjusteOpen}
        servidorId={ajusteServidorId}
        servidores={servidores}
        saldos={saldos}
        compras={compras}
        movs={movs}
      />
      <PedidoDialog
        open={pedidoOpen}
        onOpenChange={setPedidoOpen}
        texto={pedidoTexto()}
        onCopiar={copiarPedido}
      />
    </div>
  );
}

function PedidoDialog({
  open, onOpenChange, texto, onCopiar,
}: { open: boolean; onOpenChange: (o: boolean) => void; texto: string; onCopiar: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Pedido de compra do dia</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Resumo consolidado das compras de hoje agrupadas por servidor.
          </p>
          <Textarea rows={10} readOnly value={texto || "Nenhuma compra registrada hoje."} className="font-mono text-xs" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={onCopiar} disabled={!texto}>
            <ClipboardCopy className="h-4 w-4 mr-1" /> Copiar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function labelTipo(t: CreditoMovTipo) {
  const map: Record<string, string> = {
    compra: "Compra",
    ativacao: "Ativação",
    renovacao: "Renovação",
    ajuste_add: "Ajuste (+)",
    ajuste_rem: "Ajuste (-)",
    transferencia: "Transferência",
  };
  return map[t] ?? t;
}

function ResumoServidor({
  servidor, saldoAtual, saldoFinal, compras, movs, extras,
}: {
  servidor: any; saldoAtual: number; saldoFinal: number;
  compras: any[]; movs: any[]; extras?: Array<[string, React.ReactNode]>;
}) {
  if (!servidor) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 p-3 text-sm text-muted-foreground">
        Selecione um servidor para ver os detalhes do saldo.
      </div>
    );
  }
  const doServidor = compras.filter((c: any) => c.servidor_id === servidor.id);
  const ultimaCompra = doServidor[0];
  const ultimaMov = movs.find((m: any) => m.servidor_id === servidor.id);
  const investido = doServidor.reduce((s: number, c: any) => s + Number(c.valor_total || 0), 0);
  const delta = saldoFinal - saldoAtual;
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-sm">{servidor.nome}</div>
        <Badge variant="outline">{servidor.categoria}</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md bg-background/60 py-2">
          <div className="text-[10px] uppercase text-muted-foreground">Saldo atual</div>
          <div className="text-lg font-bold">{saldoAtual}</div>
        </div>
        <div className="rounded-md bg-background/60 py-2">
          <div className="text-[10px] uppercase text-muted-foreground">Movimento</div>
          <div className={`text-lg font-bold ${delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : ""}`}>
            {delta > 0 ? "+" : ""}{delta}
          </div>
        </div>
        <div className="rounded-md bg-background/60 py-2">
          <div className="text-[10px] uppercase text-muted-foreground">Saldo final</div>
          <div className={`text-lg font-bold ${saldoFinal < 0 ? "text-red-400" : "text-emerald-400"}`}>{saldoFinal}</div>
        </div>
      </div>
      {saldoFinal < 0 && (
        <div className="text-[11px] text-red-400 flex items-center gap-1">
          <AlertTriangle className="h-3.5 w-3.5" /> O saldo final ficará negativo.
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <div>Valor do crédito: <span className="text-foreground font-medium">{currencyBRL(Number(servidor.custo_mensal ?? 0))}</span></div>
        <div>Investido no servidor: <span className="text-foreground font-medium">{currencyBRL(investido)}</span></div>
        <div>
          Última compra:{" "}
          <span className="text-foreground font-medium">
            {ultimaCompra ? `${formatDateBR(ultimaCompra.data_compra)} · ${ultimaCompra.quantidade} créd. · ${currencyBRL(ultimaCompra.valor_total)}` : "—"}
          </span>
        </div>
        <div>
          Última movimentação:{" "}
          <span className="text-foreground font-medium">
            {ultimaMov ? `${formatDateTimeBR(ultimaMov.created_at)} · ${labelTipo(ultimaMov.tipo)} ${Number(ultimaMov.quantidade) > 0 ? "+" : ""}${ultimaMov.quantidade}` : "—"}
          </span>
        </div>
        <div>Compras registradas: <span className="text-foreground font-medium">{doServidor.length}</span></div>
        {extras?.map(([k, v]) => (
          <div key={k}>{k}: <span className="text-foreground font-medium">{v}</span></div>
        ))}
      </div>
    </div>
  );
}

function CompraDialog({
  open, onOpenChange, editing, servidores, saldos, compras, movs, lockServidor,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; editing: any | null; servidores: any[];
  saldos: Record<string, number>; compras: any[]; movs: any[]; lockServidor?: boolean;
}) {
  const qc = useQueryClient();
  const [servidorId, setServidorId] = useState<string>("");
  const [quantidade, setQuantidade] = useState<string>("");
  const [dataCompra, setDataCompra] = useState<string>(toISODate(new Date()));
  const [observacao, setObservacao] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const isEdit = !!editing?.id;

  useMemo(() => {
    if (open) {
      setServidorId(editing?.servidor_id ?? "");
      setQuantidade(editing?.quantidade ? String(editing.quantidade) : "");
      setDataCompra(editing?.data_compra ?? toISODate(new Date()));
      setObservacao(editing?.observacao ?? "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const qtd = Number(quantidade) || 0;
  const servidorSel = servidores.find((s: any) => s.id === servidorId);
  const vu = Number(servidorSel?.custo_mensal ?? 0) || 0;
  const total = qtd * vu;
  const saldoAtual = servidorId ? (saldos[servidorId] ?? 0) : 0;
  const saldoBase = isEdit && editing?.servidor_id === servidorId ? saldoAtual - Number(editing?.quantidade || 0) : saldoAtual;
  const saldoFinal = saldoBase + qtd;

  async function salvar() {
    if (!servidorId) return toast.error("Selecione o servidor");
    if (qtd <= 0) return toast.error("Quantidade inválida");
    setSaving(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;
      if (isEdit) {
        const { error } = await supabase.from("creditos_compras")
          .update({ servidor_id: servidorId, quantidade: qtd, valor_unitario: vu, data_compra: dataCompra, observacao })
          .eq("id", editing.id);
        if (error) return toast.error(error.message);
        // Atualiza movimentações vinculadas
        await supabase.from("creditos_movimentacoes")
          .update({ servidor_id: servidorId, quantidade: qtd, motivo: `Compra de ${qtd} créditos` })
          .eq("compra_id", editing.id);
        toast.success("Compra atualizada");
        await logAudit({ categoria: "compra_credito", acao: "editar", descricao: `Compra de créditos editada`, entidade: "creditos_compras", entidade_id: editing.id, dados_anteriores: editing, dados_novos: { servidor_id: servidorId, quantidade: qtd, valor_unitario: vu, data_compra: dataCompra, observacao } });
      } else {
        const { data: c, error } = await supabase.from("creditos_compras").insert({
          user_id: user.id, servidor_id: servidorId, quantidade: qtd,
          valor_unitario: vu, data_compra: dataCompra, observacao,
        }).select("id").single();
        if (error) return toast.error(error.message);
        await registrarMovimentacaoCredito({
          servidor_id: servidorId, quantidade: qtd, tipo: "compra",
          motivo: `Compra de ${qtd} créditos`, compra_id: c!.id,
        });
        toast.success("Compra registrada");
        await logAudit({ categoria: "compra_credito", acao: "comprar", descricao: `Compra de ${qtd} créditos registrada`, entidade: "creditos_compras", entidade_id: c!.id, dados_novos: { servidor_id: servidorId, quantidade: qtd, valor_unitario: vu, total, data_compra: dataCompra } });
      }
      qc.invalidateQueries();
      onOpenChange(false);
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{isEdit ? "Editar compra" : "Nova compra de créditos"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!lockServidor && (
            <div className="space-y-1.5">
              <Label>Servidor</Label>
              <Select value={servidorId} onValueChange={setServidorId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <ServidorSelectItems servidores={servidores as any[]} />
                </SelectContent>
              </Select>
            </div>
          )}
          <ResumoServidor
            servidor={servidorSel}
            saldoAtual={saldoBase}
            saldoFinal={saldoFinal}
            compras={compras}
            movs={movs}
            extras={[["Créditos a adicionar", qtd || 0], ["Valor total", currencyBRL(total)]]}
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Quantidade</Label>
              <Input type="number" min={1} value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor unitário (R$)</Label>
              <Input
                type="text"
                readOnly
                value={currencyBRL(vu)}
                className="bg-muted/40 cursor-not-allowed"
                title="Valor definido no cadastro do servidor"
              />
              <p className="text-[11px] text-muted-foreground">
                Puxado automaticamente do cadastro do servidor.
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Data da compra</Label>
            <Input type="date" value={dataCompra} onChange={(e) => setDataCompra(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Observação</Label>
            <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>
          <div className="rounded-lg border border-border/60 p-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Valor total</span>
            <span className="text-lg font-bold text-emerald-400">{currencyBRL(total)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>{isEdit ? "Salvar" : "Registrar compra"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AjusteDialog({
  open, onOpenChange, servidorId, servidores, saldos, compras, movs,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; servidorId: string | null; servidores: any[];
  saldos: Record<string, number>; compras: any[]; movs: any[];
}) {
  const qc = useQueryClient();
  const [sid, setSid] = useState<string>("");
  const [quantidade, setQuantidade] = useState<string>("");
  const [modo, setModo] = useState<"add" | "rem">("add");
  const [motivo, setMotivo] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useMemo(() => {
    if (open) {
      setSid(servidorId ?? "");
      setQuantidade(""); setModo("add"); setMotivo("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, servidorId]);

  const q = Number(quantidade) || 0;
  const servidorSel = servidores.find((s: any) => s.id === sid);
  const saldoAtual = sid ? (saldos[sid] ?? 0) : 0;
  const saldoFinal = saldoAtual + (modo === "add" ? q : -q);

  async function salvar() {
    if (!sid) return toast.error("Selecione o servidor");
    if (q <= 0) return toast.error("Quantidade inválida");
    setSaving(true);
    try {
      await registrarMovimentacaoCredito({
        servidor_id: sid,
        quantidade: modo === "add" ? q : -q,
        tipo: modo === "add" ? "ajuste_add" : "ajuste_rem",
        motivo: motivo || (modo === "add" ? "Ajuste manual (+)" : "Ajuste manual (-)"),
      });
      toast.success("Ajuste registrado");
      await logAudit({ categoria: "credito", acao: "ajustar", descricao: `Ajuste manual de créditos ${modo === "add" ? "+" : "-"}${q}`, entidade: "creditos_movimentacoes", metadata: { servidor_id: sid, quantidade: q, modo, motivo } });
      qc.invalidateQueries();
      onOpenChange(false);
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Ajuste manual de créditos</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!servidorId && (
            <div className="space-y-1.5">
              <Label>Servidor</Label>
              <Select value={sid} onValueChange={setSid}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <ServidorSelectItems servidores={servidores as any[]} />
                </SelectContent>
              </Select>
            </div>
          )}
          <ResumoServidor
            servidor={servidorSel}
            saldoAtual={saldoAtual}
            saldoFinal={saldoFinal}
            compras={compras}
            movs={movs}
            extras={[["Operação", modo === "add" ? `Acréscimo de ${q} crédito(s)` : `Redução de ${q} crédito(s)`]]}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={modo === "add" ? "default" : "secondary"} onClick={() => setModo("add")}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
            <Button type="button" variant={modo === "rem" ? "default" : "secondary"} onClick={() => setModo("rem")}>
              <Minus className="h-4 w-4 mr-1" /> Remover
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label>Quantidade</Label>
            <Input type="number" min={1} value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Motivo</Label>
            <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex: correção de saldo, bônus do provedor..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>Salvar ajuste</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}