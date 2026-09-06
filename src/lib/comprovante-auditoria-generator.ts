import jsPDF from "jspdf";
import { formatDateTimeBR } from "./iptv";
import { drawRodolfoTVEmblem } from "./rodolfo-tv-emblem";
import { downloadBlob } from "./comprovante-ativacao-generator";

export interface AuditRowData {
  id: string;
  user_email: string | null;
  categoria: string;
  acao: string;
  descricao: string | null;
  entidade: string | null;
  entidade_id: string | null;
  entidade_nome: string | null;
  dados_anteriores: any;
  dados_novos: any;
  metadata: any;
  created_at: string;
}

const CATEGORIAS_LABEL: Record<string, string> = {
  cliente: "Cliente",
  renovacao: "Renovação",
  revendedor: "Revendedor",
  venda_credito: "Venda Crédito",
  compra_credito: "Compra Crédito",
  credito: "Crédito",
  servidor: "Servidor",
  painel: "Painel",
  financeiro: "Financeiro",
  importacao: "Importação",
  exportacao: "Exportação",
  backup: "Backup",
  auth: "Autenticação",
  outro: "Outro",
};

const LABELS: Record<string, string> = {
  nome: "Nome",
  telefone: "Telefone",
  celular: "Celular",
  email: "E-mail",
  login: "Login",
  senha: "Senha",
  mac: "MAC",
  device: "Device",
  device_id: "Device ID",
  device_key: "Device Key",
  app: "Aplicativo",
  aplicativo: "Aplicativo",
  servidor: "Servidor",
  servidor_id: "Servidor ID",
  servidor_nome: "Servidor",
  painel: "Painel",
  url: "URL",
  observacao: "Observação",
  observacoes: "Observações",
  valor: "Valor",
  valor_pago: "Valor Pago",
  valor_custo: "Valor Custo",
  valor_venda: "Valor Venda",
  valor_compra: "Valor Compra",
  custo: "Custo",
  custo_unitario: "Custo Unitário",
  custo_mensal: "Custo Mensal",
  preco_venda: "Preço de Venda",
  lucro: "Lucro",
  quantidade: "Quantidade",
  quantidade_creditos: "Qtd. Créditos",
  creditos: "Créditos",
  saldo: "Saldo",
  data_vencimento: "Vencimento",
  vencimento: "Vencimento",
  data_recarga: "Data Recarga",
  data_ativacao: "Data Ativação",
  data_pagamento: "Data Pagamento",
  validade: "Validade",
  validade_dias: "Validade (dias)",
  dias: "Dias",
  dias_validade: "Dias Validade",
  status: "Status",
  status_pagamento: "Status Pagamento",
  status_venda: "Status Venda",
  forma_pagamento: "Forma Pagamento",
  tipo: "Tipo",
  revendedor: "Revendedor",
  cliente: "Cliente",
  motivo: "Motivo",
};

function humanizeKey(k: string): string {
  if (LABELS[k]) return LABELS[k];
  const s = k.replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatVal(key: string, v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "number") {
    const isCurrency = /(valor|preco|custo|saldo|lucro|receita|despesa)/i.test(key) &&
      !/(quantidade|qtd|total|registros|clientes|dias|duracao|done|failures|inseridos|atualizados)/i.test(key);
    if (isCurrency) {
      try {
        return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      } catch {
        return `R$ ${v.toFixed(2)}`;
      }
    }
    return String(v);
  }
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
      try {
        const [y, m, d] = v.slice(0, 10).split("-");
        if (v.includes("T") || v.includes(" ")) {
          return formatDateTimeBR(v);
        }
        return `${d}/${m}/${y}`;
      } catch {
        return v;
      }
    }
    return v;
  }
  if (Array.isArray(v)) {
    return v.length === 0 ? "—" : v.map((item) => (typeof item === "object" ? JSON.stringify(item) : String(item))).join(", ");
  }
  if (typeof v === "object") {
    return JSON.stringify(v);
  }
  return String(v);
}

const HIDE_KEYS = new Set(["id", "user_id", "created_at", "updated_at", "deleted_at"]);

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

function drawCardHeader(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  title: string,
  badgeText?: string,
  badgeBg = "#e0f2fe",
  badgeColor = "#0284c7"
) {
  const headerH = 36;
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

  ctx.textAlign = "left";
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(title, x + 16, y + 23);

  if (badgeText) {
    ctx.font = "bold 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    const badgeW = ctx.measureText(badgeText).width + 16;
    const badgeX = x + w - badgeW - 14;
    const badgeY = y + 9;
    const badgeH = 18;

    ctx.fillStyle = badgeBg;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6);
    ctx.fill();

    ctx.fillStyle = badgeColor;
    ctx.textAlign = "center";
    ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + 13);
  }
}

