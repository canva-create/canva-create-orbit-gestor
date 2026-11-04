import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Download,
  FileSpreadsheet,
  FileText,
  Users,
  Phone,
  Sparkles,
  CheckSquare,
  Square,
  Search,
  Calendar,
  DollarSign,
  AlertCircle,
  Archive,
  Trash2,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { diasParaVencer, formatDateBR, formatDateTimeBR, maskPhoneBR } from "@/lib/iptv";
import { reportHeaderLines } from "@/lib/app-version";
import { logAudit } from "@/lib/audit";
import { extrairNomeBaseCliente } from "@/lib/comprovante-vencimento-generator";
import { custoCliente } from "@/lib/creditos";
import { fetchClientesExcluidos } from "@/lib/queries";
import { cn } from "@/lib/utils";

const COLUNAS_EXPORT_PADRAO = [
  "Cliente",
  "Telefone",
  "Servidor",
  "Data Início",
  "Vencimento",
  "Status",
  "Pagamento",
  "Custo",
  "Valor Pago",
  "Lucro",
  "MAC / Login",
  "Device / Senha",
  "Aplicativo",
  "Observação",
  "Categoria Servidor",
  "Dias p/ Vencer",
  "Situação",
  "Lembrete no dia",
  "Lembrete 1 dia antes",
  "Lembrete vencimento",
  "Lembrete após",
  "Cadastrado em",
  "Atualizado em",
  "ID",
];

type ModoExport =
  | "todos"
  | "ativos"
  | "vencidos"
  | "em_dia"
  | "pagos"
  | "pendentes"
  | "mesmo_telefone"
  | "padrao_nome"
  | "arquivados"
  | "excluidos"
  | "periodos";

type PeriodoVenc = { key: string; label: string; dias: number };

const PERIODOS_EXPORT: PeriodoVenc[] = [
  { key: "v2", label: "Vencidos há 2 dias", dias: -2 },
  { key: "v1", label: "Vencido há 1 dia", dias: -1 },
  { key: "hoje", label: "Vence hoje", dias: 0 },
  { key: "a1", label: "Vence em 1 dia", dias: 1 },
  { key: "a2", label: "Vence em 2 dias", dias: 2 },
];

function cleanPhone(p: any): string {
  return String(p || "").replace(/\D/g, "");
}

export interface ExportarClientesDialogProps {
  clientes?: any[];
  historico?: any[];
  trigger?: React.ReactNode;
}

