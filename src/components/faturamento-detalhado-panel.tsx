import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchFinanceiro, localISODate } from "@/lib/faturamento";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { COMPACT_TABLE_CLASS } from "@/components/density-toggle";
import {
  Receipt,
  Search,
  RefreshCw,
  Undo2,
  FileSpreadsheet,
  FileText,
  Copy,
  Download,
  Smartphone,
  Users,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  FileDown,
} from "lucide-react";
import { currencyBRL, formatDateTimeBR } from "@/lib/iptv";
import { reverterLancamentoFaturamento } from "@/lib/reverter-renovacao";
import { reportHeaderLines } from "@/lib/app-version";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { cn } from "@/lib/utils";

export function FaturamentoDetalhadoPanel() {
  const qc = useQueryClient();
  const { data: financeiro = [], isFetching, refetch } = useQuery({
    queryKey: ["faturamento_bruto_dia"],
    queryFn: fetchFinanceiro,
  });

  const hoje = new Date();
  const [periodo, setPeriodo] = useState<string>("mes_atual");
  const [ano, setAno] = useState<number>(hoje.getFullYear());
  const [mes, setMes] = useState<number>(hoje.getMonth() + 1);
  const [tipoFiltro, setTipoFiltro] = useState<string>("todos");
  const [statusFiltro, setStatusFiltro] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [ordenacao, setOrdenacao] = useState<"recentes" | "antigos" | "maior_valor" | "maior_lucro">("recentes");
  const [revertingId, setRevertingId] = useState<string | null>(null);

  // Paginação
  const [pagina, setPagina] = useState(1);
  const [itensPorPagina, setItensPorPagina] = useState(25);

  const meses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  const anos = Array.from({ length: 5 }, (_, i) => hoje.getFullYear() - 3 + i);

  // Filtro de lançamentos
  const lancamentosFiltrados = useMemo(() => {
    const hojeISO = localISODate(hoje);
    const ontemDate = new Date();
    ontemDate.setDate(ontemDate.getDate() - 1);
    const ontemISO = localISODate(ontemDate);

    const seteDiasAtras = new Date();
    seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
    const seteDiasISO = localISODate(seteDiasAtras);

    const mesAtualPrefixo = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
    const mesAnteriorDate = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const mesAnteriorPrefixo = `${mesAnteriorDate.getFullYear()}-${String(mesAnteriorDate.getMonth() + 1).padStart(2, "0")}`;
    const mesCustomPrefixo = `${ano}-${String(mes).padStart(2, "0")}`;
    const anoAtualPrefixo = `${hoje.getFullYear()}-`;

    return (financeiro as any[]).filter((item) => {
      const dataISO = localISODate(item.created_at);

      // Filtro de Período
      if (periodo === "hoje" && dataISO !== hojeISO) return false;
      if (periodo === "ontem" && dataISO !== ontemISO) return false;
      if (periodo === "7dias" && dataISO < seteDiasISO) return false;
      if (periodo === "mes_atual" && !dataISO.startsWith(mesAtualPrefixo)) return false;
      if (periodo === "mes_anterior" && !dataISO.startsWith(mesAnteriorPrefixo)) return false;
      if (periodo === "ano_atual" && !dataISO.startsWith(anoAtualPrefixo)) return false;
      if (periodo === "personalizado" && !dataISO.startsWith(mesCustomPrefixo)) return false;

      // Filtro de Tipo
      if (tipoFiltro !== "todos") {
        if (tipoFiltro === "cliente" && item.tipo !== "cliente") return false;
        if (tipoFiltro === "revendedor" && item.tipo !== "revendedor") return false;
        if (tipoFiltro === "ativacao_app" && item.tipo !== "ativacao_app") return false;
      }

      // Filtro de Status
      if (statusFiltro !== "todos") {
        const itemStatus = item.status_pagamento || (item.valor > 0 ? "pago" : "devendo");
        if (statusFiltro === "pago" && itemStatus !== "pago") return false;
        if (statusFiltro === "devendo" && itemStatus !== "devendo") return false;
      }

      // Busca textual
      if (busca.trim()) {
        const termo = busca.toLowerCase();
        const desc = String(item.descricao || "").toLowerCase();
        const cli = String(item.cliente_nome || "").toLowerCase();
        const app = String(item.aplicativo || "").toLowerCase();
        const srv = String(item.servidor_nome || "").toLowerCase();
        const mac = String(item.mac || "").toLowerCase();
        const device = String(item.device || "").toLowerCase();
        const tel = String(item.telefone || "").toLowerCase();
        if (
          !desc.includes(termo) &&
          !cli.includes(termo) &&
          !app.includes(termo) &&
          !srv.includes(termo) &&
          !mac.includes(termo) &&
          !device.includes(termo) &&
          !tel.includes(termo)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [financeiro, periodo, ano, mes, tipoFiltro, statusFiltro, busca]);

  // Ordenação
  const lancamentosOrdenados = useMemo(() => {
    const arr = [...lancamentosFiltrados];
    if (ordenacao === "recentes") {
      arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (ordenacao === "antigos") {
      arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else if (ordenacao === "maior_valor") {
      arr.sort((a, b) => Number(b.valor || 0) - Number(a.valor || 0));
    } else if (ordenacao === "maior_lucro") {
      arr.sort((a, b) => Number(b.lucro || 0) - Number(a.lucro || 0));
    }
    return arr;
  }, [lancamentosFiltrados, ordenacao]);

  // Métricas consolidadas do período filtrado
  const metricas = useMemo(() => {
    const totalFaturado = lancamentosFiltrados.reduce((acc, item) => acc + Number(item.valor || 0), 0);
    const totalCusto = lancamentosFiltrados.reduce((acc, item) => acc + Number(item.custo || 0), 0);
    const totalLucro = lancamentosFiltrados.reduce((acc, item) => acc + Number(item.lucro || 0), 0);
    const margem = totalFaturado > 0 ? (totalLucro / totalFaturado) * 100 : 0;
    const totalOps = lancamentosFiltrados.length;
    const qtdClientes = lancamentosFiltrados.filter((i) => i.tipo === "cliente").length;
    const qtdRevendas = lancamentosFiltrados.filter((i) => i.tipo === "revendedor").length;
    const qtdApps = lancamentosFiltrados.filter((i) => i.tipo === "ativacao_app").length;
    const ticketMedio = totalOps > 0 ? totalFaturado / totalOps : 0;

    return {
      totalFaturado,
      totalCusto,
      totalLucro,
      margem,
      totalOps,
      qtdClientes,
      qtdRevendas,
      qtdApps,
      ticketMedio,
    };
  }, [lancamentosFiltrados]);

  // Paginação
  const totalPaginas = Math.ceil(lancamentosOrdenados.length / itensPorPagina) || 1;
  const paginaValida = Math.min(Math.max(1, pagina), totalPaginas);
  const itensExibidos = useMemo(() => {
    const start = (paginaValida - 1) * itensPorPagina;
    return lancamentosOrdenados.slice(start, start + itensPorPagina);
  }, [lancamentosOrdenados, paginaValida, itensPorPagina]);

  // Reversão de lançamento
  async function handleReverter(item: any) {
    setRevertingId(item.id);
    try {
      const ok = await reverterLancamentoFaturamento(item);
      if (ok) {
        await qc.invalidateQueries({ queryKey: ["faturamento_bruto_dia"] });
        await qc.invalidateQueries({ queryKey: ["historico"] });
        await qc.invalidateQueries({ queryKey: ["clientes"] });
        await qc.invalidateQueries({ queryKey: ["revendedores_movs"] });
        await qc.invalidateQueries({ queryKey: ["ativacoes_apps"] });
        await qc.invalidateQueries({ queryKey: ["creditos_saldos"] });
        await qc.invalidateQueries({ queryKey: ["creditos_movs"] });
        await qc.invalidateQueries();
      }
    } finally {
      setRevertingId(null);
    }
  }

  // Exportação para Excel
  function exportarExcel() {
    try {
      const rows = lancamentosOrdenados.map((item) => ({
        "Data / Hora": formatDateTimeBR(item.created_at),
        "Categoria / Tipo":
          item.tipo === "cliente" ? "Cliente (Renovação)" :
          item.tipo === "revendedor" ? "Revendedor (Recarga)" : "Ativação de App",
        "Descrição / Nome": item.cliente_nome || item.descricao || "",
        "Aplicativo / Detalhes": item.aplicativo || "",
        "Servidor": item.servidor_nome || "",
        "MAC": item.mac || "",
        "Device": item.device || "",
        "Telefone / Contato": item.telefone || "",
        "Faturamento (R$)": Number(item.valor || 0),
        "Custo (R$)": Number(item.custo || 0),
        "Lucro (R$)": Number(item.lucro || 0),
        "Status Pagamento": (item.status_pagamento || "pago").toUpperCase(),
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [
        { wch: 20 },
        { wch: 22 },
        { wch: 30 },
        { wch: 24 },
        { wch: 20 },
        { wch: 20 },
        { wch: 20 },
        { wch: 18 },
        { wch: 16 },
        { wch: 14 },
        { wch: 14 },
        { wch: 16 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, "Faturamento Detalhado");
      XLSX.writeFile(wb, `faturamento-detalhado-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success("Planilha Excel (.xlsx) exportada com sucesso!");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao exportar Excel");
    }
  }

  // Exportação para CSV
  function exportarCSV() {
    try {
      const rows = lancamentosOrdenados.map((item) => ({
        "Data / Hora": formatDateTimeBR(item.created_at),
        "Categoria": item.tipo === "cliente" ? "Cliente" : item.tipo === "revendedor" ? "Revenda" : "App",
        "Nome": item.cliente_nome || item.descricao || "",
        "Aplicativo": item.aplicativo || "",
        "Servidor": item.servidor_nome || "",
        "Faturamento": Number(item.valor || 0).toFixed(2),
        "Custo": Number(item.custo || 0).toFixed(2),
        "Lucro": Number(item.lucro || 0).toFixed(2),
        "Status": (item.status_pagamento || "pago").toUpperCase(),
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const csv = XLSX.utils.sheet_to_csv(ws, { FS: ";" });
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `faturamento-detalhado-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Arquivo CSV exportado!");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao exportar CSV");
    }
  }

  // Exportação para PDF
  function exportarPDF() {
    try {
      const pdf = new jsPDF({ orientation: "l", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 10;
      let y = margin;

      const header = reportHeaderLines("RELATÓRIO DETALHADO DE FATURAMENTO & OPERAÇÕES");
      pdf.setTextColor(17, 24, 39);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.text(header[0], margin, y);
      y += 5;
      pdf.setFontSize(10);
      pdf.text(header[1], margin, y);
      y += 4;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.text(`Período: ${periodo.toUpperCase()} | Total Faturado: ${currencyBRL(metricas.totalFaturado)} | Lucro Líquido: ${currencyBRL(metricas.totalLucro)} | Operações: ${metricas.totalOps}`, margin, y);
      y += 6;

      const cols = ["Data/Hora", "Tipo", "Cliente / Descrição", "App / Servidor", "Fat. (R$)", "Custo (R$)", "Lucro (R$)", "Status"];
      const colWidths = [38, 28, 65, 55, 26, 24, 24, 20];

      const drawHeader = () => {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8);
        pdf.setTextColor(255, 255, 255);
        pdf.setFillColor(30, 41, 59);
        pdf.rect(margin, y - 3.5, pageW - margin * 2, 5.5, "F");
        let cx = margin;
        cols.forEach((c, idx) => {
          pdf.text(c, cx + 1, y);
          cx += colWidths[idx];
        });
        y += 4.5;
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(30);
      };

      drawHeader();

      lancamentosOrdenados.forEach((item) => {
        if (y > pageH - margin - 10) {
          pdf.addPage();
          y = margin;
          drawHeader();
        }

        const tipoStr = item.tipo === "cliente" ? "Cliente" : item.tipo === "revendedor" ? "Revenda" : "Ativação App";
        const appSrv = [item.aplicativo, item.servidor_nome].filter(Boolean).join(" · ");
        const rowVals = [
          formatDateTimeBR(item.created_at),
          tipoStr,
          String(item.cliente_nome || item.descricao || "").slice(0, 35),
          appSrv.slice(0, 30),
          currencyBRL(Number(item.valor || 0)),
          currencyBRL(Number(item.custo || 0)),
          currencyBRL(Number(item.lucro || 0)),
          (item.status_pagamento || "pago").toUpperCase(),
        ];

        let cx = margin;
        rowVals.forEach((val, idx) => {
          pdf.text(val, cx + 1, y);
          cx += colWidths[idx];
        });
        y += 4;
      });

      pdf.save(`faturamento-detalhado-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("Documento PDF exportado!");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao exportar PDF");
    }
  }

  // Copiar dados tabulados
  function copiarTabela() {
    try {
      const header = ["Data/Hora", "Tipo", "Cliente/Descrição", "App/Servidor", "Faturamento", "Custo", "Lucro", "Status"].join("\t");
      const rows = lancamentosOrdenados.map((item) => {
        const tipoStr = item.tipo === "cliente" ? "Cliente" : item.tipo === "revendedor" ? "Revenda" : "Ativação App";
        const appSrv = [item.aplicativo, item.servidor_nome].filter(Boolean).join(" · ");
        return [
          formatDateTimeBR(item.created_at),
          tipoStr,
          item.cliente_nome || item.descricao || "",
          appSrv,
          currencyBRL(Number(item.valor || 0)),
          currencyBRL(Number(item.custo || 0)),
          currencyBRL(Number(item.lucro || 0)),
          (item.status_pagamento || "pago").toUpperCase(),
        ].join("\t");
      });
      navigator.clipboard.writeText([header, ...rows].join("\n"));
      toast.success(`${lancamentosOrdenados.length} lançamentos copiados para a área de transferência!`);
    } catch {
      toast.error("Erro ao copiar tabela");
    }
  }

  return (
    <Card className="p-4 sm:p-5 space-y-4 border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card shadow-sm">
      {/* Cabeçalho da Seção */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-border/40 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 grid place-items-center text-primary">
            <Receipt className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold tracking-tight">Lançamentos de Faturamento Detalhado & Operações</h2>
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 font-semibold text-xs">
                {metricas.totalOps} lançamentos
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Consolidado de renovações de clientes, recargas de revendedores e ativações de aplicativos.
            </p>
          </div>
        </div>

        {/* Botões de Ação e Exportação */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 text-xs gap-1.5"
            title="Atualizar dados"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            Atualizar
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="default" className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium">
                <FileDown className="h-3.5 w-3.5" />
                Exportar Relatório
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={exportarExcel} className="cursor-pointer">
                <FileSpreadsheet className="h-4 w-4 mr-2 text-emerald-400" />
                Exportar Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportarCSV} className="cursor-pointer">
                <FileText className="h-4 w-4 mr-2 text-blue-400" />
                Exportar CSV (.csv)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportarPDF} className="cursor-pointer">
                <Download className="h-4 w-4 mr-2 text-red-400" />
                Exportar PDF (.pdf)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={copiarTabela} className="cursor-pointer">
                <Copy className="h-4 w-4 mr-2 text-cyan-400" />
                Copiar para Área de Transferência
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Barra de Filtros e Controles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 pt-1">
        {/* Campo de Busca */}
        <div className="relative lg:col-span-2">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, revenda, app, MAC, servidor..."
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPagina(1);
            }}
            className="h-8 pl-8 text-xs"
          />
        </div>

        {/* Seletor de Período */}
        <Select
          value={periodo}
          onValueChange={(v) => {
            setPeriodo(v);
            setPagina(1);
          }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hoje">Hoje</SelectItem>
            <SelectItem value="ontem">Ontem</SelectItem>
            <SelectItem value="7dias">Últimos 7 dias</SelectItem>
            <SelectItem value="mes_atual">Este Mês</SelectItem>
            <SelectItem value="mes_anterior">Mês Passado</SelectItem>
            <SelectItem value="ano_atual">Ano Atual ({hoje.getFullYear()})</SelectItem>
            <SelectItem value="personalizado">Mês/Ano Específico...</SelectItem>
            <SelectItem value="todos">Todos os Lançamentos</SelectItem>
          </SelectContent>
        </Select>

        {/* Seletor de Categoria / Tipo */}
        <Select
          value={tipoFiltro}
          onValueChange={(v) => {
            setTipoFiltro(v);
            setPagina(1);
          }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas Categorias</SelectItem>
            <SelectItem value="cliente">👤 Clientes (Renovações)</SelectItem>
            <SelectItem value="revendedor">👥 Revendedores (Recargas)</SelectItem>
            <SelectItem value="ativacao_app">📱 Ativações de Apps</SelectItem>
          </SelectContent>
        </Select>

        {/* Seletor de Status & Ordenação */}
        <div className="flex items-center gap-1.5">
          <Select
            value={statusFiltro}
            onValueChange={(v) => {
              setStatusFiltro(v);
              setPagina(1);
            }}
          >
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos Status</SelectItem>
              <SelectItem value="pago">PAGO</SelectItem>
              <SelectItem value="devendo">DEVENDO</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={ordenacao}
            onValueChange={(v: any) => setOrdenacao(v)}
          >
            <SelectTrigger className="h-8 text-xs w-[120px]" title="Ordenar por">
              <ArrowUpDown className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recentes">Mais recentes</SelectItem>
              <SelectItem value="antigos">Mais antigos</SelectItem>
              <SelectItem value="maior_valor">Maior valor</SelectItem>
              <SelectItem value="maior_lucro">Maior lucro</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Filtro específico de Mês/Ano (quando personalizado) */}
      {periodo === "personalizado" && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-muted/30 border border-border/50 text-xs">
          <span className="font-semibold text-muted-foreground">Filtrar Mês e Ano:</span>
          <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
            <SelectTrigger className="h-7 text-xs w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {meses.map((m, idx) => (
                <SelectItem key={m} value={String(idx + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
            <SelectTrigger className="h-7 text-xs w-[90px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {anos.map((a) => (
                <SelectItem key={a} value={String(a)}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Tabela de Lançamentos */}
      <div className="rounded-md border border-border/60 overflow-hidden bg-background/50">
        <div className="max-h-[480px] overflow-auto">
          <Table className={COMPACT_TABLE_CLASS}>
            <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur z-10">
              <TableRow className="text-xs">
                <TableHead className="w-[140px]">Data / Hora</TableHead>
                <TableHead className="w-[130px]">Tipo / Origem</TableHead>
                <TableHead>Descrição / Cliente</TableHead>
                <TableHead>Aplicativo / Servidor / Detalhes</TableHead>
                <TableHead className="text-right w-[110px]">Faturamento</TableHead>
                <TableHead className="text-right w-[100px]">Custo</TableHead>
                <TableHead className="text-right w-[100px]">Lucro</TableHead>
                <TableHead className="text-center w-[90px]">Status</TableHead>
                <TableHead className="text-right w-[90px]">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itensExibidos.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                    Nenhum lançamento financeiro encontrado com os filtros selecionados.
                  </TableCell>
                </TableRow>
              )}
              {itensExibidos.map((item: any) => {
                const isReverting = revertingId === item.id;
                const isDevendo = item.status_pagamento === "devendo";

                return (
                  <TableRow key={item.id} className="hover:bg-muted/40 transition-colors">
                    {/* Data / Hora */}
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                      {formatDateTimeBR(item.created_at)}
                    </TableCell>

                    {/* Badge de Tipo */}
                    <TableCell>
                      {item.tipo === "cliente" ? (
                        <Badge variant="outline" className="text-[11px] bg-blue-500/10 text-blue-400 border-blue-500/30 gap-1 font-medium">
                          <Users className="h-3 w-3" /> Cliente
                        </Badge>
                      ) : item.tipo === "revendedor" ? (
                        <Badge variant="outline" className="text-[11px] bg-purple-500/10 text-purple-400 border-purple-500/30 gap-1 font-medium">
                          <Users className="h-3 w-3" /> Revenda
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[11px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30 gap-1 font-medium">
                          <Smartphone className="h-3 w-3" /> App Ativado
                        </Badge>
                      )}
                    </TableCell>

                    {/* Descrição / Cliente */}
                    <TableCell className="font-semibold text-xs">
                      <div className="flex flex-col">
                        <span>{item.cliente_nome || item.descricao || "—"}</span>
                        {item.telefone && (
                          <span className="text-[10px] font-normal text-muted-foreground">{item.telefone}</span>
                        )}
                      </div>
                    </TableCell>

                    {/* Aplicativo / Servidor / MAC / Device */}
                    <TableCell className="text-xs text-muted-foreground">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {item.aplicativo && (
                            <span className="font-medium text-foreground">{item.aplicativo}</span>
                          )}
                          {item.servidor_nome && (
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-muted/60 text-muted-foreground">
                              {item.servidor_nome}
                            </Badge>
                          )}
                          {item.dias_adicionados && (
                            <span className="text-[10px] text-emerald-400 font-semibold">+{item.dias_adicionados} dias</span>
                          )}
                        </div>
                        {(item.mac || item.device) && (
                          <div className="text-[10px] font-mono text-muted-foreground">
                            {[item.mac && `MAC: ${item.mac}`, item.device && `Dev: ${item.device}`].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </div>
                    </TableCell>

                    {/* Faturamento */}
                    <TableCell className="text-right text-xs font-bold text-emerald-400 tabular-nums">
                      {currencyBRL(Number(item.valor || 0))}
                    </TableCell>

                    {/* Custo */}
                    <TableCell className="text-right text-xs text-red-400 tabular-nums">
                      {currencyBRL(Number(item.custo || 0))}
                    </TableCell>

                    {/* Lucro */}
                    <TableCell className={cn("text-right text-xs font-bold tabular-nums", Number(item.lucro || 0) >= 0 ? "text-blue-400" : "text-red-400")}>
                      {currencyBRL(Number(item.lucro || 0))}
                    </TableCell>

                    {/* Status Pgto */}
                    <TableCell className="text-center">
                      <Badge className={cn("text-[10px] px-1.5 py-0", isDevendo ? "bg-red-500/20 text-red-400 border border-red-500/40" : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40")}>
                        {isDevendo ? "DEVENDO" : "PAGO"}
                      </Badge>
                    </TableCell>

                    {/* Ação de Reversão */}
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={isReverting}
                        onClick={() => handleReverter(item)}
                        title="Reverter lançamento, devolver créditos ao servidor e ajustar datas"
                      >
                        {isReverting ? (
                          <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <Undo2 className="h-3 w-3 mr-1" />
                        )}
                        Reverter
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Rodapé de Paginação */}
        <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-border/40 text-xs text-muted-foreground flex-wrap">
          <div className="flex items-center gap-2">
            <span>Exibindo <strong>{lancamentosFiltrados.length > 0 ? (paginaValida - 1) * itensPorPagina + 1 : 0}</strong> a <strong>{Math.min(paginaValida * itensPorPagina, lancamentosFiltrados.length)}</strong> de <strong>{lancamentosFiltrados.length}</strong></span>
            <span>·</span>
            <Select
              value={String(itensPorPagina)}
              onValueChange={(v) => {
                setItensPorPagina(Number(v));
                setPagina(1);
              }}
            >
              <SelectTrigger className="h-6 text-[11px] w-[85px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 / pág</SelectItem>
                <SelectItem value="25">25 / pág</SelectItem>
                <SelectItem value="50">50 / pág</SelectItem>
                <SelectItem value="100">100 / pág</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              size="icon"
              variant="outline"
              className="h-6 w-6"
              disabled={paginaValida <= 1}
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs px-2 font-medium">
              Página {paginaValida} de {totalPaginas}
            </span>
            <Button
              size="icon"
              variant="outline"
              className="h-6 w-6"
              disabled={paginaValida >= totalPaginas}
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
