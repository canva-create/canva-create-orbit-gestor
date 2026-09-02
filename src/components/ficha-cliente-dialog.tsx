import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, FileImage, FileSpreadsheet, FileDown } from "lucide-react";
import { currencyBRL, diasParaVencer, formatDateBR, formatDateTimeBR, maskPhoneBR } from "@/lib/iptv";
import { custoCliente } from "@/lib/creditos";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";

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
        .select("id, created_at, dias_adicionados, valor_recebido, lucro, vencimento_anterior, vencimento_novo")
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

  // Build a printable text layout using native canvas/jsPDF (no html2canvas).
  // Tailwind v4 uses oklch() colors that html2canvas cannot parse, which
  // was silently breaking PDF/PNG exports.
  function buildLines() {
    const lines: { text: string; bold?: boolean; heading?: boolean }[] = [];
    lines.push({ text: "FICHA DO CLIENTE", heading: true });
    lines.push({ text: cliente.nome, bold: true });
    lines.push({ text: "" });
    lines.push({ text: "GERAL", heading: true });
    geralRows.forEach(([k, v]) => lines.push({ text: `${k}: ${v}` }));
    lines.push({ text: "" });
    lines.push({ text: "CLIENTE", heading: true });
    clienteRows.forEach(([k, v]) => lines.push({ text: `${k}: ${v}` }));
    lines.push({ text: "" });
    lines.push({ text: "HISTÓRICO", heading: true });
    if (eventos.length === 0) {
      lines.push({ text: "Nenhum evento registrado" });
    } else {
      eventos.forEach((e) =>
        lines.push({ text: `[${formatDateTimeBR(e.data)}] ${e.tipo} — ${e.descricao}` }),
      );
    }
    return lines;
  }

  function exportPNG() {
    const lines = buildLines();
    const scale = 2;
    const width = 900;
    const paddingX = 40;
    const paddingY = 40;
    const lineH = 24;
    const maxWidth = width - paddingX * 2;

    const measureCanvas = document.createElement("canvas");
    const mctx = measureCanvas.getContext("2d")!;
    mctx.font = "14px Arial, sans-serif";

    const wrapped: { text: string; bold?: boolean; heading?: boolean }[] = [];
    lines.forEach((l) => {
      mctx.font = l.heading ? "bold 18px Arial" : l.bold ? "bold 14px Arial" : "14px Arial";
      if (!l.text) { wrapped.push(l); return; }
      const words = l.text.split(" ");
      let cur = "";
      words.forEach((w) => {
        const test = cur ? cur + " " + w : w;
        if (mctx.measureText(test).width > maxWidth && cur) {
          wrapped.push({ ...l, text: cur });
          cur = w;
        } else cur = test;
      });
      if (cur) wrapped.push({ ...l, text: cur });
    });

    const height = paddingY * 2 + wrapped.length * lineH;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#111827";
    ctx.textBaseline = "top";
    let y = paddingY;
    wrapped.forEach((l) => {
      if (l.heading) {
        ctx.fillStyle = "#2563eb";
        ctx.font = "bold 18px Arial";
      } else if (l.bold) {
        ctx.fillStyle = "#111827";
        ctx.font = "bold 14px Arial";
      } else {
        ctx.fillStyle = "#111827";
        ctx.font = "14px Arial";
      }
      ctx.fillText(l.text, paddingX, y);
      y += lineH;
    });
    canvas.toBlob((blob) => {
      if (blob) {
        downloadBlob(blob, `ficha-${safeName}.png`);
        toast.success("PNG baixado");
      } else {
        toast.error("Falha ao gerar PNG");
      }
    }, "image/png");
  }

  function exportPDF() {
    const lines = buildLines();
    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 15;
    const maxWidth = pageW - margin * 2;
    let y = margin;

    const nextLine = (h: number) => {
      if (y + h > pageH - margin) {
        pdf.addPage();
        y = margin;
      }
    };

    lines.forEach((l) => {
      if (!l.text) { y += 4; return; }
      if (l.heading) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(13);
        pdf.setTextColor(37, 99, 235);
      } else if (l.bold) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.setTextColor(17, 24, 39);
      } else {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(10);
        pdf.setTextColor(17, 24, 39);
      }
      const wrapped: string[] = pdf.splitTextToSize(l.text, maxWidth);
      wrapped.forEach((w) => {
        const h = l.heading ? 7 : 6;
        nextLine(h);
        pdf.text(w, margin, y);
        y += h;
      });
      if (l.heading) y += 1;
    });

    pdf.save(`ficha-${safeName}.pdf`);
    toast.success("PDF baixado");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ficha do Cliente</DialogTitle>
          <DialogDescription>Dados completos e histórico de eventos</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={exportPDF}><FileText className="h-4 w-4 mr-1"/> PDF</Button>
          <Button size="sm" variant="outline" onClick={exportPNG}><FileImage className="h-4 w-4 mr-1"/> PNG</Button>
          <Button size="sm" variant="outline" onClick={exportXLSX}><FileSpreadsheet className="h-4 w-4 mr-1"/> Excel</Button>
          <Button size="sm" variant="outline" onClick={exportTXT}><FileDown className="h-4 w-4 mr-1"/> TXT</Button>
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