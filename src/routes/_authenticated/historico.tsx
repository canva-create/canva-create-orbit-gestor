import { createFileRoute } from "@tanstack/react-router";
import { COMPACT_TABLE_CLASS } from "@/components/density-toggle";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchHistorico, fetchRevendedoresMovs } from "@/lib/queries";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { currencyBRL, formatDateTimeBR, formatDateBR } from "@/lib/iptv";
import { creditosPorDias, registrarMovimentacaoCredito } from "@/lib/creditos";
import { History, Download, Users, Store, Undo2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { confirmDialog } from "@/lib/confirm";
import { logAudit } from "@/lib/audit";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/historico")({
  component: HistoricoPage,
});

function HistoricoPage() {
  const qc = useQueryClient();
  const { data: renovacoes = [] } = useQuery({ queryKey: ["historico"], queryFn: fetchHistorico });
  const { data: movsRev = [] } = useQuery({ queryKey: ["revendedores_movs"], queryFn: fetchRevendedoresMovs });
  const [tab, setTab] = useState<"clientes" | "revendedores">("clientes");

  // Filtros de Clientes
  const [filtroCli, setFiltroCli] = useState<"todas" | "ativas" | "canceladas">("todas");
  const [cancelandoCli, setCancelandoCli] = useState<string | null>(null);
  const [marcandoCli, setMarcandoCli] = useState<string | null>(null);

  // Filtros e Cancelamento de Revendedores
  const [filtroRev, setFiltroRev] = useState<"todas" | "realizadas" | "canceladas">("todas");
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelandoMov, setCancelandoMov] = useState<any | null>(null);
  const [cancelMotivo, setCancelMotivo] = useState("");
  const [cancelSaving, setCancelSaving] = useState(false);
  const [marcandoRev, setMarcandoRev] = useState<string | null>(null);

  // ----------------------------------------------------
  // Operações de Clientes
  // ----------------------------------------------------
  async function marcarComoPagoCli(h: any) {
    setMarcandoCli(h.id);
    try {
      const valor = Number(h.valor_pendente || 0);
      const custoH = Number(h.custo || 0);
      const { error: eH } = await supabase.from("historico_renovacoes").update({
        status_pagamento: "pago" as any,
        valor_recebido: valor,
        valor_pendente: 0,
        lucro: valor - custoH,
        pago_em: new Date().toISOString(),
      } as any).eq("id", h.id);
      if (eH) throw eH;
      await supabase.from("clientes").update({
        status_pagamento: "pago",
        valor_pago: valor,
      }).eq("id", h.cliente_id);
      await logAudit({
        categoria: "financeiro",
        acao: "alterar_pagamento",
        descricao: `Renovação de "${h.cliente?.nome ?? "-"}" marcada como PAGA (${currencyBRL(valor)})`,
        entidade: "historico_renovacoes",
        entidade_id: h.id,
        entidade_nome: h.cliente?.nome ?? null,
        dados_anteriores: { status_pagamento: "devendo", valor_pendente: valor, valor_recebido: 0 },
        dados_novos: { status_pagamento: "pago", valor_recebido: valor, lucro: valor - custoH, pago_em: new Date().toISOString() },
      });
      toast.success(`Pagamento recebido: ${currencyBRL(valor)}`);
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao marcar como pago");
    } finally {
      setMarcandoCli(null);
    }
  }

  async function cancelarRenovacaoCli(h: any) {
    if (h.status === "cancelada") return;
    const ok = await confirmDialog({
      title: "Cancelar renovação?",
      description: `Isto irá remover ${h.dias_adicionados} dias do cliente "${h.cliente?.nome ?? "-"}", estornar ${currencyBRL(h.valor_recebido)} do faturamento e devolver os créditos utilizados. A ação não pode ser desfeita.`,
      confirmText: "Cancelar renovação",
      cancelText: "Voltar",
      destructive: true,
    });
    if (!ok) return;
    setCancelandoCli(h.id);
    try {
      const { data: cli, error: eCli } = await supabase
        .from("clientes")
        .select("id, data_vencimento, valor_pago, servidor_id")
        .eq("id", h.cliente_id)
        .maybeSingle();
      if (eCli) throw eCli;

      const dias = Number(h.dias_adicionados || 0);
      let novoVenc = h.vencimento_anterior as string | null;
      if (cli?.data_vencimento) {
        const [y, m, d] = String(cli.data_vencimento).split("-").map(Number);
        const dt = new Date(y, m - 1, d);
        dt.setDate(dt.getDate() - dias);
        const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
        novoVenc = iso;
      }

      const updates: any = { data_vencimento: novoVenc };
      if (cli && Number(cli.valor_pago || 0) === Number(h.valor_recebido || 0)) {
        updates.valor_pago = 0;
        updates.status_pagamento = "devendo";
      }
      const { error: eUp } = await supabase.from("clientes").update(updates).eq("id", h.cliente_id);
      if (eUp) throw eUp;

      const servidorId = (cli as any)?.servidor_id || null;
      const creditos = creditosPorDias(dias);
      if (servidorId && creditos > 0) {
        await registrarMovimentacaoCredito({
          servidor_id: servidorId,
          quantidade: creditos,
          tipo: "ajuste_add",
          motivo: `Cancelamento renovação ${dias}d — ${h.cliente?.nome ?? ""}`.trim(),
          cliente_id: h.cliente_id,
        });
      }

      const { error: eHist } = await supabase
        .from("historico_renovacoes")
        .update({ status: "cancelada", cancelado_em: new Date().toISOString() } as any)
        .eq("id", h.id);
      if (eHist) throw eHist;

      await logAudit({
        categoria: "renovacao",
        acao: "cancelar",
        descricao: `Renovação de "${h.cliente?.nome ?? "-"}" cancelada (${dias} dias / ${currencyBRL(h.valor_recebido)} estornados)`,
        entidade: "historico_renovacoes",
        entidade_id: h.id,
        entidade_nome: h.cliente?.nome ?? null,
        dados_anteriores: { data_vencimento: cli?.data_vencimento, valor_recebido: h.valor_recebido },
        dados_novos: { data_vencimento: novoVenc, status: "cancelada" },
      });

      toast.success("Renovação cancelada e valores estornados.");
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao cancelar renovação");
    } finally {
      setCancelandoCli(null);
    }
  }

  // ----------------------------------------------------
  // Operações de Revendedores
  // ----------------------------------------------------
  const todasVendasRev = useMemo(() => {
    return (movsRev as any[]).filter((m) => m.tipo === "venda" && Number(m.quantidade) > 0);
  }, [movsRev]);

  const renovacoesFiltradas = useMemo(() => {
    return (renovacoes as any[]).filter((h) => {
      if (filtroCli === "ativas") return h.status !== "cancelada";
      if (filtroCli === "canceladas") return h.status === "cancelada";
      return true;
    });
  }, [renovacoes, filtroCli]);

  const vendasRevFiltradas = useMemo(() => {
    return todasVendasRev.filter((m) => {
      if (filtroRev === "realizadas") return m.status_venda !== "cancelada";
      if (filtroRev === "canceladas") return m.status_venda === "cancelada";
      return true;
    });
  }, [todasVendasRev, filtroRev]);

  function abrirCancelamentoRev(m: any) {
    setCancelandoMov(m);
    setCancelMotivo("");
    setCancelModalOpen(true);
  }

  async function confirmarCancelamentoRev() {
    if (!cancelandoMov) return;
    setCancelSaving(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;
      const qtd = Number(cancelandoMov.quantidade || 0);
      const valor = Number(cancelandoMov.valor_pago || 0);
      const custo = Number(cancelandoMov.custo || 0);
      const lucro = Number(cancelandoMov.lucro || 0);
      const revNome = cancelandoMov.revendedor?.nome ?? "Revendedor";

      const { error: upErr } = await supabase
        .from("revendedores_movimentacoes")
        .update({
          status_venda: "cancelada",
          cancelada_em: new Date().toISOString(),
          cancelada_por: user.id,
          motivo_cancelamento: cancelMotivo || null,
        })
        .eq("id", cancelandoMov.id);
      if (upErr) throw upErr;

      // Devolve crédito ao servidor
      if (cancelandoMov.servidor_id && qtd > 0) {
        await registrarMovimentacaoCredito({
          servidor_id: cancelandoMov.servidor_id,
          quantidade: qtd,
          tipo: "ajuste_add",
          motivo: `Estorno de recarga p/ ${revNome}${cancelMotivo ? ` — ${cancelMotivo}` : ""}`,
        });
      }

      // Reduz créditos do revendedor
      if (cancelandoMov.revendedor_id && qtd > 0) {
        const { data: rev } = await supabase
          .from("revendedores")
          .select("creditos")
          .eq("id", cancelandoMov.revendedor_id)
          .maybeSingle();
        const atual = Number(rev?.creditos || 0);
        await supabase
          .from("revendedores")
          .update({ creditos: Math.max(0, atual - qtd) })
          .eq("id", cancelandoMov.revendedor_id);
      }

      // Estorno no histórico financeiro (valores negativos para refletir cancelamento)
      await supabase.from("historico_financeiro").insert({
        user_id: user.id,
        tipo: "estorno_revendedor",
        valor: -valor,
        custo: -custo,
        lucro: -lucro,
        descricao: `Estorno de recarga ${qtd} créditos p/ ${revNome}${cancelMotivo ? ` — ${cancelMotivo}` : ""}`,
      });

      await logAudit({
        categoria: "venda_credito",
        acao: "cancelar_venda",
        descricao: `Recarga de ${qtd} créditos p/ ${revNome} CANCELADA`,
        entidade: "revendedores_movimentacoes",
        entidade_id: cancelandoMov.id,
        entidade_nome: revNome,
        metadata: {
          quantidade: qtd,
          valor,
          custo,
          lucro,
          motivo: cancelMotivo || null,
        },
      });

      toast.success(`Recarga cancelada com sucesso. ${qtd} créditos e valores estornados.`);
      qc.invalidateQueries();
      setCancelModalOpen(false);
      setCancelandoMov(null);
      setCancelMotivo("");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao cancelar recarga");
    } finally {
      setCancelSaving(false);
    }
  }

  async function marcarComoPagoRev(m: any) {
    setMarcandoRev(m.id);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;
      const valor = Number(m.valor_pago || 0);
      const revNome = m.revendedor?.nome ?? "Revendedor";

      const { error: upErr } = await supabase
        .from("revendedores_movimentacoes")
        .update({ status_pagamento: "pago" } as any)
        .eq("id", m.id);
      if (upErr) throw upErr;

      // Registra entrada de faturamento
      await supabase.from("historico_financeiro").insert({
        user_id: user.id,
        tipo: "revendedor",
        valor: valor,
        custo: 0,
        lucro: valor,
        descricao: `Recebimento recarga ${m.quantidade} créd p/ ${revNome}`,
      });

      await logAudit({
        categoria: "venda_credito",
        acao: "alterar_pagamento",
        descricao: `Recarga de ${m.quantidade} créditos p/ ${revNome} marcada como PAGA (${currencyBRL(valor)})`,
        entidade: "revendedores_movimentacoes",
        entidade_id: m.id,
        entidade_nome: revNome,
        metadata: { valor, quantidade: m.quantidade },
      });

      toast.success(`Pagamento da recarga recebido: ${currencyBRL(valor)}`);
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao marcar como pago");
    } finally {
      setMarcandoRev(null);
    }
  }

  function exportarClientes() {
    if (renovacoesFiltradas.length === 0) return toast.error("Nada para exportar");
    const rows = renovacoesFiltradas.map((h) => ({
      Data: formatDateTimeBR(h.created_at),
      Cliente: h.cliente?.nome ?? "-",
      Status: h.status === "cancelada" ? "CANCELADA" : "RENOVADO",
      Dias: h.dias_adicionados,
      Créditos: creditosPorDias(Number(h.dias_adicionados || 0)),
      "Vencimento anterior": formatDateBR(h.vencimento_anterior),
      "Novo vencimento": formatDateBR(h.vencimento_novo),
      "Status Pagamento": (h.status_pagamento || "pago").toUpperCase(),
      Valor: Number(h.valor_recebido || 0),
      Custo: Number(h.custo || 0),
      Lucro: Number(h.lucro || 0),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ativacoes-Renovacoes");
    XLSX.writeFile(wb, `historico-clientes-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Exportado!");
  }

  function exportarRevendedores() {
    if (vendasRevFiltradas.length === 0) return toast.error("Nada para exportar");
    const rows = vendasRevFiltradas.map((m: any) => ({
      Data: formatDateTimeBR(m.created_at),
      Revendedor: m.revendedor?.nome ?? "-",
      Servidor: m.servidor?.nome ?? "-",
      Status: m.status_venda === "cancelada" ? "CANCELADA" : "REALIZADA",
      Créditos: Number(m.quantidade || 0),
      Valor: Number(m.valor_pago || 0),
      Pagamento: (m.status_pagamento || "pago").toUpperCase(),
      Motivo: m.motivo_cancelamento ?? m.motivo ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vendas-Revendedores");
    XLSX.writeFile(wb, `historico-revendedores-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Exportado!");
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <History className="h-6 w-6 text-primary" /> Histórico
        </h1>
        <p className="text-sm text-muted-foreground">
          Ativações/renovações de clientes e recargas de créditos para revendedores (realizadas e canceladas)
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <TabsList>
            <TabsTrigger value="clientes" className="gap-2">
              <Users className="h-4 w-4" /> Clientes ({renovacoes.length})
            </TabsTrigger>
            <TabsTrigger value="revendedores" className="gap-2">
              <Store className="h-4 w-4" /> Revendedores ({todasVendasRev.length})
            </TabsTrigger>
          </TabsList>
          <Button variant="outline" size="sm" onClick={tab === "clientes" ? exportarClientes : exportarRevendedores}>
            <Download className="h-4 w-4 mr-1" /> Exportar Planilha
          </Button>
        </div>

        {/* ---------------------------------------------------- */}
        {/* ABA CLIENTES */}
        {/* ---------------------------------------------------- */}
        <TabsContent value="clientes" className="mt-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium">Filtrar:</span>
            <Button
              size="sm"
              variant={filtroCli === "todas" ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setFiltroCli("todas")}
            >
              Todas ({renovacoes.length})
            </Button>
            <Button
              size="sm"
              variant={filtroCli === "ativas" ? "default" : "outline"}
              className="h-7 text-xs text-emerald-400"
              onClick={() => setFiltroCli("ativas")}
            >
              Renovadas / Ativas ({(renovacoes as any[]).filter((h) => h.status !== "cancelada").length})
            </Button>
            <Button
              size="sm"
              variant={filtroCli === "canceladas" ? "default" : "outline"}
              className="h-7 text-xs text-red-400"
              onClick={() => setFiltroCli("canceladas")}
            >
              Canceladas ({(renovacoes as any[]).filter((h) => h.status === "cancelada").length})
            </Button>
          </div>

          <Card className="overflow-hidden">
            <Table className={COMPACT_TABLE_CLASS}>
              <TableHeader className="bg-primary/10">
                <TableRow>
                  <TableHead>Data / Hora</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Dias</TableHead>
                  <TableHead>Créditos</TableHead>
                  <TableHead>Venc. anterior</TableHead>
                  <TableHead>Novo venc.</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Custo</TableHead>
                  <TableHead>Lucro</TableHead>
                  <TableHead>Pagto</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {renovacoesFiltradas.map((h: any) => {
                  const isCancelada = h.status === "cancelada";
                  return (
                    <TableRow key={h.id} className={isCancelada ? "opacity-60 bg-muted/20" : ""}>
                      <TableCell className="text-xs font-mono whitespace-nowrap">
                        {formatDateTimeBR(h.created_at)}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-foreground">{h.cliente?.nome ?? "-"}</span>
                      </TableCell>
                      <TableCell>
                        {isCancelada ? (
                          <Badge variant="destructive" className="text-[10px] uppercase tracking-wider font-semibold">
                            CANCELADA
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px] uppercase tracking-wider font-semibold">
                            RENOVADO
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className={`font-semibold ${isCancelada ? "text-muted-foreground line-through" : "text-blue-400"}`}>
                        +{h.dias_adicionados}
                      </TableCell>
                      <TableCell className="font-semibold text-primary">
                        {creditosPorDias(Number(h.dias_adicionados || 0))}
                      </TableCell>
                      <TableCell>{formatDateBR(h.vencimento_anterior)}</TableCell>
                      <TableCell>{formatDateBR(h.vencimento_novo)}</TableCell>
                      <TableCell className={h.status_pagamento === "devendo" ? "text-amber-400" : "text-emerald-400"}>
                        {currencyBRL(h.status_pagamento === "devendo" ? h.valor_pendente : h.valor_recebido)}
                      </TableCell>
                      <TableCell className="text-red-400">{currencyBRL(h.custo)}</TableCell>
                      <TableCell className="font-semibold">{currencyBRL(h.lucro)}</TableCell>
                      <TableCell>
                        {h.status_pagamento === "devendo" ? (
                          <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[10px]">DEVENDO</Badge>
                        ) : (
                          <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px]">PAGO</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isCancelada ? (
                          <span className="text-xs text-muted-foreground italic">Estornada</span>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            {h.status_pagamento === "devendo" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-emerald-400 hover:text-emerald-300 h-8 text-xs gap-1"
                                disabled={marcandoCli === h.id}
                                onClick={() => marcarComoPagoCli(h)}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                {marcandoCli === h.id ? "..." : "Pago"}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-400 hover:text-red-300 h-8 text-xs gap-1 hover:bg-red-500/10"
                              disabled={cancelandoCli === h.id}
                              onClick={() => cancelarRenovacaoCli(h)}
                              title="Cancelar renovação e estornar dias e créditos"
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                              {cancelandoCli === h.id ? "..." : "Cancelar"}
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {renovacoesFiltradas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                      Nenhuma ativação/renovação encontrada neste filtro.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ---------------------------------------------------- */}
        {/* ABA REVENDEDORES */}
        {/* ---------------------------------------------------- */}
        <TabsContent value="revendedores" className="mt-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium">Filtrar:</span>
            <Button
              size="sm"
              variant={filtroRev === "todas" ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setFiltroRev("todas")}
            >
              Todas ({todasVendasRev.length})
            </Button>
            <Button
              size="sm"
              variant={filtroRev === "realizadas" ? "default" : "outline"}
              className="h-7 text-xs text-emerald-400"
              onClick={() => setFiltroRev("realizadas")}
            >
              Realizadas / Ativas ({todasVendasRev.filter((m) => m.status_venda !== "cancelada").length})
            </Button>
            <Button
              size="sm"
              variant={filtroRev === "canceladas" ? "default" : "outline"}
              className="h-7 text-xs text-red-400"
              onClick={() => setFiltroRev("canceladas")}
            >
              Canceladas ({todasVendasRev.filter((m) => m.status_venda === "cancelada").length})
            </Button>
          </div>

          <Card className="overflow-hidden">
            <Table className={COMPACT_TABLE_CLASS}>
              <TableHeader className="bg-primary/10">
                <TableRow>
                  <TableHead>Data / Hora</TableHead>
                  <TableHead>Revendedor</TableHead>
                  <TableHead>Servidor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Créditos</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendasRevFiltradas.map((m: any) => {
                  const isCancelada = m.status_venda === "cancelada";
                  const isPago = (m.status_pagamento || "pago") === "pago";

                  return (
                    <TableRow key={m.id} className={isCancelada ? "opacity-60 bg-muted/20" : ""}>
                      <TableCell className="text-xs font-mono whitespace-nowrap">
                        {formatDateTimeBR(m.created_at)}
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold text-foreground">{m.revendedor?.nome ?? "-"}</span>
                      </TableCell>
                      <TableCell>{m.servidor?.nome ?? "-"}</TableCell>
                      <TableCell>
                        {isCancelada ? (
                          <Badge variant="destructive" className="text-[10px] uppercase tracking-wider font-semibold">
                            CANCELADA
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px] uppercase tracking-wider font-semibold">
                            REALIZADA
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${isCancelada ? "text-muted-foreground line-through" : "text-blue-400"}`}>
                        +{Number(m.quantidade || 0)}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${isCancelada ? "text-muted-foreground line-through" : isPago ? "text-emerald-400" : "text-amber-400"}`}>
                        {currencyBRL(m.valor_pago)}
                      </TableCell>
                      <TableCell>
                        {isPago ? (
                          <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px]">
                            PAGO
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[10px]">
                            DEVENDO
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isCancelada ? (
                          <span className="text-xs text-muted-foreground italic">
                            {m.motivo_cancelamento ? `Estornada (${m.motivo_cancelamento})` : "Estornada"}
                          </span>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            {!isPago && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-emerald-400 hover:text-emerald-300 h-8 text-xs gap-1"
                                disabled={marcandoRev === m.id}
                                onClick={() => marcarComoPagoRev(m)}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                {marcandoRev === m.id ? "..." : "Pago"}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-400 hover:text-red-300 h-8 text-xs gap-1 hover:bg-red-500/10"
                              onClick={() => abrirCancelamentoRev(m)}
                              title="Cancelar recarga e estornar créditos e faturamento"
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                              Cancelar Recarga
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {vendasRevFiltradas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Nenhuma recarga encontrada neste filtro.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal de Cancelamento de Recarga de Revendedor */}
      <Dialog open={cancelModalOpen} onOpenChange={(o) => !o && setCancelModalOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="h-5 w-5" /> Cancelar Recarga de Revendedor
            </DialogTitle>
            <DialogDescription>
              Esta ação cancelará a recarga, estornará os créditos do revendedor, devolverá os créditos ao servidor e registrará o estorno no histórico financeiro.
            </DialogDescription>
          </DialogHeader>
          {cancelandoMov && (
            <div className="space-y-3 py-2 text-sm">
              <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Revendedor:</span>
                  <span className="font-semibold">{cancelandoMov.revendedor?.nome ?? "Revendedor"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Servidor:</span>
                  <span>{cancelandoMov.servidor?.nome ?? "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Créditos a estornar:</span>
                  <span className="font-bold text-red-400">{cancelandoMov.quantidade} créditos</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor da venda:</span>
                  <span className="font-medium">{currencyBRL(cancelandoMov.valor_pago)}</span>
                </div>
              </div>

              <div>
                <Label htmlFor="motivo-cancel">Motivo do cancelamento (opcional)</Label>
                <Input
                  id="motivo-cancel"
                  placeholder="Ex: Erro de digitação, cliente cancelou..."
                  value={cancelMotivo}
                  onChange={(e) => setCancelMotivo(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelModalOpen(false)} disabled={cancelSaving}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmarCancelamentoRev}
              disabled={cancelSaving}
            >
              {cancelSaving ? "Cancelando..." : "Confirmar Cancelamento e Estornar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}