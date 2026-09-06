import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import {
  formatDateBR,
  formatDateTimeBR,
  downloadBlob,
  FRASE_RODOLFO_TV,
} from "./comprovante-ativacao-generator";
import { currencyBRL, diasParaVencer, maskPhoneBR } from "./iptv";
import { drawRodolfoTVEmblem } from "./rodolfo-tv-emblem";

export interface ComprovanteVencimentoData {
  cliente: any;
  ultimaRenovacao?: {
    created_at?: string | null;
    vencimento_novo?: string | null;
    dias_adicionados?: number | null;
  } | null;
}

/**
 * Busca dados da última renovação do cliente e monta o objeto completo
 */
export async function getComprovanteVencimentoData(
  cliente: any
): Promise<ComprovanteVencimentoData> {
  try {
    const { data: ultima } = await supabase
      .from("historico_renovacoes")
      .select("created_at, vencimento_novo, dias_adicionados")
      .eq("cliente_id", cliente.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      cliente,
      ultimaRenovacao: ultima || null,
    };
  } catch (err) {
    console.warn("Erro ao buscar última renovação para comprovante:", err);
    return { cliente, ultimaRenovacao: null };
  }
}

/**
 * Desenha um retângulo arredondado com preenchimento e borda
 */
function drawCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 10,
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
 * Renderiza o comprovante de vencimento e renovação da Rodolfo TV no Canvas
 */
