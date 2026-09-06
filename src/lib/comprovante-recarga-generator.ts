import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import {
  formatDateBR,
  formatDateTimeBR,
  downloadBlob,
} from "./comprovante-ativacao-generator";
import { currencyBRL, maskPhoneBR, parseDateOnly } from "./iptv";
import { drawRodolfoTVEmblem } from "./rodolfo-tv-emblem";

export interface ComprovanteRecargaData {
  revendedor: any;
  ultimaRecarga?: {
    id?: string;
    created_at?: string;
    quantidade?: number;
    valor_venda?: number;
    status_pagamento?: string;
    servidor?: { id?: string; nome?: string } | null;
    observacao?: string | null;
  } | null;
  painelUrl?: string;
}

/**
 * Busca dados da última recarga / movimentação do revendedor no Supabase
 */
export async function getComprovanteRecargaData(
  revendedor: any,
  painelUrl?: string
): Promise<ComprovanteRecargaData> {
  try {
    const { data: mov } = await supabase
      .from("revendedores_movimentacoes")
      .select("*, servidor:servidores(id, nome)")
      .eq("revendedor_id", revendedor.id)
      .eq("tipo", "venda")
      .neq("status_venda", "cancelada")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      revendedor,
      ultimaRecarga: mov || null,
      painelUrl: painelUrl || "",
    };
  } catch (err) {
    console.warn("Erro ao buscar última recarga do revendedor:", err);
    return { revendedor, ultimaRecarga: null, painelUrl: painelUrl || "" };
  }
}

/**
 * Desenha um retângulo arredondado com preenchimento e borda suave
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
 * Renderiza o cabeçalho superior de um card de seção
 */
function drawCardHeader(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  title: string,
  badgeText?: string
) {
  const headerH = 38;
  ctx.fillStyle = "#f8fafc";
  ctx.beginPath();
  ctx.roundRect(x, y, w, headerH, [12, 12, 0, 0]);
  ctx.fill();

  // Borda inferior da barra de título
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + headerH);
  ctx.lineTo(x + w, y + headerH);
  ctx.stroke();

  // Título
  ctx.textAlign = "left";
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(title, x + 16, y + 24);

  // Badge opcional à direita
  if (badgeText) {
    ctx.font = "bold 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    const badgeW = ctx.measureText(badgeText).width + 16;
    const badgeX = x + w - badgeW - 14;
    const badgeY = y + 10;
    const badgeH = 18;

    ctx.fillStyle = "#e0f2fe";
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6);
    ctx.fill();

    ctx.fillStyle = "#0284c7";
    ctx.textAlign = "center";
    ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + 13);
  }
}

/**
 * Renderiza o comprovante visual de recarga de créditos da Rodolfo TV no Canvas
 * com padrão oficial (Águia Real Imperial, degradê dark navy, 620px com margem de respiro).
 */
