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
import { getClientCredentials } from "./comprovante-vencimento-generator";

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

  // Extração inteligente de credenciais (MAC, Device, Login, Senha)
  const creds = getClientCredentials(cliente);
  const credItems: {
    label: string;
    value: string;
    badge: string;
    badgeBg: string;
    badgeColor: string;
  }[] = [];

  if (creds.mac) {
    credItems.push({
      label: "ENDEREÇO MAC",
      value: creds.mac,
      badge: "MAC",
      badgeBg: "#e0f2fe",
      badgeColor: "#0284c7",
    });
  }
  if (creds.device) {
    credItems.push({
      label: "CÓDIGO DEVICE",
      value: creds.device,
      badge: "DEVICE",
      badgeBg: "#f3e8ff",
      badgeColor: "#7c3aed",
    });
  }
  if (creds.usuario) {
    credItems.push({
      label: "LOGIN / USUÁRIO",
      value: creds.usuario,
      badge: "LOGIN",
      badgeBg: "#dcfce7",
      badgeColor: "#15803d",
    });
  }
  if (creds.senha) {
    credItems.push({
      label: "SENHA DE ACESSO",
      value: creds.senha,
      badge: "SENHA",
      badgeBg: "#fef3c7",
      badgeColor: "#b45309",
    });
  }

  const hasCreds = credItems.length > 0;

  // Cálculo dinâmico de altura com folga respirável
  const headerHeight = 194;
  const gap = 16;
  const badgeHeight = 46;
  const cardClienteH = 106;
  const credRowsCount = Math.ceil(credItems.length / 2);
  const cardCredH = hasCreds ? 38 + credRowsCount * 48 + 12 : 0;
  const cardPlanoH = 138;
  const cardObsH = hasObs ? 78 : 0;
  const cardHistH = hasRenovs ? 46 + ultimasRenovs.length * 26 : 0;
  const footerHeight = 92;

  let totalHeight =
    headerHeight +
    gap +
    badgeHeight +
    gap +
    cardClienteH +
    (hasCreds ? gap + cardCredH : 0) +
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
  drawRodolfoTVEmblem(ctx, logoX, emblemY, 1.12, "eagle");

  // Nome "RODOLFO TV" em destaque maior, caixa alta e tipografia robusta
  ctx.save();
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(56, 189, 248, 0.45)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 26px -apple-system, BlinkMacSystemFont, 'Montserrat', 'Segoe UI', Roboto, sans-serif";
  ctx.letterSpacing = "4px";
  ctx.fillText("RODOLFO TV", logoX, 116);
  ctx.restore();

  // Título: "FICHA CADASTRAL DO CLIENTE"
  ctx.textAlign = "center";
  ctx.fillStyle = "#38bdf8";
  ctx.font = "700 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.letterSpacing = "1.2px";
  ctx.fillText("FICHA CADASTRAL DO CLIENTE", logoX, 142);
  ctx.letterSpacing = "0px";

  // Subtítulo: "Emitido em DD/MM/AAAA às HH:mm"
  const agoraStr = formatDateTimeBR(new Date());
  ctx.fillStyle = "#94a3b8";
  ctx.font = "400 11.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(`Emitido em ${agoraStr}`, logoX, 165);

  let curY = headerHeight + gap;

  // --- 2. BANNER DE STATUS ---
  const cardW = width - paddingX * 2;
  const isOk = !isVencido && !isDevendo;

  ctx.fillStyle = isOk ? "#dcfce7" : isVencido ? "#fee2e2" : "#fef3c7";
  ctx.beginPath();
  ctx.roundRect(paddingX, curY, cardW, badgeHeight, 10);
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
  ctx.font = "bold 13.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(badgeText, width / 2, curY + 28);

  curY += badgeHeight + gap;

  // Coordenadas das colunas
  const col1X = paddingX + 18;
  const col2X = paddingX + cardW / 2 + 10;
  const fieldWidth = cardW / 2 - 28;

  // --- 3. CARD: DADOS DO CLIENTE ---
  drawCard(ctx, paddingX, curY, cardW, cardClienteH);

  // Barra de título da seção
  ctx.fillStyle = "#f8fafc";
  ctx.beginPath();
  ctx.roundRect(paddingX, curY, cardW, 34, [12, 12, 0, 0]);
  ctx.fill();

  ctx.textAlign = "left";
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("DADOS DO CLIENTE", paddingX + 18, curY + 22);

  // Nome do cliente em destaque
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 15px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  const nomeExibir = String(cliente?.nome || "Cliente sem nome");
  ctx.fillText(nomeExibir, paddingX + 18, curY + 54);

  // Telefone / WhatsApp & Aplicativo
  ctx.fillStyle = "#64748b";
  ctx.font = "500 10.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("TELEFONE / WHATSAPP", col1X, curY + 76);
  ctx.fillText("APLICATIVO (APP)", col2X, curY + 76);

  ctx.fillStyle = "#1e293b";
  ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(
    cliente?.telefone ? maskPhoneBR(cliente.telefone) : "Não informado",
    col1X,
    curY + 92
  );
  ctx.fillStyle = "#0284c7";
  ctx.fillText(
    cliente?.aplicativo?.toUpperCase() || "Não informado",
    col2X,
    curY + 92
  );

  curY += cardClienteH + gap;

  // --- 4. CARD OPCIONAL: CREDENCIAIS DE ACESSO & DISPOSITIVO ---
  if (hasCreds) {
    drawCard(ctx, paddingX, curY, cardW, cardCredH);

    ctx.fillStyle = "#f8fafc";
    ctx.beginPath();
    ctx.roundRect(paddingX, curY, cardW, 34, [12, 12, 0, 0]);
    ctx.fill();

    ctx.textAlign = "left";
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText("DADOS DE ACESSO & DISPOSITIVO", paddingX + 18, curY + 22);

    let credY = curY + 46;
    for (let i = 0; i < credItems.length; i += 2) {
      const item1 = credItems[i];
      const item2 = credItems[i + 1];

      const drawPillItem = (
        x: number,
        y: number,
        w: number,
        item: typeof item1
      ) => {
        ctx.fillStyle = "#f8fafc";
        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y, w, 38, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = item.badgeBg;
        ctx.beginPath();
        ctx.roundRect(x + 6, y + 7, 50, 24, 6);
        ctx.fill();

        ctx.textAlign = "center";
        ctx.fillStyle = item.badgeColor;
        ctx.font = "bold 9px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.fillText(item.badge, x + 31, y + 22);

        ctx.textAlign = "left";
        ctx.fillStyle = "#64748b";
        ctx.font = "500 8.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.fillText(item.label, x + 64, y + 14);

        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 12px 'SF Mono', 'Courier New', monospace, sans-serif";
        const maxTextW = w - 72;
        const valTxt =
          ctx.measureText(item.value).width > maxTextW
            ? `${item.value.slice(0, 26)}...`
            : item.value;
        ctx.fillText(valTxt, x + 64, y + 28);
      };

      if (item1 && item2) {
        drawPillItem(col1X, credY, fieldWidth, item1);
        drawPillItem(col2X, credY, fieldWidth, item2);
      } else if (item1) {
        drawPillItem(col1X, credY, cardW - 36, item1);
      }

      credY += 48;
    }

    curY += cardCredH + gap;
  }

  // --- 5. CARD: PLANO & VIGÊNCIA ---
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
