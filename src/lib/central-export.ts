import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { reportHeaderLines, APP_BRAND, APP_SYSTEM } from "@/lib/app-version";

export type ExportSection = {
  /** Nome da seção / relatório */
  title: string;
  /** Descrição clara do conteúdo exportado */
  description: string;
  columns: string[];
  rows: (string | number)[][];
};

export type ExportFormat = "pdf" | "xlsx" | "docx" | "txt" | "png";

const fmt = (v: string | number) => (typeof v === "number" ? String(v) : v ?? "");

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

export function fileStamp() {
  return new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
}

/* --------------------------------- TXT --------------------------------- */
function exportTXT(sections: ExportSection[], reportName: string, file: string) {
  const lines: string[] = [...reportHeaderLines(reportName.toUpperCase()), ""];
  sections.forEach((s) => {
    lines.push(`== ${s.title.toUpperCase()} ==`, s.description, "", s.columns.join(" | "), "-".repeat(90));
    s.rows.forEach((r) => lines.push(r.map(fmt).join(" | ")));
    lines.push("");
  });
  download(new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }), `${file}.txt`);
}

/* -------------------------------- XLSX --------------------------------- */
function exportXLSX(sections: ExportSection[], reportName: string, file: string) {
  const wb = XLSX.utils.book_new();
  sections.forEach((s, idx) => {
    const aoa: any[][] = [
      ...reportHeaderLines(reportName.toUpperCase()).map((l) => [l]),
      [s.title],
      [s.description],
      [],
      s.columns,
      ...s.rows,
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = s.columns.map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(wb, ws, (s.title || `Seção ${idx + 1}`).slice(0, 31));
  });
  XLSX.writeFile(wb, `${file}.xlsx`);
}

/* --------------------------------- PDF --------------------------------- */
function exportPDF(sections: ExportSection[], reportName: string, file: string) {
  const pdf = new jsPDF({ orientation: "l", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 12;
  let y = margin;

  const header = reportHeaderLines(reportName.toUpperCase());
  pdf.setTextColor(17, 24, 39);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(15);
  pdf.text(header[0], margin, y); y += 6;
  pdf.setFontSize(11); pdf.text(header[1], margin, y); y += 5;
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(9);
  pdf.text(header[2], margin, y); y += 5;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(12); pdf.setTextColor(37, 99, 235);
  pdf.text(header[3], margin, y); y += 8;

  sections.forEach((s) => {
    if (y > pageH - margin - 20) { pdf.addPage(); y = margin; }
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(11); pdf.setTextColor(37, 99, 235);
    pdf.text(s.title, margin, y); y += 5;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(90);
    pdf.splitTextToSize(s.description, pageW - margin * 2).forEach((l: string) => { pdf.text(l, margin, y); y += 4; });
    y += 2;

    const colW = (pageW - margin * 2) / s.columns.length;
    const drawHead = () => {
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.setTextColor(17, 24, 39);
      pdf.setFillColor(230, 236, 245);
      pdf.rect(margin, y - 4, pageW - margin * 2, 6, "F");
      s.columns.forEach((c, i) => pdf.text(String(c), margin + i * colW + 1, y));
      y += 5;
      pdf.setFont("helvetica", "normal");
    };
    drawHead();
    s.rows.forEach((r) => {
      if (y > pageH - margin) { pdf.addPage(); y = margin + 4; drawHead(); }
      r.forEach((v, i) => {
        const t = pdf.splitTextToSize(fmt(v), colW - 2)[0] as string;
        pdf.text(t ?? "", margin + i * colW + 1, y);
      });
      y += 4.4;
    });
    y += 6;
  });

  pdf.save(`${file}.pdf`);
}

/* --------------------------------- PNG --------------------------------- */
function exportPNG(sections: ExportSection[], reportName: string, file: string) {
  const header = reportHeaderLines(reportName.toUpperCase());
  const scale = 2;
  const width = 1400;
  const padX = 40;
  const lineH = 20;
  const totalLines =
    header.length + 3 + sections.reduce((s, sec) => s + 4 + sec.rows.length, 0);
  const height = 60 + totalLines * lineH;

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = "top";
  let y = 30;

  ctx.fillStyle = "#111827"; ctx.font = "bold 22px Arial";
  ctx.fillText(APP_BRAND, padX, y); y += 28;
  ctx.font = "bold 15px Arial"; ctx.fillText(APP_SYSTEM, padX, y); y += 20;
  ctx.font = "13px Arial"; ctx.fillText(header[2], padX, y); y += 22;
  ctx.fillStyle = "#2563eb"; ctx.font = "bold 16px Arial";
  ctx.fillText(reportName.toUpperCase(), padX, y); y += 28;

  sections.forEach((s) => {
    ctx.fillStyle = "#2563eb"; ctx.font = "bold 14px Arial";
    ctx.fillText(s.title, padX, y); y += lineH;
    ctx.fillStyle = "#6b7280"; ctx.font = "12px Arial";
    ctx.fillText(s.description, padX, y); y += lineH;

    const colW = (width - padX * 2) / s.columns.length;
    const clip = (t: string, max: number) => {
      let out = t;
      while (ctx.measureText(out).width > max && out.length > 3) out = out.slice(0, -2);
      return out === t ? t : out + "…";
    };
    ctx.fillStyle = "#111827"; ctx.font = "bold 12px Arial";
    s.columns.forEach((c, i) => ctx.fillText(clip(String(c), colW - 8), padX + i * colW, y));
    y += lineH;
    ctx.strokeStyle = "#d1d5db";
    ctx.beginPath(); ctx.moveTo(padX, y - 4); ctx.lineTo(width - padX, y - 4); ctx.stroke();
    ctx.font = "12px Arial";
    s.rows.forEach((r) => {
      r.forEach((v, i) => ctx.fillText(clip(fmt(v), colW - 8), padX + i * colW, y));
      y += lineH;
    });
    y += lineH;
  });

  canvas.toBlob((b) => { if (b) download(b, `${file}.png`); }, "image/png");
}

/* -------------------------------- DOCX --------------------------------- */
async function exportDOCX(sections: ExportSection[], reportName: string, file: string) {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, AlignmentType } =
    await import("docx");
  const header = reportHeaderLines(reportName.toUpperCase());
  const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const TOTAL = 9360;

  const children: any[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: header[0], bold: true, size: 32 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: header[1], bold: true, size: 24 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: header[2], size: 18 })] }),
    new Paragraph({ children: [new TextRun({ text: reportName.toUpperCase(), bold: true, size: 26, color: "2563EB" })], spacing: { before: 200, after: 160 } }),
  ];

  sections.forEach((s) => {
    const w = Math.floor(TOTAL / s.columns.length);
    const widths = s.columns.map(() => w);
    const cell = (text: string, i: number, bold = false, fill?: string) =>
      new TableCell({
        borders,
        width: { size: widths[i], type: WidthType.DXA },
        shading: fill ? { fill, type: ShadingType.CLEAR } : undefined,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({ children: [new TextRun({ text, bold, size: 16 })] })],
      });
    children.push(
      new Paragraph({ children: [new TextRun({ text: s.title, bold: true, size: 22 })], spacing: { before: 240, after: 80 } }),
      new Paragraph({ children: [new TextRun({ text: s.description, size: 16, italics: true })], spacing: { after: 120 } }),
      new Table({
        width: { size: w * s.columns.length, type: WidthType.DXA },
        columnWidths: widths,
        rows: [
          new TableRow({ children: s.columns.map((c, i) => cell(String(c), i, true, "D5E8F0")) }),
          ...s.rows.map((r) => new TableRow({ children: r.map((v, i) => cell(fmt(v), i)) })),
        ],
      }),
    );
  });

  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 20 } } } },
    sections: [
      {
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1000, right: 900, bottom: 1000, left: 900 } } },
        children,
      },
    ],
  });
  download(await Packer.toBlob(doc), `${file}.docx`);
}

/* ------------------------------ Entrypoint ------------------------------ */
export async function exportConsolidado(
  format: ExportFormat,
  reportName: string,
  sections: ExportSection[],
) {
  const file = `${reportName.toLowerCase().replace(/[^\w]+/g, "-")}-${fileStamp()}`;
  const safe = sections.map((s) => ({ ...s, rows: s.rows.length ? s.rows : [s.columns.map(() => "—")] }));
  if (format === "txt") return exportTXT(safe, reportName, file);
  if (format === "xlsx") return exportXLSX(safe, reportName, file);
  if (format === "pdf") return exportPDF(safe, reportName, file);
  if (format === "png") return exportPNG(safe, reportName, file);
  return exportDOCX(safe, reportName, file);
}
