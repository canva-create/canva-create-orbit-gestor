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
  contas?: any[]; // Lista de contas vinculadas quando multi-contas
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
 * Mapeamento de termos ordinais em português para ordenação e identificação
 */
const ORDINAIS_MAP: Record<string, number> = {
  "1": 1, "01": 1, "um": 1, "primeiro": 1, "primeira": 1, "i": 1,
  "2": 2, "02": 2, "dois": 2, "duas": 2, "segundo": 2, "segunda": 2, "ii": 2,
  "3": 3, "03": 3, "tres": 3, "três": 3, "terceiro": 3, "terceira": 3, "iii": 3,
  "4": 4, "04": 4, "quatro": 4, "quarto": 4, "quarta": 4, "iv": 4,
  "5": 5, "05": 5, "cinco": 5, "quinto": 5, "quinta": 5, "v": 5,
  "6": 6, "06": 6, "seis": 6, "sexto": 6, "sexta": 6, "vi": 6,
  "7": 7, "07": 7, "sete": 7, "setimo": 7, "sétimo": 7, "setima": 7, "sétima": 7, "vii": 7,
  "8": 8, "08": 8, "oito": 8, "oitavo": 8, "oitava": 8, "viii": 8,
  "9": 9, "09": 9, "nove": 9, "nono": 9, "nona": 9, "ix": 9,
  "10": 10, "dez": 10, "decimo": 10, "décimo": 10, "decima": 10, "décima": 10, "x": 10,
};

/**
 * Extrai a raiz base do nome do cliente, isolando numerais ou ordinais no final.
 * Exemplos:
 * - "João Silva 1" -> base: "João Silva", sufixo: "1", ordinalNum: 1
 * - "João Silva - Tela 2" -> base: "João Silva", sufixo: "Tela 2", ordinalNum: 2
 * - "João Silva Quarto" -> base: "João Silva", sufixo: "Quarto", ordinalNum: 4
 * - "João Silva (Ponto 3)" -> base: "João Silva", sufixo: "Ponto 3", ordinalNum: 3
 */
