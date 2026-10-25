import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { FileSpreadsheet, FileText, Send, Users, Phone, Search, CheckSquare, Square, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { diasParaVencer, formatDateBR, maskPhoneBR } from "@/lib/iptv";
import { reportHeaderLines } from "@/lib/app-version";
import { logAudit } from "@/lib/audit";
import { extrairNomeBaseCliente } from "@/lib/comprovante-vencimento-generator";
import { cn } from "@/lib/utils";

type Periodo = { key: string; label: string; dias: number };

const PERIODOS: Periodo[] = [
  { key: "v2", label: "Vencidos há 2 dias", dias: -2 },
  { key: "v1", label: "Vencidos há 1 dia", dias: -1 },
  { key: "hoje", label: "Vencem hoje", dias: 0 },
  { key: "a1", label: "Ativos — vencem em 1 dia", dias: 1 },
  { key: "a2", label: "Ativos — vencem em 2 dias", dias: 2 },
];

function cleanPhone(p: any): string {
  return String(p || "").replace(/\D/g, "");
}

export function EnviosMassaDialog({ clientes = [] }: { clientes: any[] }) {
  const [open, setOpen] = useState(false);
  const [selPeriodos, setSelPeriodos] = useState<Set<string>>(new Set(["v1"]));
  const [custom, setCustom] = useState("");
  const [selecionarTodos, setSelecionarTodos] = useState(false);
  const [selecionarMesmoTelefone, setSelecionarMesmoTelefone] = useState(false);
  const [selecionarMesmoNome, setSelecionarMesmoNome] = useState(false);
  const [expandirVinculados, setExpandirVinculados] = useState(true);
  const [buscaPadrao, setBuscaPadrao] = useState("");

  useEffect(() => {
    if (open) {
      setSelPeriodos(new Set(["v1"]));
      setCustom("");
      setSelecionarTodos(false);
      setSelecionarMesmoTelefone(false);
      setSelecionarMesmoNome(false);
      setExpandirVinculados(true);
      setBuscaPadrao("");
    }
  }, [open]);

  // Lista base segura
  const listClientes = useMemo(() => (Array.isArray(clientes) ? clientes.filter(Boolean) : []), [clientes]);

  // 1. Identificação de contas com o mesmo número de telefone (duplicados / telas adicionais)
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

  // 2. Identificação de contas com o mesmo padrão/raiz de nome (ex: "Carlos 1", "Carlos 2")
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

  // Mapas auxiliares para expansão de contas vinculadas
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
      custom
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^-?\d+$/.test(s))
        .map(Number),
    [custom],
  );

  const diasSelecionados = useMemo(() => {
    const base = PERIODOS.filter((p) => selPeriodos.has(p.key)).map((p) => p.dias);
    return Array.from(new Set([...base, ...customDias])).sort((a, b) => a - b);
  }, [selPeriodos, customDias]);

  // Contagem por dia de vencimento
  const contagem = useMemo(() => {
    const m: Record<number, number> = {};
    listClientes.forEach((c: any) => {
      const d = diasParaVencer(c.data_vencimento);
      if (d === null) return;
      m[d] = (m[d] ?? 0) + 1;
    });
    return m;
  }, [listClientes]);

  // Lista consolidada de clientes selecionados
  const clientesSelecionados = useMemo(() => {
    let idsSelecionados = new Set<string>();

    // Se "Selecionar Todos os Clientes" estiver ativo
    if (selecionarTodos) {
      listClientes.forEach((c: any) => idsSelecionados.add(c.id));
    } else {
      // 1. Seleção por período de vencimento
      if (diasSelecionados.length > 0) {
        const setDias = new Set(diasSelecionados);
        listClientes.forEach((c: any) => {
          const d = diasParaVencer(c.data_vencimento);
          if (d !== null && setDias.has(d)) {
            idsSelecionados.add(c.id);
          }
        });
      }

      // 2. Seleção de clientes com o mesmo número de telefone
      if (selecionarMesmoTelefone) {
        telefonesRepetidosIds.forEach((id) => idsSelecionados.add(id));
      }

      // 3. Seleção de clientes com o mesmo padrão de nome
      if (selecionarMesmoNome) {
        nomesRepetidosIds.forEach((id) => idsSelecionados.add(id));
      }

      // 4. Busca por padrão digitado (nome ou telefone)
      if (buscaPadrao.trim()) {
        const term = buscaPadrao.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const digits = buscaPadrao.replace(/\D/g, "");

        listClientes.forEach((c: any) => {
          const nomeNorm = String(c.nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          const phone = cleanPhone(c.telefone || c.celular || c.whatsapp);
          const matchNome = nomeNorm.includes(term);
          const matchPhone = digits.length >= 3 && phone.includes(digits);
          if (matchNome || matchPhone) {
            idsSelecionados.add(c.id);
          }
        });
      }
    }

    // Se a opção de expandir vinculados estiver ativa, inclui todas as outras contas com mesmo telefone ou padrão de nome
    if (expandirVinculados && !selecionarTodos && idsSelecionados.size > 0) {
      const expandidos = new Set<string>(idsSelecionados);
      listClientes.forEach((c: any) => {
        if (idsSelecionados.has(c.id)) {
          // Vinculados por telefone
          const phone = cleanPhone(c.telefone || c.celular || c.whatsapp);
          if (phone.length >= 8) {
            (mapaVinculadosPorTelefone.get(phone) || []).forEach((outro: any) => expandidos.add(outro.id));
          }
          // Vinculados por nome
          const { base } = extrairNomeBaseCliente(c.nome || "");
          const norm = base.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if (norm.length >= 3) {
            (mapaVinculadosPorNome.get(norm) || []).forEach((outro: any) => expandidos.add(outro.id));
          }
        }
      });
      idsSelecionados = expandidos;
    }

    return listClientes.filter((c: any) => idsSelecionados.has(c.id));
  }, [
    listClientes,
    selecionarTodos,
    diasSelecionados,
    selecionarMesmoTelefone,
    selecionarMesmoNome,
    buscaPadrao,
    expandirVinculados,
    telefonesRepetidosIds,
    nomesRepetidosIds,
    mapaVinculadosPorTelefone,
    mapaVinculadosPorNome,
  ]);

  // Linhas formatadas para exportação (com STATUS ATIVO / VENCIDO e dados de vencimento)
  const linhasExport = useMemo(() => {
    return clientesSelecionados
      .map((c: any) => {
        const d = diasParaVencer(c.data_vencimento);
        const isAtivo = (d === null && c.status !== "vencido") || (d !== null && d >= 0);
        const statusStr = isAtivo ? "ATIVO" : "VENCIDO";
        const situacaoStr =
          d === null
            ? "Sem vencimento"
            : d < 0
            ? `Vencido há ${Math.abs(d)} dia(s)`
            : d === 0
            ? "Vence hoje"
            : `Ativo (vence em ${d} dias)`;

        return {
          NOMES: c?.nome ?? "",
          NUMERO: c?.telefone ? maskPhoneBR(c.telefone) : "",
          STATUS: statusStr,
          DIAS_VENCIMENTO: d ?? 0,
          DATA_VENCIMENTO: c?.data_vencimento ? formatDateBR(c.data_vencimento) : "-",
          SITUACAO: situacaoStr,
          APLICATIVO: c?.aplicativo || "-",
          SERVIDOR: c?.servidor?.nome || "-",
          _isAtivo: isAtivo,
          _dias: d,
        };
      })
      .sort((a, b) => (a.NOMES || "").localeCompare(b.NOMES || "", "pt-BR", { sensitivity: "base" }));
  }, [clientesSelecionados]);

  // Contadores
  const totalSelecionado = linhasExport.length;
  const totalAtivos = useMemo(() => linhasExport.filter((l) => l._isAtivo).length, [linhasExport]);
  const totalVencidos = useMemo(() => linhasExport.filter((l) => !l._isAtivo).length, [linhasExport]);

  const togglePeriodo = (k: string) => {
    setSelecionarTodos(false);
    setSelPeriodos((prev) => {
      const n = new Set(prev);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  };

  const rotuloFiltros = () => {
    const partes: string[] = [];
    if (selecionarTodos) partes.push("Todos os Clientes");
    if (selecionarMesmoTelefone) partes.push("Mesmo Telefone");
    if (selecionarMesmoNome) partes.push("Mesmo Padrão de Nome");
    if (buscaPadrao.trim()) partes.push(`Busca: "${buscaPadrao.trim()}"`);
    const nomesPeriodos = PERIODOS.filter((p) => selPeriodos.has(p.key)).map((p) => p.label);
    if (nomesPeriodos.length) partes.push(...nomesPeriodos);
    if (customDias.length) partes.push(`Personalizado (${customDias.join(", ")}d)`);
    if (expandirVinculados) partes.push("Vinculados Inclusos");
    return partes.join(" • ") || "Nenhum filtro";
  };

  const stamp = () => new Date().toISOString().slice(0, 10);

  function exportXLSX() {
    if (!linhasExport.length) return toast.error("Nenhum cliente selecionado.");

    // Remove propriedades de controle interno antes de exportar para a planilha
    const linhasLimpa = linhasExport.map(({ _isAtivo, _dias, ...resto }) => resto);

    const ws = XLSX.utils.json_to_sheet(linhasLimpa, {
      header: [
        "NOMES",
        "NUMERO",
        "STATUS",
        "DIAS_VENCIMENTO",
        "DATA_VENCIMENTO",
        "SITUACAO",
        "APLICATIVO",
        "SERVIDOR",
      ],
    });

    ws["!cols"] = [
      { wch: 36 }, // NOMES
      { wch: 20 }, // NUMERO
      { wch: 12 }, // STATUS
      { wch: 18 }, // DIAS_VENCIMENTO
      { wch: 18 }, // DATA_VENCIMENTO
      { wch: 28 }, // SITUACAO
      { wch: 18 }, // APLICATIVO
      { wch: 20 }, // SERVIDOR
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Envios em massa");
    XLSX.writeFile(wb, `envios-em-massa-${stamp()}.xlsx`);

    toast.success(`Excel gerado com ${linhasExport.length} cliente(s) (${totalAtivos} ativos, ${totalVencidos} vencidos)`);
    logAudit({
      categoria: "exportacao",
      acao: "exportar",
      descricao: `Envios em massa (Excel) — ${rotuloFiltros()}`,
      entidade: "clientes",
      metadata: { total: linhasExport.length, ativos: totalAtivos, vencidos: totalVencidos },
    });
  }

  function exportPDF() {
    if (!linhasExport.length) return toast.error("Nenhum cliente selecionado.");

    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 12;
    const header = reportHeaderLines("ENVIOS EM MASSA");
    let y = margin;

    pdf.setTextColor(17, 24, 39);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.text(header[0], margin, y);
    y += 6;

    pdf.setFontSize(10);
    pdf.text(header[1], margin, y);
    y += 5;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.text(header[2], margin, y);
    y += 5;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(37, 99, 235);
    pdf.text(header[3], margin, y);
    y += 6;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(90);
    pdf
      .splitTextToSize(
        `${rotuloFiltros()} — Total: ${linhasExport.length} cliente(s) (${totalAtivos} ativos, ${totalVencidos} vencidos)`,
        pageW - margin * 2
      )
      .forEach((l: string) => {
        pdf.text(l, margin, y);
        y += 4;
      });
    y += 3;

    // Colunas da tabela PDF
    const colWNome = 58;
    const colWNumero = 32;
    const colWStatus = 20;
    const colWVenc = 26;
    const colWSituacao = 50;

    const drawHead = () => {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8.5);
      pdf.setTextColor(17, 24, 39);
      pdf.setFillColor(230, 236, 245);
      pdf.rect(margin, y - 4.5, pageW - margin * 2, 6.5, "F");

      let curX = margin + 1.5;
      pdf.text("NOMES", curX, y);
      curX += colWNome;
      pdf.text("NUMERO", curX, y);
      curX += colWNumero;
      pdf.text("STATUS", curX, y);
      curX += colWStatus;
      pdf.text("VENCIMENTO", curX, y);
      curX += colWVenc;
      pdf.text("SITUAÇÃO", curX, y);

      y += 6;
      pdf.setFont("helvetica", "normal");
    };

    drawHead();

    linhasExport.forEach((r) => {
      if (y > pageH - margin) {
        pdf.addPage();
        y = margin + 4;
        drawHead();
      }

      let curX = margin + 1.5;
      pdf.setTextColor(17, 24, 39);
      pdf.text(pdf.splitTextToSize(r.NOMES, colWNome - 2)[0] ?? "", curX, y);
      curX += colWNome;

      pdf.text(r.NUMERO, curX, y);
      curX += colWNumero;

      // Status com cor
      if (r.STATUS === "ATIVO") {
        pdf.setTextColor(16, 149, 90); // verde
      } else {
        pdf.setTextColor(220, 38, 38); // vermelho
      }
      pdf.text(r.STATUS, curX, y);
      curX += colWStatus;

      pdf.setTextColor(17, 24, 39);
      pdf.text(r.DATA_VENCIMENTO, curX, y);
      curX += colWVenc;

      pdf.text(pdf.splitTextToSize(r.SITUACAO, colWSituacao - 2)[0] ?? "", curX, y);

      y += 5;
    });

    pdf.save(`envios-em-massa-${stamp()}.pdf`);
    toast.success(`PDF gerado com ${linhasExport.length} cliente(s) (${totalAtivos} ativos, ${totalVencidos} vencidos)`);
    logAudit({
      categoria: "exportacao",
      acao: "exportar",
      descricao: `Envios em massa (PDF) — ${rotuloFiltros()}`,
      entidade: "clientes",
      metadata: { total: linhasExport.length, ativos: totalAtivos, vencidos: totalVencidos },
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Send className="h-4 w-4 mr-1" /> Envios em Massa
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" /> Envios em Massa
            </DialogTitle>
            <DialogDescription>
              Selecione clientes por períodos, mesmo padrão de nome ou mesmo telefone, e baixe a lista com identificação de <strong>ATIVOS</strong> e <strong>VENCIDOS</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {/* Opções Especiais de Seleção Coletiva */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Seleção Rápida por Padrão ou Base
              </Label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {/* 1. Todos os Clientes */}
                <Card
                  onClick={() => {
                    const next = !selecionarTodos;
                    setSelecionarTodos(next);
                    if (next) {
                      setSelPeriodos(new Set());
                      setCustom("");
                    }
                  }}
                  className={cn(
                    "p-2.5 flex flex-col justify-between gap-1.5 cursor-pointer transition-all border",
                    selecionarTodos ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40" : "hover:border-border/80 bg-card/60"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-primary" />
                      Todos os Clientes
                    </span>
                    {selecionarTodos ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Base Completa</span>
                    <Badge variant="secondary" className="text-[10px] py-0">{listClientes.length}</Badge>
                  </div>
                </Card>

                {/* 2. Mesmo Número de Telefone */}
                <Card
                  onClick={() => {
                    setSelecionarTodos(false);
                    setSelecionarMesmoTelefone((prev) => !prev);
                  }}
                  className={cn(
                    "p-2.5 flex flex-col justify-between gap-1.5 cursor-pointer transition-all border",
                    selecionarMesmoTelefone ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40" : "hover:border-border/80 bg-card/60"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-primary" />
                      Mesmo Telefone
                    </span>
                    {selecionarMesmoTelefone ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Contas vinculadas</span>
                    <Badge variant="secondary" className="text-[10px] py-0">{telefonesRepetidosIds.size}</Badge>
                  </div>
                </Card>

                {/* 3. Mesmo Padrão de Nome */}
                <Card
                  onClick={() => {
                    setSelecionarTodos(false);
                    setSelecionarMesmoNome((prev) => !prev);
                  }}
                  className={cn(
                    "p-2.5 flex flex-col justify-between gap-1.5 cursor-pointer transition-all border",
                    selecionarMesmoNome ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40" : "hover:border-border/80 bg-card/60"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      Padrão de Nome
                    </span>
                    {selecionarMesmoNome ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Multi-telas por nome</span>
                    <Badge variant="secondary" className="text-[10px] py-0">{nomesRepetidosIds.size}</Badge>
                  </div>
                </Card>
              </div>
            </div>

            {/* Campo de Busca Rápida por Padrão */}
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">
                Buscar / Selecionar por padrão específico de nome ou telefone
              </Label>
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={buscaPadrao}
                  onChange={(e) => {
                    setBuscaPadrao(e.target.value);
                    if (e.target.value) setSelecionarTodos(false);
                  }}
                  placeholder="Ex.: Carlos, Tela 2, (11) 96117..."
                  className="h-8 pl-8 text-xs bg-background/80"
                />
              </div>
            </div>

            {/* Checkbox: Expandir para contas vinculadas */}
            <div
              onClick={() => setExpandirVinculados((prev) => !prev)}
              className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border/50 cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                {expandirVinculados ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                <span className="text-xs font-medium text-foreground">
                  Incluir automaticamente contas vinculadas (mesmo telefone ou padrão de nome)
                </span>
              </div>
              <Badge variant="outline" className="text-[10px] py-0 text-muted-foreground">
                Recomendado
              </Badge>
            </div>

            {/* Períodos de Vencimento */}
            <div className="space-y-1.5 pt-1">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Períodos de Vencimento
              </Label>

              <div className="space-y-1.5">
                {PERIODOS.map((p) => {
                  const isChecked = selPeriodos.has(p.key) && !selecionarTodos;
                  return (
                    <Card
                      key={p.key}
                      onClick={() => togglePeriodo(p.key)}
                      className={cn(
                        "p-2 flex items-center justify-between gap-2 cursor-pointer transition-colors border",
                        isChecked ? "border-primary bg-primary/5" : "hover:border-border/80"
                      )}
                    >
                      <div className="flex items-center gap-2 text-xs sm:text-sm">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          readOnly
                          className="pointer-events-none"
                        />
                        <span>{p.label}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs">{contagem[p.dias] ?? 0}</Badge>
                    </Card>
                  );
                })}

                <div className="space-y-1 pt-1">
                  <Label className="text-[11px] text-muted-foreground">
                    Personalizar dias específicos (negativo = vencido). Ex.: -30, -5, 3, 7
                  </Label>
                  <Input
                    value={custom}
                    onChange={(e) => {
                      setCustom(e.target.value);
                      if (e.target.value) setSelecionarTodos(false);
                    }}
                    placeholder="-30, -5, 3, 7"
                    className="h-8 text-xs bg-background/80"
                  />
                </div>
              </div>
            </div>

            {/* Banner de Resumo da Seleção com Ativos e Vencidos */}
            <div className="rounded-lg bg-muted/40 border border-border/70 p-2.5 flex items-center justify-between gap-2 flex-wrap text-xs">
              <div className="space-y-0.5">
                <span className="text-muted-foreground block text-[11px]">Total selecionado para o arquivo:</span>
                <span className="font-bold text-sm text-foreground">
                  {totalSelecionado} cliente(s)
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-semibold py-0.5">
                  {totalAtivos} Ativos
                </Badge>
                <Badge className="bg-red-500/15 text-red-400 border border-red-500/30 text-xs font-semibold py-0.5">
                  {totalVencidos} Vencidos
                </Badge>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground leading-normal">
              💡 <strong>Dica:</strong> O arquivo baixado traz as colunas <code>STATUS</code> (ATIVO/VENCIDO), <code>DIAS_VENCIMENTO</code> e <code>DATA_VENCIMENTO</code>, permitindo no Excel filtrar e excluir facilmente os clientes vencidos há muito tempo.
            </p>
          </div>

          <DialogFooter className="gap-2 pt-2 border-t border-border/50">
            <Button variant="outline" size="sm" onClick={exportXLSX} disabled={!linhasExport.length} className="gap-1.5">
              <FileSpreadsheet className="h-4 w-4 text-emerald-500" /> Baixar Excel (.xlsx)
            </Button>
            <Button size="sm" onClick={exportPDF} disabled={!linhasExport.length} className="gap-1.5">
              <FileText className="h-4 w-4" /> Baixar PDF (.pdf)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
