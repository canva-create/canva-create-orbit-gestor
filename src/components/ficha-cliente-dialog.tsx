import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, FileImage, Copy, Users, ShieldCheck } from "lucide-react";
import { currencyBRL, diasParaVencer, formatDateBR, formatDateTimeBR, maskPhoneBR } from "@/lib/iptv";
import { custoCliente } from "@/lib/creditos";
import { toast } from "sonner";
import {
  exportFichaClientePDF,
  exportFichaClientePNG,
  copyFichaClienteImageToClipboard,
  type FichaModo,
} from "@/lib/ficha-cliente-generator";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cliente: any | null;
  historico: any[];
};

export function FichaClienteDialog({ open, onOpenChange, cliente, historico }: Props) {
  const { data: renovs = [] } = useQuery({
    enabled: !!cliente?.id && open,
    queryKey: ["cliente-renovacoes", cliente?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("historico_renovacoes")
        .select("*")
        .eq("cliente_id", cliente!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const custo = cliente ? custoCliente(cliente, historico) : 0;
  const lucro = cliente ? Number(cliente.valor_pago || 0) - custo : 0;
  const dias = cliente ? diasParaVencer(cliente.data_vencimento) : null;

  const geralRows: [string, string][] = cliente
    ? [
        ["Servidor", cliente.servidor?.nome ?? "-"],
        ["Data Início", formatDateTimeBR(cliente.data_inicio)],
        ["Vencimento", formatDateBR(cliente.data_vencimento)],
        ["Dias p/ Vencer", String(dias ?? "-")],
        ["Status", String(cliente.status ?? "-")],
        ["Pagamento", String(cliente.status_pagamento ?? "-")],
        ["Custo", currencyBRL(custo)],
        ["Valor Pago", currencyBRL(cliente.valor_pago)],
        ["Lucro", currencyBRL(lucro)],
      ]
    : [];

  const clienteRows: [string, string][] = cliente
    ? [
        ["Nome", String(cliente.nome ?? "-")],
        ["Telefone", cliente.telefone ? maskPhoneBR(cliente.telefone) : "-"],
        ["MAC", cliente.mac || "-"],
        ["Device", cliente.device || "-"],
        ["Aplicativo", cliente.aplicativo || "-"],
        ["Observação", cliente.observacao || "-"],
      ]
    : [];

  const eventos = useMemo(() => {
    if (!cliente) return [] as { data: string; tipo: string; descricao: string }[];
    const list: { data: string; tipo: string; descricao: string }[] = [];
    list.push({
      data: cliente.created_at,
      tipo: "Cadastro",
      descricao: `Cliente cadastrado no sistema`,
    });
    if (cliente.updated_at && cliente.updated_at !== cliente.created_at) {
      list.push({
        data: cliente.updated_at,
        tipo: "Atualização",
        descricao: "Cadastro do cliente atualizado",
      });
    }
    (renovs as any[]).forEach((r) => {
      list.push({
        data: r.created_at,
        tipo: "Renovação",
        descricao: `+${r.dias_adicionados} dias • Recebido ${currencyBRL(r.valor_recebido)} • Lucro ${currencyBRL(r.lucro)} (${formatDateBR(r.vencimento_anterior)} → ${formatDateBR(r.vencimento_novo)})`,
      });
    });
    return list.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  }, [cliente, renovs]);

  if (!cliente) return null;

  async function handleExportPNG(modo: FichaModo) {
    try {
      await exportFichaClientePNG(cliente, historico, renovs, modo);
      toast.success(`PNG da ${modo === "cliente" ? "Ficha do Cliente" : "Ficha Completa"} baixado!`);
    } catch (err: any) {
      toast.error(err?.message || "Falha ao gerar PNG");
    }
  }

  async function handleExportPDF(modo: FichaModo) {
    try {
      await exportFichaClientePDF(cliente, historico, renovs, modo);
      toast.success(`PDF da ${modo === "cliente" ? "Ficha do Cliente" : "Ficha Completa"} baixado!`);
    } catch (err: any) {
      toast.error(err?.message || "Falha ao gerar PDF");
    }
  }

  async function handleCopyImage(modo: FichaModo) {
    try {
      const ok = await copyFichaClienteImageToClipboard(cliente, historico, renovs, modo);
      if (ok) {
        toast.success(`Imagem da ${modo === "cliente" ? "Ficha do Cliente" : "Ficha Completa"} copiada! Cole no WhatsApp com Ctrl + V.`);
      } else {
        toast.error("Seu navegador não suporta cópia direta de imagem. Use o botão 'PNG'.");
      }
    } catch {
      toast.error("Erro ao copiar imagem.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ficha do Cliente</DialogTitle>
          <DialogDescription>Dados cadastrais, métricas operacionais e histórico da linha</DialogDescription>
        </DialogHeader>

        {/* Duas colunas de ações: Ficha do Cliente (Para Envio) e Ficha Completa (Controle Interno) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-lg border bg-muted/40">
          {/* Coluna 1: Ficha para o Cliente (Para Envio / WhatsApp) */}
          <div className="flex flex-col justify-between space-y-2 p-3 rounded-md border bg-card/60">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Users className="h-4 w-4 text-sky-500" />
                <span>Ficha do Cliente (Para Envio / WhatsApp)</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-tight">
                Versão resumida e limpa, <strong>sem custos de crédito e sem lucros</strong>.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleExportPDF("cliente")}
                className="h-8 px-2.5 text-xs font-medium text-sky-500 hover:bg-sky-500/10 hover:text-sky-400"
              >
                <FileText className="h-3.5 w-3.5 mr-1 text-sky-500" /> PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleExportPNG("cliente")}
                className="h-8 px-2.5 text-xs font-medium text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"
              >
                <FileImage className="h-3.5 w-3.5 mr-1 text-emerald-500" /> PNG
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleCopyImage("cliente")}
                title="Copiar imagem resumida da ficha para colar no WhatsApp com Ctrl + V"
                className="h-8 px-2.5 text-xs font-medium text-cyan-500 hover:bg-cyan-500/10 hover:text-cyan-400"
              >
                <Copy className="h-3.5 w-3.5 mr-1 text-cyan-500" /> Copiar Imagem
              </Button>
            </div>
          </div>

          {/* Coluna 2: Ficha Completa (Controle Interno / Gestão) */}
          <div className="flex flex-col justify-between space-y-2 p-3 rounded-md border bg-card/60">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <span>Ficha Completa (Controle Interno)</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-tight">
                Completa com <strong>servidor, custos, valor pago, lucro, credenciais e histórico</strong>.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleExportPDF("completo")}
                className="h-8 px-2.5 text-xs font-medium text-primary hover:bg-primary/10"
              >
                <FileText className="h-3.5 w-3.5 mr-1 text-primary" /> PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleExportPNG("completo")}
                className="h-8 px-2.5 text-xs font-medium text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"
              >
                <FileImage className="h-3.5 w-3.5 mr-1 text-emerald-500" /> PNG
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleCopyImage("completo")}
                title="Copiar imagem completa da ficha para colar no WhatsApp com Ctrl + V"
                className="h-8 px-2.5 text-xs font-medium text-indigo-500 hover:bg-indigo-500/10 hover:text-indigo-400"
              >
                <Copy className="h-3.5 w-3.5 mr-1 text-indigo-500" /> Copiar Imagem
              </Button>
            </div>
          </div>
        </div>

        <div id="ficha-print-area" className="space-y-4 bg-background p-4 rounded-md">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold">{cliente.nome}</h3>
              <Badge variant="outline">{cliente.status}</Badge>
            </div>
            <h4 className="text-sm font-semibold text-primary mb-2">Geral</h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {geralRows.map(([k, v]) => <Info key={k} label={k} value={v} />)}
            </div>
          </Card>

          <Card className="p-4">
            <h4 className="text-sm font-semibold text-primary mb-2">Cliente</h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {clienteRows.filter(([k]) => k !== "Observação").map(([k, v]) => <Info key={k} label={k} value={v} />)}
            </div>
            {cliente.observacao && (
              <div className="mt-3 text-sm">
                <div className="text-muted-foreground text-xs">Observação</div>
                <div>{cliente.observacao}</div>
              </div>
            )}
          </Card>

          <Card className="p-4">
            <h4 className="font-semibold mb-2">Histórico do Cliente</h4>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eventos.map((e, i) => (
                    <TableRow key={i} className="text-xs">
                      <TableCell className="whitespace-nowrap">{formatDateTimeBR(e.data)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{e.tipo}</Badge>
                      </TableCell>
                      <TableCell>{e.descricao}</TableCell>
                    </TableRow>
                  ))}
                  {eventos.length === 0 && (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4">Nenhum evento registrado</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}