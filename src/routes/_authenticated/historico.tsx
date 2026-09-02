import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { COMPACT_TABLE_CLASS } from "@/components/density-toggle";
import { z } from "zod";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchHistorico, fetchRevendedoresMovs } from "@/lib/queries";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { currencyBRL, formatDateTimeBR, formatDateBR } from "@/lib/iptv";
import { creditosPorDias, registrarMovimentacaoCredito } from "@/lib/creditos";
import { History, Download, Users, Store, Undo2, CheckCircle2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { confirmDialog } from "@/lib/confirm";
import { logAudit } from "@/lib/audit";
import { Badge } from "@/components/ui/badge";
import { AuditoriaPage } from "./auditoria";

const searchSchema = z.object({
  sec: z.enum(["registros", "auditoria"]).catch("registros"),
});

export const Route = createFileRoute("/_authenticated/historico")({
  validateSearch: searchSchema,
  component: HistoricoWrapper,
});

function HistoricoWrapper() {
  const { sec } = Route.useSearch();
  const navigate = useNavigate({ from: "/historico" });
  return (
    <div className="p-6">
      <Tabs value={sec} onValueChange={(v) => navigate({ search: { sec: v as any }, replace: true })}>
        <TabsList className="mb-2">
          <TabsTrigger value="registros" className="gap-2">
            <History className="h-4 w-4" /> Registros
          </TabsTrigger>
          <TabsTrigger value="auditoria" className="gap-2">
            <ShieldCheck className="h-4 w-4" /> Auditoria
          </TabsTrigger>
        </TabsList>
        <TabsContent value="registros" className="-mx-6">
          <HistoricoPage />
        </TabsContent>
        <TabsContent value="auditoria" className="-mx-6">
          <AuditoriaPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function HistoricoPage() {
  const qc = useQueryClient();
  const { data: renovacoes = [] } = useQuery({ queryKey: ["historico"], queryFn: fetchHistorico });
  const { data: movsRev = [] } = useQuery({ queryKey: ["revendedores_movs"], queryFn: fetchRevendedoresMovs });
  const [tab, setTab] = useState<"clientes" | "revendedores">("clientes");
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [marcando, setMarcando] = useState<string | null>(null);

  async function marcarComoPago(h: any) {
    setMarcando(h.id);
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
      qc.invalidateQueries({ queryKey: ["historico"] });
      qc.invalidateQueries({ queryKey: ["clientes"] });
      qc.invalidateQueries({ queryKey: ["creditos_saldos"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao marcar como pago");
    } finally {
      setMarcando(null);
    }
  }

  async function cancelarRenovacao(h: any) {
    if (h.status === "cancelada") return;
    const ok = await confirmDialog({
      title: "Cancelar renovação?",
      description: `Isto irá remover ${h.dias_adicionados} dias do cliente "${h.cliente?.nome ?? "-"}", estornar ${currencyBRL(h.valor_recebido)} do faturamento e devolver os créditos utilizados. A ação não pode ser desfeita.`,
      confirmText: "Cancelar renovação",
      cancelText: "Voltar",
      destructive: true,
    });
    if (!ok) return;
    setCancelando(h.id);
    try {
      // Buscar cliente atual para reverter dias e valor
      const { data: cli, error: eCli } = await supabase
        .from("clientes")
        .select("id, data_vencimento, valor_pago, servidor_id")
        .eq("id", h.cliente_id)
        .maybeSingle();
      if (eCli) throw eCli;

      const dias = Number(h.dias_adicionados || 0);
      let novoVenc = h.vencimento_anterior as string | null;
      if (cli?.data_vencimento) {
        // Subtrai os dias adicionados a partir do vencimento atual
        const [y, m, d] = String(cli.data_vencimento).split("-").map(Number);
        const dt = new Date(y, m - 1, d);
        dt.setDate(dt.getDate() - dias);
        const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
        novoVenc = iso;
      }

      const updates: any = { data_vencimento: novoVenc };
      // Se o valor pago atual bate com o desta renovação, zera para refletir o estorno
      if (cli && Number(cli.valor_pago || 0) === Number(h.valor_recebido || 0)) {
        updates.valor_pago = 0;
        updates.status_pagamento = "devendo";
      }
      const { error: eUp } = await supabase.from("clientes").update(updates).eq("id", h.cliente_id);
      if (eUp) throw eUp;

      // Devolver créditos consumidos (movimentação positiva de ajuste)
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

      // Marcar histórico como cancelado (mantém auditoria)
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
      qc.invalidateQueries({ queryKey: ["historico"] });
      qc.invalidateQueries({ queryKey: ["clientes"] });
      qc.invalidateQueries({ queryKey: ["creditos_saldos"] });
      qc.invalidateQueries({ queryKey: ["creditos_movs"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao cancelar renovação");
    } finally {
      setCancelando(null);
    }
  }

  const vendasRev = (movsRev as any[]).filter((m) => m.tipo === "venda" && Number(m.quantidade) > 0 && m.status_venda !== "cancelada");

  function exportarClientes() {
    if (renovacoes.length === 0) return toast.error("Nada para exportar");
    const rows = (renovacoes as any[]).map((h) => ({
      Data: formatDateTimeBR(h.created_at),
      Cliente: h.cliente?.nome ?? "-",
      Dias: h.dias_adicionados,
      Créditos: creditosPorDias(Number(h.dias_adicionados || 0)),
      "Vencimento anterior": formatDateBR(h.vencimento_anterior),
      "Novo vencimento": formatDateBR(h.vencimento_novo),
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
    if (vendasRev.length === 0) return toast.error("Nada para exportar");
    const rows = vendasRev.map((m: any) => ({
      Data: formatDateTimeBR(m.created_at),
      Revendedor: m.revendedor?.nome ?? "-",
      Servidor: m.servidor?.nome ?? "-",
      Créditos: Number(m.quantidade || 0),
      Valor: Number(m.valor_pago || 0),
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
        <h1 className="text-2xl font-bold flex items-center gap-2"><History className="h-6 w-6 text-primary"/> Histórico</h1>
        <p className="text-sm text-muted-foreground">Ativações/renovações de clientes e vendas de créditos para revendedores</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <TabsList>
            <TabsTrigger value="clientes" className="gap-2"><Users className="h-4 w-4"/> Clientes ({renovacoes.length})</TabsTrigger>
            <TabsTrigger value="revendedores" className="gap-2"><Store className="h-4 w-4"/> Revendedores ({vendasRev.length})</TabsTrigger>
          </TabsList>
          <Button variant="outline" size="sm" onClick={tab === "clientes" ? exportarClientes : exportarRevendedores}>
            <Download className="h-4 w-4 mr-1"/> Exportar
          </Button>
        </div>

        <TabsContent value="clientes" className="mt-4">
          <Card className="overflow-hidden">
            <Table className={COMPACT_TABLE_CLASS}>
              <TableHeader className="bg-primary/10">
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Cliente</TableHead>
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
                {(renovacoes as any[]).map((h: any) => (
                  <TableRow key={h.id} className={h.status === "cancelada" ? "opacity-60" : ""}>
                    <TableCell className="text-xs">{formatDateTimeBR(h.created_at)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{h.cliente?.nome ?? "-"}</span>
                        {h.status === "cancelada" && <Badge variant="destructive" className="text-[10px]">Cancelada</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold text-blue-400">+{h.dias_adicionados}</TableCell>
                    <TableCell className="font-semibold text-primary">{creditosPorDias(Number(h.dias_adicionados || 0))}</TableCell>
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
                      {h.status === "cancelada" ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          {h.status_pagamento === "devendo" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-emerald-400 hover:text-emerald-300 h-8"
                              disabled={marcando === h.id}
                              onClick={() => marcarComoPago(h)}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              {marcando === h.id ? "..." : "Marcar como Pago"}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-400 hover:text-red-300 h-8"
                            disabled={cancelando === h.id}
                            onClick={() => cancelarRenovacao(h)}
                          >
                            <Undo2 className="h-4 w-4 mr-1" />
                            {cancelando === h.id ? "Cancelando..." : "Cancelar"}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {renovacoes.length === 0 && (
                  <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">Nenhuma ativação/renovação registrada.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="revendedores" className="mt-4">
          <Card className="overflow-hidden">
            <Table className={COMPACT_TABLE_CLASS}>
              <TableHeader className="bg-primary/10">
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Revendedor</TableHead>
                  <TableHead>Servidor</TableHead>
                  <TableHead>Créditos</TableHead>
                  <TableHead>Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendasRev.map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs">{formatDateTimeBR(m.created_at)}</TableCell>
                    <TableCell>{m.revendedor?.nome ?? "-"}</TableCell>
                    <TableCell>{m.servidor?.nome ?? "-"}</TableCell>
                    <TableCell className="font-semibold text-blue-400">+{Number(m.quantidade || 0)}</TableCell>
                    <TableCell className="text-emerald-400">{currencyBRL(m.valor_pago)}</TableCell>
                  </TableRow>
                ))}
                {vendasRev.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma venda para revendedores registrada.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}