import jsPDF from "jspdf";
import { drawRodolfoTVEmblem } from "./rodolfo-tv-emblem";

export interface ComprovanteData {
  id?: string | null;
  cliente_nome?: string | null;
  aplicativo?: string | null;
  mac?: string | null;
  device?: string | null;
  ativado_em?: string | Date | null;
  expira_em?: string | Date | null;
  origem?: string | null;
  servidor_nome?: string | null;
  observacao?: string | null;
}

export const PLATAFORMA_RODOLFO_TV = "Rodolfo TV";
export const FRASE_RODOLFO_TV = "Rodolfo TV • Conectando você ao melhor do entretenimento com máxima estabilidade!";
export const SUBFRASE_RODOLFO_TV = "Comprovante gerado automaticamente pela Rodolfo TV. Documento sem valor fiscal.";

/** Normaliza e formata data/hora para pt-BR */
export function formatDateTimeBR(iso: string | Date | null | undefined): string {
  if (!iso) return "-";
  if (typeof iso === "string") {
    const str = iso.trim();
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(str) || str.includes("T00:00:00");
    if (isDateOnly) {
      const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) {
        const [, y, mon, d] = m;
        return `${d.padStart(2, "0")}/${mon.padStart(2, "0")}/${y} às 00:00`;
      }
    }
  }
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).replace(",", " às");
}

