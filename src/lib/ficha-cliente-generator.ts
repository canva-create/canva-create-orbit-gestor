import jsPDF from "jspdf";
import {
  PLATAFORMA_RODOLFO_TV,
  FRASE_RODOLFO_TV,
  SUBFRASE_RODOLFO_TV,
  formatDateTimeBR,
  formatDateBR,
  downloadBlob,
} from "./comprovante-ativacao-generator";
import { currencyBRL, diasParaVencer, maskPhoneBR } from "./iptv";
import { drawRodolfoTVEmblem } from "./rodolfo-tv-emblem";

/**
 * Desenha um retângulo arredondado com preenchimento e borda
 */
function drawCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 12,
  fill = "#ffffff",
  stroke = "#e2e8f0"
) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * Renderiza o comprovante / ficha visual do cliente no Canvas com a identidade Rodolfo TV
 */
export function renderFichaClienteCanvas(
  cliente: any,
  historico: any[] = [],
  renovacoes: any[] = []
): HTMLCanvasElement {
  const width = 600;
  const paddingX = 28;
  const scale = 2; // Alta resolução (2x Retina)

  const dias = cliente ? diasParaVencer(cliente.data_vencimento) : null;
  const isDevendo = cliente?.status_pagamento === "devendo";
  const isVencido = dias !== null && dias < 0;

  // Itens de renovação (até as 3 mais recentes)
  const ultimasRenovs = (renovacoes || []).slice(0, 3);
  const hasRenovs = ultimasRenovs.length > 0;
  const hasObs = Boolean(cliente?.observacao?.trim());

  // Cálculo dinâmico de altura
  const headerHeight = 192;
  const gap = 14;
  const badgeHeight = 44;
  const cardClienteH = 148;
  const cardPlanoH = 138;
  const cardObsH = hasObs ? 78 : 0;
  const cardHistH = hasRenovs ? 46 + ultimasRenovs.length * 24 : 0;
  const footerHeight = 88;

  let totalHeight =
    headerHeight +
    gap +
    badgeHeight +
    gap +
    cardClienteH +
    gap +
    cardPlanoH +
    (hasObs ? gap + cardObsH : 0) +
    (hasRenovs ? gap + cardHistH : 0) +
    gap +
    footerHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = totalHeight * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);

  // Fundo geral do documento
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, width, totalHeight);

  // --- 1. CABEÇALHO DARK COM LOGO NEON RODOLFO TV ---
  const headerGrad = ctx.createLinearGradient(0, 0, 0, headerHeight);
  headerGrad.addColorStop(0, "#080e1a");
  headerGrad.addColorStop(0.5, "#0f172a");
  headerGrad.addColorStop(1, "#162035");
  ctx.fillStyle = headerGrad;
  ctx.fillRect(0, 0, width, headerHeight);

  // Emblema Oficial Rodolfo TV (Águia Real / Leão Imperial em alta resolução)
  const logoX = width / 2;
  const emblemY = 48;
  drawRodolfoTVEmblem(ctx, logoX, emblemY, 1.15, "eagle");

  // Nome "RODOLFO TV" em destaque maior, caixa alta e tipografia robusta
  ctx.save();
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(56, 189, 248, 0.45)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 26px -apple-system, BlinkMacSystemFont, 'Montserrat', 'Segoe UI', Roboto, sans-serif";
  ctx.letterSpacing = "4px";
  ctx.fillText("RODOLFO TV", logoX, 118);
  ctx.restore();

  // Título: "FICHA CADASTRAL DO CLIENTE"
  ctx.textAlign = "center";
  ctx.fillStyle = "#38bdf8";
  ctx.font = "700 17px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.letterSpacing = "1.2px";
  ctx.fillText("FICHA CADASTRAL DO CLIENTE", logoX, 144);
  ctx.letterSpacing = "0px";

  // Subtítulo: "Emitido em DD/MM/AAAA às HH:mm"
  const agoraStr = formatDateTimeBR(new Date());
  ctx.fillStyle = "#94a3b8";
  ctx.font = "400 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(`Emitido em ${agoraStr}`, logoX, 166);

  let curY = headerHeight + 14;

  // --- 2. BANNER DE STATUS ---
  const cardW = width - paddingX * 2;
  const isOk = !isVencido && !isDevendo;

  ctx.fillStyle = isOk ? "#dcfce7" : isVencido ? "#fee2e2" : "#fef3c7";
  ctx.beginPath();
  ctx.roundRect(paddingX, curY, cardW, badgeHeight, 8);
  ctx.fill();

  const badgeText = isVencido
    ? `PLANO VENCIDO (${Math.abs(dias || 0)} dias atrás)`
    : isDevendo
    ? "CLIENTE ATIVO • PAGAMENTO PENDENTE (DEVENDO)"
    : dias === 0
    ? "PLANO VENCE HOJE"
    : dias === 1
    ? "PLANO VENCE AMANHÃ (1 DIA)"
    : `CLIENTE ATIVO • ${dias !== null ? `${dias} DIAS RESTANTES` : "EM DIA"}`;

  ctx.textAlign = "center";
  ctx.fillStyle = isOk ? "#15803d" : isVencido ? "#b91c1c" : "#b45309";
  ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(badgeText, width / 2, curY + 27);

  curY += badgeHeight + gap;

  // --- 3. CARD: DADOS DO CLIENTE ---
  drawCard(ctx, paddingX, curY, cardW, cardClienteH);

  // Cabeçalho da seção
  ctx.textAlign = "left";
  ctx.fillStyle = "#2563eb";
  ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("DADOS DO CLIENTE", paddingX + 16, curY + 22);

  // Nome do cliente em destaque
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  const nomeExibir = String(cliente?.nome || "Cliente sem nome");
  ctx.fillText(nomeExibir, paddingX + 16, curY + 44);

  // Linha 1: Telefone & Aplicativo
  const col1X = paddingX + 16;
  const col2X = paddingX + cardW / 2 + 8;

  ctx.fillStyle = "#64748b";
  ctx.font = "500 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("TELEFONE / WHATSAPP", col1X, curY + 70);
  ctx.fillText("APLICATIVO", col2X, curY + 70);

  ctx.fillStyle = "#1e293b";
  ctx.font = "600 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(cliente?.telefone ? maskPhoneBR(cliente.telefone) : "Não informado", col1X, curY + 86);
  ctx.fillText(cliente?.aplicativo?.toUpperCase() || "Não informado", col2X, curY + 86);

  // Linha 2: MAC & Device
  ctx.fillStyle = "#64748b";
  ctx.font = "500 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("CÓDIGO MAC / LOGIN", col1X, curY + 112);
  ctx.fillText("DEVICE / SENHA", col2X, curY + 112);

  ctx.fillStyle = "#1e293b";
  ctx.font = "bold 13px 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace";
  ctx.fillText(cliente?.mac || "—", col1X, curY + 128);
  ctx.fillText(cliente?.device || "—", col2X, curY + 128);

  curY += cardClienteH + gap;

  // --- 4. CARD: PLANO & VIGÊNCIA ---
  drawCard(ctx, paddingX, curY, cardW, cardPlanoH);

  ctx.textAlign = "left";
  ctx.fillStyle = "#2563eb";
  ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("PLANO & VIGÊNCIA", paddingX + 16, curY + 22);

  // Linha 1: Servidor & Data de Início
  ctx.fillStyle = "#64748b";
  ctx.font = "500 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("SERVIDOR", col1X, curY + 46);
  ctx.fillText("DATA DE INÍCIO", col2X, curY + 46);

  ctx.fillStyle = "#1e293b";
  ctx.font = "600 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(cliente?.servidor?.nome || "Padrão", col1X, curY + 62);
  ctx.fillText(formatDateTimeBR(cliente?.data_inicio), col2X, curY + 62);

  // Linha 2: Vencimento & Pagamento / Mensalidade
  ctx.fillStyle = "#64748b";
  ctx.font = "500 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("VENCIMENTO ATUAL", col1X, curY + 88);
  ctx.fillText("MENSALIDADE / PAGAMENTO", col2X, curY + 88);

  // Vencimento formatado com destaque
  ctx.fillStyle = isVencido ? "#ef4444" : "#0f172a";
  ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(formatDateBR(cliente?.data_vencimento), col1X, curY + 104);

  // Valor pago + status pagamento
  const valPago = currencyBRL(cliente?.valor_pago);
  const statusPgto = isDevendo ? "DEVENDO" : "PAGO";

  ctx.fillStyle = "#0f172a";
  ctx.font = "600 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(`${valPago} (`, col2X, curY + 104);

  const prefixW = ctx.measureText(`${valPago} (`).width;
  ctx.fillStyle = isDevendo ? "#ef4444" : "#16a34a";
  ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(statusPgto, col2X + prefixW, curY + 104);

  const statusW = ctx.measureText(statusPgto).width;
  ctx.fillStyle = "#0f172a";
  ctx.font = "600 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(")", col2X + prefixW + statusW, curY + 104);

  curY += cardPlanoH + gap;

  // --- 5. CARD: OBSERVAÇÃO (se preenchida) ---
  if (hasObs) {
    drawCard(ctx, paddingX, curY, cardW, cardObsH);

    ctx.textAlign = "left";
    ctx.fillStyle = "#2563eb";
    ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText("OBSERVAÇÕES", paddingX + 16, curY + 22);

    ctx.fillStyle = "#334155";
    ctx.font = "400 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    const obsText = String(cliente.observacao || "").slice(0, 180);
    ctx.fillText(obsText, paddingX + 16, curY + 44);

    curY += cardObsH + gap;
  }

  // --- 6. CARD: HISTÓRICO RECENTE DE RENOVAÇÕES (se houver) ---
  if (hasRenovs) {
    drawCard(ctx, paddingX, curY, cardW, cardHistH);

    ctx.textAlign = "left";
    ctx.fillStyle = "#2563eb";
    ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText("HISTÓRICO RECENTE DE RENOVAÇÕES", paddingX + 16, curY + 22);

    let histY = curY + 44;
    ultimasRenovs.forEach((r) => {
      ctx.fillStyle = "#64748b";
      ctx.font = "500 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillText(`• ${formatDateBR(r.created_at)}`, paddingX + 16, histY);

      ctx.fillStyle = "#1e293b";
      ctx.font = "600 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillText(
        `+${r.dias_adicionados} dias  |  Recebido ${currencyBRL(r.valor_recebido)}`,
        paddingX + 120,
        histY
      );

      histY += 24;
    });

    curY += cardHistH + gap;
  }

  // --- 7. RODAPÉ INSTITUCIONAL RODOLFO TV ---
  ctx.save();
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(paddingX, curY);
  ctx.lineTo(width - paddingX, curY);
  ctx.stroke();
  ctx.restore();

  curY += 24;

  ctx.textAlign = "center";
  ctx.fillStyle = "#475569";
  ctx.font = "600 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(FRASE_RODOLFO_TV, width / 2, curY);

  curY += 18;

  ctx.fillStyle = "#94a3b8";
  ctx.font = "400 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(SUBFRASE_RODOLFO_TV, width / 2, curY);

  return canvas;
}

