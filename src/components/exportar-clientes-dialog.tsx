import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import { diasParaVencer, formatDateBR, formatDateTimeBR, maskPhoneBR } from "@/lib/iptv";
import { reportHeaderLines } from "@/lib/app-version";
import { logAudit } from "@/lib/audit";
import { extrairNomeBaseCliente } from "@/lib/comprovante-vencimento-generator";
import { custoCliente } from "@/lib/creditos";
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
  { key: "v1", label: "Vencidos há 1 dia", dias: -1 },
  { key: "hoje", label: "Vence hoje", dias: 0 },
  { key: "a1", label: "Vencem amanhã / 1 dia", dias: 1 },
  { key: "a2", label: "Vencem em 2 dias", dias: 2 },
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

  // Modo de seleção ativo
  const [modo, setModo] = useState<ModoExport>("todos");

  // Períodos específicos de vencimento quando combinados
  const [selPeriodos, setSelPeriodos] = useState<Set<string>>(new Set());
  const [customDiasStr, setCustomDiasStr] = useState("");

  // Expansão de contas vinculadas
  const [expandirVinculados, setExpandirVinculados] = useState(false);

  // Busca textual em tempo real
  const [busca, setBusca] = useState("");

  useEffect(() => {
    if (open) {
      setModo("todos");
      setSelPeriodos(new Set());
      setCustomDiasStr("");
      setExpandirVinculados(false);
      setBusca("");
    }
  }, [open]);

  // Lista base segura
  const listClientes = useMemo(
    () => (Array.isArray(clientes) ? clientes.filter(Boolean) : []),
    [clientes]
  );

  // 1. Identificação de contas com o mesmo telefone
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

  // 2. Identificação de contas com o mesmo padrão/raiz de nome
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

  // Contagens por período e categoria para exibição rápida
  const estatisticasBase = useMemo(() => {
    let ativos = 0;
    let vencidos = 0;
    let pagos = 0;
    let pendentes = 0;
    let arquivados = 0;
    let excluidos = 0;
    let emDia = 0;
    const porDias: Record<number, number> = {};

    listClientes.forEach((c: any) => {
      const d = diasParaVencer(c.data_vencimento);
      const isExcluido = c.status === "cancelado";
      const isSuspenso = c.status === "suspenso";
      const isPago = c.status_pagamento === "pago";
      const isDevendo = c.status_pagamento === "devendo";

      if (isExcluido) excluidos++;
      if (isSuspenso) arquivados++;

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
      arquivados,
      excluidos,
      emDia,
      porDias,
      mesmoTelefone: telefonesRepetidosIds.size,
      padraoNome: nomesRepetidosIds.size,
    };
  }, [listClientes, telefonesRepetidosIds, nomesRepetidosIds]);

  const togglePeriodo = (key: string) => {
    setModo("periodos");
    setSelPeriodos((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 3. Filtragem consolidada dos clientes selecionados
  const clientesSelecionados = useMemo(() => {
    let idsSelecionados = new Set<string>();

    if (modo === "todos") {
      listClientes.forEach((c: any) => idsSelecionados.add(c.id));
    } else if (modo === "ativos") {
      listClientes.forEach((c: any) => {
        const d = diasParaVencer(c.data_vencimento);
        if (c.status !== "cancelado" && c.status !== "suspenso") {
          if (d === null || d >= 0) idsSelecionados.add(c.id);
        }
      });
    } else if (modo === "vencidos") {
      listClientes.forEach((c: any) => {
        const d = diasParaVencer(c.data_vencimento);
        if ((d !== null && d < 0) || (c.status === "vencido" && (d === null || d < 0))) {
          idsSelecionados.add(c.id);
        }
      });
    } else if (modo === "em_dia") {
      listClientes.forEach((c: any) => {
        const d = diasParaVencer(c.data_vencimento);
        if (d !== null && d > 0 && c.status !== "cancelado" && c.status !== "suspenso") {
          idsSelecionados.add(c.id);
        }
      });
    } else if (modo === "pagos") {
      listClientes.forEach((c: any) => {
        if (c.status_pagamento === "pago") idsSelecionados.add(c.id);
      });
    } else if (modo === "pendentes") {
      listClientes.forEach((c: any) => {
        if (c.status_pagamento === "devendo") idsSelecionados.add(c.id);
      });
    } else if (modo === "mesmo_telefone") {
      telefonesRepetidosIds.forEach((id) => idsSelecionados.add(id));
    } else if (modo === "padrao_nome") {
      nomesRepetidosIds.forEach((id) => idsSelecionados.add(id));
    } else if (modo === "arquivados") {
      listClientes.forEach((c: any) => {
        if (c.status === "suspenso") idsSelecionados.add(c.id);
      });
    } else if (modo === "excluidos") {
      listClientes.forEach((c: any) => {
        if (c.status === "cancelado") idsSelecionados.add(c.id);
      });
    } else if (modo === "periodos") {
      const baseDias = PERIODOS_EXPORT.filter((p) => selPeriodos.has(p.key)).map((p) => p.dias);
      const todosDias = Array.from(new Set([...baseDias, ...customDias]));
      const setDias = new Set(todosDias);
      listClientes.forEach((c: any) => {
        const d = diasParaVencer(c.data_vencimento);
        if (d !== null && setDias.has(d)) {
          idsSelecionados.add(c.id);
        }
      });
    }

    // Se houver busca em tempo real, filtra os selecionados
    if (busca.trim()) {
      const term = busca.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const filtradosPorBusca = new Set<string>();
      idsSelecionados.forEach((id) => {
        const c = listClientes.find((item: any) => item.id === id);
        if (!c) return;
        const nomeNorm = String(c.nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const tel = cleanPhone(c.telefone);
        const app = String(c.aplicativo || "").toLowerCase();
        const serv = String(c.servidor?.nome || "").toLowerCase();
        if (nomeNorm.includes(term) || tel.includes(term) || app.includes(term) || serv.includes(term)) {
          filtradosPorBusca.add(id);
        }
      });
      idsSelecionados = filtradosPorBusca;
    }

    // Expansão de contas vinculadas (mesmo telefone ou padrão de nome)
    if (expandirVinculados && idsSelecionados.size > 0 && modo !== "todos") {
      const expandidos = new Set<string>(idsSelecionados);
      idsSelecionados.forEach((id) => {
        const c = listClientes.find((item: any) => item.id === id);
        if (!c) return;

        const phone = cleanPhone(c.telefone || c.celular || c.whatsapp);
        if (phone.length >= 8) {
          const vinculadosTel = mapaVinculadosPorTelefone.get(phone) ?? [];
          vinculadosTel.forEach((v: any) => expandidos.add(v.id));
        }

        const { base } = extrairNomeBaseCliente(c.nome || "");
        const norm = base.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (norm.length >= 3) {
          const vinculadosNome = mapaVinculadosPorNome.get(norm) ?? [];
          vinculadosNome.forEach((v: any) => expandidos.add(v.id));
        }
      });
      idsSelecionados = expandidos;
    }

    // Recupera objetos completos ordenados por vencimento e nome
    return listClientes
      .filter((c: any) => idsSelecionados.has(c.id))
      .sort((a: any, b: any) => {
        const va = a.data_vencimento ? new Date(a.data_vencimento).getTime() : Infinity;
        const vb = b.data_vencimento ? new Date(b.data_vencimento).getTime() : Infinity;
        if (va !== vb) return va - vb;
        return String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR", { sensitivity: "base" });
      });
  }, [
    listClientes,
    modo,
    selPeriodos,
    customDias,
    busca,
    expandirVinculados,
    telefonesRepetidosIds,
    nomesRepetidosIds,
    mapaVinculadosPorTelefone,
    mapaVinculadosPorNome,
  ]);

  // Contagens dos selecionados
  const contagensSelecionados = useMemo(() => {
    let ativos = 0;
    let vencidos = 0;
    let pagos = 0;
    let pendentes = 0;

    clientesSelecionados.forEach((c: any) => {
      const d = diasParaVencer(c.data_vencimento);
      if (d === null || d >= 0) ativos++;
      else vencidos++;
      if (c.status_pagamento === "pago") pagos++;
      if (c.status_pagamento === "devendo") pendentes++;
    });

    return { total: clientesSelecionados.length, ativos, vencidos, pagos, pendentes };
  }, [clientesSelecionados]);

  // Rótulo da exportação para nome de arquivo e auditoria
  const rotuloAtual = useMemo(() => {
    switch (modo) {
      case "todos":
        return "todos-os-contatos";
      case "ativos":
        return "somente-ativos";
      case "vencidos":
        return "somente-vencidos";
      case "em_dia":
        return "em-dia-futuro";
      case "pagos":
        return "todos-os-pagos";
      case "pendentes":
        return "todos-os-pendentes";
      case "mesmo_telefone":
        return "mesmo-telefone";
      case "padrao_nome":
        return "padrao-nome";
      case "arquivados":
        return "arquivados-suspensos";
      case "excluidos":
        return "excluidos-lixeira";
      case "periodos":
        return `periodos-${Array.from(selPeriodos).join("-")}`;
      default:
        return "exportacao-contatos";
    }
  }, [modo, selPeriodos]);

  // ==========================================
  // EXPORTAÇÃO EXCEL (.xlsx) COMPLETA
  // ==========================================
  const exportarExcelCompleto = () => {
    if (clientesSelecionados.length === 0) {
      return toast.info("Nenhum cliente encontrado para este filtro de exportação.");
    }

    const sim = (v: any) => (v ? "Sim" : "Não");
    const linhasAOA = clientesSelecionados.map((c: any) => {
      const d = diasParaVencer(c.data_vencimento);
      const custo = custoCliente(c, historico);
      return [
        c.nome ?? "",
        c.telefone ? maskPhoneBR(c.telefone) : "",
        c.servidor?.nome ?? "",
        formatDateTimeBR(c.data_inicio),
        formatDateBR(c.data_vencimento),
        c.status ?? "",
        c.status_pagamento ?? "",
        custo,
        Number(c.valor_pago || 0),
        Number(c.valor_pago || 0) - custo,
        c.mac ?? "",
        c.device ?? "",
        c.aplicativo ?? "",
        c.observacao ?? "",
        c.servidor?.categoria ?? "",
        d ?? "",
        d === null
          ? "Sem vencimento"
          : d < 0
          ? `Vencido há ${Math.abs(d)} dia(s)`
          : d === 0
          ? "Vence hoje"
          : `Faltam ${d} dia(s)`,
        sim(c.lembrete_no_dia),
        sim(c.lembrete_1_dia_antes),
        sim(c.lembrete_vencimento),
        sim(c.lembrete_apos),
        formatDateTimeBR(c.created_at),
        formatDateTimeBR(c.updated_at),
        c.id,
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([COLUNAS_EXPORT_PADRAO, ...linhasAOA]);
    ws["!cols"] = COLUNAS_EXPORT_PADRAO.map(() => ({ wch: 18 }));
    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: linhasAOA.length, c: COLUNAS_EXPORT_PADRAO.length - 1 },
      }),
    };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clientes");

    const dataHoje = new Date().toISOString().slice(0, 10);
    const nomeArquivo = `contatos-${rotuloAtual}-${dataHoje}.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);

    toast.success(`Planilha Excel baixada com ${clientesSelecionados.length} contato(s)!`);
    logAudit({
      categoria: "exportacao",
      acao: "exportar_excel",
      descricao: `Exportação de clientes Excel (${rotuloAtual}) - ${clientesSelecionados.length} contatos`,
      entidade: "clientes",
      metadata: {
        modo,
        total: clientesSelecionados.length,
        ativos: contagensSelecionados.ativos,
        vencidos: contagensSelecionados.vencidos,
      },
    });
  };

  // ==========================================
  // EXPORTAÇÃO PDF (.pdf) FORMATADA
  // ==========================================
  const exportarPDFCompleto = () => {
    if (clientesSelecionados.length === 0) {
      return toast.info("Nenhum cliente encontrado para este filtro de exportação.");
    }

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 10;
    let y = margin;

    const drawHeader = () => {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(13);
      pdf.setTextColor(17, 24, 39);
      pdf.text("RELATÓRIO DE CONTATOS — RODOLFO TV", margin, y);
      y += 5;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(107, 114, 128);
      pdf.text(
        `Filtro: ${rotuloAtual} • Gerado em: ${formatDateTimeBR(new Date())} • Total: ${clientesSelecionados.length} contatos (${contagensSelecionados.ativos} ativos, ${contagensSelecionados.vencidos} vencidos)`,
        margin,
        y
      );
      y += 6;

      // Cabeçalho da tabela
      pdf.setFillColor(243, 244, 246);
      pdf.rect(margin, y - 4, pageW - margin * 2, 6, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7.5);
      pdf.setTextColor(31, 41, 55);

      pdf.text("NOME", margin + 1, y);
      pdf.text("TELEFONE", margin + 55, y);
      pdf.text("STATUS", margin + 90, y);
      pdf.text("VENCIMENTO", margin + 115, y);
      pdf.text("SITUAÇÃO", margin + 140, y);
      pdf.text("SERVIDOR", margin + 168, y);
      y += 5;
    };

    drawHeader();

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);

    clientesSelecionados.forEach((c: any) => {
      if (y > pageH - margin - 5) {
        pdf.addPage();
        y = margin;
        drawHeader();
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7);
      }

      const d = diasParaVencer(c.data_vencimento);
      const isAtivo = d === null || d >= 0;
      const situacao =
        d === null
          ? "Sem vencimento"
          : d < 0
          ? `Vencido há ${Math.abs(d)}d`
          : d === 0
          ? "Vence hoje"
          : `Faltam ${d}d`;

      pdf.setTextColor(17, 24, 39);
      pdf.text(pdf.splitTextToSize(String(c.nome || "-"), 52)[0] ?? "", margin + 1, y);
      pdf.text(c.telefone ? maskPhoneBR(c.telefone) : "-", margin + 55, y);

      if (isAtivo) {
        pdf.setTextColor(16, 149, 90);
        pdf.text("ATIVO", margin + 90, y);
      } else {
        pdf.setTextColor(220, 38, 38);
        pdf.text("VENCIDO", margin + 90, y);
      }

      pdf.setTextColor(17, 24, 39);
      pdf.text(c.data_vencimento ? formatDateBR(c.data_vencimento) : "-", margin + 115, y);
      pdf.text(situacao, margin + 140, y);
      pdf.text(pdf.splitTextToSize(String(c.servidor?.nome || "-"), 22)[0] ?? "", margin + 168, y);

      y += 4.5;
    });

    const dataHoje = new Date().toISOString().slice(0, 10);
    pdf.save(`relatorio-contatos-${rotuloAtual}-${dataHoje}.pdf`);
    toast.success(`Relatório PDF baixado com ${clientesSelecionados.length} contato(s)!`);
    logAudit({
      categoria: "exportacao",
      acao: "exportar_pdf",
      descricao: `Exportação de clientes PDF (${rotuloAtual}) - ${clientesSelecionados.length} contatos`,
      entidade: "clientes",
      metadata: { modo, total: clientesSelecionados.length },
    });
  };

  return (
    <>
      {trigger ? (
        <span onClick={() => setOpen(true)} className="inline-flex cursor-pointer">
          {trigger}
        </span>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className="gap-1 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
        >
          <Download className="h-4 w-4 text-emerald-500" /> Exportar
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-emerald-500" />
              Central Dinâmica de Exportação de Contatos
            </DialogTitle>
            <DialogDescription>
              Selecione o filtro ou categoria desejada para exportar os contatos com todas as informações completas em Excel ou PDF.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* 1. Categorias Principais de Exportação */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Filtros Principais & Status dos Contatos
              </Label>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {/* Todos os Clientes */}
                <Card
                  onClick={() => {
                    setModo("todos");
                    setSelPeriodos(new Set());
                  }}
                  className={cn(
                    "p-2.5 flex flex-col justify-between gap-1 cursor-pointer transition-all border",
                    modo === "todos"
                      ? "border-emerald-500 bg-emerald-500/10 shadow-xs ring-1 ring-emerald-500/40"
                      : "hover:border-border/80 bg-card/60"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                      <Users className="h-3.5 w-3.5 text-emerald-500" />
                      Todos os Contatos
                    </span>
                    {modo === "todos" ? (
                      <CheckSquare className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Base completa</span>
                    <Badge variant="secondary" className="text-[10px] py-0">
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
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      Somente Ativos
                    </span>
                    {modo === "ativos" ? (
                      <CheckSquare className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Em dia / futuros</span>
                    <Badge variant="secondary" className="text-[10px] py-0 text-emerald-500">
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
                    <span>Vencimento &lt; 0</span>
                    <Badge variant="secondary" className="text-[10px] py-0 text-red-400">
                      {estatisticasBase.vencidos}
                    </Badge>
                  </div>
                </Card>

                {/* Em Dia / Futuros */}
                <Card
                  onClick={() => {
                    setModo("em_dia");
                    setSelPeriodos(new Set());
                  }}
                  className={cn(
                    "p-2.5 flex flex-col justify-between gap-1 cursor-pointer transition-all border",
                    modo === "em_dia"
                      ? "border-emerald-500 bg-emerald-500/10 shadow-xs ring-1 ring-emerald-500/40"
                      : "hover:border-border/80 bg-card/60"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                      <Clock className="h-3.5 w-3.5 text-sky-400" />
                      Em Dia / Futuro
                    </span>
                    {modo === "em_dia" ? (
                      <CheckSquare className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Vencimento futuro</span>
                    <Badge variant="secondary" className="text-[10px] py-0">
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
                    <Badge variant="secondary" className="text-[10px] py-0 text-emerald-400">
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
                      <DollarSign className="h-3.5 w-3.5 text-amber-400" />
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
                    <Badge variant="secondary" className="text-[10px] py-0 text-amber-400">
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
                      ? "border-blue-500 bg-blue-500/10 shadow-xs ring-1 ring-blue-500/40"
                      : "hover:border-border/80 bg-card/60"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                      <Archive className="h-3.5 w-3.5 text-blue-400" />
                      Todos os Arquivados
                    </span>
                    {modo === "arquivados" ? (
                      <CheckSquare className="h-4 w-4 text-blue-400" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Status: suspenso</span>
                    <Badge variant="secondary" className="text-[10px] py-0">
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
                    <Badge variant="secondary" className="text-[10px] py-0 text-red-400">
                      {estatisticasBase.excluidos}
                    </Badge>
                  </div>
                </Card>
              </div>
            </div>

            {/* 2. Seleções por Agrupamento (Mesmo Telefone & Padrão de Nome) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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
                    <Badge variant="secondary" className="text-[10px] py-0">
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
                    <span>Múltiplas telas com o mesmo radical</span>
                    <Badge variant="secondary" className="text-[10px] py-0">
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

            {/* 3. Períodos de Vencimento Específicos */}
            <div className="space-y-1.5 pt-1">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Ou Filtrar por Períodos de Vencimento Específicos
              </Label>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                {PERIODOS_EXPORT.map((p) => {
                  const isChecked = modo === "periodos" && selPeriodos.has(p.key);
                  return (
                    <Card
                      key={p.key}
                      onClick={() => togglePeriodo(p.key)}
                      className={cn(
                        "p-2 flex flex-col justify-between gap-1 cursor-pointer transition-colors border",
                        isChecked ? "border-primary bg-primary/10" : "hover:border-border/80"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium truncate">{p.label}</span>
                        {isChecked ? (
                          <CheckSquare className="h-3.5 w-3.5 text-primary shrink-0" />
                        ) : (
                          <Square className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        )}
                      </div>
                      <Badge variant="secondary" className="text-[10px] self-end py-0">
                        {estatisticasBase.porDias[p.dias] ?? 0}
                      </Badge>
                    </Card>
                  );
                })}
              </div>

              {/* Dias personalizados */}
              <div className="pt-1 space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  Personalizar dias específicos de vencimento (ex.: -30, -5, 3, 7):
                </Label>
                <Input
                  value={customDiasStr}
                  onChange={(e) => {
                    setCustomDiasStr(e.target.value);
                    if (e.target.value) setModo("periodos");
                  }}
                  placeholder="-30, -5, 3, 7"
                  className="h-8 text-xs bg-background/80"
                />
              </div>
            </div>

            {/* 4. Busca Textual Rápida */}
            <div className="space-y-1">
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Pesquisar por nome, telefone, aplicativo ou servidor..."
                  className="h-8 pl-8 text-xs bg-background/80"
                />
              </div>
            </div>

            {/* 5. Banner de Resumo da Seleção */}
            <div className="rounded-lg bg-muted/40 border border-border/70 p-2.5 flex items-center justify-between gap-2 flex-wrap text-xs">
              <div className="space-y-0.5">
                <span className="text-muted-foreground block text-[11px]">
                  Total de contatos selecionados para exportação:
                </span>
                <span className="font-bold text-sm text-foreground">
                  {contagensSelecionados.total} contato(s)
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
              className="gap-1.5 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
              Baixar Excel Completo (.xlsx)
            </Button>
            <Button
              size="sm"
              onClick={exportarPDFCompleto}
              disabled={clientesSelecionados.length === 0}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              <FileText className="h-4 w-4" />
              Baixar Relatório em PDF (.pdf)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