export function renderComprovanteVencimentoCanvas(
  data: ComprovanteVencimentoData
): HTMLCanvasElement {
  const { cliente, ultimaRenovacao } = data;
  const width = 560;
  const paddingX = 24;
  const scale = 2; // Retina 2x

  // Cálculos de datas
  const dataRenovDate = ultimaRenovacao?.created_at
    ? new Date(ultimaRenovacao.created_at)
    : new Date();
  const hh = String(dataRenovDate.getHours()).padStart(2, "0");
  const mm = String(dataRenovDate.getMinutes()).padStart(2, "0");
  const ss = String(dataRenovDate.getSeconds()).padStart(2, "0");
  const dataRenovStr = `${formatDateBR(dataRenovDate)} às ${hh}:${mm}:${ss}`;

  const vencISO = cliente.data_vencimento || ultimaRenovacao?.vencimento_novo;
  const dataVencStr = vencISO
    ? `${formatDateBR(vencISO)} às ${hh}:${mm}:${ss}`
    : "-";

  const dias = diasParaVencer(vencISO);
  const isVencido = dias !== null && dias < 0;
  const isVenceHoje = dias === 0;

  const contatoRaw = (
    cliente.telefone ||
    cliente.celular ||
    cliente.whatsapp ||
    ""
  ).toString();
  const contatoFmt = contatoRaw.replace(/\D/g, "")
    ? maskPhoneBR(contatoRaw)
    : "-";

  const hasObs = Boolean(cliente?.observacao?.trim());
  const hasMac = Boolean(cliente?.mac?.trim());
  const hasDevice = Boolean(cliente?.device?.trim());
  const hasServidor = Boolean(cliente?.servidor?.nome?.trim());

  // Layout dinâmico
  const headerHeight = 188;
  const gap = 14;
  const badgeHeight = 46;

  // Linhas do card de dados do cliente (2 colunas)
  const rowsClienteCount = 2 + (hasMac || hasDevice ? 1 : 0) + (hasServidor ? 1 : 0);
  const cardClienteH = 44 + rowsClienteCount * 28;

  // Linhas do card de vigência (Renovação, Vencimento, Dias, Pagamento)
  const cardVigenciaH = 44 + 4 * 28;
  const cardObsH = hasObs ? 66 : 0;
  const footerHeight = 88;

  const totalHeight =
    headerHeight +
    gap +
    badgeHeight +
    gap +
    cardClienteH +
    gap +
    cardVigenciaH +
    (hasObs ? gap + cardObsH : 0) +
    gap +
    footerHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = totalHeight * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);

  // Fundo geral
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, width, totalHeight);

  // --- 1. CABEÇALHO COM GRADIENTE DARK & EMBLEMA RODOLFO TV ---
  const headerGrad = ctx.createLinearGradient(0, 0, 0, headerHeight);
  headerGrad.addColorStop(0, "#080e1a");
  headerGrad.addColorStop(0.5, "#0f172a");
  headerGrad.addColorStop(1, "#162035");
  ctx.fillStyle = headerGrad;
  ctx.fillRect(0, 0, width, headerHeight);

  // Emblema Oficial Rodolfo TV (Águia Real / Leão Imperial em alta resolução)
  const logoX = width / 2;
  const emblemY = 46;
  drawRodolfoTVEmblem(ctx, logoX, emblemY, 1.05, "eagle");

  // Nome "RODOLFO TV" em destaque robusto em caixa alta
  ctx.save();
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(56, 189, 248, 0.45)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 24px -apple-system, BlinkMacSystemFont, 'Montserrat', 'Segoe UI', Roboto, sans-serif";
  ctx.letterSpacing = "4px";
  ctx.fillText("RODOLFO TV", logoX, 114);
  ctx.restore();

  // Título: "COMPROVANTE DE VENCIMENTO"
  ctx.textAlign = "center";
  ctx.fillStyle = "#38bdf8";
  ctx.font = "700 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.letterSpacing = "1.2px";
  ctx.fillText("COMPROVANTE DE VENCIMENTO", logoX, 138);
  ctx.letterSpacing = "0px";

  // Subtítulo: "Emitido em DD/MM/AAAA às HH:mm"
  const agoraStr = formatDateTimeBR(new Date());
  ctx.fillStyle = "#94a3b8";
  ctx.font = "400 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(`Emitido em ${agoraStr}`, logoX, 160);

  let curY = headerHeight + gap;

  // --- 2. BANNER DE STATUS DO VENCIMENTO ---
  const cardW = width - paddingX * 2;
  const isDevendo = cliente.status_pagamento === "devendo";

  let badgeBg = "#dcfce7";
  let badgeBorder = "#86efac";
  let badgeTextColor = "#15803d";
  let badgeMsg = "RENOVAÇÃO REALIZADA COM SUCESSO!";

  if (isVencido) {
    badgeBg = "#fee2e2";
    badgeBorder = "#fca5a5";
    badgeTextColor = "#b91c1c";
    badgeMsg = `ASSINATURA VENCIDA HÁ ${Math.abs(dias || 0)} DIAS`;
  } else if (isVenceHoje) {
    badgeBg = "#fef3c7";
    badgeBorder = "#fde047";
    badgeTextColor = "#b45309";
    badgeMsg = "ASSINATURA VENCE HOJE";
  } else if (isDevendo) {
    badgeBg = "#fef3c7";
    badgeBorder = "#fde047";
    badgeTextColor = "#b45309";
    badgeMsg = "RENOVAÇÃO CONCLUÍDA • PAGAMENTO PENDENTE";
  }

  ctx.fillStyle = badgeBg;
  ctx.strokeStyle = badgeBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(paddingX, curY, cardW, badgeHeight, 8);
  ctx.fill();
  ctx.stroke();

  // Ícone de checkmark circular ou exclamação
  const badgeCenterX = width / 2;
  const iconX = badgeCenterX - 140;
  const iconY = curY + badgeHeight / 2;

  ctx.strokeStyle = badgeTextColor;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(iconX, iconY, 8, 0, Math.PI * 2);
  ctx.stroke();

  if (!isVencido) {
    ctx.beginPath();
    ctx.moveTo(iconX - 3.5, iconY);
    ctx.lineTo(iconX - 1, iconY + 2.8);
    ctx.lineTo(iconX + 3.8, iconY - 2.8);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(iconX, iconY - 3.5);
    ctx.lineTo(iconX, iconY + 1);
    ctx.moveTo(iconX, iconY + 3.5);
    ctx.lineTo(iconX, iconY + 4.5);
    ctx.stroke();
  }

  ctx.textAlign = "center";
  ctx.fillStyle = badgeTextColor;
  ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(badgeMsg, badgeCenterX + 6, curY + 28);

  curY += badgeHeight + gap;

  // --- 3. CARD: DADOS DO CLIENTE & APLICATIVO ---
  drawCard(ctx, paddingX, curY, cardW, cardClienteH);

  // Barra de título do card
  ctx.fillStyle = "#f1f5f9";
  ctx.beginPath();
  ctx.roundRect(paddingX, curY, cardW, 36, [10, 10, 0, 0]);
  ctx.fill();

  ctx.textAlign = "left";
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("DADOS DO CLIENTE & APLICATIVO", paddingX + 14, curY + 23);

  let rowY = curY + 54;
  const col1X = paddingX + 14;
  const col2X = paddingX + cardW / 2 + 10;

  const drawField = (x: number, y: number, label: string, val: string, isHighlight = false) => {
    ctx.fillStyle = "#64748b";
    ctx.font = "500 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(label, x, y);

    ctx.fillStyle = isHighlight ? "#0284c7" : "#0f172a";
    ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    const maxW = cardW / 2 - 24;
    const truncated = ctx.measureText(val).width > maxW ? `${val.slice(0, 24)}...` : val;
    ctx.fillText(truncated, x, y + 16);
  };

  // Linha 1: Cliente e Contato
  drawField(col1X, rowY, "Cliente", String(cliente.nome || "-"));
  drawField(col2X, rowY, "Contato", contatoFmt);
  rowY += 28;

  // Linha 2: Aplicativo e Servidor
  drawField(col1X, rowY, "Aplicativo (APP)", String(cliente.aplicativo || "-"), true);
  drawField(col2X, rowY, "Servidor", String(cliente.servidor?.nome || "-"));
  rowY += 28;

  // Linha 3 (opcional): MAC e Device
  if (hasMac || hasDevice) {
    drawField(col1X, rowY, "MAC / Login", String(cliente.mac || "-"));
    drawField(col2X, rowY, "Device / Senha", String(cliente.device || "-"));
    rowY += 28;
  }

  curY += cardClienteH + gap;

  // --- 4. CARD: INFORMAÇÕES DE VIGÊNCIA & VENCIMENTO ---
  drawCard(ctx, paddingX, curY, cardW, cardVigenciaH);

  ctx.fillStyle = "#f1f5f9";
  ctx.beginPath();
  ctx.roundRect(paddingX, curY, cardW, 36, [10, 10, 0, 0]);
  ctx.fill();

  ctx.textAlign = "left";
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("INFORMAÇÕES DE VIGÊNCIA & RENOVAÇÃO", paddingX + 14, curY + 23);

  rowY = curY + 54;

  // Linha 1: Data de Renovação
  drawField(col1X, rowY, "Data da Renovação", dataRenovStr);
  drawField(col2X, rowY, "Novo Vencimento", dataVencStr, true);
  rowY += 28;

  // Linha 2: Dias para Vencer e Status de Pagamento
  const diasBadgeTxt =
    dias === null
      ? "Sem vencimento"
      : isVencido
      ? `Vencido há ${Math.abs(dias)} dia(s)`
      : isVenceHoje
      ? "Vence hoje"
      : `${dias} dias restantes`;

  drawField(col1X, rowY, "Prazo de Vigência", diasBadgeTxt);
  drawField(
    col2X,
    rowY,
    "Status Pagamento",
    isDevendo ? "DEVENDO (Pendente)" : "PAGO",
    !isDevendo
  );
  rowY += 28;

  // Linha 3: Valor Pago e Origem
  drawField(
    col1X,
    rowY,
    "Valor do Plano",
    currencyBRL(cliente.valor_pago || 0)
  );
  drawField(
    col2X,
    rowY,
    "Status Geral",
    String(cliente.status || "ativo").toUpperCase()
  );
  rowY += 28;

  // Linha 4: Dias adicionados
  if (ultimaRenovacao?.dias_adicionados) {
    drawField(
      col1X,
      rowY,
      "Dias Adicionados",
      `+${ultimaRenovacao.dias_adicionados} dias`
    );
    drawField(col2X, rowY, "Canal de Emissão", "Painel Rodolfo TV");
  } else {
    drawField(col1X, rowY, "Canal de Emissão", "Painel Oficial Rodolfo TV");
    drawField(col2X, rowY, "Autenticação", "Comprovante Digital");
  }

  curY += cardVigenciaH + gap;

  // --- 5. CARD OPCIONAL: OBSERVAÇÕES ---
  if (hasObs) {
    drawCard(ctx, paddingX, curY, cardW, cardObsH);
    ctx.fillStyle = "#64748b";
    ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText("Observações:", paddingX + 14, curY + 22);

    ctx.fillStyle = "#334155";
    ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    const obsText = String(cliente.observacao);
    const maxW = cardW - 28;
    const truncatedObs =
      ctx.measureText(obsText).width > maxW
        ? `${obsText.slice(0, 60)}...`
        : obsText;
    ctx.fillText(truncatedObs, paddingX + 14, curY + 44);

    curY += cardObsH + gap;
  }

  // --- 6. RODAPÉ INSTITUCIONAL RODOLFO TV ---
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(paddingX, curY, cardW, footerHeight);

  // Linha separadora
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(paddingX + 20, curY);
  ctx.lineTo(paddingX + cardW - 20, curY);
  ctx.stroke();

  // Frase da Rodolfo TV
  ctx.textAlign = "center";
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(FRASE_RODOLFO_TV, width / 2, curY + 30);

  // Subfrase de segurança
  ctx.fillStyle = "#94a3b8";
  ctx.font = "400 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("Comprovante digital emitido pela Rodolfo TV. Válido e verificado.", width / 2, curY + 48);

  ctx.fillStyle = "#cbd5e1";
  ctx.font = "400 10px monospace";
  ctx.fillText(`ID de Verificação: ${cliente.id?.slice(0, 16) || "RODOLFO-TV-AUTH"}`, width / 2, curY + 68);

  return canvas;
}