export function renderComprovanteRecargaCanvas(
  data: ComprovanteRecargaData
): HTMLCanvasElement {
  const { revendedor, ultimaRecarga, painelUrl } = data;

  const width = 620;
  const paddingX = 28;
  const cardW = width - paddingX * 2; // 564px
  const scale = 2; // Retina 2x

  // Cálculos de datas
  const dataRecargaDate = ultimaRecarga?.created_at
    ? new Date(ultimaRecarga.created_at)
    : revendedor.data_recarga
    ? parseDateOnly(revendedor.data_recarga)
    : new Date();

  const hh = String(dataRecargaDate.getHours()).padStart(2, "0");
  const mm = String(dataRecargaDate.getMinutes()).padStart(2, "0");
  const ss = String(dataRecargaDate.getSeconds()).padStart(2, "0");
  const hasTime = Boolean(ultimaRecarga?.created_at);
  const dataRecargaStr = hasTime
    ? `${formatDateBR(dataRecargaDate)} às ${hh}:${mm}:${ss}`
    : formatDateBR(dataRecargaDate);

  // Dias de validade e restantes
  let diasRest = "-";
  if (revendedor.data_recarga) {
    const base = parseDateOnly(revendedor.data_recarga);
    const fim = new Date(base);
    fim.setDate(fim.getDate() + Number(revendedor.dias_validade || 0));
    const diff = Math.ceil((fim.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    diasRest = diff >= 0 ? `${diff} dias restantes` : `Vencido há ${Math.abs(diff)} dias`;
  }

  const creditosAdicionados = ultimaRecarga?.quantidade ?? revendedor.creditos ?? 0;
  const saldoTotal = Number(revendedor.creditos || 0);

  const statusPag = (ultimaRecarga?.status_pagamento || revendedor.status_pagamento || "pago").toLowerCase();
  const isDevendo = statusPag === "devendo";

  const contatoRaw = String(revendedor.telefone || "").trim();
  const contatoFmt = contatoRaw.replace(/\D/g, "") ? maskPhoneBR(contatoRaw) : "-";

  const hasCreds = Boolean(revendedor.login || revendedor.senha);
  const hasPainel = Boolean(painelUrl && painelUrl.trim());
  const hasObs = Boolean(revendedor.observacao?.trim() || ultimaRecarga?.observacao?.trim());

  // Dimensões dos cards
  const headerHeight = 194;
  const gap = 16;
  const badgeHeight = 48;

  // Card 1: Dados do Revendedor & Servidor (2 ou 3 linhas)
  const revRowsCount = hasPainel ? 3 : 2;
  const cardRevH = 38 + revRowsCount * 44 + 14;

  // Card 2: Informações da Recarga & Créditos (3 linhas)
  const cardRecargaH = 38 + 3 * 44 + 14;

  // Card 3: Credenciais de Acesso ao Painel
  const cardCredH = hasCreds ? 38 + 52 + 12 : 0;

  // Card 4: Observações
  const cardObsH = hasObs ? 74 : 0;
  const footerHeight = 98;

  const totalHeight =
    headerHeight +
    gap +
    badgeHeight +
    gap +
    cardRevH +
    gap +
    cardRecargaH +
    (hasCreds ? gap + cardCredH : 0) +
    (hasObs ? gap + cardObsH : 0) +
    gap +
    footerHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = totalHeight * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível inicializar o contexto 2D do Canvas");

  ctx.scale(scale, scale);

  // Fundo geral da página
  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(0, 0, width, totalHeight);

  // --- 1. CABEÇALHO DARK COM DEGRADÊ INSTITUCIONAL ---
  const headerGrad = ctx.createLinearGradient(0, 0, width, headerHeight);
  headerGrad.addColorStop(0, "#080e1a");
  headerGrad.addColorStop(0.5, "#0e172a");
  headerGrad.addColorStop(1, "#162035");
  ctx.fillStyle = headerGrad;
  ctx.fillRect(0, 0, width, headerHeight);

  // Detalhe de linha dourada neon no topo
  const goldNeon = ctx.createLinearGradient(0, 0, width, 0);
  goldNeon.addColorStop(0, "rgba(245, 158, 11, 0)");
  goldNeon.addColorStop(0.2, "rgba(245, 158, 11, 0.9)");
  goldNeon.addColorStop(0.5, "rgba(56, 189, 248, 1)");
  goldNeon.addColorStop(0.8, "rgba(245, 158, 11, 0.9)");
  goldNeon.addColorStop(1, "rgba(245, 158, 11, 0)");
  ctx.fillStyle = goldNeon;
  ctx.fillRect(0, 0, width, 3.5);

  // Emblema Oficial Rodolfo TV (Águia Real Imperial)
  ctx.save();
  const emblemSize = 64;
  const emblemX = (width - emblemSize) / 2;
  const emblemY = 16;
  drawRodolfoTVEmblem(ctx, emblemX, emblemY, emblemSize);
  ctx.restore();

  // Nome oficial: RODOLFO TV
  ctx.textAlign = "center";
  ctx.font = "900 24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.shadowColor = "rgba(56, 189, 248, 0.6)";
  ctx.shadowBlur = 10;
  ctx.fillStyle = "#ffffff";
  ctx.fillText("RODOLFO TV", width / 2, 108);

  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  // Subtítulo
  ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = "#38bdf8";
  ctx.fillText("COMPROVANTE DE RECARGA DE CRÉDITOS", width / 2, 128);

  ctx.font = "600 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = "#fbbf24";
  ctx.fillText("ÁREA DO REVENDEDOR", width / 2, 146);

  // Data e hora de emissão
  ctx.font = "400 10.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(`Emitido em ${formatDateTimeBR(new Date())}`, width / 2, 168);

  let curY = headerHeight + gap;

  // --- 2. BANNER DE STATUS DA RECARGA ---
  const badgeBg = isDevendo ? "#fef3c7" : "#dcfce7";
  const badgeBorder = isDevendo ? "#f59e0b" : "#10b981";
  const badgeTextCol = isDevendo ? "#92400e" : "#065f46";
  const badgeMainText = isDevendo
    ? "RECARGA CONCLUÍDA • PAGAMENTO PENDENTE (DEVENDO)"
    : "RECARGA REALIZADA COM SUCESSO! ✅";

  drawCard(ctx, paddingX, curY, cardW, badgeHeight, 10, badgeBg, badgeBorder);

  ctx.textAlign = "center";
  ctx.fillStyle = badgeTextCol;
  ctx.font = "bold 13.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(badgeMainText, width / 2, curY + 29);

  curY += badgeHeight + gap;

  // Helper para desenhar campo com chave e valor
  const col1X = paddingX + 18;
  const col2X = paddingX + cardW / 2 + 10;
  const fieldWidth = cardW / 2 - 28;

  const drawField = (
    fx: number,
    fy: number,
    label: string,
    value: string,
    highlight = false,
    highlightColor = "#0284c7"
  ) => {
    ctx.textAlign = "left";
    ctx.fillStyle = "#64748b";
    ctx.font = "500 10.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(label.toUpperCase(), fx, fy);

    ctx.fillStyle = highlight ? highlightColor : "#0f172a";
    ctx.font = highlight
      ? "bold 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      : "600 12.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

    const textToMeasure = String(value || "-");
    let renderText = textToMeasure;
    if (ctx.measureText(renderText).width > fieldWidth) {
      while (
        renderText.length > 3 &&
        ctx.measureText(`${renderText}...`).width > fieldWidth
      ) {
        renderText = renderText.slice(0, -1);
      }
      renderText = `${renderText}...`;
    }
    ctx.fillText(renderText, fx, fy + 18);
  };

  // --- 3. CARD: DADOS DO REVENDEDOR & SERVIDOR ---
  drawCard(ctx, paddingX, curY, cardW, cardRevH);
  drawCardHeader(ctx, paddingX, curY, cardW, "DADOS DO REVENDEDOR & SERVIDOR", "PARCEIRO");

  let rowY = curY + 54;
  drawField(col1X, rowY, "Revendedor", revendedor.nome || "-", true, "#0f172a");
  drawField(col2X, rowY, "Contato / WhatsApp", contatoFmt);
  rowY += 44;

  const servidorNome = revendedor.servidor?.nome || "Servidor Padrão";
  drawField(col1X, rowY, "Servidor IPTV", servidorNome, true, "#2563eb");
  drawField(col2X, rowY, "Login do Revendedor", revendedor.login || "-", false);

  if (hasPainel) {
    rowY += 44;
    drawField(col1X, rowY, "Painel de Acesso", painelUrl!, true, "#0284c7");
    drawField(col2X, rowY, "Status da Conta", String(revendedor.status || "ativo").toUpperCase(), revendedor.status === "ativo", "#15803d");
  }

  curY += cardRevH + gap;

  // --- 4. CARD: INFORMAÇÕES DA RECARGA & CRÉDITOS ---
  drawCard(ctx, paddingX, curY, cardW, cardRecargaH);
  drawCardHeader(ctx, paddingX, curY, cardW, "INFORMAÇÕES DA RECARGA & CRÉDITOS");

  rowY = curY + 54;
  drawField(
    col1X,
    rowY,
    "Quantidade Recarregada",
    `+${creditosAdicionados} Créditos`,
    true,
    "#16a34a"
  );
  drawField(
    col2X,
    rowY,
    "Saldo Atual",
    `${saldoTotal} Créditos`,
    true,
    "#0284c7"
  );
  rowY += 44;

  drawField(col1X, rowY, "Data da Recarga", dataRecargaStr);
  drawField(
    col2X,
    rowY,
    "Validade do Saldo",
    `${revendedor.dias_validade || 30} dias (${diasRest})`
  );
  rowY += 44;

  drawField(
    col1X,
    rowY,
    "Status do Pagamento",
    isDevendo ? "DEVENDO (Pendente)" : "PAGO",
    true,
    isDevendo ? "#dc2626" : "#16a34a"
  );
  drawField(
    col2X,
    rowY,
    "Valor da Recarga",
    currencyBRL(ultimaRecarga?.valor_venda ?? revendedor.valor_venda ?? 0),
    true,
    "#0f172a"
  );

  curY += cardRecargaH + gap;

  // --- 5. CARD OPCIONAL: CREDENCIAIS DE ACESSO AO PAINEL ---
  if (hasCreds) {
    drawCard(ctx, paddingX, curY, cardW, cardCredH);
    drawCardHeader(ctx, paddingX, curY, cardW, "DADOS DE ACESSO AO PAINEL");

    const credY = curY + 50;

    const drawPill = (
      px: number,
      py: number,
      pw: number,
      badge: string,
      label: string,
      val: string,
      bBg: string,
      bCol: string
    ) => {
      ctx.fillStyle = "#f8fafc";
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(px, py, pw, 40, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = bBg;
      ctx.beginPath();
      ctx.roundRect(px + 6, py + 8, 48, 24, 6);
      ctx.fill();

      ctx.textAlign = "center";
      ctx.fillStyle = bCol;
      ctx.font = "bold 9.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillText(badge, px + 30, py + 23);

      ctx.textAlign = "left";
      ctx.fillStyle = "#64748b";
      ctx.font = "500 9px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillText(label, px + 62, py + 14);

      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 12.5px 'SF Mono', 'Courier New', monospace, sans-serif";
      const maxW = pw - 70;
      const valTxt = ctx.measureText(val).width > maxW ? `${val.slice(0, 22)}...` : val;
      ctx.fillText(valTxt, px + 62, py + 29);
    };

    if (revendedor.login && revendedor.senha) {
      drawPill(col1X, credY, fieldWidth, "LOGIN", "USUÁRIO DO PAINEL", revendedor.login, "#dcfce7", "#15803d");
      drawPill(col2X, credY, fieldWidth, "SENHA", "SENHA DE ACESSO", revendedor.senha, "#fef3c7", "#b45309");
    } else if (revendedor.login) {
      drawPill(col1X, credY, cardW - 36, "LOGIN", "USUÁRIO DO PAINEL", revendedor.login, "#dcfce7", "#15803d");
    } else if (revendedor.senha) {
      drawPill(col1X, credY, cardW - 36, "SENHA", "SENHA DE ACESSO", revendedor.senha, "#fef3c7", "#b45309");
    }

    curY += cardCredH + gap;
  }

  // --- 6. CARD OPCIONAL: OBSERVAÇÕES ---
  if (hasObs) {
    const obsText = String(ultimaRecarga?.observacao || revendedor.observacao || "").trim();
    drawCard(ctx, paddingX, curY, cardW, cardObsH);
    ctx.fillStyle = "#64748b";
    ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText("OBSERVAÇÕES:", paddingX + 16, curY + 24);

    ctx.fillStyle = "#334155";
    ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    const maxW = cardW - 32;
    const truncatedObs = ctx.measureText(obsText).width > maxW ? `${obsText.slice(0, 68)}...` : obsText;
    ctx.fillText(truncatedObs, paddingX + 16, curY + 46);

    curY += cardObsH + gap;
  }

  // --- 7. RODAPÉ INSTITUCIONAL RODOLFO TV ---
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(paddingX, curY, cardW, footerHeight);

  // Linha separadora discreta
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(paddingX + 24, curY);
  ctx.lineTo(paddingX + cardW - 24, curY);
  ctx.stroke();

  // Frase oficial de liberação
  ctx.textAlign = "center";
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("Seus créditos já estão liberados para novas ativações e renovações.", width / 2, curY + 30);

  // Frase de parceria
  ctx.fillStyle = "#2563eb";
  ctx.font = "600 11.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("Agradecemos pela parceria — Bons negócios e ótimas vendas!", width / 2, curY + 50);

  // Código de autenticação
  ctx.fillStyle = "#94a3b8";
  ctx.font = "400 10px monospace";
  ctx.fillText(
    `ID: REV-${revendedor.id?.slice(0, 12) || "RODOLFO-TV"} • www.rodolfotv.com`,
    width / 2,
    curY + 74
  );

  return canvas;
}

/**
 * Retorna texto formatado da recarga compatível com mensagem de WhatsApp para revendedores
 */
export function comprovanteRecargaTextoFormatado(
  revendedor: any,
  ultimaRecarga?: any
): string {
  const dataRecargaDate = ultimaRecarga?.created_at
    ? new Date(ultimaRecarga.created_at)
    : revendedor.data_recarga
    ? parseDateOnly(revendedor.data_recarga)
    : new Date();

  const dataStr = formatDateBR(dataRecargaDate);
  const servidorNome = revendedor.servidor?.nome ?? "-";
  const qtd = ultimaRecarga?.quantidade ?? revendedor.creditos ?? 0;

  return [
    `📺 *RODOLFO TV – Área do Revendedor*`,
    ``,
    `♻️ *RECARGA REALIZADA COM SUCESSO!* ✅`,
    ``,
    `👤 Revendedor: *${revendedor.nome ?? "-"}*`,
    `🔑 Login: *${revendedor.login ?? "-"}*`,
    `📅 Data da Recarga: *${dataStr}*`,
    `📦 Quantidade Adicionada: *${qtd} Créditos*`,
    `🗒️ Servidor: *${servidorNome}*`,
    ``,
    `🚀 *Seus créditos já estão liberados para novas ativações e renovações*.`,
    ``,
    `🙏 _Agradecemos pela parceria - Bons negócios e ótimas vendas!_`,
  ].join("\n");
}

/**
 * Exporta a imagem PNG do comprovante de recarga e faz o download automático
 */
export async function exportComprovanteRecargaPNG(
  revendedor: any,
  filename?: string,
  painelUrl?: string
): Promise<void> {
  const data = await getComprovanteRecargaData(revendedor, painelUrl);
  const canvas = renderComprovanteRecargaCanvas(data);
  const safeName = String(revendedor?.nome || "revendedor").replace(/\s+/g, "_");
  const safeFilename = filename || `comprovante-recarga-${safeName}.png`;

  return new Promise<void>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        downloadBlob(blob, safeFilename);
        resolve();
      } else {
        reject(new Error("Falha ao gerar a imagem PNG do comprovante"));
      }
    }, "image/png");
  });
}