export function renderAuditRowCanvas(row: AuditRowData): HTMLCanvasElement {
  const width = 640;
  const paddingX = 24;
  const cardW = width - paddingX * 2;
  const scale = 2;

  const a = (row.dados_anteriores && typeof row.dados_anteriores === "object" ? row.dados_anteriores : {}) as Record<string, any>;
  const d = (row.dados_novos && typeof row.dados_novos === "object" ? row.dados_novos : {}) as Record<string, any>;

  const isDiff = row.acao === "editar" || row.acao === "ajustar" || row.acao === "alterar_pagamento";
  const diffKeys = Array.from(new Set([...Object.keys(a), ...Object.keys(d)])).filter(
    (k) => !HIDE_KEYS.has(k) && JSON.stringify(a[k]) !== JSON.stringify(d[k])
  );

  const newEntries = Object.entries(d).filter(([k, v]) => !HIDE_KEYS.has(k) && v !== null && v !== "");
  const oldEntries = Object.entries(a).filter(([k, v]) => !HIDE_KEYS.has(k) && v !== null && v !== "");

  let detailRowsCount = 0;
  if (isDiff) {
    detailRowsCount = Math.max(1, diffKeys.length);
  } else if (row.acao === "criar") {
    detailRowsCount = Math.max(1, newEntries.length);
  } else if (row.acao === "excluir" || row.acao === "excluir_definitivo") {
    detailRowsCount = Math.max(1, oldEntries.length);
  } else {
    detailRowsCount = Math.max(1, newEntries.length || oldEntries.length);
  }

  const detailCardH = 36 + Math.min(15, detailRowsCount) * 28 + 16;
  const baseH = 96 + 18 + 140 + 16 + 85 + 16 + detailCardH + 16 + 60 + 24;
  const height = Math.max(680, baseH);

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.scale(scale, scale);

  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, width, height);

  const headerH = 96;
  const navGrad = ctx.createLinearGradient(0, 0, width, headerH);
  navGrad.addColorStop(0, "#080e1a");
  navGrad.addColorStop(0.5, "#0f172a");
  navGrad.addColorStop(1, "#162035");
  ctx.fillStyle = navGrad;
  ctx.fillRect(0, 0, width, headerH);

  const decorGrad = ctx.createLinearGradient(0, 0, width, 0);
  decorGrad.addColorStop(0, "#ca8a04");
  decorGrad.addColorStop(0.3, "#38bdf8");
  decorGrad.addColorStop(0.7, "#818cf8");
  decorGrad.addColorStop(1, "#f59e0b");
  ctx.fillStyle = decorGrad;
  ctx.fillRect(0, headerH - 3, width, 3);

  const logoX = paddingX + 38;
  const logoY = headerH / 2 - 1;
  drawRodolfoTVEmblem(ctx, logoX, logoY, 0.95, "eagle");

  const titleX = logoX + 54;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  const goldGrad = ctx.createLinearGradient(titleX, 0, titleX + 220, 0);
  goldGrad.addColorStop(0, "#ffffff");
  goldGrad.addColorStop(0.65, "#fef08a");
  goldGrad.addColorStop(1, "#f59e0b");
  ctx.fillStyle = goldGrad;
  ctx.font = "bold 21px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("RODOLFO TV", titleX, headerH / 2 - 13);

  ctx.fillStyle = "#38bdf8";
  ctx.font = "bold 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("SISTEMA ORBIT • REGISTRO OFICIAL DE AUDITORIA", titleX, headerH / 2 + 7);

  const dataFormatada = formatDateTimeBR(row.created_at);
  ctx.font = "bold 10px 'Courier New', Courier, monospace";
  const dateBadgeW = ctx.measureText(dataFormatada).width + 18;
  const dateBadgeX = width - paddingX - dateBadgeW;
  const dateBadgeY = (headerH - 24) / 2 - 2;

  ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
  ctx.strokeStyle = "rgba(56, 189, 248, 0.45)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(dateBadgeX, dateBadgeY, dateBadgeW, 24, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#e0f2fe";
  ctx.textAlign = "center";
  ctx.fillText(dataFormatada, dateBadgeX + dateBadgeW / 2, dateBadgeY + 13);

  let curY = headerH + 16;
  const card1H = 136;
  drawCard(ctx, paddingX, curY, cardW, card1H, 12, "#ffffff", "#e2e8f0");
  drawCardHeader(
    ctx,
    paddingX,
    curY,
    cardW,
    "DADOS DA OPERAÇÃO",
    `REGISTRO #${row.id.slice(0, 8).toUpperCase()}`,
    "#f1f5f9",
    "#475569"
  );

  const gridY = curY + 48;
  const col1X = paddingX + 16;
  const col2X = paddingX + cardW / 2 + 10;

  ctx.textAlign = "left";
  ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText("Categoria:", col1X, gridY);

  const catLabel = CATEGORIAS_LABEL[row.categoria] ?? humanizeKey(row.categoria);
  ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = "#0f172a";
  ctx.fillText(catLabel, col1X + 70, gridY);

  ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText("Ação Realizada:", col2X, gridY);

  ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  const acaoNome = row.acao.toUpperCase();
  const acaoW = ctx.measureText(acaoNome).width + 14;
  const acaoBadgeX = col2X + 95;
  const acaoBadgeY = gridY - 12;

  let acaoBg = "#e0f2fe";
  let acaoColor = "#0369a1";
  if (row.acao === "criar" || row.acao === "renovar" || row.acao === "reativar") {
    acaoBg = "#dcfce7";
    acaoColor = "#15803d";
  } else if (row.acao === "excluir" || row.acao === "excluir_definitivo") {
    acaoBg = "#fee2e2";
    acaoColor = "#b91c1c";
  } else if (row.acao === "cancelar" || row.acao === "cancelar_venda") {
    acaoBg = "#ffedd5";
    acaoColor = "#c2410c";
  }

  ctx.fillStyle = acaoBg;
  ctx.beginPath();
  ctx.roundRect(acaoBadgeX, acaoBadgeY, acaoW, 18, 5);
  ctx.fill();

  ctx.fillStyle = acaoColor;
  ctx.textAlign = "center";
  ctx.fillText(acaoNome, acaoBadgeX + acaoW / 2, acaoBadgeY + 13);

  const gridY2 = gridY + 30;
  ctx.textAlign = "left";
  ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText("Usuário:", col1X, gridY2);

  ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = "#0f172a";
  const userText = row.user_email || "Administrador do Painel";
  ctx.fillText(userText.length > 28 ? userText.slice(0, 26) + "..." : userText, col1X + 70, gridY2);

  ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText("Entidade / Alvo:", col2X, gridY2);

  const entidadeText = row.entidade_nome || row.entidade_id || row.entidade || "Sistema";
  ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = "#0f172a";
  ctx.fillText(entidadeText.length > 24 ? entidadeText.slice(0, 22) + "..." : entidadeText, col2X + 95, gridY2);

  const gridY3 = gridY2 + 28;
  ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText("Data e Hora:", col1X, gridY3);

  ctx.font = "bold 12px 'Courier New', Courier, monospace";
  ctx.fillStyle = "#0284c7";
  ctx.fillText(formatDateTimeBR(row.created_at), col1X + 76, gridY3);

  ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText("ID Completo:", col2X, gridY3);

  ctx.font = "10px 'Courier New', Courier, monospace";
  ctx.fillStyle = "#64748b";
  ctx.fillText(row.id.slice(0, 22) + "...", col2X + 80, gridY3);

  curY += card1H + 14;
  const descCardH = 76;
  drawCard(ctx, paddingX, curY, cardW, descCardH, 12, "#ffffff", "#e2e8f0");
  drawCardHeader(ctx, paddingX, curY, cardW, "DESCRITIVO DA AÇÃO", undefined);

  ctx.textAlign = "left";
  ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = "#1e293b";
  const descText = row.descricao || `Operação de ${row.acao} realizada em ${row.entidade || "registro"}.`;
  ctx.fillText(descText.length > 85 ? descText.slice(0, 82) + "..." : descText, paddingX + 16, curY + 54);

  curY += descCardH + 14;
  drawCard(ctx, paddingX, curY, cardW, detailCardH, 12, "#ffffff", "#e2e8f0");

  let headerBadge = "DETALHADO";
  let headerBg = "#e0f2fe";
  let headerColor = "#0284c7";
  if (isDiff) {
    headerBadge = `${diffKeys.length} CAMPO(S) ALTERADO(S)`;
    headerBg = "#fef3c7";
    headerColor = "#b45309";
  } else if (row.acao === "criar") {
    headerBadge = "NOVO REGISTRO";
    headerBg = "#dcfce7";
    headerColor = "#15803d";
  } else if (row.acao === "excluir") {
    headerBadge = "DADOS REMOVIDOS";
    headerBg = "#fee2e2";
    headerColor = "#b91c1c";
  }

  drawCardHeader(
    ctx,
    paddingX,
    curY,
    cardW,
    isDiff ? "ALTERAÇÕES REALIZADAS" : "DADOS DO REGISTRO",
    headerBadge,
    headerBg,
    headerColor
  );

  let rowY = curY + 52;
  const itemH = 26;

  if (isDiff && diffKeys.length > 0) {
    ctx.font = "bold 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillStyle = "#64748b";
    ctx.fillText("CAMPO", paddingX + 16, rowY - 6);
    ctx.fillText("VALOR ANTERIOR", paddingX + 150, rowY - 6);
    ctx.fillText("NOVO VALOR", paddingX + 370, rowY - 6);

    ctx.strokeStyle = "#f1f5f9";
    ctx.beginPath();
    ctx.moveTo(paddingX + 16, rowY);
    ctx.lineTo(paddingX + cardW - 16, rowY);
    ctx.stroke();

    rowY += 12;

    diffKeys.slice(0, 15).forEach((k, idx) => {
      if (idx % 2 === 0) {
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(paddingX + 12, rowY - 14, cardW - 24, itemH);
      }

      ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillStyle = "#334155";
      ctx.fillText(humanizeKey(k), paddingX + 16, rowY);

      ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillStyle = "#dc2626";
      const valAnt = formatVal(k, a[k]);
      ctx.fillText(valAnt.length > 25 ? valAnt.slice(0, 23) + "..." : valAnt, paddingX + 150, rowY);

      ctx.fillStyle = "#16a34a";
      const valDep = formatVal(k, d[k]);
      ctx.fillText(valDep.length > 25 ? valDep.slice(0, 23) + "..." : valDep, paddingX + 370, rowY);

      rowY += itemH;
    });
  } else {
    const listEntries = (row.acao === "criar" ? newEntries : (oldEntries.length ? oldEntries : newEntries)).slice(0, 15);

    if (listEntries.length === 0) {
      ctx.font = "italic 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillStyle = "#94a3b8";
      ctx.fillText("Nenhum detalhe adicional gravado neste evento.", paddingX + 16, rowY);
    } else {
      listEntries.forEach(([k, v], idx) => {
        if (idx % 2 === 0) {
          ctx.fillStyle = "#f8fafc";
          ctx.fillRect(paddingX + 12, rowY - 14, cardW - 24, itemH);
        }

        ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.fillStyle = "#475569";
        ctx.fillText(humanizeKey(k) + ":", paddingX + 16, rowY);

        ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.fillStyle = row.acao === "excluir" ? "#dc2626" : "#0f172a";
        const valStr = formatVal(k, v);
        ctx.fillText(valStr.length > 55 ? valStr.slice(0, 52) + "..." : valStr, paddingX + 160, rowY);

        rowY += itemH;
      });
    }
  }

  const footerY = height - 42;

  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(paddingX, footerY);
  ctx.lineTo(width - paddingX, footerY);
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.font = "10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText("Registro auditado e certificado pelo Orbit Gestor • Histórico Seguro e Imutável", paddingX, footerY + 22);

  ctx.textAlign = "right";
  ctx.font = "bold 10px 'Courier New', Courier, monospace";
  ctx.fillStyle = "#0284c7";
  ctx.fillText(`AUDIT-LOG • ${row.id.slice(0, 12).toUpperCase()}`, width - paddingX, footerY + 22);

  return canvas;
}

