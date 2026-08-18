import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { reportHeaderLines, APP_BRAND, APP_SYSTEM } from "@/lib/app-version";
import { currencyBRL } from "@/lib/iptv";

export type PagamentoRow = {
  dia: number;
  faturamento: number;
  diaria: number;
  comissao: number;
  considerado: number;
  acumulado: number;
  descricao: string;
};

export type PagamentoResumo = {
  funcionario: string;
  cargo: string;
  periodo: string;
  salarioFixo: number;
  totalRecebido: number;
  totalPrevisto: number;
};

const COLS = ["Dia", "Faturamento bruto", "Diária mínima", "Comissão do dia", "Considerado", "Acumulado", "Descrição"];

function rowValues(r: PagamentoRow) {
  return [
    String(r.dia).padStart(2, "0"),
    currencyBRL(r.faturamento),
    currencyBRL(r.diaria),
    currencyBRL(r.comissao),
    currencyBRL(r.considerado),
    currencyBRL(r.acumulado),
    r.descricao,
  ];
}

function resumoLines(res: PagamentoResumo) {
  return [
    `Funcionário: ${res.funcionario}${res.cargo ? ` (${res.cargo})` : ""}`,
    `Período: ${res.periodo}`,
    `Salário fixo: ${currencyBRL(res.salarioFixo)}`,
    `Total recebido até o momento: ${currencyBRL(res.totalRecebido)}`,
    `Total previsto para o mês: ${currencyBRL(res.totalPrevisto)}`,
  ];
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function baseName(res: PagamentoResumo) {
  return `pagamento-${res.funcionario.replace(/\s+/g, "_")}-${res.periodo.replace(/[^\w]+/g, "_")}`;
}

/* ------------------------------- TXT -------------------------------- */
export function exportTXT(rows: PagamentoRow[], res: PagamentoResumo) {
  const lines = [
    ...reportHeaderLines("PLANILHA DE PAGAMENTOS"),
    "",
    ...resumoLines(res),
    "",
    COLS.join(" | "),
    "-".repeat(90),
    ...rows.map((r) => rowValues(r).join(" | ")),
  ];
  download(new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }), `${baseName(res)}.txt`);
}