/** Formata apenas data para pt-BR sem sofrer deslocamento de fuso horário */
export function formatDateBR(iso: string | Date | null | undefined): string {
  if (!iso) return "-";
  if (typeof iso === "string") {
    const str = iso.trim();
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(str) || str.includes("T00:00:00");
    if (isDateOnly) {
      const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) {
        const [, y, mon, d] = m;
        return `${d.padStart(2, "0")}/${mon.padStart(2, "0")}/${y}`;
      }
    }
  }
  if (iso instanceof Date) {
    if (isNaN(iso.getTime())) return "-";
    const d = String(iso.getDate()).padStart(2, "0");
    const mon = String(iso.getMonth() + 1).padStart(2, "0");
    const y = iso.getFullYear();
    return `${d}/${mon}/${y}`;
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Adiciona 365 dias (1 ano) a uma data */
export function add365Days(baseDate: Date | string = new Date()): Date {
  const d = typeof baseDate === "string" ? new Date(baseDate) : new Date(baseDate.getTime());
  if (isNaN(d.getTime())) return new Date(Date.now() + 365 * 86400000);
  return new Date(d.getTime() + 365 * 86400000);
}

/** Localiza o servidor "Ativa App" na lista de servidores */
export function findAtivaAppServer(servidores: any[] = []): any | undefined {
  if (!servidores || servidores.length === 0) return undefined;
  const normalize = (str: any) =>
    String(str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");

  // Prioridade 1: correspondência direta de "ativaapp" ou "ativeapp"
  let match = servidores.find((s) => {
    const norm = normalize(s?.nome);
    return norm === "ativaapp" || norm === "ativeapp";
  });
  if (match) return match;

  // Prioridade 2: contém "ativa" e "app" ou "ative" e "app"
  match = servidores.find((s) => {
    const norm = normalize(s?.nome);
    return (norm.includes("ativa") && norm.includes("app")) || (norm.includes("ative") && norm.includes("app"));
  });
  if (match) return match;

  // Prioridade 3: contém "ativa" ou "ative"
  match = servidores.find((s) => {
    const norm = normalize(s?.nome);
    return norm.includes("ativa") || norm.includes("ative");
  });
  return match;
}

/** Função para download de Blob */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Renderiza o comprovante de ativação completo no Canvas com layout idêntico
 * ao modelo Rodolfo TV fornecido pelo usuário.
 */
export function renderComprovanteCanvas(data: ComprovanteData): HTMLCanvasElement {
  const width = 560;
  const paddingX = 24;
  const scale = 2; // Alta resolução (Retina 2x)

  // Calcule altura necessária dinamicamente
  const headerHeight = 188;
  const badgeHeight = 44;
  const gap = 16;
  const cardAtivacaoH = 92;
  const cardDispositivoH = 92;
  const cardVigenciaH = 92;
  const hasCliente = Boolean(data.cliente_nome?.trim());
  const cardIdentificacaoH = hasCliente ? 122 : 92;
  const footerHeight = 90;

  const totalHeight =
    headerHeight +
    gap +
    badgeHeight +
    gap +
    cardAtivacaoH +
    gap +
    cardDispositivoH +
    gap +
    cardVigenciaH +
    gap +
    cardIdentificacaoH +
    gap +
    footerHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = totalHeight * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);

  // Fundo geral do comprovante
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, width, totalHeight);

  // --- 1. CABEÇALHO COM GRADIENTE DARK ---
  const headerGrad = ctx.createLinearGradient(0, 0, 0, headerHeight);
  headerGrad.addColorStop(0, "#080e1a");
  headerGrad.addColorStop(0.5, "#0f172a");
  headerGrad.addColorStop(1, "#162035");
  ctx.fillStyle = headerGrad;
  ctx.fillRect(0, 0, width, headerHeight);

  // Emblema Oficial Rodolfo TV (Águia Real / Leão Imperial em alta resolução)
  const logoX = width / 2;
  const emblemY = 46;
  drawRodolfoTVEmblem(ctx, logoX, emblemY, 1.0, "eagle");

  // Nome "RODOLFO TV" em destaque maior, caixa alta e tipografia extra bold/robusta
  ctx.save();
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(56, 189, 248, 0.45)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 24px -apple-system, BlinkMacSystemFont, 'Montserrat', 'Segoe UI', Roboto, sans-serif";
  ctx.letterSpacing = "4px";
  ctx.fillText("RODOLFO TV", logoX, 114);
  ctx.restore();

  // Título: "COMPROVANTE DE ATIVAÇÃO"
  ctx.textAlign = "center";
  ctx.fillStyle = "#38bdf8";
  ctx.font = "700 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.letterSpacing = "1.2px";
  ctx.fillText("COMPROVANTE DE ATIVAÇÃO", logoX, 138);
  ctx.letterSpacing = "0px";

  // Subtítulo: "Emitido em DD/MM/AAAA às HH:mm"
  const agoraStr = formatDateTimeBR(new Date());
  ctx.fillStyle = "#94a3b8";
  ctx.font = "400 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(`Emitido em ${agoraStr}`, logoX, 160);

  let curY = headerHeight + 14;

  // --- 2. BANNER DE STATUS "ATIVADO" ---
  const badgeW = width - paddingX * 2;
  ctx.fillStyle = "#dcfce7";
  ctx.beginPath();
  ctx.roundRect(paddingX, curY, badgeW, badgeHeight, 8);
  ctx.fill();

  // Círculo com checkmark
  const badgeCenterX = width / 2;
  const checkIconX = badgeCenterX - 38;
  const checkIconY = curY + badgeHeight / 2;

  ctx.strokeStyle = "#15803d";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(checkIconX, checkIconY, 8, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(checkIconX - 4, checkIconY);
  ctx.lineTo(checkIconX - 1, checkIconY + 3);
  ctx.lineTo(checkIconX + 4, checkIconY - 3);
  ctx.stroke();

  // Texto "Ativado"
  ctx.fillStyle = "#15803d";
  ctx.font = "700 15px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Ativado", badgeCenterX - 22, checkIconY + 5);

  curY += badgeHeight + 14;

  // --- FUNÇÃO AUXILIAR PARA RENDERIZAR GRUPO DE CARTÕES ---
  const cardW = width - paddingX * 2;

  function renderSection(
    title: string,
    rows: { label: string; value: string; isMonospace?: boolean; isAppPill?: boolean }[],
  ) {
    // Título da seção
    ctx.textAlign = "left";
    ctx.fillStyle = "#64748b";
    ctx.font = "700 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.letterSpacing = "0.8px";
    ctx.fillText(title.toUpperCase(), paddingX + 2, curY + 4);
    ctx.letterSpacing = "0px";
    curY += 12;

    const rowH = 36;
    const boxH = rows.length * rowH + 8;

    // Fundo do cartão branco com borda suave
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(paddingX, curY, cardW, boxH, 12);
    ctx.fill();
    ctx.stroke();

    // Renderizar linhas
    rows.forEach((r, idx) => {
      const lineY = curY + 6 + idx * rowH;

      // Divisor sutil entre linhas
      if (idx > 0) {
        ctx.strokeStyle = "#f1f5f9";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(paddingX + 16, lineY);
        ctx.lineTo(paddingX + cardW - 16, lineY);
        ctx.stroke();
      }

      const textY = lineY + rowH / 2 + 5;

      // Label (esquerda)
      ctx.textAlign = "left";
      ctx.fillStyle = "#475569";
      ctx.font = "500 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillText(r.label, paddingX + 16, textY);

      // Value (direita)
      ctx.textAlign = "right";
      const rightX = paddingX + cardW - 16;

      if (r.isAppPill) {
        // Pill escuro ou destaque para o Aplicativo
        ctx.fillStyle = "#1e3a8a";
        ctx.font = "700 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.fillText(r.value || "—", rightX, textY);
      } else if (r.isMonospace) {
        ctx.fillStyle = "#0f172a";
        ctx.font = "600 13px Consolas, Monaco, monospace";
        ctx.fillText(r.value || "—", rightX, textY);
      } else {
        ctx.fillStyle = "#0f172a";
        ctx.font = "700 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.fillText(r.value || "—", rightX, textY);
      }
    });

    curY += boxH + 12;
  }

  // --- 3. SEÇÃO ATIVAÇÃO ---
  renderSection("Ativação", [
    { label: "Aplicativo", value: (data.aplicativo || "—").toUpperCase(), isAppPill: true },
    { label: "Tipo de ativação", value: "Anual" },
  ]);

  // --- 4. SEÇÃO DISPOSITIVO ---
  renderSection("Dispositivo", [
    { label: "MAC", value: data.mac || "—", isMonospace: true },
    { label: "Código", value: data.device || "—" },
  ]);

  // --- 5. SEÇÃO VIGÊNCIA ---
  const ativadoEmFormatted = formatDateTimeBR(data.ativado_em);
  const expiraEmFormatted = formatDateBR(data.expira_em);

  renderSection("Vigência", [
    { label: "Solicitado em", value: ativadoEmFormatted },
    { label: "Válido até", value: expiraEmFormatted },
  ]);

  // --- 6. SEÇÃO IDENTIFICAÇÃO ---
  const rowsIdentificacao: { label: string; value: string; isMonospace?: boolean }[] = [
    { label: "Origem", value: data.origem || "Painel Rodolfo TV" },
    { label: "ID da transação", value: data.id || "manual-ativacao", isMonospace: true },
  ];
  if (hasCliente) {
    rowsIdentificacao.push({ label: "Cliente", value: data.cliente_nome! });
  }
  renderSection("Identificação", rowsIdentificacao);

  // --- 7. RODAPÉ RODOLFO TV ---
  curY += 4;

  // Linha tracejada separadora
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(paddingX, curY);
  ctx.lineTo(width - paddingX, curY);
  ctx.stroke();
  ctx.restore();

  curY += 24;

  // Frase da Rodolfo TV
  ctx.textAlign = "center";
  ctx.fillStyle = "#475569";
  ctx.font = "600 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(FRASE_RODOLFO_TV, width / 2, curY);

  curY += 18;

  // Frase legal / automática
  ctx.fillStyle = "#94a3b8";
  ctx.font = "400 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(SUBFRASE_RODOLFO_TV, width / 2, curY);

  return canvas;
}

