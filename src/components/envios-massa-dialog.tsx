import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { FileSpreadsheet, FileText, Send } from "lucide-react";
import { toast } from "sonner";
import { diasParaVencer, maskPhoneBR } from "@/lib/iptv";
import { reportHeaderLines } from "@/lib/app-version";
import { logAudit } from "@/lib/audit";

type Periodo = { key: string; label: string; dias: number };

const PERIODOS: Periodo[] = [
  { key: "v2", label: "Vencidos há 2 dias", dias: -2 },
  { key: "v1", label: "Vencidos há 1 dia", dias: -1 },
  { key: "hoje", label: "Vencem hoje", dias: 0 },
  { key: "a1", label: "Ativos — vencem em 1 dia", dias: 1 },
  { key: "a2", label: "Ativos — vencem em 2 dias", dias: 2 },
];

export function EnviosMassaDialog({ clientes }: { clientes: any[] }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set(["v2", "v1", "hoje"]));
  const [custom, setCustom] = useState("");

  const customDias = useMemo(
    () =>
      custom
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^-?\d+$/.test(s))
        .map(Number),
    [custom],
  );

  const diasSelecionados = useMemo(() => {
    const base = PERIODOS.filter((p) => sel.has(p.key)).map((p) => p.dias);
    return Array.from(new Set([...base, ...customDias])).sort((a, b) => a - b);
  }, [sel, customDias]);

  const contagem = useMemo(() => {
    const m: Record<number, number> = {};
    clientes.forEach((c: any) => {
      const d = diasParaVencer(c.data_vencimento);
      if (d === null) return;
      m[d] = (m[d] ?? 0) + 1;
    });
    return m;
  }, [clientes]);

  const linhas = useMemo(() => {
    if (!diasSelecionados.length) return [];
    const set = new Set(diasSelecionados);
    return clientes
      .filter((c: any) => {
        const d = diasParaVencer(c.data_vencimento);
        return d !== null && set.has(d);
      })
      .map((c: any) => ({ NOMES: c.nome ?? "", NUMERO: c.telefone ? maskPhoneBR(c.telefone) : "" }))
      .sort((a, b) => a.NOMES.localeCompare(b.NOMES, "pt-BR", { sensitivity: "base" }));
  }, [clientes, diasSelecionados]);

  const rotulo = () => {
    const nomes = PERIODOS.filter((p) => sel.has(p.key)).map((p) => p.label);
    if (customDias.length) nomes.push(`Personalizado (${customDias.join(", ")} dias)`);
    return nomes.join(" • ") || "Sem período";
  };

  const stamp = () => new Date().toISOString().slice(0, 10);

  const toggle = (k: string) =>
    setSel((prev) => {
      const n = new Set(prev);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  function exportXLSX() {
    if (!linhas.length) return toast.error("Nenhum cliente no período selecionado.");
    const ws = XLSX.utils.json_to_sheet(linhas, { header: ["NOMES", "NUMERO"] });
    ws["!cols"] = [{ wch: 38 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Envios em massa");
    XLSX.writeFile(wb, `envios-em-massa-${stamp()}.xlsx`);
    toast.success(`Excel gerado com ${linhas.length} cliente(s)`);
    logAudit({ categoria: "exportacao", acao: "exportar", descricao: `Envios em massa (Excel) — ${rotulo()}`, entidade: "clientes", metadata: { dias: diasSelecionados, total: linhas.length } });
  }

  function exportPDF() {
    if (!linhas.length) return toast.error("Nenhum cliente no período selecionado.");
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 14;
    const header = reportHeaderLines("ENVIOS EM MASSA");
    let y = margin;
    pdf.setTextColor(17, 24, 39);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(15); pdf.text(header[0], margin, y); y += 6;
    pdf.setFontSize(11); pdf.text(header[1], margin, y); y += 5;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.text(header[2], margin, y); y += 5;
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(12); pdf.setTextColor(37, 99, 235);
    pdf.text(header[3], margin, y); y += 6;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(90);
    pdf.splitTextToSize(`${rotulo()} — ${linhas.length} cliente(s)`, pageW - margin * 2)
      .forEach((l: string) => { pdf.text(l, margin, y); y += 4; });
    y += 4;

    const colW = (pageW - margin * 2) / 2;
    const drawHead = () => {
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(9); pdf.setTextColor(17, 24, 39);
      pdf.setFillColor(230, 236, 245);
      pdf.rect(margin, y - 4.5, pageW - margin * 2, 6.5, "F");
      pdf.text("NOMES", margin + 1.5, y);
      pdf.text("NUMERO", margin + colW + 1.5, y);
      y += 6;
      pdf.setFont("helvetica", "normal");
    };
    drawHead();
    linhas.forEach((r) => {
      if (y > pageH - margin) { pdf.addPage(); y = margin + 4; drawHead(); }
      pdf.text(pdf.splitTextToSize(r.NOMES, colW - 3)[0] ?? "", margin + 1.5, y);
      pdf.text(r.NUMERO, margin + colW + 1.5, y);
      y += 5;
    });
    pdf.save(`envios-em-massa-${stamp()}.pdf`);
    toast.success(`PDF gerado com ${linhas.length} cliente(s)`);
    logAudit({ categoria: "exportacao", acao: "exportar", descricao: `Envios em massa (PDF) — ${rotulo()}`, entidade: "clientes", metadata: { dias: diasSelecionados, total: linhas.length } });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Send className="h-4 w-4 mr-1" /> Envios em Massa
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Send className="h-4 w-4" /> Envios em Massa</DialogTitle>
            <DialogDescription>
              Selecione os períodos de vencimento e baixe a lista em Excel ou PDF (colunas NOMES e NUMERO, em ordem alfabética).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {PERIODOS.map((p) => (
              <Card
                key={p.key}
                onClick={() => toggle(p.key)}
                className={`p-2 flex items-center justify-between gap-2 cursor-pointer transition-colors ${sel.has(p.key) ? "border-primary bg-primary/5" : ""}`}
              >
                <div className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={sel.has(p.key)} readOnly className="pointer-events-none" />
                  {p.label}
                </div>
                <Badge variant="secondary">{contagem[p.dias] ?? 0}</Badge>
              </Card>
            ))}

            <div className="space-y-1 pt-1">
              <Label className="text-xs">Personalizar dias (negativo = vencido). Ex.: -5, 3, 7</Label>
              <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="-5, 3, 7" className="h-9" />
            </div>

            <div className="text-xs text-muted-foreground pt-1">
              Total selecionado: <span className="font-semibold text-foreground">{linhas.length}</span> cliente(s)
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={exportXLSX} disabled={!linhas.length}>
              <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
            </Button>
            <Button size="sm" onClick={exportPDF} disabled={!linhas.length}>
              <FileText className="h-4 w-4 mr-1" /> PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
