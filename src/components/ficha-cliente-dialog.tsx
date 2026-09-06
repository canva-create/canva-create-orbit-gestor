import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, FileImage, FileSpreadsheet, FileDown, Copy } from "lucide-react";
import { currencyBRL, diasParaVencer, formatDateBR, formatDateTimeBR, maskPhoneBR } from "@/lib/iptv";
import { custoCliente } from "@/lib/creditos";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { exportFichaClientePDF, exportFichaClientePNG, copyFichaClienteImageToClipboard } from "@/lib/ficha-cliente-generator";

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
  const safeName = String(cliente.nome ?? "cliente").replace(/\s+/g, "_");

  function fichaTexto() {
    const fmt = (rows: [string, string][]) =>
      rows.map(([k, v]) => `${k.padEnd(16, " ")}${v}`).join("\n");
    return [
      "===== FICHA DO CLIENTE =====",
      "",
      "--- GERAL ---",
      fmt(geralRows),
      "",
      "--- CLIENTE ---",
      fmt(clienteRows),
      "",
      "--- HISTÓRICO ---",
      ...eventos.map((e) => `[${formatDateTimeBR(e.data)}] ${e.tipo}: ${e.descricao}`),
      "============================",
    ].join("\n");
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportTXT() {
    downloadBlob(new Blob([fichaTexto()], { type: "text/plain;charset=utf-8" }), `ficha-${safeName}.txt`);
    toast.success("TXT baixado");
  }

  function exportXLSX() {
    const geral = geralRows.map(([Campo, Valor]) => ({ Campo, Valor }));
    const cli = clienteRows.map(([Campo, Valor]) => ({ Campo, Valor }));
    const evts = eventos.map((e) => ({
      Data: formatDateTimeBR(e.data),
      Tipo: e.tipo,
      Descrição: e.descricao,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(geral), "Geral");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cli), "Cliente");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(evts), "Histórico");
    XLSX.writeFile(wb, `ficha-${safeName}.xlsx`);
    toast.success("Excel baixado");
  }

  async function exportPNG() {
    try {
      await exportFichaClientePNG(cliente, historico, renovs);
      toast.success("PNG baixado com sucesso!");
    } catch (err: any) {
      toast.error(err?.message || "Falha ao gerar PNG");
    }
  }

  async function exportPDF() {
    try {
      await exportFichaClientePDF(cliente, historico, renovs);
      toast.success("PDF baixado com sucesso!");
    } catch (err: any) {
      toast.error(err?.message || "Falha ao gerar PDF");
    }
  }

  async function handleCopyImage() {
    try {
      const ok = await copyFichaClienteImageToClipboard(cliente, historico, renovs);
      if (ok) {
        toast.success("Imagem copiada! Cole no WhatsApp com Ctrl + V.");
      } else {
        toast.error("Seu navegador não suporta cópia direta de imagem para a área de transferência. Use 'PNG'.");
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
          <DialogDescription>Dados completos e histórico de eventos</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={exportPDF} className="h-8 gap-1.5 text-xs font-medium text-primary hover:bg-primary/10">
            <FileText className="h-3.5 w-3.5 text-primary" /> PDF
          </Button>
          <Button size="sm" variant="outline" onClick={exportPNG} className="h-8 gap-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/10">
            <FileImage className="h-3.5 w-3.5 text-emerald-400" /> PNG
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopyImage}
            title="Copiar imagem da ficha para colar no WhatsApp com Ctrl + V"
            className="h-8 gap-1.5 text-xs font-medium text-cyan-400 hover:bg-cyan-500/10 hover:text-cyan-300"
          >
            <Copy className="h-3.5 w-3.5 text-cyan-400" /> Copiar Imagem
          </Button>
          <Button size="sm" variant="outline" onClick={exportXLSX} className="h-8 gap-1.5 text-xs font-medium">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
          </Button>
          <Button size="sm" variant="outline" onClick={exportTXT} className="h-8 gap-1.5 text-xs font-medium">
            <FileDown className="h-3.5 w-3.5" /> TXT
          </Button>
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