export function ExportarClientesDialog({
  clientes = [],
  historico = [],
  trigger,
}: ExportarClientesDialogProps) {
  const [open, setOpen] = useState(false);
  const [modo, setModo] = useState<ModoExport>("todos");
  const [selPeriodos, setSelPeriodos] = useState<Set<string>>(new Set());
  const [customDiasStr, setCustomDiasStr] = useState("");
  const [expandirVinculados, setExpandirVinculados] = useState(false);
  const [busca, setBusca] = useState("");

  // Busca clientes excluídos da lixeira (deleted_at != null)
  const { data: excluidosBase = [] } = useQuery({
    queryKey: ["clientes_excluidos"],
    queryFn: fetchClientesExcluidos,
  });

  useEffect(() => {
    if (open) {
      setModo("todos");
      setSelPeriodos(new Set());
      setCustomDiasStr("");
      setExpandirVinculados(false);
      setBusca("");
    }
  }, [open]);

  // Lista base segura de clientes regulares
  const listClientes = useMemo(
    () => (Array.isArray(clientes) ? clientes.filter(Boolean) : []),
    [clientes]
  );

  // 1. Identificação completa de excluídos (Lixeira: deleted_at != null + cancelados)
  const listaExcluidos = useMemo(() => {
    const map = new Map<string, any>();
    (excluidosBase as any[]).forEach((c) => {
      if (c?.id) map.set(c.id, c);
    });
    listClientes.forEach((c) => {
      if (c?.status === "cancelado" || c?.deleted_at) {
        map.set(c.id, c);
      }
    });
    return Array.from(map.values());
  }, [excluidosBase, listClientes]);

  // 2. Identificação completa de arquivados (status: suspenso, cancelado ou vencidos > 365 dias)
  const listaArquivados = useMemo(() => {
    const map = new Map<string, any>();
    listClientes.forEach((c) => {
      const d = diasParaVencer(c?.data_vencimento);
      const isMais365 = d !== null && d < -365;
      const isInativo = c?.status === "cancelado" || c?.status === "suspenso";
      if (isMais365 || isInativo) {
        map.set(c.id, c);
      }
    });
    return Array.from(map.values());
  }, [listClientes]);

  // Mapa mestre de todos os clientes conhecidos (ativos + arquivados + lixeira)
  const mapaGeralClientes = useMemo(() => {
    const map = new Map<string, any>();
    listClientes.forEach((c: any) => { if (c?.id) map.set(c.id, c); });
    listaExcluidos.forEach((c: any) => { if (c?.id) map.set(c.id, c); });
    listaArquivados.forEach((c: any) => { if (c?.id) map.set(c.id, c); });
    return map;
  }, [listClientes, listaExcluidos, listaArquivados]);

  // 3. Contas com o mesmo telefone
  const telefonesRepetidosIds = useMemo(() => {
    const map = new Map<string, string[]>();
    listClientes.forEach((c: any) => {
      const phone = cleanPhone(c.telefone || c.celular || c.whatsapp);
      if (phone.length >= 8) {
        const arr = map.get(phone) ?? [];
        arr.push(c.id);
        map.set(phone, arr);
      }
    });

    const setIds = new Set<string>();
    map.forEach((ids) => {
      if (ids.length > 1) {
        ids.forEach((id) => setIds.add(id));
      }
    });
    return setIds;
  }, [listClientes]);

  // 4. Contas com o mesmo padrão de nome
  const nomesRepetidosIds = useMemo(() => {
    const map = new Map<string, string[]>();
    listClientes.forEach((c: any) => {
      const { base } = extrairNomeBaseCliente(c.nome || "");
      const norm = base.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (norm.length >= 3) {
        const arr = map.get(norm) ?? [];
        arr.push(c.id);
        map.set(norm, arr);
      }
    });

    const setIds = new Set<string>();
    map.forEach((ids) => {
      if (ids.length > 1) {
        ids.forEach((id) => setIds.add(id));
      }
    });
    return setIds;
  }, [listClientes]);

  // Mapas de expansão por telefone e nome
  const mapaVinculadosPorTelefone = useMemo(() => {
    const map = new Map<string, any[]>();
    listClientes.forEach((c: any) => {
      const phone = cleanPhone(c.telefone || c.celular || c.whatsapp);
      if (phone.length >= 8) {
        const arr = map.get(phone) ?? [];
        arr.push(c);
        map.set(phone, arr);
      }
    });
    return map;
  }, [listClientes]);

  const mapaVinculadosPorNome = useMemo(() => {
    const map = new Map<string, any[]>();
    listClientes.forEach((c: any) => {
      const { base } = extrairNomeBaseCliente(c.nome || "");
      const norm = base.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (norm.length >= 3) {
        const arr = map.get(norm) ?? [];
        arr.push(c);
        map.set(norm, arr);
      }
    });
    return map;
  }, [listClientes]);

  // Dias personalizados
  const customDias = useMemo(
    () =>
      customDiasStr
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^-?\d+$/.test(s))
        .map(Number),
    [customDiasStr]
  );

  // Contagens por período e categoria para exibição em tempo real
  const estatisticasBase = useMemo(() => {
    let ativos = 0;
    let vencidos = 0;
    let pagos = 0;
    let pendentes = 0;
    let emDia = 0;
    const porDias: Record<number, number> = {};

    listClientes.forEach((c: any) => {
      const d = diasParaVencer(c.data_vencimento);
      const isExcluido = c.status === "cancelado" || !!c.deleted_at;
      const isSuspenso = c.status === "suspenso";
      const isPago = c.status_pagamento === "pago";
      const isDevendo = c.status_pagamento === "devendo";

      if (!isExcluido && !isSuspenso) {
        if (d === null || d >= 0) {
          ativos++;
        }
        if (d !== null && d > 0) {
          emDia++;
        }
        if (d !== null && d < 0) {
          vencidos++;
        } else if (c.status === "vencido") {
          vencidos++;
        }
      }

      if (isPago) pagos++;
      if (isDevendo) pendentes++;

      if (d !== null) {
        porDias[d] = (porDias[d] ?? 0) + 1;
      }
    });

    return {
      total: listClientes.length,
      ativos,
      vencidos,
      pagos,
      pendentes,
      arquivados: listaArquivados.length,
      excluidos: listaExcluidos.length,
      emDia,
      porDias,
      mesmoTelefone: telefonesRepetidosIds.size,
      padraoNome: nomesRepetidosIds.size,
    };
  }, [listClientes, listaArquivados, listaExcluidos, telefonesRepetidosIds, nomesRepetidosIds]);

  const togglePeriodo = (key: string) => {
    setModo("periodos");
    setSelPeriodos((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Filtragem consolidada dos clientes selecionados
  const clientesSelecionados = useMemo(() => {
    let baseList: any[] = [];

    if (modo === "todos") {
      baseList = listClientes;
    } else if (modo === "ativos") {
      baseList = listClientes.filter((c: any) => {
        const d = diasParaVencer(c.data_vencimento);
        return c.status !== "cancelado" && c.status !== "suspenso" && (d === null || d >= 0);
      });
    } else if (modo === "vencidos") {
      baseList = listClientes.filter((c: any) => {
        const d = diasParaVencer(c.data_vencimento);
        return (d !== null && d < 0) || (c.status === "vencido" && (d === null || d < 0));
      });
    } else if (modo === "em_dia") {
      baseList = listClientes.filter((c: any) => {
        const d = diasParaVencer(c.data_vencimento);
        return d !== null && d > 0 && c.status !== "cancelado" && c.status !== "suspenso";
      });
    } else if (modo === "pagos") {
      baseList = listClientes.filter((c: any) => c.status_pagamento === "pago");
    } else if (modo === "pendentes") {
      baseList = listClientes.filter((c: any) => c.status_pagamento === "devendo");
    } else if (modo === "mesmo_telefone") {
      baseList = listClientes.filter((c: any) => telefonesRepetidosIds.has(c.id));
    } else if (modo === "padrao_nome") {
      baseList = listClientes.filter((c: any) => nomesRepetidosIds.has(c.id));
    } else if (modo === "arquivados") {
      baseList = listaArquivados;
    } else if (modo === "excluidos") {
      baseList = listaExcluidos;
    } else if (modo === "periodos") {
      const baseDias = PERIODOS_EXPORT.filter((p) => selPeriodos.has(p.key)).map((p) => p.dias);
      const todosDias = Array.from(new Set([...baseDias, ...customDias]));
      const setDias = new Set(todosDias);
      baseList = listClientes.filter((c: any) => {
        const d = diasParaVencer(c.data_vencimento);
        return d !== null && setDias.has(d);
      });
    }

    // Se expandir vinculados estiver marcado
    let expandidos = baseList;
    if (expandirVinculados && modo !== "arquivados" && modo !== "excluidos") {
      const mapExp = new Map<string, any>();
      baseList.forEach((c) => {
        mapExp.set(c.id, c);
        const phone = cleanPhone(c.telefone || c.celular || c.whatsapp);
        if (phone.length >= 8) {
          (mapaVinculadosPorTelefone.get(phone) ?? []).forEach((v) => mapExp.set(v.id, v));
        }
        const { base } = extrairNomeBaseCliente(c.nome || "");
        const norm = base.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (norm.length >= 3) {
          (mapaVinculadosPorNome.get(norm) ?? []).forEach((v) => mapExp.set(v.id, v));
        }
      });
      expandidos = Array.from(mapExp.values());
    }

    // Filtro de busca textual
    if (busca.trim()) {
      const term = busca.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      expandidos = expandidos.filter((c: any) => {
        const nomeNorm = String(c.nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const telNorm = String(c.telefone || "");
        const appNorm = String(c.aplicativo || "").toLowerCase();
        const srvNorm = String(c.servidor?.nome || "").toLowerCase();
        const obsNorm = String(c.observacao || "").toLowerCase();
        return (
          nomeNorm.includes(term) ||
          telNorm.includes(term) ||
          appNorm.includes(term) ||
          srvNorm.includes(term) ||
          obsNorm.includes(term)
        );
      });
    }

    // Ordenação alfabética
    return [...expandidos].sort((a, b) =>
      String(a.nome ?? "").localeCompare(String(b.nome ?? ""), "pt-BR", { sensitivity: "base" })
    );
  }, [
    modo,
    listClientes,
    listaArquivados,
    listaExcluidos,
    selPeriodos,
    customDias,
    expandirVinculados,
    mapaVinculadosPorTelefone,
    mapaVinculadosPorNome,
    telefonesRepetidosIds,
    nomesRepetidosIds,
    busca,
  ]);

  // Contagens dos selecionados
  const contagensSelecionados = useMemo(() => {
    let ativos = 0;
    let vencidos = 0;
    let pagos = 0;
    let pendentes = 0;

    clientesSelecionados.forEach((c: any) => {
      const d = diasParaVencer(c.data_vencimento);
      if (c.status !== "cancelado" && c.status !== "suspenso") {
        if (d === null || d >= 0) ativos++;
        else vencidos++;
      } else {
        vencidos++;
      }
      if (c.status_pagamento === "pago") pagos++;
      else if (c.status_pagamento === "devendo") pendentes++;
    });

    return {
      total: clientesSelecionados.length,
      ativos,
      vencidos,
      pagos,
      pendentes,
    };
  }, [clientesSelecionados]);

  // Rótulo do filtro atual
  const rotuloFiltroAtual = useMemo(() => {
    if (modo === "todos") return "Todos os Contatos (Base Geral)";
    if (modo === "ativos") return "Somente Clientes Ativos";
    if (modo === "vencidos") return "Somente Clientes Vencidos";
    if (modo === "em_dia") return "Clientes em Dia / Futuro";
    if (modo === "pagos") return "Todos os Clientes Pagos";
    if (modo === "pendentes") return "Todos os Clientes Pendentes (Devendo)";
    if (modo === "mesmo_telefone") return "Clientes pelo Mesmo Telefone";
    if (modo === "padrao_nome") return "Clientes por Padrão de Nome";
    if (modo === "arquivados") return "Todos os Arquivados (Suspensos / Inativos)";
    if (modo === "excluidos") return "Todos os Excluídos (Lixeira / Cancelados)";
    if (modo === "periodos") {
      const pLabels = PERIODOS_EXPORT.filter((p) => selPeriodos.has(p.key)).map((p) => p.label);
      if (customDias.length) pLabels.push(`Dias: ${customDias.join(", ")}`);
      return pLabels.length > 0 ? pLabels.join(" + ") : "Períodos de Vencimento";
    }
    return "Contatos Selecionados";
  }, [modo, selPeriodos, customDias]);

  // Exportação Excel Completo (.xlsx) com 24 colunas
  const exportarExcelCompleto = () => {
    if (!clientesSelecionados.length) {
      toast.info("Nenhum cliente selecionado com os filtros atuais.");
      return;
    }

    const rows = clientesSelecionados.map((c: any) => {
      const d = diasParaVencer(c.data_vencimento);
      const isAtivo = d === null || d >= 0;
      const situacao =
        c.status === "cancelado"
          ? "Excluído / Cancelado"
          : c.status === "suspenso"
          ? "Arquivado / Suspenso"
          : d === null
          ? "Sem vencimento"
          : d < 0
          ? `Vencido há ${Math.abs(d)} dia(s)`
          : d === 0
          ? "Vence hoje"
          : `Ativo (vence em ${d} dia(s))`;

      const custo = custoCliente(c, historico);
      const valor = Number(c.valor_pago || 0);
      const lucro = valor - custo;

      return {
        Cliente: c.nome ?? "",
        Telefone: c.telefone ? maskPhoneBR(c.telefone) : "",
        Servidor: c.servidor?.nome ?? "",
        "Data Início": c.data_inicio ? formatDateBR(c.data_inicio) : "",
        Vencimento: c.data_vencimento ? formatDateBR(c.data_vencimento) : "",
        Status: (c.status ?? (isAtivo ? "ativo" : "vencido")).toUpperCase(),
        Pagamento: (c.status_pagamento ?? "pago").toUpperCase(),
        Custo: custo,
        "Valor Pago": valor,
        Lucro: lucro,
        "MAC / Login": c.mac ?? "",
        "Device / Senha": c.device ?? "",
        Aplicativo: c.aplicativo ?? "",
        Observação: c.observacao ?? "",
        "Categoria Servidor": c.servidor?.categoria ?? "",
        "Dias p/ Vencer": d ?? 0,
        Situação: situacao,
        "Lembrete no dia": c.lembrete_no_dia ? "SIM" : "NÃO",
        "Lembrete 1 dia antes": c.lembrete_1_dia_antes ? "SIM" : "NÃO",
        "Lembrete vencimento": c.lembrete_vencimento ? "SIM" : "NÃO",
        "Lembrete após": c.lembrete_apos ? "SIM" : "NÃO",
        "Cadastrado em": c.created_at ? formatDateTimeBR(c.created_at) : "",
        "Atualizado em": c.updated_at ? formatDateTimeBR(c.updated_at) : "",
        ID: c.id ?? "",
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows, { header: COLUNAS_EXPORT_PADRAO });
    ws["!cols"] = [
      { wch: 28 }, // Cliente
      { wch: 18 }, // Telefone
      { wch: 18 }, // Servidor
      { wch: 14 }, // Data Início
      { wch: 14 }, // Vencimento
      { wch: 12 }, // Status
      { wch: 12 }, // Pagamento
      { wch: 12 }, // Custo
      { wch: 12 }, // Valor Pago
      { wch: 12 }, // Lucro
      { wch: 22 }, // MAC / Login
      { wch: 22 }, // Device / Senha
      { wch: 18 }, // Aplicativo
      { wch: 30 }, // Observação
      { wch: 18 }, // Categoria Servidor
      { wch: 14 }, // Dias p/ Vencer
      { wch: 26 }, // Situação
      { wch: 15 }, // Lembrete no dia
      { wch: 18 }, // Lembrete 1 dia antes
      { wch: 18 }, // Lembrete vencimento
      { wch: 15 }, // Lembrete após
      { wch: 20 }, // Cadastrado em
      { wch: 20 }, // Atualizado em
      { wch: 38 }, // ID
    ];

    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: rows.length, c: COLUNAS_EXPORT_PADRAO.length - 1 },
      }),
    };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contatos");
    const stampStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `exportacao-clientes-${stampStr}.xlsx`);

    toast.success(
      `Planilha completa exportada com ${rows.length} contatos (${contagensSelecionados.ativos} ativos, ${contagensSelecionados.vencidos} vencidos)!`
    );
    logAudit({
      categoria: "exportacao",
      acao: "exportar",
      descricao: `Exportação Completa (XLSX) — ${rotuloFiltroAtual}`,
      entidade: "clientes",
      metadata: {
        total: rows.length,
        modo,
        ativos: contagensSelecionados.ativos,
        vencidos: contagensSelecionados.vencidos,
      },
    });
  };

  // Exportação PDF Formatado
  const exportarPDFCompleto = () => {
    if (!clientesSelecionados.length) {
      toast.info("Nenhum cliente selecionado com os filtros atuais.");
      return;
    }

    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 10;
    let y = margin;

    const header = reportHeaderLines("RELATÓRIO COMPLETO DE CLIENTES");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text(header.empresa, margin, y);
    y += 4.5;

    pdf.setFontSize(10);
    pdf.setTextColor(50);
    pdf.text(header.titulo, margin, y);
    y += 4;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(100);
    pdf.text(
      `Filtro: ${rotuloFiltroAtual}  |  Total: ${clientesSelecionados.length} clientes (${contagensSelecionados.ativos} ativos, ${contagensSelecionados.vencidos} vencidos, ${contagensSelecionados.pagos} pagos, ${contagensSelecionados.pendentes} pendentes)  |  Emissão: ${header.dataHora}`,
      margin,
      y
    );
    y += 6;

    const colWCliente = 48;
    const colWTelefone = 28;
    const colWServidor = 28;
    const colWVenc = 22;
    const colWStatus = 18;
    const colWPgto = 18;
    const colWApp = 30;
    const colWSituacao = pageW - margin * 2 - (colWCliente + colWTelefone + colWServidor + colWVenc + colWStatus + colWPgto + colWApp);

    const drawHeaderTable = () => {
      pdf.setFillColor(243, 244, 246);
      pdf.rect(margin, y - 4, pageW - margin * 2, 5.5, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7.5);
      pdf.setTextColor(31, 41, 55);

      let curX = margin + 1;
      pdf.text("CLIENTE", curX, y); curX += colWCliente;
      pdf.text("TELEFONE", curX, y); curX += colWTelefone;
      pdf.text("SERVIDOR", curX, y); curX += colWServidor;
      pdf.text("VENCIMENTO", curX, y); curX += colWVenc;
      pdf.text("STATUS", curX, y); curX += colWStatus;
      pdf.text("PGTO", curX, y); curX += colWPgto;
      pdf.text("APLICATIVO", curX, y); curX += colWApp;
      pdf.text("SITUAÇÃO", curX, y);

      y += 5.5;
      pdf.setFont("helvetica", "normal");
    };

    drawHeaderTable();

    clientesSelecionados.forEach((c: any) => {
      if (y > pageH - margin) {
        pdf.addPage();
        y = margin + 4;
        drawHeaderTable();
      }

      const d = diasParaVencer(c.data_vencimento);
      const isAtivo = d === null || d >= 0;
      const situacao =
        c.status === "cancelado"
          ? "Cancelado"
          : c.status === "suspenso"
          ? "Suspenso"
          : d === null
          ? "Sem data"
          : d < 0
          ? `Vencido ${Math.abs(d)}d`
          : d === 0
          ? "Vence hoje"
          : `Ativo (+${d}d)`;

      let curX = margin + 1;
      pdf.setTextColor(17, 24, 39);
      pdf.text(pdf.splitTextToSize(c.nome ?? "", colWCliente - 2)[0] ?? "", curX, y);
      curX += colWCliente;

      pdf.text(c.telefone ? maskPhoneBR(c.telefone) : "", curX, y);
      curX += colWTelefone;

      pdf.text(c.servidor?.nome ?? "", curX, y);
      curX += colWServidor;

      pdf.text(c.data_vencimento ? formatDateBR(c.data_vencimento) : "", curX, y);
      curX += colWVenc;

      if (isAtivo && c.status !== "cancelado" && c.status !== "suspenso") {
        pdf.setTextColor(16, 149, 90);
        pdf.text("ATIVO", curX, y);
      } else {
        pdf.setTextColor(220, 38, 38);
        pdf.text((c.status ?? "VENCIDO").toUpperCase(), curX, y);
      }
      curX += colWStatus;

      if (c.status_pagamento === "pago") {
        pdf.setTextColor(16, 149, 90);
        pdf.text("PAGO", curX, y);
      } else {
        pdf.setTextColor(220, 38, 38);
        pdf.text("DEVENDO", curX, y);
      }
      curX += colWPgto;

      pdf.setTextColor(17, 24, 39);
      pdf.text(pdf.splitTextToSize(c.aplicativo ?? "", colWApp - 2)[0] ?? "", curX, y);
      curX += colWApp;

      pdf.text(pdf.splitTextToSize(situacao, colWSituacao - 2)[0] ?? "", curX, y);

      y += 4.5;
    });

    const stampStr = new Date().toISOString().slice(0, 10);
    pdf.save(`relatorio-clientes-${stampStr}.pdf`);
    toast.success(`PDF gerado com sucesso contendo ${clientesSelecionados.length} contatos!`);
  };

  return (
    <>
      {trigger ? (
        <span onClick={() => setOpen(true)} className="inline-block cursor-pointer">
          {trigger}
        </span>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className="gap-1.5 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 font-medium"
        >
          <Download className="h-4 w-4 text-emerald-500" />
          Exportar
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[96vw] max-w-5xl max-h-[92vh] flex flex-col p-4 sm:p-6 overflow-hidden">
          <DialogHeader className="pb-2 border-b border-border/50">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-500 border border-emerald-500/30">
                  <Download className="h-4 w-4" />
                </div>
                <div>
                  <DialogTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                    Central de Exportação de Contatos
                    <Badge variant="outline" className="text-[11px] font-normal border-emerald-500/30 text-emerald-400">
                      Rodolfo TV
                    </Badge>
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Selecione por períodos de vencimento, base cadastral, situação financeira ou vínculos para baixar planilhas e relatórios.
                  </DialogDescription>
                </div>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1 space-y-4 py-2">
            {/* 1. BLOCO SUPERIOR: PERÍODOS DE VENCIMENTO ESPECÍFICOS ALINHADOS EM 5 BLOCOS */}
            <div className="space-y-1.5 p-3 rounded-xl bg-muted/30 border border-border/70">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                  Filtrar por Períodos de Vencimento Específicos
                </Label>
                <span className="text-[11px] text-muted-foreground">
                  Selecione um ou mais blocos
                </span>
              </div>

              {/* 5 Blocos Alinhados Perfeitamente */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {PERIODOS_EXPORT.map((p) => {
                  const isChecked = modo === "periodos" && selPeriodos.has(p.key);
                  const countPeriodo = estatisticasBase.porDias[p.dias] ?? 0;
                  const isVencido = p.dias < 0;
                  const isHoje = p.dias === 0;

                  return (
                    <Card
                      key={p.key}
                      onClick={() => togglePeriodo(p.key)}
                      className={cn(
                        "p-2.5 flex flex-col justify-between gap-1.5 cursor-pointer transition-all border rounded-lg",
                        isChecked
                          ? isVencido
                            ? "border-red-500 bg-red-500/10 shadow-xs ring-1 ring-red-500/50"
                            : isHoje
                            ? "border-amber-500 bg-amber-500/10 shadow-xs ring-1 ring-amber-500/50"
                            : "border-emerald-500 bg-emerald-500/10 shadow-xs ring-1 ring-emerald-500/50"
                          : "hover:border-border/80 bg-card/70"
                      )}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold flex items-center gap-1 text-foreground leading-tight">
                          {isVencido ? (
                            <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                          ) : isHoje ? (
                            <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                          ) : (
                            <Calendar className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                          )}
                          <span>{p.label}</span>
                        </span>
                        {isChecked ? (
                          <CheckSquare className="h-4 w-4 text-primary shrink-0" />
                        ) : (
                          <Square className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                        <span className="text-[10px]">
                          {p.dias === 0 ? "Hoje" : `${p.dias > 0 ? "+" : ""}${p.dias}d`}
                        </span>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[10px] font-bold py-0 px-1.5",
                            countPeriodo > 0 && isVencido && "text-red-400 bg-red-500/10",
                            countPeriodo > 0 && isHoje && "text-amber-400 bg-amber-500/10",
                            countPeriodo > 0 && !isVencido && !isHoje && "text-emerald-400 bg-emerald-500/10"
                          )}
                        >
                          {countPeriodo} cliente(s)
                        </Badge>
                      </div>
                    </Card>
                  );
                })}
              </div>

              {/* Personalização de dias específicos */}
              <div className="pt-2 flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <Label className="text-[11px] text-muted-foreground shrink-0">
                  Dias personalizados (negativo = vencido):
                </Label>
                <Input
                  value={customDiasStr}
                  onChange={(e) => {
                    setCustomDiasStr(e.target.value);
                    if (e.target.value) setModo("periodos");
                  }}
                  placeholder="Exemplo: -30, -5, 3, 7, 15"
                  className="h-7 text-xs bg-background/80"
                />
              </div>
            </div>

            {/* 2. SELEÇÃO POR BASE GERAL & STATUS */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Seleção por Base Cadastral & Status Financeiro
              </Label>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {/* Todos os Contatos */}
                <Card
                  onClick={() => {
                    setModo("todos");
                    setSelPeriodos(new Set());
                  }}
                  className={cn(
                    "p-2.5 flex flex-col justify-between gap-1 cursor-pointer transition-all border",
                    modo === "todos"
                      ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                      : "hover:border-border/80 bg-card/60"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                      <Users className="h-3.5 w-3.5 text-primary" />
                      Todos os Contatos
                    </span>
                    {modo === "todos" ? (
                      <CheckSquare className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Base cadastrada</span>
                    <Badge variant="secondary" className="text-[10px] py-0 font-bold">
                      {estatisticasBase.total}
                    </Badge>
                  </div>
                </Card>

                {/* Somente Ativos */}
                <Card
                  onClick={() => {
                    setModo("ativos");
                    setSelPeriodos(new Set());
                  }}
                  className={cn(
                    "p-2.5 flex flex-col justify-between gap-1 cursor-pointer transition-all border",
                    modo === "ativos"
                      ? "border-emerald-500 bg-emerald-500/10 shadow-xs ring-1 ring-emerald-500/40"
                      : "hover:border-border/80 bg-card/60"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      Somente Ativos
                    </span>
                    {modo === "ativos" ? (
                      <CheckSquare className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Em dia ou futuro</span>
                    <Badge variant="secondary" className="text-[10px] py-0 text-emerald-400 font-bold">
                      {estatisticasBase.ativos}
                    </Badge>
                  </div>
                </Card>

                {/* Somente Vencidos */}
                <Card
                  onClick={() => {
                    setModo("vencidos");
                    setSelPeriodos(new Set());
                  }}
                  className={cn(
                    "p-2.5 flex flex-col justify-between gap-1 cursor-pointer transition-all border",
                    modo === "vencidos"
                      ? "border-red-500 bg-red-500/10 shadow-xs ring-1 ring-red-500/40"
                      : "hover:border-border/80 bg-card/60"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                      <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                      Somente Vencidos
                    </span>
                    {modo === "vencidos" ? (
                      <CheckSquare className="h-4 w-4 text-red-400" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Atraso geral</span>
                    <Badge variant="secondary" className="text-[10px] py-0 text-red-400 font-bold">
                      {estatisticasBase.vencidos}
                    </Badge>
                  </div>
                </Card>

                {/* Em Dia / Futuro */}
                <Card
                  onClick={() => {
                    setModo("em_dia");
                    setSelPeriodos(new Set());
                  }}
                  className={cn(
                    "p-2.5 flex flex-col justify-between gap-1 cursor-pointer transition-all border",
                    modo === "em_dia"
                      ? "border-blue-500 bg-blue-500/10 shadow-xs ring-1 ring-blue-500/40"
                      : "hover:border-border/80 bg-card/60"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                      <Clock className="h-3.5 w-3.5 text-blue-400" />
                      Em Dia / Futuro
                    </span>
                    {modo === "em_dia" ? (
                      <CheckSquare className="h-4 w-4 text-blue-400" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Vencimento futuro</span>
                    <Badge variant="secondary" className="text-[10px] py-0 text-blue-400 font-bold">
                      {estatisticasBase.emDia}
                    </Badge>
                  </div>
                </Card>

                {/* Todos os Pagos */}
                <Card
                  onClick={() => {
                    setModo("pagos");
                    setSelPeriodos(new Set());
                  }}
                  className={cn(
                    "p-2.5 flex flex-col justify-between gap-1 cursor-pointer transition-all border",
                    modo === "pagos"
                      ? "border-emerald-500 bg-emerald-500/10 shadow-xs ring-1 ring-emerald-500/40"
                      : "hover:border-border/80 bg-card/60"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                      <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
                      Todos os Pagos
                    </span>
                    {modo === "pagos" ? (
                      <CheckSquare className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Status: pago</span>
                    <Badge variant="secondary" className="text-[10px] py-0 text-emerald-400 font-bold">
                      {estatisticasBase.pagos}
                    </Badge>
                  </div>
                </Card>

                {/* Todos os Pendentes */}
                <Card
                  onClick={() => {
                    setModo("pendentes");
                    setSelPeriodos(new Set());
                  }}
                  className={cn(
                    "p-2.5 flex flex-col justify-between gap-1 cursor-pointer transition-all border",
                    modo === "pendentes"
                      ? "border-amber-500 bg-amber-500/10 shadow-xs ring-1 ring-amber-500/40"
                      : "hover:border-border/80 bg-card/60"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                      Todos os Pendentes
                    </span>
                    {modo === "pendentes" ? (
                      <CheckSquare className="h-4 w-4 text-amber-400" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Devendo / Fiado</span>
                    <Badge variant="secondary" className="text-[10px] py-0 text-amber-400 font-bold">
                      {estatisticasBase.pendentes}
                    </Badge>
                  </div>
                </Card>

                {/* Todos os Arquivados */}
                <Card
                  onClick={() => {
                    setModo("arquivados");
                    setSelPeriodos(new Set());
                  }}
                  className={cn(
                    "p-2.5 flex flex-col justify-between gap-1 cursor-pointer transition-all border",
                    modo === "arquivados"
                      ? "border-purple-500 bg-purple-500/10 shadow-xs ring-1 ring-purple-500/40"
                      : "hover:border-border/80 bg-card/60"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                      <Archive className="h-3.5 w-3.5 text-purple-400" />
                      Todos os Arquivados
                    </span>
                    {modo === "arquivados" ? (
                      <CheckSquare className="h-4 w-4 text-purple-400" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Suspensos / &gt;365d</span>
                    <Badge variant="secondary" className="text-[10px] py-0 text-purple-400 font-bold">
                      {estatisticasBase.arquivados}
                    </Badge>
                  </div>
                </Card>

                {/* Todos os Excluídos */}
                <Card
                  onClick={() => {
                    setModo("excluidos");
                    setSelPeriodos(new Set());
                  }}
                  className={cn(
                    "p-2.5 flex flex-col justify-between gap-1 cursor-pointer transition-all border",
                    modo === "excluidos"
                      ? "border-red-500 bg-red-500/10 shadow-xs ring-1 ring-red-500/40"
                      : "hover:border-border/80 bg-card/60"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      Todos os Excluídos
                    </span>
                    {modo === "excluidos" ? (
                      <CheckSquare className="h-4 w-4 text-red-400" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Lixeira / cancelados</span>
                    <Badge variant="secondary" className="text-[10px] py-0 text-red-400 font-bold">
                      {estatisticasBase.excluidos}
                    </Badge>
                  </div>
                </Card>
              </div>
            </div>

            {/* 3. SELEÇÕES POR AGRUPAMENTO (MESMO TELEFONE & PADRÃO DE NOME) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Agrupamento & Multi-telas
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* Mesmo Telefone */}
                <Card
                  onClick={() => {
                    setModo("mesmo_telefone");
                    setSelPeriodos(new Set());
                  }}
                  className={cn(
                    "p-2.5 flex flex-col justify-between gap-1 cursor-pointer transition-all border",
                    modo === "mesmo_telefone"
                      ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                      : "hover:border-border/80 bg-card/60"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                      <Phone className="h-3.5 w-3.5 text-primary" />
                      Todos pelo Mesmo Telefone
                    </span>
                    {modo === "mesmo_telefone" ? (
                      <CheckSquare className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Múltiplos contatos com o mesmo número</span>
                    <Badge variant="secondary" className="text-[10px] py-0 font-bold">
                      {estatisticasBase.mesmoTelefone}
                    </Badge>
                  </div>
                </Card>

                {/* Padrão de Nome */}
                <Card
                  onClick={() => {
                    setModo("padrao_nome");
                    setSelPeriodos(new Set());
                  }}
                  className={cn(
                    "p-2.5 flex flex-col justify-between gap-1 cursor-pointer transition-all border",
                    modo === "padrao_nome"
                      ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                      : "hover:border-border/80 bg-card/60"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      Todos por Padrão de Nome
                    </span>
                    {modo === "padrao_nome" ? (
                      <CheckSquare className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Múltiplas contas com radical semelhante</span>
                    <Badge variant="secondary" className="text-[10px] py-0 font-bold">
                      {estatisticasBase.padraoNome}
                    </Badge>
                  </div>
                </Card>
              </div>
            </div>

            {/* Checkbox de Expansão Automática de Contas Vinculadas */}
            <div
              onClick={() => setExpandirVinculados((prev) => !prev)}
              className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border/50 cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                {expandirVinculados ? (
                  <CheckSquare className="h-4 w-4 text-primary" />
                ) : (
                  <Square className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-xs font-medium text-foreground">
                  Incluir automaticamente contas vinculadas (mesmo telefone ou mesmo padrão de nome)
                </span>
              </div>
              <Badge variant="outline" className="text-[10px] py-0 text-muted-foreground">
                Opcional
              </Badge>
            </div>

            {/* 4. BUSCA EM TEMPO REAL */}
            <div className="space-y-1">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Search className="h-3 w-3" />
                Filtrar Resultados em Tempo Real
              </Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Pesquise por nome, telefone, aplicativo, servidor ou observação..."
                  className="pl-8 h-8 text-xs bg-background/70"
                />
              </div>
            </div>

            {/* Banner de Resumo da Seleção com Ativos e Vencidos */}
            <div className="rounded-lg bg-muted/40 border border-border/70 p-3 flex items-center justify-between gap-2 flex-wrap text-xs">
              <div className="space-y-0.5">
                <span className="text-muted-foreground block text-[11px]">
                  Filtro Ativo: <strong>{rotuloFiltroAtual}</strong>
                </span>
                <span className="font-bold text-sm text-foreground">
                  {contagensSelecionados.total} contato(s) selecionado(s) para o relatório
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-semibold py-0.5">
                  {contagensSelecionados.ativos} Ativos
                </Badge>
                <Badge className="bg-red-500/15 text-red-400 border border-red-500/30 text-xs font-semibold py-0.5">
                  {contagensSelecionados.vencidos} Vencidos
                </Badge>
                <Badge className="bg-blue-500/15 text-blue-400 border border-blue-500/30 text-xs font-semibold py-0.5">
                  {contagensSelecionados.pagos} Pagos
                </Badge>
                <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/30 text-xs font-semibold py-0.5">
                  {contagensSelecionados.pendentes} Pendentes
                </Badge>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2 border-t border-border/50">
            <Button
              variant="outline"
              size="sm"
              onClick={exportarExcelCompleto}
              disabled={clientesSelecionados.length === 0}
              className="gap-1.5 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 font-semibold"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
              Baixar Excel Completo (24 colunas)
            </Button>
            <Button
              size="sm"
              onClick={exportarPDFCompleto}
              disabled={clientesSelecionados.length === 0}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
            >
              <FileText className="h-4 w-4" />
              Baixar Relatório em PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