export function extrairNomeBaseCliente(nome: string): {
  base: string;
  sufixo: string;
  ordinalNum: number | null;
} {
  if (!nome) return { base: "", sufixo: "", ordinalNum: null };
  const trimmed = nome.trim();

  const regex = /[\s\-_/(\[]*(?:tela|conta|conex[aã]o|ponto|tv)?\s*(\b(?:[0-9]{1,2}|um|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|quint[oa]|sext[oa]|s[eé]tim[oa]|oitav[oa]|non[oa]|d[eé]cim[oa])\b|\b[ivxlcdm]+\b)[\s\-)\]]*$/i;

  const match = trimmed.match(regex);
  if (match) {
    const rawMatch = match[1].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const base = trimmed.slice(0, match.index).trim().replace(/[\s\-_/(\[]+$/, "").trim();
    if (base.length >= 2) {
      const ordinalNum = ORDINAIS_MAP[rawMatch] ?? null;
      return {
        base,
        sufixo: match[0].trim().replace(/^[(\[\-_/]+|[)\]]+$/g, "").trim(),
        ordinalNum,
      };
    }
  }

  return { base: trimmed, sufixo: "", ordinalNum: null };
}

/**
 * Localiza todas as contas ativas vinculadas ao mesmo cliente que possuam a mesma data de vencimento.
 */
export function encontrarContasVinculadas(cliente: any, todosClientes: any[]): any[] {
  if (!cliente || !Array.isArray(todosClientes) || todosClientes.length === 0) {
    return [cliente];
  }

  const cleanPhone = (p: any) => String(p || "").replace(/\D/g, "");
  const cPhone = cleanPhone(cliente.telefone || cliente.celular || cliente.whatsapp);
  const { base: cBase } = extrairNomeBaseCliente(cliente.nome || "");
  const cNormBase = cBase.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const cVenc = cliente.data_vencimento;

  const vinculados = todosClientes.filter((outro: any) => {
    if (outro.deleted_at) return false;
    if (outro.status === "cancelado" || outro.status === "suspenso") return false;

    // Se as datas de vencimento forem diferentes, não agrupa no mesmo comprovante de renovação
    if (cVenc && outro.data_vencimento && cVenc !== outro.data_vencimento) {
      return false;
    }

    // 1. Mesmo telefone com pelo menos 8 dígitos
    const oPhone = cleanPhone(outro.telefone || outro.celular || outro.whatsapp);
    if (cPhone.length >= 8 && oPhone.length >= 8 && cPhone === oPhone) {
      return true;
    }

    // 2. Mesmo nome base
    if (cNormBase.length >= 3) {
      const { base: oBase } = extrairNomeBaseCliente(outro.nome || "");
      const oNormBase = oBase.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (cNormBase === oNormBase) {
        return true;
      }
    }

    return false;
  });

  if (!vinculados.some((v) => v.id === cliente.id)) {
    vinculados.unshift(cliente);
  }

  // Ordena pelo número ordinal ou nome
  return vinculados.sort((a, b) => {
    const ordA = extrairNomeBaseCliente(a.nome || "").ordinalNum ?? 999;
    const ordB = extrairNomeBaseCliente(b.nome || "").ordinalNum ?? 999;
    if (ordA !== ordB) return ordA - ordB;
    return (a.nome || "").localeCompare(b.nome || "", "pt-BR", { numeric: true });
  });
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
  cliente: any,
  contas?: any[]
): Promise<ComprovanteVencimentoData> {
  try {
    const ids = contas && contas.length > 0 ? contas.map((c) => c.id) : [cliente.id];
    const { data: ultimas } = await supabase
      .from("historico_renovacoes")
      .select("created_at, vencimento_novo, dias_adicionados")
      .in("cliente_id", ids)
      .order("created_at", { ascending: false })
      .limit(1);

    const ultima = ultimas && ultimas.length > 0 ? ultimas[0] : null;

    return {
      cliente,
      contas: contas && contas.length > 1 ? contas : undefined,
      ultimaRenovacao: ultima || null,
    };
  } catch (err) {
    console.warn("Erro ao buscar última renovação para comprovante:", err);
    return { cliente, contas: contas && contas.length > 1 ? contas : undefined, ultimaRenovacao: null };
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

  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + headerH);
  ctx.lineTo(x + w, y + headerH);
  ctx.stroke();

  // Bullet azul brilhante no início do título
  ctx.fillStyle = "#0284c7";
  ctx.beginPath();
  ctx.arc(x + 18, y + headerH / 2, 4.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = "left";
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(title.toUpperCase(), x + 32, y + 24);

  if (badgeText) {
    ctx.textAlign = "right";
    ctx.fillStyle = "#0284c7";
    ctx.font = "600 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(badgeText, x + w - 16, y + 24);
  }
}

/**
 * Renderiza o comprovante de vencimento completo no Canvas (suportando conta individual ou multi-contas)
 */
export function renderComprovanteVencimentoCanvas(
  data: ComprovanteVencimentoData
): HTMLCanvasElement {
  const { cliente, contas, ultimaRenovacao } = data;
  const isMulti = Boolean(contas && contas.length > 1);
  const listaContas = isMulti ? contas! : [cliente];

  const width = 620;
  const paddingX = 28;
  const cardW = width - paddingX * 2;
  const scale = 2;

  // Cálculos de datas
  const dataRenovDate = ultimaRenovacao?.created_at
    ? new Date(ultimaRenovacao.created_at)
    : new Date();
  const hh = String(dataRenovDate.getHours()).padStart(2, "0");
  const mm = String(dataRenovDate.getMinutes()).padStart(2, "0");
  const ss = String(dataRenovDate.getSeconds()).padStart(2, "0");
  const dataRenovStr = `${formatDateBR(dataRenovDate)} às ${hh}:${mm}:${ss}`;

  const vencISO = ultimaRenovacao?.vencimento_novo || cliente?.data_vencimento;
  const dataVencStr = vencISO
    ? `${formatDateBR(vencISO)} às ${hh}:${mm}:${ss}`
    : "-";

  const dias = diasParaVencer(vencISO);
  const isVencido = dias !== null && dias < 0;
  const isVenceHoje = dias === 0;

  const contatoRaw = (
    listaContas.find((c) => c.telefone)?.telefone ||
    cliente.telefone ||
    cliente.celular ||
    cliente.whatsapp ||
    ""
  ).toString();
  const contatoFmt = contatoRaw.replace(/\D/g, "")
    ? maskPhoneBR(contatoRaw)
    : "-";

  const { base: nomeBase } = extrairNomeBaseCliente(cliente.nome || "");
  const nomeClientePrincipal = isMulti ? (nomeBase || cliente.nome) : cliente.nome;
  const valorTotalPlano = listaContas.reduce((sum, c) => sum + Number(c.valor_pago || 0), 0);

  const dataInicRaw = cliente?.data_inicio || cliente?.created_at;
  const dataInicStr = dataInicRaw ? formatDateBR(dataInicRaw) : "-";
  const appStr = listaContas.find((c) => c.aplicativo)?.aplicativo || cliente.aplicativo || "-";

  // Layout Dinâmico
  const headerHeight = 194;
  const gap = 16;
  const badgeHeight = 48;

  // Card 1: Dados do Cliente (Nome, Contato, App)
  const cardClienteH = 38 + 2 * 46 + 14;

  // Card 2: Contas / Telas ou Credenciais
  let cardContasH = 0;
  let singleCredRows = 0;
  const singleCreds = getClientCredentials(cliente);
  if (isMulti) {
    // 38px header + 54px por conta + margem
    cardContasH = 38 + listaContas.length * 54 + 12;
  } else {
    const hasUserOrPass = Boolean(singleCreds.usuario || singleCreds.senha);
    const hasMacOrDev = Boolean(singleCreds.mac || singleCreds.device);
    if (hasUserOrPass && hasMacOrDev) {
      singleCredRows = 2;
    } else if (hasUserOrPass || hasMacOrDev) {
      singleCredRows = 1;
    }
    cardContasH = singleCredRows > 0 ? 38 + singleCredRows * 46 + 14 : 0;
  }

  // Card 3: Vigência & Renovação
  const cardVigenciaH = 38 + 2 * 46 + 14;
  const footerHeight = 96;

  const totalHeight =
    headerHeight +
    gap +
    badgeHeight +
    gap +
    cardClienteH +
    (cardContasH > 0 ? gap + cardContasH : 0) +
    gap +
    cardVigenciaH +
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

  // Emblema Oficial Rodolfo TV
  const logoX = width / 2;
  const emblemY = 48;
  drawRodolfoTVEmblem(ctx, logoX, emblemY, 1.08, "eagle");

  // Nome "RODOLFO TV"
  ctx.save();
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(56, 189, 248, 0.45)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 25px -apple-system, BlinkMacSystemFont, 'Montserrat', 'Segoe UI', Roboto, sans-serif";
  ctx.letterSpacing = "4px";
  ctx.fillText("RODOLFO TV", logoX, 116);
  ctx.restore();

  // Título
  ctx.textAlign = "center";
  ctx.fillStyle = "#38bdf8";
  ctx.font = "700 15px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.letterSpacing = "1.5px";
  ctx.fillText("COMPROVANTE DE VENCIMENTO", logoX, 140);
  ctx.letterSpacing = "0px";

  const agoraStr = formatDateTimeBR(new Date());
  ctx.fillStyle = "#94a3b8";
  ctx.font = "400 11.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(`Emitido em ${agoraStr}`, logoX, 163);

  let curY = headerHeight + gap;

  // --- 2. BANNER DE STATUS DO VENCIMENTO ---
  let badgeBg = "#dcfce7";
  let badgeBorder = "#86efac";
  let badgeTextColor = "#15803d";
  let badgeMsg = isMulti
    ? `RENOVAÇÃO REALIZADA COM SUCESSO • ${listaContas.length} TELAS VINCULADAS`
    : "RENOVAÇÃO REALIZADA COM SUCESSO!";

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
  }

  ctx.fillStyle = badgeBg;
  ctx.strokeStyle = badgeBorder;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(paddingX, curY, cardW, badgeHeight, 10);
  ctx.fill();
  ctx.stroke();

  const badgeCenterX = width / 2;
  ctx.textAlign = "center";
  ctx.fillStyle = badgeTextColor;
  ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(badgeMsg, badgeCenterX, curY + 29);

  curY += badgeHeight + gap;

  const col1X = paddingX + 18;
  const col2X = paddingX + cardW / 2 + 12;
  const fieldWidth = cardW / 2 - 30;

  const drawField = (x: number, y: number, label: string, val: string, isHighlight = false) => {
    ctx.textAlign = "left";
    ctx.fillStyle = "#64748b";
    ctx.font = "600 10.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(label.toUpperCase(), x, y);

    ctx.fillStyle = isHighlight ? "#0284c7" : "#0f172a";
    ctx.font = "bold 13.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    const truncated = ctx.measureText(val).width > fieldWidth ? `${val.slice(0, 26)}...` : val;
    ctx.fillText(truncated, x, y + 17);
  };

  // --- 3. CARD: DADOS DO CLIENTE & CONTATO ---
  drawCard(ctx, paddingX, curY, cardW, cardClienteH);
  drawCardHeader(ctx, paddingX, curY, cardW, "DADOS DO CLIENTE", isMulti ? `${listaContas.length} TELAS` : undefined);

  let rowY = curY + 54;
  drawField(col1X, rowY, "Cliente", String(nomeClientePrincipal || "-"));
  drawField(col2X, rowY, "Contato / Celular", contatoFmt);
  rowY += 46;
  drawField(col1X, rowY, "Aplicativo", String(appStr || "-"));
  drawField(col2X, rowY, "Assinatura", isMulti ? `${listaContas.length} Telas Vinculadas` : "Individual");
  curY += cardClienteH + gap;

  // --- 4. CARD: CONTAS / TELAS VINCULADAS OU CREDENCIAIS ---
  if (isMulti) {
    drawCard(ctx, paddingX, curY, cardW, cardContasH);
    drawCardHeader(ctx, paddingX, curY, cardW, "CONTAS & TELAS RENOVADAS", `${listaContas.length} TELAS`);

    let itemY = curY + 48;
    listaContas.forEach((c, idx) => {
      const { sufixo } = extrairNomeBaseCliente(c.nome || "");
      const label = sufixo ? `CONTA ${sufixo}` : `CONTA ${idx + 1}`;
      const creds = getClientCredentials(c);
      const app = c.aplicativo || "-";

      // Fundo sutil para cada item
      ctx.fillStyle = idx % 2 === 0 ? "#f8fafc" : "#ffffff";
      ctx.beginPath();
      ctx.roundRect(paddingX + 12, itemY - 6, cardW - 24, 46, 8);
      ctx.fill();
      ctx.strokeStyle = "#e2e8f0";
      ctx.stroke();

      // Badge da conta
      ctx.fillStyle = "#e0f2fe";
      ctx.beginPath();
      ctx.roundRect(paddingX + 20, itemY + 2, 70, 22, 6);
      ctx.fill();
      ctx.fillStyle = "#0284c7";
      ctx.font = "bold 10.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label, paddingX + 55, itemY + 17);

      // App e Credenciais
      ctx.textAlign = "left";
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 11.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillText(`APP: ${app}`, paddingX + 100, itemY + 17);

      const credParts: string[] = [];
      if (creds.usuario) credParts.push(`User: ${creds.usuario}`);
      if (creds.senha) credParts.push(`Senha: ${creds.senha}`);
      if (creds.mac) credParts.push(`MAC: ${creds.mac}`);
      if (creds.device) credParts.push(`Dev: ${creds.device}`);

      const credText = credParts.join(" • ") || "Acesso ativo";
      ctx.fillStyle = "#64748b";
      ctx.font = "500 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillText(credText, paddingX + 240, itemY + 17);

      itemY += 54;
    });

    curY += cardContasH + gap;
  } else if (cardContasH > 0) {
    // Single account credentials card
    drawCard(ctx, paddingX, curY, cardW, cardContasH);
    drawCardHeader(ctx, paddingX, curY, cardW, "CREDENCIAS DE ACESSO");
    let cY = curY + 54;

    if (singleCredRows === 2) {
      drawField(col1X, cY, "Login / Usuário", singleCreds.usuario || "-", true);
      drawField(col2X, cY, "Senha de Acesso", singleCreds.senha || "-", true);
      cY += 46;
      drawField(col1X, cY, "Endereço MAC", singleCreds.mac || "-", true);
      drawField(col2X, cY, "Device / Aparelho", singleCreds.device || "-", true);
    } else if (singleCredRows === 1) {
      const leftLabel = singleCreds.usuario ? "Login / Usuário" : "Endereço MAC";
      const leftVal = singleCreds.usuario || singleCreds.mac || "-";
      const rightLabel = singleCreds.senha ? "Senha de Acesso" : "Device / Aparelho";
      const rightVal = singleCreds.senha || singleCreds.device || "-";
      drawField(col1X, cY, leftLabel, leftVal, true);
      drawField(col2X, cY, rightLabel, rightVal, true);
    }
    curY += cardContasH + gap;
  }

  // --- 5. CARD: VIGÊNCIA DO PLANO (SEM VALORES) ---
  drawCard(ctx, paddingX, curY, cardW, cardVigenciaH);
  drawCardHeader(ctx, paddingX, curY, cardW, "VIGÊNCIA DO PLANO");

  rowY = curY + 54;
  drawField(col1X, rowY, "Data de Início", dataInicStr);
  drawField(col2X, rowY, "Data da Renovação", dataRenovStr);
  rowY += 46;

  const diasTxt = dias === null ? "-" : dias < 0 ? `${Math.abs(dias)} dias atrás` : dias === 0 ? "Vence hoje" : `${dias} dias`;
  drawField(col1X, rowY, "Data de Vencimento", dataVencStr, true);
  drawField(col2X, rowY, "Dias para Vencer", diasTxt, isVencido || isVenceHoje);
  curY += cardVigenciaH + gap;

  // --- 6. RODAPÉ ---
  ctx.textAlign = "center";
  ctx.fillStyle = "#64748b";
  ctx.font = "italic 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(FRASE_RODOLFO_TV, width / 2, curY + 26);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "400 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("Comprovante gerado automaticamente pela Rodolfo TV. Documento sem valor fiscal.", width / 2, curY + 44);

  return canvas;
}

/**
 * Retorna o comprovante de vencimento em texto formatado para WhatsApp (Individual)
 */
export function comprovanteVencimentoTextoFormatado(
  cliente: any,
  ultimaRenovacao?: any
): string {
  const nome = cliente?.nome || "-";
  const contatoRaw = (
    cliente?.telefone ||
    cliente?.celular ||
    cliente?.whatsapp ||
    ""
  ).toString();
  const contato = maskPhoneBR(contatoRaw) || contatoRaw || "-";
  const app = cliente?.aplicativo || "-";

  const dataInicRaw = cliente?.data_inicio || cliente?.created_at;
  const dataInic = dataInicRaw ? formatDateBR(dataInicRaw) : "-";

  const dataRenovDate = ultimaRenovacao?.created_at
    ? new Date(ultimaRenovacao.created_at)
    : new Date();
  const hh = String(dataRenovDate.getHours()).padStart(2, "0");
  const mm = String(dataRenovDate.getMinutes()).padStart(2, "0");
  const ss = String(dataRenovDate.getSeconds()).padStart(2, "0");
  const dataRenov = `${formatDateBR(dataRenovDate)} às ${hh}:${mm}:${ss}`;

  const vencISO = ultimaRenovacao?.vencimento_novo || cliente?.data_vencimento;
  const dataVenc = vencISO
    ? `${formatDateBR(vencISO)} às ${hh}:${mm}:${ss}`
    : "-";
  const dias = diasParaVencer(vencISO);
  const diasTxt = dias === null ? "-" : dias < 0 ? `Vencido há ${Math.abs(dias)} dia(s)` : dias === 0 ? "Vence hoje" : `${dias} dia(s)`;

  const creds = getClientCredentials(cliente);
  const credLines: string[] = [];
  if (creds.usuario) credLines.push(`🔑 *Login:* *${creds.usuario}*`);
  if (creds.senha) credLines.push(`🔒 *Senha:* *${creds.senha}*`);
  if (creds.mac) credLines.push(`🌐 *MAC:* *${creds.mac}*`);
  if (creds.device) credLines.push(`📱 *Device:* *${creds.device}*`);

  return [
    `📺 *RODOLFO TV*`,
    ``,
    `✅ *Comprovante de Renovação*`,
    ``,
    `👤 *Cliente:* *${nome}*`,
    `📞 *Celular:* *${contato}*`,
    `📺 *Aplicativo:* *${app}*`,
    ...(credLines.length > 0 ? [``, ...credLines] : []),
    ``,
    `🚀 *Data de Início:* *${dataInic}*`,
    `🗓️ *Data da Renovação:* *${dataRenov}*`,
    `📅 *Data de Vencimento:* *${dataVenc}*`,
    `⌛ *Dias a Vencer:* *${diasTxt}*`,
    ``,
    `🙏 *Obrigado pela preferência e confiança!*`,
  ].join("\n");
}

/**
 * Retorna o comprovante de vencimento unificado para clientes com múltiplas contas/telas.
 */
export function comprovanteVencimentoMultiContasTextoFormatado(
  contas: any[],
  ultimaRenovacao?: any
): string {
  if (!contas || contas.length === 0) return "";
  if (contas.length === 1) {
    return comprovanteVencimentoTextoFormatado(contas[0], ultimaRenovacao);
  }

  const clientePrincipal = contas[0];
  const { base: nomeBase } = extrairNomeBaseCliente(clientePrincipal.nome || "");
  const nomeExibicao = nomeBase || clientePrincipal.nome || "-";

  const contatoRaw = (
    contas.find((c) => c.telefone)?.telefone ||
    clientePrincipal.telefone ||
    ""
  ).toString();
  const contato = maskPhoneBR(contatoRaw) || contatoRaw || "-";
  const app = clientePrincipal.aplicativo || "-";

  const dataInicRaw = clientePrincipal.data_inicio || clientePrincipal.created_at;
  const dataInic = dataInicRaw ? formatDateBR(dataInicRaw) : "-";

  const dataRenovDate = ultimaRenovacao?.created_at
    ? new Date(ultimaRenovacao.created_at)
    : new Date();
  const hh = String(dataRenovDate.getHours()).padStart(2, "0");
  const mm = String(dataRenovDate.getMinutes()).padStart(2, "0");
  const ss = String(dataRenovDate.getSeconds()).padStart(2, "0");
  const dataRenov = `${formatDateBR(dataRenovDate)} às ${hh}:${mm}:${ss}`;

  const vencISO = ultimaRenovacao?.vencimento_novo || clientePrincipal?.data_vencimento;
  const dataVenc = vencISO
    ? `${formatDateBR(vencISO)} às ${hh}:${mm}:${ss}`
    : "-";
  const dias = diasParaVencer(vencISO);
  const diasTxt = dias === null ? "-" : dias < 0 ? `Vencido há ${Math.abs(dias)} dia(s)` : dias === 0 ? "Vence hoje" : `${dias} dia(s)`;

  const linhasContas = contas.map((c, idx) => {
    const { sufixo } = extrairNomeBaseCliente(c.nome || "");
    const labelConta = sufixo ? `Conta ${sufixo}` : `Conta ${idx + 1}`;
    const creds = getClientCredentials(c);
    const itemApp = c.aplicativo ? ` [${c.aplicativo}]` : "";

    const detalhes: string[] = [];
    if (creds.usuario) detalhes.push(`Login: *${creds.usuario}*`);
    if (creds.senha) detalhes.push(`Senha: *${creds.senha}*`);
    if (creds.mac) detalhes.push(`MAC: *${creds.mac}*`);
    if (creds.device) detalhes.push(`Device: *${creds.device}*`);

    const credsStr = detalhes.length > 0 ? ` (${detalhes.join(" | ")})` : "";
    return `  ▫️ *${labelConta}*${itemApp}${credsStr}`;
  });

  return [
    `📺 *RODOLFO TV*`,
    ``,
    `✅ *Comprovante de Renovação (${contas.length} Telas)*`,
    ``,
    `👤 *Cliente:* *${nomeExibicao}*`,
    `📞 *Celular:* *${contato}*`,
    `📺 *Aplicativo:* *${app}*`,
    ``,
    `📱 *Contas / Telas (${contas.length}):*`,
    ...linhasContas,
    ``,
    `🚀 *Data de Início:* *${dataInic}*`,
    `🗓️ *Data da Renovação:* *${dataRenov}*`,
    `📅 *Data de Vencimento:* *${dataVenc}*`,
    `⌛ *Dias a Vencer:* *${diasTxt}*`,
    ``,
    `🙏 *Obrigado pela preferência e confiança!*`,
  ].join("\n");
}

/**
 * Exporta a imagem PNG do comprovante de vencimento individual ou multi-contas
 */
export async function exportComprovanteVencimentoPNG(
  cliente: any,
  contas?: any[],
  filename?: string
): Promise<void> {
  const data = await getComprovanteVencimentoData(cliente, contas);
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
 */
export async function copyComprovanteVencimentoImageToClipboard(
  cliente: any,
  contas?: any[]
): Promise<boolean> {
  try {
    const data = await getComprovanteVencimentoData(cliente, contas);
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
  contas?: any[],
  filename?: string
): Promise<void> {
  const data = await getComprovanteVencimentoData(cliente, contas);
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

  pdf.addImage(imgData, "PNG", marginX, targetY, targetW, targetH, undefined, "FAST");
  pdf.save(safeFilename);
}