export async function exportAuditRowPNG(row: AuditRowData, filename?: string): Promise<void> {
  const canvas = renderAuditRowCanvas(row);
  const safeName = (row.entidade_nome || row.acao || "auditoria").replace(/\s+/g, "_");
  const safeFilename = filename || `auditoria_${row.acao}_${safeName}_${Date.now()}.png`;

  return new Promise<void>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        downloadBlob(blob, safeFilename);
        resolve();
      } else {
        reject(new Error("Falha ao gerar o arquivo PNG da auditoria"));
      }
    }, "image/png");
  });
}

export async function copyAuditRowImageToClipboard(row: AuditRowData): Promise<boolean> {
  try {
    const canvas = renderAuditRowCanvas(row);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return false;

    if (navigator.clipboard && window.ClipboardItem) {
      const item = new ClipboardItem({ "image/png": blob });
      await navigator.clipboard.write([item]);
      return true;
    }
    return false;
  } catch (err) {
    console.warn("Falha ao copiar comprovante de auditoria para o clipboard:", err);
    return false;
  }
}

export async function exportAuditRowPDF(row: AuditRowData, filename?: string): Promise<void> {
  const canvas = renderAuditRowCanvas(row);
  const safeName = (row.entidade_nome || row.acao || "auditoria").replace(/\s+/g, "_");
  const safeFilename = filename || `auditoria_${row.acao}_${safeName}_${Date.now()}.pdf`;
  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const marginX = 20;
  const targetW = pageW - marginX * 2;
  const targetH = (canvas.height / canvas.width) * targetW;
  const targetY = targetH < pageH - 24 ? (pageH - targetH) / 2 : 12;

  pdf.addImage(imgData, "PNG", marginX, targetY, targetW, targetH, undefined, "FAST");
  pdf.save(safeFilename);
}