/**
 * Copia a imagem PNG do comprovante de recarga diretamente para a Área de Transferência
 * para colar no WhatsApp Web ou Desktop com Ctrl + V.
 */
export async function copyComprovanteRecargaImageToClipboard(
  revendedor: any,
  painelUrl?: string
): Promise<boolean> {
  try {
    const data = await getComprovanteRecargaData(revendedor, painelUrl);
    const canvas = renderComprovanteRecargaCanvas(data);
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
    console.warn("Falha ao copiar imagem de recarga para clipboard:", err);
    return false;
  }
}

/**
 * Exporta o comprovante de recarga como PDF profissional A4
 */
export async function exportComprovanteRecargaPDF(
  revendedor: any,
  filename?: string,
  painelUrl?: string
): Promise<void> {
  const data = await getComprovanteRecargaData(revendedor, painelUrl);
  const canvas = renderComprovanteRecargaCanvas(data);
  const safeName = String(revendedor?.nome || "revendedor").replace(/\s+/g, "_");
  const safeFilename = filename || `comprovante-recarga-${safeName}.pdf`;
  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const marginX = 24;
  const targetW = pageW - marginX * 2;
  const targetH = (canvas.height / canvas.width) * targetW;
  const targetY = targetH < pageH - 24 ? (pageH - targetH) / 2 : 12;

  pdf.addImage(imgData, "PNG", marginX, targetY, targetW, targetH, undefined, "FAST");
  pdf.save(safeFilename);
}