/**
 * Exporta a ficha do cliente como imagem PNG de alta definição
 */
export async function exportFichaClientePNG(
  cliente: any,
  historico: any[] = [],
  renovacoes: any[] = [],
  filename?: string
): Promise<void> {
  const canvas = renderFichaClienteCanvas(cliente, historico, renovacoes);
  const safeName = String(cliente?.nome || "cliente").replace(/\s+/g, "_");
  const safeFilename = filename || `ficha-${safeName}.png`;

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
 * Exporta a ficha do cliente como arquivo PDF profissional (A4 centralizado)
 */
export async function exportFichaClientePDF(
  cliente: any,
  historico: any[] = [],
  renovacoes: any[] = [],
  filename?: string
): Promise<void> {
  const canvas = renderFichaClienteCanvas(cliente, historico, renovacoes);
  const safeName = String(cliente?.nome || "cliente").replace(/\s+/g, "_");
  const safeFilename = filename || `ficha-${safeName}.pdf`;
  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  // Dimensões proporcionais em mm na folha A4
  const marginX = 24;
  const targetW = pageW - marginX * 2; // ~162mm
  const targetH = (canvas.height / canvas.width) * targetW;

  const targetY = targetH < pageH - 24 ? (pageH - targetH) / 2 : 12;

  pdf.addImage(imgData, "PNG", marginX, targetY, targetW, targetH, undefined, "FAST");
  pdf.save(safeFilename);
}

/**
 * Copia a imagem PNG da ficha do cliente para a Área de Transferência
 * para permitir colar diretamente no WhatsApp com Ctrl+V.
 */
export async function copyFichaClienteImageToClipboard(
  cliente: any,
  historico: any[] = [],
  renovacoes: any[] = []
): Promise<boolean> {
  try {
    const canvas = renderFichaClienteCanvas(cliente, historico, renovacoes);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return false;

    if (navigator.clipboard && window.ClipboardItem) {
      const item = new ClipboardItem({ "image/png": blob });
      await navigator.clipboard.write([item]);
      return true;
    }
    return false;
  } catch (err) {
    console.warn("Falha ao copiar imagem da ficha para a área de transferência:", err);
    return false;
  }
}
