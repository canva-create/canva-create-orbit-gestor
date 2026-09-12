import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchClientes, fetchServidores, fetchHistorico } from "@/lib/queries";
import { currencyBRL, formatDateTimeBR, formatDateBR } from "@/lib/iptv";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COMPACT_TABLE_CLASS } from "@/components/density-toggle";
import { ExportConsolidado } from "@/components/export-consolidado";
import { type ExportSection } from "@/lib/central-export";
import {
  Server,
  TrendingUp,
  TrendingDown,
  Award,
  DollarSign,
  Calendar,
  CalendarDays,
  CalendarClock,
  Layers,
  Search,
  FileText,
  FileSpreadsheet,
  FileImage,
  BarChart3,
  Flame,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
  Legend,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { toast } from "sonner";

type Subdivisao = "diario" | "semanal" | "mensal";

const CATEGORIA_CORES: Record<string, { bg: string; text: string; border: string }> = {
  TOP: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/40" },
  Premium: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/40" },
  P2P: { bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/40" },
  IPTV: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/40" },
};

export function RenovacoesServidoresPanel() {
  const { data: historico = [] } = useQuery({ queryKey: ["historico"], queryFn: fetchHistorico });
  const { data: clientes = [] } = useQuery({ queryKey: ["clientes"], queryFn: fetchClientes });
  const { data: servidores = [] } = useQuery({ queryKey: ["servidores"], queryFn: fetchServidores });

  // Estado de subdivisão (Diário / Semanal / Mensal)
  const [aba, setAba] = useState<Subdivisao>("diario");

  // Controles de data
  const hoje = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [dataDiaria, setDataDiaria] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [semanaOffset, setSemanaOffset] = useState<number>(0); // 0 = semana atual, -1 = semana passada
  const [mesSel, setMesSel] = useState<number>(hoje.getMonth());
  const [anoSel, setAnoSel] = useState<number>(hoje.getFullYear());

  // Filtros de visualização da tabela
  const [servidorFiltro, setServidorFiltro] = useState<string>("todos");
  const [termoBusca, setTermoBusca] = useState<string>("");
  const [tipoGrafico, setTipoGrafico] = useState<"volume" | "financeiro">("volume");

  // Mapas para lookup rápido
  const clientesMap = useMemo(() => {
    const map = new Map<string, any>();
    (clientes as any[]).forEach((c) => {
      if (c?.id) map.set(c.id, c);
    });
    return map;
  }, [clientes]);

  const servidoresMap = useMemo(() => {
    const map = new Map<string, any>();
    (servidores as any[]).forEach((s) => {
      if (s?.id) map.set(s.id, s);
    });
    return map;
  }, [servidores]);

  // Lista normalizada de renovações com associação precisa de servidor
  const renovacoesNormalizadas = useMemo(() => {
    return (historico as any[])
      .filter((h) => !!h.created_at && h.status !== "cancelada")
      .map((h) => {
        const cli = h.cliente || clientesMap.get(h.cliente_id);
        const servId =
          h.cliente?.servidor_id ||
          cli?.servidor_id ||
          cli?.servidor?.id ||
          h.servidor_id ||
          (typeof h.servidor === "object" ? h.servidor?.id : null);

        const serv = (servId ? servidoresMap.get(servId) : null) || cli?.servidor || h.cliente?.servidor;
        const servidorNome = serv?.nome || (servId ? "Servidor Vinculado" : "Servidor não informado");
        const servidorCategoria = serv?.categoria || "IPTV";
        const servidorId = servId || "sem_servidor";

        const valor = Number(h.valor_recebido || 0);
        const custo = Number(h.custo || 0);
        const lucro = Number(h.lucro ?? (valor - custo));
        const pendente = Number(h.valor_pendente || 0);

        return {
          id: h.id,
          created_at: h.created_at,
          data_obj: new Date(h.created_at),
          cliente_id: h.cliente_id,
          cliente_nome: h.cliente_nome || cli?.nome || h.cliente?.nome || "Cliente",
          servidor_id: servidorId,
          servidor_nome: servidorNome,
          servidor_categoria: servidorCategoria,
          dias_adicionados: Number(h.dias_adicionados || h.dias || 30),
          valor_recebido: valor,
          valor_pendente: pendente,
          custo,
          lucro,
          status_pagamento: h.status_pagamento || (valor > 0 ? "pago" : "devendo"),
          pago_em: h.pago_em,
          vencimento_anterior: h.vencimento_anterior,
          vencimento_novo: h.vencimento_novo,
        };
      });
  }, [historico, clientesMap, servidoresMap]);

  // Definição dos limites do período selecionado
  const { inicioPeriodo, fimPeriodo, rotuloPeriodo } = useMemo(() => {
    if (aba === "diario") {
      const [y, m, d] = dataDiaria.split("-").map(Number);
      const inicio = new Date(y, m - 1, d, 0, 0, 0, 0);
      const fim = new Date(y, m - 1, d, 23, 59, 59, 999);
      const ehHoje = dataDiaria === hoje.toISOString().slice(0, 10);
      const rotulo = ehHoje
        ? `Hoje (${formatDateBR(inicio.toISOString())})`
        : `Dia ${formatDateBR(inicio.toISOString())}`;
      return { inicioPeriodo: inicio, fimPeriodo: fim, rotuloPeriodo: rotulo };
    }

    if (aba === "semanal") {
      const diaSemanaHoje = hoje.getDay(); // 0 = Domingo
      const baseSemana = new Date(hoje);
      baseSemana.setDate(hoje.getDate() - diaSemanaHoje + semanaOffset * 7);
      const inicio = new Date(baseSemana.getFullYear(), baseSemana.getMonth(), baseSemana.getDate(), 0, 0, 0, 0);
      const fim = new Date(inicio.getTime() + 6 * 86400000 + 86399999);
      const rotulo =
        semanaOffset === 0
          ? `Semana Atual (${formatDateBR(inicio.toISOString())} a ${formatDateBR(fim.toISOString())})`
          : `Semana de ${formatDateBR(inicio.toISOString())} a ${formatDateBR(fim.toISOString())}`;
      return { inicioPeriodo: inicio, fimPeriodo: fim, rotuloPeriodo: rotulo };
    }

    // Mensal
    const inicio = new Date(anoSel, mesSel, 1, 0, 0, 0, 0);
    const fim = new Date(anoSel, mesSel + 1, 0, 23, 59, 59, 999);
    const nomeMes = inicio.toLocaleDateString("pt-BR", { month: "long" });
    const rotulo = `${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)} de ${anoSel}`;
    return { inicioPeriodo: inicio, fimPeriodo: fim, rotuloPeriodo: rotulo };
  }, [aba, dataDiaria, semanaOffset, mesSel, anoSel, hoje]);

  // Renovações do período selecionado
  const renovacoesDoPeriodo = useMemo(() => {
    return renovacoesNormalizadas.filter((r) => {
      const t = r.data_obj.getTime();
      return t >= inicioPeriodo.getTime() && t <= fimPeriodo.getTime();
    });
  }, [renovacoesNormalizadas, inicioPeriodo, fimPeriodo]);

  // Totais do período
  const totaisPeriodo = useMemo(() => {
    const qtd = renovacoesDoPeriodo.length;
    const faturamento = renovacoesDoPeriodo.reduce((s, r) => s + r.valor_recebido, 0);
    const custo = renovacoesDoPeriodo.reduce((s, r) => s + r.custo, 0);
    const lucro = renovacoesDoPeriodo.reduce((s, r) => s + r.lucro, 0);
    const margem = faturamento > 0 ? (lucro / faturamento) * 100 : 0;
    const ticketMedio = qtd > 0 ? faturamento / qtd : 0;
    return { qtd, faturamento, custo, lucro, margem, ticketMedio };
  }, [renovacoesDoPeriodo]);

  // Agregação por servidor no período (Ranking & Desempenho)
  const rankingServidores = useMemo(() => {
    const mapa = new Map<
      string,
      {
        servidor_id: string;
        nome: string;
        categoria: string;
        qtd: number;
        faturamento: number;
        custo: number;
        lucro: number;
        clientesUnicos: Set<string>;
      }
    >();

    // Inicializa todos os servidores cadastrados para visibilidade completa
    (servidores as any[]).forEach((s) => {
      mapa.set(s.id, {
        servidor_id: s.id,
        nome: s.nome,
        categoria: s.categoria || "IPTV",
        qtd: 0,
        faturamento: 0,
        custo: 0,
        lucro: 0,
        clientesUnicos: new Set<string>(),
      });
    });

    // Processa renovações do período
    renovacoesDoPeriodo.forEach((r) => {
      let item = mapa.get(r.servidor_id);
      if (!item) {
        item = {
          servidor_id: r.servidor_id,
          nome: r.servidor_nome,
          categoria: r.servidor_categoria,
          qtd: 0,
          faturamento: 0,
          custo: 0,
          lucro: 0,
          clientesUnicos: new Set<string>(),
        };
        mapa.set(r.servidor_id, item);
      }
      item.qtd += 1;
      item.faturamento += r.valor_recebido;
      item.custo += r.custo;
      item.lucro += r.lucro;
      if (r.cliente_id) item.clientesUnicos.add(r.cliente_id);
    });

    const lista = Array.from(mapa.values())
      .filter((s) => s.qtd > 0 || (servidores as any[]).some((serv) => serv.id === s.servidor_id))
      .map((s) => {
        const margem = s.faturamento > 0 ? (s.lucro / s.faturamento) * 100 : 0;
        const ticketMedio = s.qtd > 0 ? s.faturamento / s.qtd : 0;
        const shareVolume = totaisPeriodo.qtd > 0 ? (s.qtd / totaisPeriodo.qtd) * 100 : 0;
        const shareFaturamento = totaisPeriodo.faturamento > 0 ? (s.faturamento / totaisPeriodo.faturamento) * 100 : 0;

        return {
          ...s,
          margem,
          ticketMedio,
          shareVolume,
          shareFaturamento,
        };
      })
      // Ordena primariamente por quantidade de renovações e secundariamente por faturamento
      .sort((a, b) => {
        if (b.qtd !== a.qtd) return b.qtd - a.qtd;
        return b.faturamento - a.faturamento;
      });

    return lista;
  }, [renovacoesDoPeriodo, servidores, totaisPeriodo]);

  // Servidor líder em volume e líder em lucro
  const servidoresComMovimento = useMemo(() => rankingServidores.filter((s) => s.qtd > 0), [rankingServidores]);

  const liderVolume = useMemo(() => {
    if (servidoresComMovimento.length === 0) return null;
    return servidoresComMovimento.reduce((prev, cur) => (cur.qtd > prev.qtd ? cur : prev));
  }, [servidoresComMovimento]);

  const liderLucro = useMemo(() => {
    if (servidoresComMovimento.length === 0) return null;
    return servidoresComMovimento.reduce((prev, cur) => (cur.lucro > prev.lucro ? cur : prev));
  }, [servidoresComMovimento]);

  // Dados para o gráfico Recharts
  const chartData = useMemo(() => {
    return rankingServidores
      .filter((s) => s.qtd > 0)
      .slice(0, 10)
      .map((s) => ({
        nome: s.nome.length > 15 ? s.nome.slice(0, 14) + "…" : s.nome,
        nomeCompleto: s.nome,
        categoria: s.categoria,
        renovacoes: s.qtd,
        faturamento: s.faturamento,
        custo: s.custo,
        lucro: s.lucro,
      }));
  }, [rankingServidores]);

  // Renovações filtradas para a tabela de detalhamento
  const renovacoesFiltradasTabela = useMemo(() => {
    return renovacoesDoPeriodo.filter((r) => {
      if (servidorFiltro !== "todos" && r.servidor_id !== servidorFiltro) return false;
      if (termoBusca.trim()) {
        const termo = termoBusca.toLowerCase();
        const nomeCli = r.cliente_nome.toLowerCase();
        const nomeServ = r.servidor_nome.toLowerCase();
        if (!nomeCli.includes(termo) && !nomeServ.includes(termo)) return false;
      }
      return true;
    });
  }, [renovacoesDoPeriodo, servidorFiltro, termoBusca]);

  // Totais da tabela filtrada
  const totaisTabela = useMemo(() => {
    const qtd = renovacoesFiltradasTabela.length;
    const faturamento = renovacoesFiltradasTabela.reduce((s, r) => s + r.valor_recebido, 0);
    const custo = renovacoesFiltradasTabela.reduce((s, r) => s + r.custo, 0);
    const lucro = renovacoesFiltradasTabela.reduce((s, r) => s + r.lucro, 0);
    return { qtd, faturamento, custo, lucro };
  }, [renovacoesFiltradasTabela]);

  // -------------------------------------------------------------
  // EXPORTAÇÕES (PDF, Excel, PNG, Consolidado)
  // -------------------------------------------------------------
  const stamp = () => new Date().toISOString().slice(0, 10);

  // Seções para ExportConsolidado
  const getExportSections = (): ExportSection[] => {
    const resumoSection: ExportSection = {
      title: `Resumo de Performance (${rotuloPeriodo})`,
      description: `Métricas consolidadas de renovações por servidor no período selecionado.`,
      columns: ["Indicador", "Valor"],
      rows: [
        ["Período Analisado", rotuloPeriodo],
        ["Total de Renovações", totaisPeriodo.qtd],
        ["Faturamento Total", currencyBRL(totaisPeriodo.faturamento)],
        ["Custo Total", currencyBRL(totaisPeriodo.custo)],
        ["Lucro Líquido", currencyBRL(totaisPeriodo.lucro)],
        ["Margem Média de Lucro", `${totaisPeriodo.margem.toFixed(1)}%`],
        ["Ticket Médio", currencyBRL(totaisPeriodo.ticketMedio)],
        ["Servidor Líder em Volume", liderVolume ? `${liderVolume.nome} (${liderVolume.qtd} renovações)` : "—"],
        ["Servidor Líder em Lucro", liderLucro ? `${liderLucro.nome} (${currencyBRL(liderLucro.lucro)})` : "—"],
      ],
    };

    const rankingSection: ExportSection = {
      title: `Ranking de Performance dos Servidores`,
      description: `Classificação dos servidores por volume de renovação, faturamento e lucratividade.`,
      columns: [
        "Posição",
        "Servidor",
        "Categoria",
        "Renovações",
        "Share (%)",
        "Faturamento",
        "Custo",
        "Lucro Líquido",
        "Margem (%)",
        "Ticket Médio",
      ],
      rows: rankingServidores
        .filter((s) => s.qtd > 0)
        .map((s, idx) => [
          `${idx + 1}º`,
          s.nome,
          s.categoria,
          s.qtd,
          `${s.shareVolume.toFixed(1)}%`,
          currencyBRL(s.faturamento),
          currencyBRL(s.custo),
          currencyBRL(s.lucro),
          `${s.margem.toFixed(1)}%`,
          currencyBRL(s.ticketMedio),
        ]),
    };

    const detalhamentoSection: ExportSection = {
      title: `Listagem Detalhada de Renovações`,
      description: `Registro cronológico individual de todas as renovações efetuadas no período.`,
      columns: ["Data / Hora", "Cliente", "Servidor", "Dias", "Valor Recebido", "Custo", "Lucro", "Status"],
      rows: renovacoesDoPeriodo.map((r) => [
        formatDateTimeBR(r.created_at),
        r.cliente_nome,
        r.servidor_nome,
        `+${r.dias_adicionados} dias`,
        currencyBRL(r.valor_recebido),
        currencyBRL(r.custo),
        currencyBRL(r.lucro),
        r.status_pagamento === "pago" ? "Pago" : "Devendo",
      ]),
    };

    return [resumoSection, rankingSection, detalhamentoSection];
  };

  const exportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      // Aba 1: Resumo
      const resumoRows = [
        { Indicador: "Período Analisado", Valor: rotuloPeriodo },
        { Indicador: "Total de Renovações", Valor: totaisPeriodo.qtd },
        { Indicador: "Faturamento Total", Valor: totaisPeriodo.faturamento },
        { Indicador: "Custo Total", Valor: totaisPeriodo.custo },
        { Indicador: "Lucro Líquido", Valor: totaisPeriodo.lucro },
        { Indicador: "Margem de Lucro (%)", Valor: Number(totaisPeriodo.margem.toFixed(2)) },
        { Indicador: "Ticket Médio", Valor: Number(totaisPeriodo.ticketMedio.toFixed(2)) },
        { Indicador: "Servidor Top Volume", Valor: liderVolume?.nome ?? "—" },
        { Indicador: "Servidor Top Lucro", Valor: liderLucro?.nome ?? "—" },
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumoRows), "Resumo");

      // Aba 2: Ranking Servidores
      const rankingRows = rankingServidores.map((s, idx) => ({
        Posição: `${idx + 1}º`,
        Servidor: s.nome,
        Categoria: s.categoria,
        Renovações: s.qtd,
        "Participação (%)": Number(s.shareVolume.toFixed(2)),
        Faturamento: s.faturamento,
        Custo: s.custo,
        "Lucro Líquido": s.lucro,
        "Margem (%)": Number(s.margem.toFixed(2)),
        "Ticket Médio": Number(s.ticketMedio.toFixed(2)),
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rankingRows), "Performance Servidores");

      // Aba 3: Renovações Detalhadas
      const detalheRows = renovacoesDoPeriodo.map((r) => ({
        "Data / Hora": formatDateTimeBR(r.created_at),
        Cliente: r.cliente_nome,
        Servidor: r.servidor_nome,
        "Categoria Servidor": r.servidor_categoria,
        "Dias Adicionados": r.dias_adicionados,
        "Valor Recebido (R$)": r.valor_recebido,
        "Custo (R$)": r.custo,
        "Lucro Líquido (R$)": r.lucro,
        Status: r.status_pagamento === "pago" ? "Pago" : "Devendo",
      }));
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(detalheRows.length ? detalheRows : [{ Info: "Sem renovações no período" }]),
        "Renovações Detalhadas",
      );

      XLSX.writeFile(wb, `performance-renovacoes-servidores-${aba}-${stamp()}.xlsx`);
      toast.success("Relatório Excel exportado com sucesso!");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao exportar Excel");
    }
  };

  const exportPDF = () => {
    try {
      const pdf = new jsPDF({ orientation: "l", unit: "mm", format: "a4" });
      const margin = 12;
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      let y = margin;

      const nextLine = (h: number) => {
        if (y + h > pageH - margin) {
          pdf.addPage();
          y = margin;
        }
      };

      // Header
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.setTextColor(37, 99, 235);
      pdf.text(`Relatório de Performance de Renovações por Servidor (${aba.toUpperCase()})`, margin, y);
      y += 6;

      pdf.setFontSize(9);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`Período: ${rotuloPeriodo}  |  Gerado em: ${new Date().toLocaleString("pt-BR")}`, margin, y);
      y += 7;

      // Resumo em linha
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(17, 24, 39);
      pdf.text(
        `Total Renovações: ${totaisPeriodo.qtd}   |   Faturamento: ${currencyBRL(totaisPeriodo.faturamento)}   |   Custo: ${currencyBRL(totaisPeriodo.custo)}   |   Lucro: ${currencyBRL(totaisPeriodo.lucro)} (Margem ${totaisPeriodo.margem.toFixed(1)}%)`,
        margin,
        y,
      );
      y += 7;

      // Tabela de Ranking
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.setTextColor(37, 99, 235);
      pdf.text("Ranking e Desempenho por Servidor", margin, y);
      y += 5;

      const headersR = ["Rank", "Servidor", "Categoria", "Qtd Renovações", "Share %", "Faturamento", "Custo", "Lucro", "Margem %", "Ticket Médio"];
      const colWR = (pageW - margin * 2) / headersR.length;

      pdf.setFillColor(238, 242, 255);
      pdf.rect(margin, y - 4, pageW - margin * 2, 6, "F");
      pdf.setFontSize(8);
      pdf.setTextColor(30, 41, 59);
      headersR.forEach((h, i) => pdf.text(h, margin + i * colWR + 1, y));
      y += 5;

      pdf.setFont("helvetica", "normal");
      rankingServidores.forEach((s, idx) => {
        nextLine(4.5);
        const vals = [
          `${idx + 1}º`,
          s.nome.slice(0, 18),
          s.categoria,
          String(s.qtd),
          `${s.shareVolume.toFixed(1)}%`,
          currencyBRL(s.faturamento),
          currencyBRL(s.custo),
          currencyBRL(s.lucro),
          `${s.margem.toFixed(1)}%`,
          currencyBRL(s.ticketMedio),
        ];
        vals.forEach((v, i) => pdf.text(v, margin + i * colWR + 1, y));
        y += 4.5;
      });

      y += 4;

      // Tabela Detalhada
      nextLine(12);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.setTextColor(37, 99, 235);
      pdf.text(`Detalhamento das Renovações (${renovacoesDoPeriodo.length} registros)`, margin, y);
      y += 5;

      const headersD = ["Data / Hora", "Cliente", "Servidor", "Dias", "Valor Recebido", "Custo", "Lucro Líquido", "Status"];
      const colWD = (pageW - margin * 2) / headersD.length;

      pdf.setFillColor(238, 242, 255);
      pdf.rect(margin, y - 4, pageW - margin * 2, 6, "F");
      pdf.setFontSize(8);
      pdf.setTextColor(30, 41, 59);
      headersD.forEach((h, i) => pdf.text(h, margin + i * colWD + 1, y));
      y += 5;

      pdf.setFont("helvetica", "normal");
      if (renovacoesDoPeriodo.length === 0) {
        pdf.text("Sem renovações registradas no período selecionado.", margin + 1, y);
        y += 6;
      } else {
        renovacoesDoPeriodo.forEach((r) => {
          nextLine(4.5);
          const vals = [
            formatDateTimeBR(r.created_at),
            r.cliente_nome.slice(0, 20),
            r.servidor_nome.slice(0, 18),
            `+${r.dias_adicionados}d`,
            currencyBRL(r.valor_recebido),
            currencyBRL(r.custo),
            currencyBRL(r.lucro),
            r.status_pagamento === "pago" ? "Pago" : "Devendo",
          ];
          vals.forEach((v, i) => pdf.text(v, margin + i * colWD + 1, y));
          y += 4.5;
        });
      }

      pdf.save(`performance-renovacoes-servidores-${aba}-${stamp()}.pdf`);
      toast.success("Relatório PDF exportado com sucesso!");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao exportar PDF");
    }
  };

  const exportPNG = () => {
    try {
      const scale = 2;
      const width = 1200;
      const padX = 32;
      const padY = 32;
      const lineH = 20;

      const rankingLinhas = rankingServidores.filter((s) => s.qtd > 0);
      const detalheLinhas = renovacoesDoPeriodo.slice(0, 40); // Limite visual no PNG

      const totalLines = 14 + rankingLinhas.length + Math.max(1, detalheLinhas.length);
      const height = padY * 2 + totalLines * lineH;

      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(scale, scale);

      // Fundo
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.textBaseline = "top";

      let y = padY;
      ctx.fillStyle = "#111827";
      ctx.font = "bold 20px Arial";
      ctx.fillText(`Performance de Renovações por Servidor (${aba.toUpperCase()})`, padX, y);
      y += 24;

      ctx.fillStyle = "#6b7280";
      ctx.font = "12px Arial";
      ctx.fillText(`Período: ${rotuloPeriodo}  •  Exportado em ${new Date().toLocaleString("pt-BR")}`, padX, y);
      y += 24;

      // Cards resumo
      ctx.fillStyle = "#10b981";
      ctx.font = "bold 14px Arial";
      ctx.fillText(
        `Renovações: ${totaisPeriodo.qtd}   |   Faturamento: ${currencyBRL(totaisPeriodo.faturamento)}   |   Lucro: ${currencyBRL(totaisPeriodo.lucro)} (${totaisPeriodo.margem.toFixed(1)}%)   |   Ticket Médio: ${currencyBRL(totaisPeriodo.ticketMedio)}`,
        padX,
        y,
      );
      y += 28;

      // Ranking
      ctx.fillStyle = "#2563eb";
      ctx.font = "bold 15px Arial";
      ctx.fillText("Ranking de Performance dos Servidores", padX, y);
      y += 20;

      ctx.fillStyle = "#4b5563";
      ctx.font = "bold 11px Arial";
      ctx.fillText("Rank  |  Servidor  |  Categoria  |  Renovações  |  Share %  |  Faturamento  |  Lucro  |  Margem %", padX, y);
      y += 18;

      ctx.font = "12px Arial";
      ctx.fillStyle = "#111827";
      rankingLinhas.forEach((s, i) => {
        ctx.fillText(
          `${i + 1}º   ${s.nome.padEnd(20, " ")}   ${s.categoria.padEnd(8, " ")}   ${String(s.qtd).padStart(4, " ")} renovações   (${s.shareVolume.toFixed(1)}%)   ${currencyBRL(s.faturamento)}   ${currencyBRL(s.lucro)}   (${s.margem.toFixed(1)}%)`,
          padX,
          y,
        );
        y += lineH;
      });

      y += 16;
      ctx.fillStyle = "#2563eb";
      ctx.font = "bold 15px Arial";
      ctx.fillText(`Detalhamento das Renovações (${renovacoesDoPeriodo.length} registros)`, padX, y);
      y += 20;

      ctx.fillStyle = "#4b5563";
      ctx.font = "bold 11px Arial";
      ctx.fillText("Data/Hora  |  Cliente  |  Servidor  |  Plano  |  Valor Recebido  |  Lucro", padX, y);
      y += 18;

      ctx.font = "12px Arial";
      ctx.fillStyle = "#111827";
      if (detalheLinhas.length === 0) {
        ctx.fillText("Sem renovações no período.", padX, y);
        y += lineH;
      } else {
        detalheLinhas.forEach((r) => {
          ctx.fillText(
            `${formatDateTimeBR(r.created_at)}  |  ${r.cliente_nome.slice(0, 22)}  |  ${r.servidor_nome.slice(0, 18)}  |  +${r.dias_adicionados}d  |  ${currencyBRL(r.valor_recebido)}  |  ${currencyBRL(r.lucro)}`,
            padX,
            y,
          );
          y += lineH;
        });
        if (renovacoesDoPeriodo.length > 40) {
          ctx.fillStyle = "#6b7280";
          ctx.font = "italic 11px Arial";
          ctx.fillText(`... e mais ${renovacoesDoPeriodo.length - 40} renovações no período.`, padX, y);
          y += lineH;
        }
      }

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `performance-renovacoes-servidores-${aba}-${stamp()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("Imagem PNG exportada com sucesso!");
      }, "image/png");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao exportar PNG");
    }
  };

  return (
    <Card className="p-4 space-y-4 border-border/80 bg-card/60 backdrop-blur-sm shadow-sm">
      {/* =========================================================
          CABEÇALHO DA SEÇÃO COM ABAS E BOTÕES DE EXPORTAÇÃO
      ========================================================= */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-2 border-b border-border/60">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
                Performance de Renovações por Servidor
                <Badge variant="outline" className="text-[11px] font-normal py-0 h-5 text-muted-foreground">
                  {rotuloPeriodo}
                </Badge>
              </h2>
              <p className="text-xs text-muted-foreground">
                Acompanhe o volume de renovações, faturamento, custos e lucratividade de cada servidor.
              </p>
            </div>
          </div>
        </div>

        {/* Controles de subdivisão e exportação */}
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={aba} onValueChange={(v) => setAba(v as Subdivisao)} className="w-auto">
            <TabsList className="h-8 p-0.5 bg-muted/80">
              <TabsTrigger value="diario" className="h-7 px-3 text-xs gap-1.5 data-[state=active]:bg-background">
                <Calendar className="h-3.5 w-3.5 text-emerald-400" /> Diário
              </TabsTrigger>
              <TabsTrigger value="semanal" className="h-7 px-3 text-xs gap-1.5 data-[state=active]:bg-background">
                <CalendarClock className="h-3.5 w-3.5 text-amber-400" /> Semanal
              </TabsTrigger>
              <TabsTrigger value="mensal" className="h-7 px-3 text-xs gap-1.5 data-[state=active]:bg-background">
                <CalendarDays className="h-3.5 w-3.5 text-blue-400" /> Mensal
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Botões de Exportação Padrão */}
          <div className="flex items-center gap-1 border-l border-border/60 pl-2">
            <Button size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={exportPDF} title="Exportar em PDF">
              <FileText className="h-3.5 w-3.5 mr-1 text-red-400" /> PDF
            </Button>
            <Button size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={exportExcel} title="Exportar em Excel (.xlsx)">
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1 text-emerald-400" /> Excel
            </Button>
            <Button size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={exportPNG} title="Exportar imagem PNG">
              <FileImage className="h-3.5 w-3.5 mr-1 text-blue-400" /> PNG
            </Button>
            <ExportConsolidado
              reportName={`Performance Renovações (${aba.toUpperCase()})`}
              sections={getExportSections}
              label="Exportar"
            />
          </div>
        </div>
      </div>

      {/* =========================================================
          BARRA DE NAVEGAÇÃO TEMPORAL (DATA / SEMANA / MÊS)
      ========================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-muted/40 border border-border/40 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">
            Filtro de Período:
          </span>

          {aba === "diario" && (
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant={dataDiaria === hoje.toISOString().slice(0, 10) ? "default" : "outline"}
                className="h-7 px-2.5 text-xs"
                onClick={() => setDataDiaria(hoje.toISOString().slice(0, 10))}
              >
                Hoje
              </Button>
              <Button
                size="sm"
                variant={
                  dataDiaria ===
                  new Date(hoje.getTime() - 86400000).toISOString().slice(0, 10)
                    ? "default"
                    : "outline"
                }
                className="h-7 px-2.5 text-xs"
                onClick={() => {
                  const ont = new Date(hoje.getTime() - 86400000);
                  setDataDiaria(ont.toISOString().slice(0, 10));
                }}
              >
                Ontem
              </Button>
              <Input
                type="date"
                value={dataDiaria}
                onChange={(e) => e.target.value && setDataDiaria(e.target.value)}
                className="h-7 w-36 text-xs bg-background"
              />
            </div>
          )}

          {aba === "semanal" && (
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant={semanaOffset === 0 ? "default" : "outline"}
                className="h-7 px-2.5 text-xs"
                onClick={() => setSemanaOffset(0)}
              >
                Semana Atual
              </Button>
              <Button
                size="sm"
                variant={semanaOffset === -1 ? "default" : "outline"}
                className="h-7 px-2.5 text-xs"
                onClick={() => setSemanaOffset(-1)}
              >
                Semana Anterior
              </Button>
              <div className="flex items-center gap-1 pl-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => setSemanaOffset((prev) => prev - 1)}
                  title="Semana anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="font-medium text-foreground px-1">{rotuloPeriodo}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  disabled={semanaOffset >= 0}
                  onClick={() => setSemanaOffset((prev) => prev + 1)}
                  title="Próxima semana"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {aba === "mensal" && (
            <div className="flex items-center gap-1.5">
              <select
                value={mesSel}
                onChange={(e) => setMesSel(Number(e.target.value))}
                className="h-7 rounded-md border border-border/60 bg-background px-2 text-xs capitalize"
                aria-label="Mês selecionado"
              >
                {Array.from({ length: 12 }, (_, m) => (
                  <option key={m} value={m} className="capitalize">
                    {new Date(2026, m, 1).toLocaleDateString("pt-BR", { month: "long" })}
                  </option>
                ))}
              </select>
              <select
                value={anoSel}
                onChange={(e) => setAnoSel(Number(e.target.value))}
                className="h-7 rounded-md border border-border/60 bg-background px-2 text-xs"
                aria-label="Ano selecionado"
              >
                {Array.from({ length: 5 }, (_, i) => hoje.getFullYear() - i).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 text-muted-foreground">
          <span>
            Total de Renovantes no Período: <strong className="text-foreground">{totaisPeriodo.qtd}</strong>
          </span>
          <span>•</span>
          <span>
            Faturamento: <strong className="text-emerald-400">{currencyBRL(totaisPeriodo.faturamento)}</strong>
          </span>
        </div>
      </div>

      {/* =========================================================
          CARDS DE KPIS DO PERÍODO
      ========================================================= */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {/* Total Renovações */}
        <div className="rounded-xl border border-border/60 bg-background/50 p-3 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Renovações</span>
            <RefreshIcon className="h-4 w-4 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-foreground tabular-nums">{totaisPeriodo.qtd}</div>
          <div className="text-[11px] text-muted-foreground truncate">Registradas no período</div>
        </div>

        {/* Faturamento Bruto */}
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium text-emerald-400">Faturamento</span>
            <DollarSign className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-emerald-400 tabular-nums">
            {currencyBRL(totaisPeriodo.faturamento)}
          </div>
          <div className="text-[11px] text-muted-foreground">Receita bruta</div>
        </div>

        {/* Custo dos Créditos */}
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium text-red-400">Custo Créditos</span>
            <TrendingDown className="h-4 w-4 text-red-400" />
          </div>
          <div className="text-xl font-bold text-red-400 tabular-nums">{currencyBRL(totaisPeriodo.custo)}</div>
          <div className="text-[11px] text-muted-foreground">Despesa de créditos</div>
        </div>

        {/* Lucro Líquido */}
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium text-blue-400">Lucro Líquido</span>
            <TrendingUp className="h-4 w-4 text-blue-400" />
          </div>
          <div className="text-xl font-bold text-blue-400 tabular-nums">{currencyBRL(totaisPeriodo.lucro)}</div>
          <div className="text-[11px] text-muted-foreground font-semibold">
            Margem: <span className="text-emerald-400">{totaisPeriodo.margem.toFixed(1)}%</span>
          </div>
        </div>

        {/* Servidor Líder em Volume */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium text-amber-400 flex items-center gap-1">
              <Flame className="h-3.5 w-3.5" /> Top Volume
            </span>
            <Award className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-sm font-bold text-foreground truncate" title={liderVolume?.nome ?? "Sem movimento"}>
            {liderVolume ? liderVolume.nome : "—"}
          </div>
          <div className="text-[11px] text-amber-400/90 font-semibold">
            {liderVolume ? `${liderVolume.qtd} renovações (${liderVolume.shareVolume.toFixed(0)}%)` : "Sem vendas"}
          </div>
        </div>

        {/* Servidor Líder em Lucro */}
        <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-3 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium text-purple-400 flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5" /> Top Lucro
            </span>
            <Award className="h-4 w-4 text-purple-400" />
          </div>
          <div className="text-sm font-bold text-foreground truncate" title={liderLucro?.nome ?? "Sem movimento"}>
            {liderLucro ? liderLucro.nome : "—"}
          </div>
          <div className="text-[11px] text-purple-400/90 font-semibold">
            {liderLucro ? `${currencyBRL(liderLucro.lucro)} de lucro` : "Sem vendas"}
          </div>
        </div>
      </div>

      {/* =========================================================
          GRID PRINCIPAL: RANKING DE SERVIDORES + GRÁFICO COMPARATIVO
      ========================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Coluna 1: Ranking e Performance dos Servidores (7 colunas) */}
        <div className="lg:col-span-7 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Award className="h-4 w-4 text-amber-400" /> Desempenho e Ranking por Servidor
            </h3>
            <span className="text-xs text-muted-foreground">
              {rankingServidores.filter((s) => s.qtd > 0).length} com renovações
            </span>
          </div>

          <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
            {rankingServidores.length === 0 || rankingServidores.every((s) => s.qtd === 0) ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                Nenhuma renovação registrada no período selecionado ({rotuloPeriodo}).
              </div>
            ) : (
              rankingServidores.map((serv, index) => {
                const isTop1 = index === 0 && serv.qtd > 0;
                const isTop2 = index === 1 && serv.qtd > 0;
                const isTop3 = index === 2 && serv.qtd > 0;
                const catStyle = CATEGORIA_CORES[serv.categoria] || CATEGORIA_CORES.IPTV;

                return (
                  <div
                    key={serv.servidor_id}
                    onClick={() =>
                      setServidorFiltro((prev) => (prev === serv.servidor_id ? "todos" : serv.servidor_id))
                    }
                    className={cn(
                      "rounded-lg border p-2.5 transition cursor-pointer hover:border-primary/50 hover:bg-muted/30",
                      servidorFiltro === serv.servidor_id
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border/60 bg-background/40",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Medalha / Posição */}
                        <div
                          className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0",
                            isTop1 && "bg-amber-400/20 text-amber-400 border border-amber-400/50",
                            isTop2 && "bg-slate-400/20 text-slate-300 border border-slate-400/50",
                            isTop3 && "bg-amber-700/20 text-amber-600 border border-amber-700/50",
                            !isTop1 && !isTop2 && !isTop3 && "bg-muted text-muted-foreground",
                          )}
                        >
                          {index + 1}º
                        </div>

                        {/* Nome do Servidor */}
                        <div className="truncate font-semibold text-sm text-foreground">{serv.nome}</div>

                        {/* Categoria */}
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] h-4 px-1.5 font-medium", catStyle.border, catStyle.text, catStyle.bg)}
                        >
                          {serv.categoria}
                        </Badge>

                        {/* Badges de Destaque */}
                        {liderVolume?.servidor_id === serv.servidor_id && serv.qtd > 0 && (
                          <Badge className="text-[10px] h-4 px-1.5 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border-0">
                            ⭐ Top Volume
                          </Badge>
                        )}
                        {liderLucro?.servidor_id === serv.servidor_id && serv.qtd > 0 && (
                          <Badge className="text-[10px] h-4 px-1.5 bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border-0">
                            💰 Top Lucro
                          </Badge>
                        )}
                      </div>

                      {/* Quantidade e % */}
                      <div className="text-right shrink-0">
                        <span className="text-sm font-bold text-foreground tabular-nums">{serv.qtd}</span>
                        <span className="text-xs text-muted-foreground ml-1">
                          renov. ({serv.shareVolume.toFixed(1)}%)
                        </span>
                      </div>
                    </div>

                    {/* Barra de Progresso do Volume */}
                    <div className="w-full bg-muted/70 rounded-full h-1.5 mb-2 overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-300",
                          isTop1 ? "bg-amber-400" : isTop2 ? "bg-blue-400" : "bg-primary",
                        )}
                        style={{ width: `${Math.min(100, Math.max(0, serv.shareVolume))}%` }}
                      />
                    </div>

                    {/* Métricas Financeiras do Servidor */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1 border-t border-border/30">
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase block">Faturamento</span>
                        <span className="font-semibold text-emerald-400 tabular-nums">
                          {currencyBRL(serv.faturamento)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase block">Custo Créditos</span>
                        <span className="font-semibold text-red-400 tabular-nums">{currencyBRL(serv.custo)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase block">Lucro Líquido</span>
                        <span className="font-semibold text-blue-400 tabular-nums">{currencyBRL(serv.lucro)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase block">Margem / Ticket</span>
                        <span className="font-semibold text-foreground tabular-nums">
                          {serv.margem.toFixed(0)}% • {currencyBRL(serv.ticketMedio)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Coluna 2: Gráfico Comparativo de Servidores (5 colunas) */}
        <div className="lg:col-span-5 space-y-2 flex flex-col">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4 text-blue-400" /> Comparativo Gráfico
            </h3>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant={tipoGrafico === "volume" ? "secondary" : "ghost"}
                className="h-6 px-2 text-[11px]"
                onClick={() => setTipoGrafico("volume")}
              >
                Volume
              </Button>
              <Button
                size="sm"
                variant={tipoGrafico === "financeiro" ? "secondary" : "ghost"}
                className="h-6 px-2 text-[11px]"
                onClick={() => setTipoGrafico("financeiro")}
              >
                Financeiro
              </Button>
            </div>
          </div>

          <div className="flex-1 rounded-lg border border-border/60 bg-background/40 p-3 min-h-[300px] flex items-center justify-center">
            {chartData.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center">
                Sem dados suficientes para gerar o gráfico no período.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                {tipoGrafico === "volume" ? (
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis
                      dataKey="nome"
                      tick={{ fontSize: 11, fill: "currentColor" }}
                      angle={-25}
                      textAnchor="end"
                      height={40}
                    />
                    <YAxis tick={{ fontSize: 11, fill: "currentColor" }} allowDecimals={false} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="rounded-lg border border-border bg-popover p-2 text-xs shadow-md space-y-1">
                            <div className="font-bold text-foreground">{d.nomeCompleto}</div>
                            <div className="text-blue-400">Renovações: {d.renovacoes}</div>
                            <div className="text-emerald-400">Faturamento: {currencyBRL(d.faturamento)}</div>
                            <div className="text-muted-foreground">Lucro: {currencyBRL(d.lucro)}</div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="renovacoes" name="Renovações" radius={[4, 4, 0, 0]}>
                      {chartData.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={index === 0 ? "#f59e0b" : index === 1 ? "#3b82f6" : "#8b5cf6"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                ) : (
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis
                      dataKey="nome"
                      tick={{ fontSize: 11, fill: "currentColor" }}
                      angle={-25}
                      textAnchor="end"
                      height={40}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "currentColor" }}
                      tickFormatter={(val) => `R$${val}`}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="rounded-lg border border-border bg-popover p-2 text-xs shadow-md space-y-1">
                            <div className="font-bold text-foreground">{d.nomeCompleto}</div>
                            <div className="text-emerald-400">Faturamento: {currencyBRL(d.faturamento)}</div>
                            <div className="text-red-400">Custo: {currencyBRL(d.custo)}</div>
                            <div className="text-blue-400">Lucro Líquido: {currencyBRL(d.lucro)}</div>
                          </div>
                        );
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                    <Bar dataKey="faturamento" name="Faturamento" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="lucro" name="Lucro Líquido" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* =========================================================
          TABELA DETALHADA DE TODAS AS RENOVAÇÕES DO PERÍODO
      ========================================================= */}
      <div className="space-y-2 pt-2 border-t border-border/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-primary" /> Todas as Renovações do Período
            </h3>
            <Badge variant="secondary" className="text-xs h-5 px-1.5">
              {renovacoesFiltradasTabela.length} de {renovacoesDoPeriodo.length}
            </Badge>
          </div>

          {/* Filtros da Tabela */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Filtro por Servidor */}
            <div className="flex items-center gap-1">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <select
                value={servidorFiltro}
                onChange={(e) => setServidorFiltro(e.target.value)}
                className="h-7 rounded-md border border-border/60 bg-background px-2 text-xs"
                aria-label="Filtrar por servidor"
              >
                <option value="todos">Todos os Servidores</option>
                {(servidores as any[]).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </div>

            {/* Busca por Nome do Cliente */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar cliente..."
                value={termoBusca}
                onChange={(e) => setTermoBusca(e.target.value)}
                className="h-7 pl-7 pr-2 w-36 sm:w-44 text-xs bg-background"
              />
            </div>
          </div>
        </div>

        {/* Tabela */}
        <div className="rounded-lg border border-border/60 bg-background/50 overflow-hidden">
          <div className="max-h-[340px] overflow-y-auto">
            <Table className={COMPACT_TABLE_CLASS}>
              <TableHeader className="bg-muted/60 sticky top-0 z-10">
                <TableRow>
                  <TableHead className="w-36">Data / Hora</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Servidor</TableHead>
                  <TableHead className="text-center w-24">Dias</TableHead>
                  <TableHead className="text-right">Valor Recebido</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                  <TableHead className="text-right">Lucro Líquido</TableHead>
                  <TableHead className="text-center w-24">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {renovacoesFiltradasTabela.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-xs text-muted-foreground">
                      {renovacoesDoPeriodo.length === 0
                        ? `Nenhuma renovação efetuada no período (${rotuloPeriodo}).`
                        : "Nenhuma renovação encontrada com os filtros atuais."}
                    </TableCell>
                  </TableRow>
                ) : (
                  renovacoesFiltradasTabela.map((r) => {
                    const catStyle = CATEGORIA_CORES[r.servidor_categoria] || CATEGORIA_CORES.IPTV;
                    return (
                      <TableRow key={r.id} className="hover:bg-muted/30">
                        <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                          {formatDateTimeBR(r.created_at)}
                        </TableCell>
                        <TableCell className="font-medium text-foreground">{r.cliente_nome}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-foreground">{r.servidor_nome}</span>
                            <Badge
                              variant="outline"
                              className={cn("text-[10px] h-4 px-1 font-normal", catStyle.border, catStyle.text, catStyle.bg)}
                            >
                              {r.servidor_categoria}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5 font-mono">
                            +{r.dias_adicionados}d
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold text-emerald-400 tabular-nums">
                          {currencyBRL(r.valor_recebido)}
                        </TableCell>
                        <TableCell className="text-right font-medium text-red-400 tabular-nums">
                          {currencyBRL(r.custo)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-bold tabular-nums",
                            r.lucro >= 0 ? "text-blue-400" : "text-red-400",
                          )}
                        >
                          {currencyBRL(r.lucro)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={r.status_pagamento === "pago" ? "default" : "destructive"}
                            className="text-[10px] h-4 px-1.5"
                          >
                            {r.status_pagamento === "pago" ? "Pago" : "Devendo"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Rodapé Totalizador da Tabela */}
          {renovacoesFiltradasTabela.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-muted/50 border-t border-border/60 text-xs">
              <span className="font-semibold text-muted-foreground">
                Total Listado: <strong className="text-foreground">{totaisTabela.qtd} renovação(ões)</strong>
              </span>
              <div className="flex items-center gap-4">
                <span>
                  Faturamento:{" "}
                  <strong className="text-emerald-400 tabular-nums">{currencyBRL(totaisTabela.faturamento)}</strong>
                </span>
                <span>
                  Custo: <strong className="text-red-400 tabular-nums">{currencyBRL(totaisTabela.custo)}</strong>
                </span>
                <span>
                  Lucro Total:{" "}
                  <strong
                    className={cn(
                      "tabular-nums font-bold",
                      totaisTabela.lucro >= 0 ? "text-blue-400" : "text-red-400",
                    )}
                  >
                    {currencyBRL(totaisTabela.lucro)}
                  </strong>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 21h5v-5" />
    </svg>
  );
}