/**
 * Exporta o comprovante de ativação como arquivo PNG
 */
export async function exportComprovantePNG(data: ComprovanteData, filename?: string): Promise<void> {
  const canvas = renderComprovanteCanvas(data);
  const safeFilename = filename || `comprovante-${data.device || data.mac || "ativacao"}.png`;

  return new Promise<void>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        downloadBlob(blob, safeFilename);
        resolve();
      } else {
        reject(new Error("Falha ao gerar o arquivo PNG"));
      }
    }, "image/png");
  });
}

/**
 * Exporta o comprovante de ativação como arquivo PDF (A4 centralizado em alta resolução)
 */
export async function exportComprovantePDF(data: ComprovanteData, filename?: string): Promise<void> {
  const canvas = renderComprovanteCanvas(data);
  const safeFilename = filename || `comprovante-${data.device || data.mac || "ativacao"}.pdf`;
  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  // Largura máxima agradável no A4 para comprovantes tipo cupom/card
  const marginX = 28;
  const targetW = pageW - marginX * 2; // ~154mm
  const targetH = (canvas.height / canvas.width) * targetW;

  // Se cabe perfeitamente na página, centraliza verticalmente; caso contrário, posiciona com margem superior
  const targetY = targetH < pageH - 24 ? (pageH - targetH) / 2 : 12;

  pdf.addImage(imgData, "PNG", marginX, targetY, targetW, targetH, undefined, "FAST");
  pdf.save(safeFilename);
}

/**
 * Copia a imagem PNG do comprovante diretamente para a Área de Transferência
 * para permitir colar com Ctrl+V no WhatsApp Web.
 */
export async function copyComprovanteImageToClipboard(data: ComprovanteData): Promise<boolean> {
  try {
    const canvas = renderComprovanteCanvas(data);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return false;

    if (navigator.clipboard && window.ClipboardItem) {
      const item = new ClipboardItem({ "image/png": blob });
      await navigator.clipboard.write([item]);
      return true;
    }
    return false;
  } catch (err) {
    console.warn("Falha ao copiar imagem para área de transferência:", err);
    return false;
  }
}

/**
 * Retorna texto formatado para envio no WhatsApp
 */
export function comprovanteTextoFormatado(data: ComprovanteData): string {
  const blocos: string[] = [];
  blocos.push(`✅ *Ativado por ${PLATAFORMA_RODOLFO_TV}*`);
  if (data.cliente_nome) blocos.push(`👤 *Cliente:* ${data.cliente_nome}`);

  const appLinhas = [
    `📺 *Aplicativo:* ${data.aplicativo || "-"} — *ATIVADO*`,
    ...(data.mac ? [`🔗 *MAC:* ${data.mac}`] : []),
    ...(data.device ? [`📱 *Device:* ${data.device}`] : []),
  ];
  blocos.push(appLinhas.join("\n"));

  blocos.push([
    `🗓️ *Ativado em:* ${formatDateTimeBR(data.ativado_em)}`,
    `⏳ *Vence em:* ${formatDateTimeBR(data.expira_em)} (Válido por 1 ano / 365 dias)`,
  ].join("\n"));

  if (data.id) blocos.push(`🔑 *ID da Transação:* \`${data.id}\``);
  if (data.observacao) blocos.push(`📝 *Obs.:* ${data.observacao}`);

  blocos.push(`✨ *${FRASE_RODOLFO_TV}*`);
  return blocos.join("\n\n");
}
