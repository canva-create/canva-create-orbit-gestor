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

export interface ExtractedCredentials {
  mac?: string | null;
  device?: string | null;
  usuario?: string | null;
  senha?: string | null;
}

/**
 * Identifica e extrai de forma inteligente credenciais de acesso disponíveis no cadastro:
 * MAC, Device, Login/Usuário e Senha.
 */
export function getClientCredentials(cliente: any): ExtractedCredentials {
  const creds: ExtractedCredentials = {};
  const rawMac = String(cliente?.mac ?? "").trim();
  const rawDevice = String(cliente?.device ?? "").trim();
  const rawUser = String(cliente?.usuario ?? cliente?.login ?? "").trim();
  const rawPass = String(cliente?.senha ?? cliente?.password ?? "").trim();
  const obs = String(cliente?.observacao ?? "");

  // 1. Campos explícitos se presentes
  if (rawUser) creds.usuario = rawUser;
  if (rawPass) creds.senha = rawPass;

  // 2. Análise do campo MAC e Device
  if (rawMac) {
    const isRealMac =
      rawMac.includes(":") ||
      rawMac.includes("-") ||
      /^([0-9a-fA-F]{2}){6}$/i.test(rawMac);

    if (isRealMac) {
      creds.mac = rawMac;
      if (rawDevice) creds.device = rawDevice;
    } else {
      // String sem delimitador de MAC (pode ser login/usuário do cliente)
      if (!creds.usuario) {
        creds.usuario = rawMac;
        if (rawDevice && !creds.senha) {
          creds.senha = rawDevice;
        } else if (rawDevice) {
          creds.device = rawDevice;
        }
      } else {
        creds.mac = rawMac;
        if (rawDevice) creds.device = rawDevice;
      }
    }
  } else if (rawDevice) {
    creds.device = rawDevice;
  }

  // 3. Fallback inteligente a partir do campo observação
  if (!creds.usuario) {
    const userMatch = obs.match(/(?:usu[aá]rio|login|user)\s*[:=]\s*([^\s,;]+)/i);
    if (userMatch) creds.usuario = userMatch[1].trim();
  }
  if (!creds.senha) {
    const passMatch = obs.match(/(?:senha|password|pass)\s*[:=]\s*([^\s,;]+)/i);
    if (passMatch) creds.senha = passMatch[1].trim();
  }
  if (!creds.mac) {
    const macMatch = obs.match(/(?:mac)\s*[:=]\s*([0-9a-fA-F:]{12,17})/i);
    if (macMatch) creds.mac = macMatch[1].trim();
  }
  if (!creds.device) {
    const devMatch = obs.match(/(?:device|aparelho|id)\s*[:=]\s*([^\s,;]+)/i);
    if (devMatch) creds.device = devMatch[1].trim();
  }

  return creds;
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
 * Renderiza o comprovante de vencimento e renovação da Rodolfo TV no Canvas
 * com folga generosa, alinhamento visual proporcional e credenciais dinâmicas.
 */
export function renderComprovanteVencimentoCanvas(
  data: ComprovanteVencimentoData
): HTMLCanvasElement {
  const { cliente, ultimaRenovacao } = data;

  // Largura ampliada para máxima legibilidade e folga lateral
  const width = 620;
  const paddingX = 28;
  const cardW = width - paddingX * 2; // 564px
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

  // Extração inteligente de credenciais
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
  const hasObs = Boolean(cliente?.observacao?.trim());

  // Espaçamentos e alturas com folga confortável
  const headerHeight = 194;
  const gap = 16;
  const badgeHeight = 48;

  // Card 1: Dados do Cliente & Serviço (Cliente, Contato, Aplicativo, Servidor)
  const cardClienteH = 38 + 2 * 44 + 14; // 140px

  // Card 2: Credenciais de Acesso (quando disponível)
  const credRowsCount = Math.ceil(credItems.length / 2);
  const cardCredH = hasCreds ? 38 + credRowsCount * 52 + 12 : 0;

  // Card 3: Vigência & Renovação
  const vigenciaRows = ultimaRenovacao?.dias_adicionados ? 4 : 3;
  const cardVigenciaH = 38 + vigenciaRows * 44 + 14;

  // Card 4: Observações
  const cardObsH = hasObs ? 74 : 0;
  const footerHeight = 96;

  const totalHeight =
    headerHeight +
    gap +
    badgeHeight +
    gap +
    cardClienteH +
    (hasCreds ? gap + cardCredH : 0) +
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

  // Fundo geral do documento
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, width, totalHeight);

  // --- 1. CABEÇALHO DARK COM DEGRADÊ & EMBLEMA RODOLFO TV ---
  const headerGrad = ctx.createLinearGradient(0, 0, 0, headerHeight);
  headerGrad.addColorStop(0, "#080e1a");
  headerGrad.addColorStop(0.5, "#0f172a");
  headerGrad.addColorStop(1, "#162035");
  ctx.fillStyle = headerGrad;
  ctx.fillRect(0, 0, width, headerHeight);

  // Emblema Oficial Rodolfo TV (Águia Real Dourada e Ciano)
  const logoX = width / 2;
  const emblemY = 48;
  drawRodolfoTVEmblem(ctx, logoX, emblemY, 1.08, "eagle");

  // Nome "RODOLFO TV" em destaque robusto e caixa alta
  ctx.save();
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(56, 189, 248, 0.45)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 25px -apple-system, BlinkMacSystemFont, 'Montserrat', 'Segoe UI', Roboto, sans-serif";
  ctx.letterSpacing = "4px";
  ctx.fillText("RODOLFO TV", logoX, 116);
  ctx.restore();

  // Título: "COMPROVANTE DE VENCIMENTO"
  ctx.textAlign = "center";
  ctx.fillStyle = "#38bdf8";
  ctx.font = "700 15px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.letterSpacing = "1.5px";
  ctx.fillText("COMPROVANTE DE VENCIMENTO", logoX, 140);
  ctx.letterSpacing = "0px";

  // Subtítulo: "Emitido em DD/MM/AAAA às HH:mm:ss"
  const agoraStr = formatDateTimeBR(new Date());
  ctx.fillStyle = "#94a3b8";
  ctx.font = "400 11.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(`Emitido em ${agoraStr}`, logoX, 163);

  let curY = headerHeight + gap;

  // --- 2. BANNER DE STATUS DO VENCIMENTO ---
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
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(paddingX, curY, cardW, badgeHeight, 10);
  ctx.fill();
  ctx.stroke();

  // Ícone de status no banner
  const badgeCenterX = width / 2;
  ctx.textAlign = "center";
  ctx.fillStyle = badgeTextColor;
  ctx.font = "bold 13.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(badgeMsg, badgeCenterX, curY + 29);

  curY += badgeHeight + gap;

  // Coordenadas das duas colunas com folga
  const col1X = paddingX + 18;
  const col2X = paddingX + cardW / 2 + 12;
  const fieldWidth = cardW / 2 - 30;

  // Helper para desenhar campos com espaçamento respirável
  const drawField = (
    x: number,
    y: number,
    label: string,
    val: string,
    isHighlight = false
  ) => {
    ctx.textAlign = "left";
    ctx.fillStyle = "#64748b";
    ctx.font = "600 10.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(label.toUpperCase(), x, y);

    ctx.fillStyle = isHighlight ? "#0284c7" : "#0f172a";
    ctx.font = "bold 13.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    const truncated =
      ctx.measureText(val).width > fieldWidth
        ? `${val.slice(0, 26)}...`
        : val;
    ctx.fillText(truncated, x, y + 17);
  };

  // --- 3. CARD: DADOS DO CLIENTE & SERVIÇO ---
  drawCard(ctx, paddingX, curY, cardW, cardClienteH);
  drawCardHeader(ctx, paddingX, curY, cardW, "DADOS DO CLIENTE & SERVIÇO");

  let rowY = curY + 54;
  drawField(col1X, rowY, "Cliente", String(cliente.nome || "-"));
  drawField(col2X, rowY, "Contato / WhatsApp", contatoFmt);
  rowY += 44;

  drawField(
    col1X,
    rowY,
    "Aplicativo (APP)",
    String(cliente.aplicativo || "-"),
    true
  );
  drawField(
    col2X,
    rowY,
    "Servidor IPTV",
    String(cliente.servidor?.nome || "Painel Rodolfo TV")
  );

  curY += cardClienteH + gap;

  // --- 4. CARD: DADOS DE ACESSO & DISPOSITIVO (SE DISPONÍVEL) ---
  if (hasCreds) {
    drawCard(ctx, paddingX, curY, cardW, cardCredH);
    drawCardHeader(
      ctx,
      paddingX,
      curY,
      cardW,
      "DADOS DE ACESSO & DISPOSITIVO",
      "ATIVO"
    );

    let credY = curY + 52;
    for (let i = 0; i < credItems.length; i += 2) {
      const item1 = credItems[i];
      const item2 = credItems[i + 1];

      const drawPillItem = (
        x: number,
        y: number,
        w: number,
        item: typeof item1
      ) => {
        // Caixa de fundo suave estilo código
        ctx.fillStyle = "#f8fafc";
        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y, w, 40, 8);
        ctx.fill();
        ctx.stroke();

        // Badge lateral do tipo
        ctx.fillStyle = item.badgeBg;
        ctx.beginPath();
        ctx.roundRect(x + 6, y + 8, 48, 24, 6);
        ctx.fill();

        ctx.textAlign = "center";
        ctx.fillStyle = item.badgeColor;
        ctx.font = "bold 9.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.fillText(item.badge, x + 30, y + 23);

        // Label e valor
        ctx.textAlign = "left";
        ctx.fillStyle = "#64748b";
        ctx.font = "500 9px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.fillText(item.label, x + 62, y + 14);

        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 12.5px 'SF Mono', 'Courier New', monospace, sans-serif";
        const maxTextW = w - 70;
        const valTxt =
          ctx.measureText(item.value).width > maxTextW
            ? `${item.value.slice(0, 22)}...`
            : item.value;
        ctx.fillText(valTxt, x + 62, y + 29);
      };

      if (item1 && item2) {
        drawPillItem(col1X, credY, fieldWidth, item1);
        drawPillItem(col2X, credY, fieldWidth, item2);
      } else if (item1) {
        // Item único centralizado ou expandido confortavelmente
        drawPillItem(col1X, credY, cardW - 36, item1);
      }

      credY += 52;
    }

    curY += cardCredH + gap;
  }

  // --- 5. CARD: INFORMAÇÕES DE VIGÊNCIA & RENOVAÇÃO ---
  drawCard(ctx, paddingX, curY, cardW, cardVigenciaH);
  drawCardHeader(
    ctx,
    paddingX,
    curY,
    cardW,
    "INFORMAÇÕES DE VIGÊNCIA & RENOVAÇÃO"
  );

  rowY = curY + 54;
  drawField(col1X, rowY, "Data da Renovação", dataRenovStr);
  drawField(col2X, rowY, "Novo Vencimento", dataVencStr, true);
  rowY += 44;

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
  rowY += 44;

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

  if (ultimaRenovacao?.dias_adicionados) {
    rowY += 44;
    drawField(
      col1X,
      rowY,
      "Dias Adicionados",
      `+${ultimaRenovacao.dias_adicionados} dias adicionados`
    );
    drawField(col2X, rowY, "Canal de Emissão", "Painel Oficial Rodolfo TV");
  }

  curY += cardVigenciaH + gap;

  // --- 6. CARD OPCIONAL: OBSERVAÇÕES ---
  if (hasObs) {
    drawCard(ctx, paddingX, curY, cardW, cardObsH);
    ctx.fillStyle = "#64748b";
    ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText("OBSERVAÇÕES:", paddingX + 16, curY + 24);

    ctx.fillStyle = "#334155";
    ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    const obsText = String(cliente.observacao);
    const maxW = cardW - 32;
    const truncatedObs =
      ctx.measureText(obsText).width > maxW
        ? `${obsText.slice(0, 68)}...`
        : obsText;
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

  // Frase oficial
  ctx.textAlign = "center";
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(FRASE_RODOLFO_TV, width / 2, curY + 32);

  // Subfrase
  ctx.fillStyle = "#64748b";
  ctx.font = "400 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(
    "Documento digital emitido e verificado pelo sistema Rodolfo TV.",
    width / 2,
    curY + 52
  );

  // Código de autenticação
  ctx.fillStyle = "#94a3b8";
  ctx.font = "400 10px monospace";
  ctx.fillText(
    `ID: ${cliente.id?.slice(0, 16) || "RODOLFO-TV-VERIFIED"} • www.rodolfotv.com`,
    width / 2,
    curY + 74
  );

  return canvas;
}