/**
 * Exporta a imagem PNG do comprovante de vencimento e salva no computador
 */
export async function exportComprovanteVencimentoPNG(
  cliente: any,
  filename?: string
): Promise<void> {
  const data = await getComprovanteVencimentoData(cliente);
  const canvas = renderComprovanteVencimentoCanvas(data);
  const safeName = String(cliente?.nome || "cliente").replace(/\s+/g, "_");
  const safeFilename = filename || `comprovante-vencimento-${safeName}.png`;

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
 * Copia a imagem PNG do comprovante de vencimento diretamente para a Área de Transferência
 * para colar no WhatsApp Web com Ctrl + V.
 */
export async function copyComprovanteVencimentoImageToClipboard(
  cliente: any
): Promise<boolean> {
  try {
    const data = await getComprovanteVencimentoData(cliente);
    const canvas = renderComprovanteVencimentoCanvas(data);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    if (!blob) return false;

    if (navigator.clipboard && window.ClipboardItem) {
      const item = new ClipboardItem({ "image/png": blob });
      await navigator.clipboard.write([item]);
      return true;
    }
    return false;
  } catch (err) {
    console.warn("Falha ao copiar imagem de vencimento para clipboard:", err);
    return false;
  }
}

/**
 * Exporta como PDF A4 profissional
 */
export async function exportComprovanteVencimentoPDF(
  cliente: any,
  filename?: string
): Promise<void> {
  const data = await getComprovanteVencimentoData(cliente);
  const canvas = renderComprovanteVencimentoCanvas(data);
  const safeName = String(cliente?.nome || "cliente").replace(/\s+/g, "_");
  const safeFilename = filename || `comprovante-vencimento-${safeName}.pdf`;
  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const marginX = 28;
  const targetW = pageW - marginX * 2;
  const targetH = (canvas.height / canvas.width) * targetW;
  const targetY = targetH < pageH - 24 ? (pageH - targetH) / 2 : 12;

  pdf.addImage(imgData, "PNG", marginX, targetY, targetW, targetH, undefined, "FAST");
  pdf.save(safeFilename);
}
