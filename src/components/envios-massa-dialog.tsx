import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { FileSpreadsheet, FileText, Send, CheckSquare, Square, Calendar } from "lucide-react";
import { toast } from "sonner";
import { diasParaVencer, formatDateBR, maskPhoneBR } from "@/lib/iptv";
import { reportHeaderLines } from "@/lib/app-version";
import { logAudit } from "@/lib/audit";
import { cn } from "@/lib/utils";

type Periodo = { key: string; label: string; dias: number };

const PERIODOS: Periodo[] = [
  { key: "v2", label: "Vencidos há 2 dias", dias: -2 },
  { key: "v1", label: "Vencido há 1 dia", dias: -1 },
  { key: "hoje", label: "Vence hoje", dias: 0 },
  { key: "a1", label: "Vence em 1 dia", dias: 1 },
  { key: "a2", label: "Vence em 2 dias", dias: 2 },
];

function formatPhoneWhatsApp(phone: any): string {
  const raw = String(phone || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (raw.startsWith("+") || digits.length > 11) {
    return digits;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}

export interface EnviosMassaDialogProps {
  clientes?: any[];
  trigger?: React.ReactNode;
}

export function EnviosMassaDialog({ clientes = [], trigger }: EnviosMassaDialogProps) {
  const [open, setOpen] = useState(false);
  const [selPeriodos, setSelPeriodos] = useState<Set<string>>(new Set(["v1"]));

  useEffect(() => {
    if (open) {
      setSelPeriodos(new Set(["v1"]));
    }
  }, [open]);

  // Lista base segura
  const listClientes = useMemo(
    () => (Array.isArray(clientes) ? clientes.filter(Boolean) : []),
    [clientes]
  );

  // Contagem por dia de vencimento
  const contagem = useMemo(() => {
    const m: Record<number, number> = {};
    listClientes.forEach((c: any) => {
      const d = diasParaVencer(c.data_vencimento);
      if (d === null) return;
      m[d] = (m[d] ?? 0) + 1;
    });
    return m;
  }, [listClientes]);

  // Dias selecionados
  const diasSelecionados = useMemo(() => {
    return PERIODOS.filter((p) => selPeriodos.has(p.key)).map((p) => p.dias);
  }, [selPeriodos]);

  // Clientes filtrados pelos períodos selecionados
  const clientesSelecionados = useMemo(() => {
    if (diasSelecionados.length === 0) return [];
    const setDias = new Set(diasSelecionados);
    return listClientes
      .filter((c: any) => {
        const d = diasParaVencer(c.data_vencimento);
        return d !== null && setDias.has(d);
      })
      .sort((a: any, b: any) => {
        const va = a.data_vencimento ? new Date(a.data_vencimento).getTime() : Infinity;
        const vb = b.data_vencimento ? new Date(b.data_vencimento).getTime() : Infinity;
        if (va !== vb) return va - vb;
        return String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR", {
          sensitivity: "base",
        });
      });
  }, [listClientes, diasSelecionados]);

  // Contadores de Ativos e Vencidos
  const totalSelecionado = clientesSelecionados.length;
  const totalAtivos = useMemo(() => {
    return clientesSelecionados.filter((c: any) => {
      const d = diasParaVencer(c.data_vencimento);
      return d === null || d >= 0;
    }).length;
  }, [clientesSelecionados]);
  const totalVencidos = totalSelecionado - totalAtivos;

  const togglePeriodo = (key: string) => {
    setSelPeriodos((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const rotuloFiltros = () => {
    const periodos = PERIODOS.filter((p) => selPeriodos.has(p.key)).map((p) => p.label);
    return periodos.length > 0 ? periodos.join(" + ") : "nenhum";
  };

  // Linhas formatadas para exportação exclusiva de duas colunas: Nome e Número (com DDI 55 limpo para WhatsApp)
  const linhasExport = useMemo(() => {
    return clientesSelecionados.map((c: any) => ({
      Nome: (c.nome ?? "").trim(),
      Número: formatPhoneWhatsApp(c.telefone),
    }));
  }, [clientesSelecionados]);

  const stamp = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  };

  // Exportação Excel (.xlsx)
  const exportXLSX = () => {
    if (!linhasExport.length) return toast.info("Nenhum cliente selecionado nos períodos.");

    const ws = XLSX.utils.json_to_sheet(linhasExport, {
      header: ["Nome", "Número"],
    });

    ws["!cols"] = [
      { wch: 36 }, // Nome
      { wch: 22 }, // Número
    ];

    // Forçar formatação de texto na coluna Número para evitar notação científica (ex: 5.51E+12)
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1:B1");
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: 1 });
      const cell = ws[cellAddress];
      if (cell && cell.v !== undefined) {
        cell.t = "s";
        cell.v = String(cell.v);
        cell.z = "@";
      }
    }

    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: linhasExport.length, c: 1 },
      }),
    };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Envios");
    XLSX.writeFile(wb, `envios-em-massa-${stamp()}.xlsx`);

    toast.success(
      `Planilha gerada com ${linhasExport.length} cliente(s) (${totalAtivos} ativos, ${totalVencidos} vencidos)`
    );
    logAudit({
      categoria: "exportacao",
      acao: "exportar",
      descricao: `Envios em massa (XLSX) — ${rotuloFiltros()}`,
      entidade: "clientes",
      metadata: { total: linhasExport.length, ativos: totalAtivos, vencidos: totalVencidos },
    });
  };

  // Exportação CSV (.csv)
  const exportCSV = () => {
    if (!linhasExport.length) return toast.info("Nenhum cliente selecionado nos períodos.");

    const ws = XLSX.utils.json_to_sheet(linhasExport, {
      header: ["Nome", "Número"],
    });
    const csvContent = XLSX.utils.sheet_to_csv(ws);
    // Adiciona BOM UTF-8 (\uFEFF) para abrir com acentuação correta no Excel/Windows
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `envios-em-massa-${stamp()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(
      `Arquivo CSV gerado com ${linhasExport.length} cliente(s) (${totalAtivos} ativos, ${totalVencidos} vencidos)`
    );
    logAudit({
      categoria: "exportacao",
      acao: "exportar",
      descricao: `Envios em massa (CSV) — ${rotuloFiltros()}`,
      entidade: "clientes",
      metadata: { total: linhasExport.length, ativos: totalAtivos, vencidos: totalVencidos },
    });
  };

  // Exportação PDF (.pdf)
  const exportPDF = () => {
    if (!linhasExport.length) return toast.info("Nenhum cliente selecionado nos períodos.");

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 12;
    let y = margin;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.text("Envios em Massa — Rodolfo TV", margin, y);
    y += 5;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(100);
    pdf.text(
      `Filtros: ${rotuloFiltros()}  |  Total: ${linhasExport.length} clientes (${totalAtivos} ativos, ${totalVencidos} vencidos)`,
      margin,
      y
    );
    y += 4;
    pdf.text(
      `Gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}`,
      margin,
      y
    );
    y += 6;

    const colWNome = 110;
    const colWNumero = pageW - margin * 2 - colWNome;

    const drawHead = () => {
      pdf.setFillColor(243, 244, 246);
      pdf.rect(margin, y - 4, pageW - margin * 2, 6, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8.5);
      pdf.setTextColor(31, 41, 55);

      let curX = margin + 1.5;
      pdf.text("NOME", curX, y);
      curX += colWNome;
      pdf.text("NÚMERO", curX, y);

      y += 6;
      pdf.setFont("helvetica", "normal");
    };

    drawHead();

    linhasExport.forEach((r) => {
      if (y > pageH - margin) {
        pdf.addPage();
        y = margin + 4;
        drawHead();
      }

      let curX = margin + 1.5;
      pdf.setTextColor(17, 24, 39);
      pdf.text(pdf.splitTextToSize(r.Nome, colWNome - 4)[0] ?? "", curX, y);
      curX += colWNome;

      pdf.text(r.Número, curX, y);

      y += 5.5;
    });

    pdf.save(`envios-em-massa-${stamp()}.pdf`);
    toast.success(
      `PDF gerado com ${linhasExport.length} cliente(s) (${totalAtivos} ativos, ${totalVencidos} vencidos)`
    );
    logAudit({
      categoria: "exportacao",
      acao: "exportar",
      descricao: `Envios em massa (PDF) — ${rotuloFiltros()}`,
      entidade: "clientes",
      metadata: { total: linhasExport.length, ativos: totalAtivos, vencidos: totalVencidos },
    });
  };

  return (
    <>
      {trigger ? (
        <span onClick={() => setOpen(true)} className="inline-flex cursor-pointer">
          {trigger}
        </span>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1">
          <Send className="h-4 w-4 text-primary" /> Envios em Massa
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" /> Envios em Massa
            </DialogTitle>
            <DialogDescription>
              Selecione os períodos de vencimento para gerar a lista de lembretes e avisos aos clientes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {/* Os 5 Períodos de Vencimento Específicos */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                Períodos de Vencimento
              </Label>

              <div className="space-y-2">
                {PERIODOS.map((p) => {
                  const isChecked = selPeriodos.has(p.key);
                  return (
                    <Card
                      key={p.key}
                      onClick={() => togglePeriodo(p.key)}
                      className={cn(
                        "p-2.5 flex items-center justify-between gap-2 cursor-pointer transition-colors border",
                        isChecked ? "border-primary bg-primary/10 shadow-xs" : "hover:border-border/80 bg-card/60"
                      )}
                    >
                      <div className="flex items-center gap-2.5 text-xs sm:text-sm font-medium">
                        {isChecked ? (
                          <CheckSquare className="h-4 w-4 text-primary shrink-0" />
                        ) : (
                          <Square className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <span>{p.label}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs font-semibold">
                        {contagem[p.dias] ?? 0}
                      </Badge>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* Banner de Resumo da Seleção com Ativos e Vencidos */}
            <div className="rounded-lg bg-muted/40 border border-border/70 p-2.5 flex items-center justify-between gap-2 flex-wrap text-xs">
              <div className="space-y-0.5">
                <span className="text-muted-foreground block text-[11px]">
                  Total selecionado para o arquivo:
                </span>
                <span className="font-bold text-sm text-foreground">
                  {totalSelecionado} cliente(s)
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-semibold py-0.5">
                  {totalAtivos} Ativos
                </Badge>
                <Badge className="bg-red-500/15 text-red-400 border border-red-500/30 text-xs font-semibold py-0.5">
                  {totalVencidos} Vencidos
                </Badge>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground leading-normal">
              💡 <strong>Formato otimizado:</strong> O arquivo traz exclusivamente as duas colunas <code>Nome</code> e <code>Número</code>, com o telefone com código do país (55) em formato texto, 100% pronto para importação em disparadores de WhatsApp.
            </p>
          </div>

          <DialogFooter className="gap-2 pt-2 border-t border-border/50 flex flex-wrap sm:flex-nowrap justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={exportCSV}
              disabled={!linhasExport.length}
              className="gap-1.5"
            >
              <FileText className="h-4 w-4 text-blue-500" /> Baixar CSV (.csv)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportXLSX}
              disabled={!linhasExport.length}
              className="gap-1.5"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-500" /> Baixar Excel (.xlsx)
            </Button>
            <Button
              size="sm"
              onClick={exportPDF}
              disabled={!linhasExport.length}
              className="gap-1.5"
            >
              <FileText className="h-4 w-4" /> Baixar PDF (.pdf)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