/**
 * Retorna texto formatado com suporte a todas as credenciais disponíveis
 */
export function comprovanteVencimentoTextoFormatado(
  cliente: any,
  ultimaRenovacao?: any
): string {
  const creds = getClientCredentials(cliente);
  const app = cliente.aplicativo || "-";
  const nome = cliente.nome || "-";
  const contatoRaw = (
    cliente.telefone ||
    cliente.celular ||
    cliente.whatsapp ||
    ""
  ).toString();
  const contato = contatoRaw.replace(/\D/g, "")
    ? maskPhoneBR(contatoRaw)
    : "-";

  const dataRenovDate = ultimaRenovacao?.created_at
    ? new Date(ultimaRenovacao.created_at)
    : new Date();
  const hh = String(dataRenovDate.getHours()).padStart(2, "0");
  const mm = String(dataRenovDate.getMinutes()).padStart(2, "0");
  const ss = String(dataRenovDate.getSeconds()).padStart(2, "0");
  const dataRenov = `${formatDateBR(dataRenovDate)} às ${hh}:${mm}:${ss}`;

  const vencISO = cliente.data_vencimento || ultimaRenovacao?.vencimento_novo;
  const dataVenc = vencISO
    ? `${formatDateBR(vencISO)} às ${hh}:${mm}:${ss}`
    : "-";
  const dias = diasParaVencer(vencISO);
  const diasTxt = dias == null ? "-" : `${dias} dias`;

  const blocos: string[] = [];
  blocos.push(`📺 *RODOLFO TV*`);
  blocos.push(`✅ *Renovação Realizada com Sucesso!*`);

  const dadosCli = [
    `👤 *Cliente:* *${nome}*`,
    `📱 *APP:* *${app}*`,
    `📞 *Contato:* *${contato}*`,
  ];
  if (cliente.servidor?.nome) {
    dadosCli.push(`🌐 *Servidor:* *${cliente.servidor.nome}*`);
  }
  blocos.push(dadosCli.join("\n"));

  // Credenciais disponíveis
  const credLinhas: string[] = [];
  if (creds.mac) credLinhas.push(`🔗 *MAC:* \`${creds.mac}\``);
  if (creds.device) credLinhas.push(`📱 *Device:* \`${creds.device}\``);
  if (creds.usuario) credLinhas.push(`🔑 *Login/Usuário:* \`${creds.usuario}\``);
  if (creds.senha) credLinhas.push(`🔐 *Senha:* \`${creds.senha}\``);
  if (credLinhas.length > 0) {
    blocos.push(credLinhas.join("\n"));
  }

  blocos.push(
    [
      `🗓️ *Renovação:* *${dataRenov}*`,
      `📅 *Vencimento:* *${dataVenc}*`,
      `⏳ *Dias para Vencer:* *${diasTxt}*`,
      ...(cliente.valor_pago
        ? [`💰 *Valor:* *${currencyBRL(cliente.valor_pago)}*`]
        : []),
    ].join("\n")
  );

  blocos.push(`✨ *${FRASE_RODOLFO_TV}*`);
  return blocos.join("\n\n");
}

/**
 * Exporta a imagem PNG do comprovante de vencimento e faz o download automático
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
 * para colar no WhatsApp Web ou Desktop com Ctrl + V.
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
 * Exporta como PDF profissional A4 centralizado
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
  const marginX = 24;
  const targetW = pageW - marginX * 2;
  const targetH = (canvas.height / canvas.width) * targetW;
  const targetY = targetH < pageH - 24 ? (pageH - targetH) / 2 : 12;

  pdf.addImage(
    imgData,
    "PNG",
    marginX,
    targetY,
    targetW,
    targetH,
    undefined,
    "FAST"
  );
  pdf.save(safeFilename);
}