/* ------------------------------ EXCEL ------------------------------- */
export function exportXLSX(rows: PagamentoRow[], res: PagamentoResumo) {
  const aoa: any[][] = [
    ...reportHeaderLines("PLANILHA DE PAGAMENTOS").map((l) => [l]),
    [],
    ...resumoLines(res).map((l) => [l]),
    [],
    COLS,
    ...rows.map(rowValues),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 6 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 60 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pagamentos");
  XLSX.writeFile(wb, `${baseName(res)}.xlsx`);
}

/* ------------------------------- PDF -------------------------------- */
export function exportPDF(rows: PagamentoRow[], res: PagamentoResumo) {
  const pdf = new jsPDF({ orientation: "l", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 12;
  let y = margin;

  const header = reportHeaderLines("PLANILHA DE PAGAMENTOS");
  pdf.setTextColor(17, 24, 39);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.text(header[0], margin, y); y += 6;
  pdf.setFontSize(11);
  pdf.text(header[1], margin, y); y += 5;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(header[2], margin, y); y += 5;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(37, 99, 235);
  pdf.text(header[3], margin, y); y += 7;
  pdf.setTextColor(17, 24, 39);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  resumoLines(res).forEach((l) => { pdf.text(l, margin, y); y += 4.5; });
  y += 3;

  const widths = [12, 30, 28, 30, 28, 28, pageW - margin * 2 - 156];
  const drawHead = () => {
    pdf.setFont("helvetica", "bold");
    pdf.setFillColor(230, 236, 245);
    pdf.rect(margin, y - 4, pageW - margin * 2, 6, "F");
    let x = margin;
    COLS.forEach((c, i) => { pdf.text(c, x + 1, y); x += widths[i]; });
    y += 5;
    pdf.setFont("helvetica", "normal");
  };
  drawHead();

  rows.forEach((r) => {
    if (y > pageH - margin) { pdf.addPage(); y = margin + 4; drawHead(); }
    let x = margin;
    rowValues(r).forEach((v, i) => {
      const t = i === 6 ? (pdf.splitTextToSize(v, widths[i] - 2)[0] as string) : v;
      pdf.text(t, x + 1, y);
      x += widths[i];
    });
    y += 4.6;
  });

  pdf.save(`${baseName(res)}.pdf`);
}

/* ------------------------------- PNG -------------------------------- */
export function exportPNG(rows: PagamentoRow[], res: PagamentoResumo) {
  const header = reportHeaderLines("PLANILHA DE PAGAMENTOS");
  const scale = 2;
  const width = 1200;
  const padX = 40;
  const lineH = 22;
  const colX = [40, 95, 245, 390, 545, 690, 840];
  const headLines = header.length + resumoLines(res).length + 3;
  const height = 60 + (headLines + rows.length + 2) * lineH;

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = "top";
  let y = 30;

  ctx.fillStyle = "#111827";
  ctx.font = "bold 22px Arial";
  ctx.fillText(APP_BRAND, padX, y); y += 28;
  ctx.font = "bold 15px Arial";
  ctx.fillText(APP_SYSTEM, padX, y); y += 20;
  ctx.font = "13px Arial";
  ctx.fillText(header[2], padX, y); y += 24;
  ctx.fillStyle = "#2563eb";
  ctx.font = "bold 16px Arial";
  ctx.fillText("PLANILHA DE PAGAMENTOS", padX, y); y += 26;
  ctx.fillStyle = "#111827";
  ctx.font = "13px Arial";
  resumoLines(res).forEach((l) => { ctx.fillText(l, padX, y); y += lineH; });
  y += 8;

  ctx.font = "bold 13px Arial";
  COLS.forEach((c, i) => ctx.fillText(c, colX[i], y));
  y += lineH;
  ctx.strokeStyle = "#d1d5db";
  ctx.beginPath(); ctx.moveTo(padX, y - 4); ctx.lineTo(width - padX, y - 4); ctx.stroke();
  ctx.font = "12px Arial";
  rows.forEach((r) => {
    rowValues(r).forEach((v, i) => {
      const max = i === 6 ? width - padX - colX[6] : colX[i + 1] - colX[i] - 8;
      let t = v;
      while (ctx.measureText(t).width > max && t.length > 3) t = t.slice(0, -2);
      if (t !== v) t = t.slice(0, -1) + "…";
      ctx.fillText(t, colX[i], y);
    });
    y += lineH;
  });

  canvas.toBlob((b) => { if (b) download(b, `${baseName(res)}.png`); }, "image/png");
}

/* ------------------------------ DOCX -------------------------------- */
export async function exportDOCX(rows: PagamentoRow[], res: PagamentoResumo) {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, AlignmentType } =
    await import("docx");
  const header = reportHeaderLines("PLANILHA DE PAGAMENTOS");
  const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const widths = [800, 1900, 1700, 1900, 1800, 1800, 4540];
  const total = widths.reduce((a, b) => a + b, 0);

  const cell = (text: string, i: number, bold = false, fill?: string) =>
    new TableCell({
      borders,
      width: { size: widths[i], type: WidthType.DXA },
      shading: fill ? { fill, type: ShadingType.CLEAR } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ children: [new TextRun({ text, bold, size: 18 })] })],
    });

  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 20 } } } },
    sections: [
      {
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1000, right: 900, bottom: 1000, left: 900 } } },
        children: [
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: header[0], bold: true, size: 32 })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: header[1], bold: true, size: 24 })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: header[2], size: 18 })] }),
          new Paragraph({ children: [new TextRun({ text: "PLANILHA DE PAGAMENTOS", bold: true, size: 24, color: "2563EB" })], spacing: { before: 200, after: 160 } }),
          ...resumoLines(res).map((l) => new Paragraph({ children: [new TextRun({ text: l, size: 18 })] })),
          new Paragraph({ children: [new TextRun("")] }),
          new Table({
            width: { size: total, type: WidthType.DXA },
            columnWidths: widths,
            rows: [
              new TableRow({ children: COLS.map((c, i) => cell(c, i, true, "D5E8F0")) }),
              ...rows.map((r) => new TableRow({ children: rowValues(r).map((v, i) => cell(v, i)) })),
            ],
          }),
        ],
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  download(blob, `${baseName(res)}.docx`);
}
