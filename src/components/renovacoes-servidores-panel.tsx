import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchClientes, fetchServidores, fetchHistorico } from "@/lib/queries";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExportConsolidado } from "@/components/export-consolidado";
import { type ExportSection } from "@/lib/central-export";
import {
  Server,
  Award,
  Calendar,
  CalendarDays,
  CalendarClock,
  FileText,
  FileSpreadsheet,
  FileImage,
  Flame,
  Zap,
} from "lucide-react";
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

  // Aba ativa para visualização do Top 3
  const [aba, setAba] = useState<Subdivisao>("diario");

  // Mapas para lookup rápido de servidores e clientes
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

  // Lista normalizada de renovações válidas
  const renovacoes = useMemo(() => {
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
        const servidorNome = serv?.nome || (servId ? "Servidor Vinculado" : "Sem Servidor");
        const servidorCategoria = serv?.categoria || "IPTV";

        return {
          id: h.id,
          created_at: h.created_at,
          data_obj: new Date(h.created_at),
          cliente_nome: h.cliente_nome || cli?.nome || h.cliente?.nome || "Cliente",
          servidor_id: servId || "sem_servidor",
          servidor_nome: servidorNome,
          servidor_categoria: servidorCategoria,
        };
      });
  }, [historico, clientesMap, servidoresMap]);

  // Limites temporais (Hoje, Esta Semana, Este Mês)
  const { hoje, startOfWeek, startOfMonth, nomeMesAtual } = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);

    const diaSemana = d.getDay(); // 0 = Domingo
    const sWeek = new Date(d);
    sWeek.setDate(d.getDate() - diaSemana);
    sWeek.setHours(0, 0, 0, 0);

    const sMonth = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
    const mNome = d.toLocaleDateString("pt-BR", { month: "long" });

    return {
      hoje: d,
      startOfWeek: sWeek,
      startOfMonth: sMonth,
      nomeMesAtual: mNome.charAt(0).toUpperCase() + mNome.slice(1),
    };
  }, []);

  // Filtragem das renovações por período
  const renovacoesHoje = useMemo(() => {
    const hojeTime = hoje.getTime();
    return renovacoes.filter((r) => {
      const t = new Date(r.data_obj);
      t.setHours(0, 0, 0, 0);
      return t.getTime() === hojeTime;
    });
  }, [renovacoes, hoje]);

  const renovacoesSemana = useMemo(() => {
    const inicio = startOfWeek.getTime();
    return renovacoes.filter((r) => r.data_obj.getTime() >= inicio);
  }, [renovacoes, startOfWeek]);

  const renovacoesMes = useMemo(() => {
    const inicio = startOfMonth.getTime();
    return renovacoes.filter((r) => r.data_obj.getTime() >= inicio);
  }, [renovacoes, startOfMonth]);

  // Função auxiliar para calcular ranking de todos os servidores com base em uma lista de renovações
  const calcularRanking = (lista: typeof renovacoes) => {
    const mapa = new Map<string, { nome: string; categoria: string; qtd: number }>();
    lista.forEach((r) => {
      const cur = mapa.get(r.servidor_id) || {
        nome: r.servidor_nome,
        categoria: r.servidor_categoria,
        qtd: 0,
      };
      cur.qtd += 1;
      mapa.set(r.servidor_id, cur);
    });

    const total = lista.length;
    return Array.from(mapa.values())
      .sort((a, b) => b.qtd - a.qtd)
      .map((item, idx) => ({
        posicao: idx + 1,
        nome: item.nome,
        categoria: item.categoria,
        qtd: item.qtd,
        share: total > 0 ? (item.qtd / total) * 100 : 0,
      }));
  };

  const rankingHoje = useMemo(() => calcularRanking(renovacoesHoje), [renovacoesHoje]);
  const rankingSemana = useMemo(() => calcularRanking(renovacoesSemana), [renovacoesSemana]);
  const rankingMes = useMemo(() => calcularRanking(renovacoesMes), [renovacoesMes]);

  const statsHoje = useMemo(() => {
    const total = renovacoesHoje.length;
    const top1 = rankingHoje[0] || null;
    const top2 = rankingHoje[1] || null;
    const servidoresAtivos = rankingHoje.length;
    const shareSemana = renovacoesSemana.length > 0 ? Math.round((total / renovacoesSemana.length) * 100) : 0;
    return { total, top1, top2, servidoresAtivos, shareSemana };
  }, [renovacoesHoje, rankingHoje, renovacoesSemana]);

  const statsSemana = useMemo(() => {
    const total = renovacoesSemana.length;
    const top1 = rankingSemana[0] || null;
    const top2 = rankingSemana[1] || null;
    const servidoresAtivos = rankingSemana.length;
    const diasDecorridos = Math.max(1, hoje.getDay() + 1);
    const mediaDiaria = (total / diasDecorridos).toFixed(1);
    const shareMes = renovacoesMes.length > 0 ? Math.round((total / renovacoesMes.length) * 100) : 0;
    return { total, top1, top2, servidoresAtivos, diasDecorridos, mediaDiaria, shareMes };
  }, [renovacoesSemana, rankingSemana, renovacoesMes, hoje]);

  const statsMes = useMemo(() => {
    const total = renovacoesMes.length;
    const top1 = rankingMes[0] || null;
    const top2 = rankingMes[1] || null;
    const servidoresAtivos = rankingMes.length;
    const diaAtual = hoje.getDate();
    const diasTotalMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    const mediaDiaria = (total / Math.max(1, diaAtual)).toFixed(1);
    const projecao = Math.round((total / Math.max(1, diaAtual)) * diasTotalMes);
    return { total, top1, top2, servidoresAtivos, diaAtual, diasTotalMes, mediaDiaria, projecao };
  }, [renovacoesMes, rankingMes, hoje]);

  // Ranking ativo de acordo com a aba selecionada
  const { rankingAtivo, rotuloAba } = useMemo(() => {
    if (aba === "diario") {
      return { rankingAtivo: rankingHoje, rotuloAba: "Hoje" };
    }
    if (aba === "semanal") {
      return { rankingAtivo: rankingSemana, rotuloAba: "Esta Semana" };
    }
    return { rankingAtivo: rankingMes, rotuloAba: `Mês (${nomeMesAtual})` };
  }, [aba, rankingHoje, rankingSemana, rankingMes, nomeMesAtual]);

  // -------------------------------------------------------------
  // EXPORTAÇÕES (PDF, Excel, PNG, Consolidado)
  // -------------------------------------------------------------
  const stamp = () => new Date().toISOString().slice(0, 10);

  const getExportSections = (): ExportSection[] => [
    {
      title: "Resumo de Renovações por Período",
      description: "Total de renovações realizadas no dia, na semana e no mês atual.",
      columns: ["Período", "Total de Renovações", "Servidores Ativos", "Mais Vendido"],
      rows: [
        ["Hoje (Diário)", renovacoesHoje.length, statsHoje.servidoresAtivos, statsHoje.top1 ? `${statsHoje.top1.nome} (${statsHoje.top1.qtd})` : "—"],
        ["Esta Semana (Semanal)", renovacoesSemana.length, statsSemana.servidoresAtivos, statsSemana.top1 ? `${statsSemana.top1.nome} (${statsSemana.top1.qtd})` : "—"],
        [`Este Mês (${nomeMesAtual})`, renovacoesMes.length, statsMes.servidoresAtivos, statsMes.top1 ? `${statsMes.top1.nome} (${statsMes.top1.qtd})` : "—"],
      ],
    },
    {
      title: `Servidores Mais Vendidos — ${rotuloAba}`,
      description: `Ranking de servidores por número de renovações no período selecionado.`,
      columns: ["Posição", "Servidor", "Categoria", "Renovações", "Participação (%)"],
      rows: rankingAtivo.map((s) => [
        `${s.posicao}º`,
        s.nome,
        s.categoria,
        s.qtd,
        `${s.share.toFixed(1)}%`,
      ]),
    },
  ];

  const exportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      const resumoRows = [
        { Período: "Hoje (Diário)", Renovações: renovacoesHoje.length, "Servidores Ativos": statsHoje.servidoresAtivos, "Líder": statsHoje.top1 ? `${statsHoje.top1.nome} (${statsHoje.top1.qtd})` : "—" },
        { Período: "Esta Semana (Semanal)", Renovações: renovacoesSemana.length, "Servidores Ativos": statsSemana.servidoresAtivos, "Líder": statsSemana.top1 ? `${statsSemana.top1.nome} (${statsSemana.top1.qtd})` : "—" },
        { Período: `Este Mês (${nomeMesAtual})`, Renovações: renovacoesMes.length, "Servidores Ativos": statsMes.servidoresAtivos, "Líder": statsMes.top1 ? `${statsMes.top1.nome} (${statsMes.top1.qtd})` : "—" },
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumoRows), "Resumo Renovações");

      const servRows = rankingAtivo.map((s) => ({
        Posição: `${s.posicao}º`,
        Servidor: s.nome,
        Categoria: s.categoria,
        Renovações: s.qtd,
        "Participação (%)": Number(s.share.toFixed(1)),
      }));
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(servRows.length ? servRows : [{ Info: "Sem renovações no período" }]),
        "Servidores Mais Vendidos",
      );

      XLSX.writeFile(wb, `renovacoes-servidores-${stamp()}.xlsx`);
      toast.success("Relatório Excel exportado!");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao exportar Excel");
    }
  };

  const exportPDF = () => {
    try {
      const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
      const margin = 15;
      let y = margin;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.setTextColor(37, 99, 235);
      pdf.text("Performance de Renovações por Servidor", margin, y);
      y += 6;

      pdf.setFontSize(9);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, margin, y);
      y += 8;

      // Resumo
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.setTextColor(17, 24, 39);
      pdf.text("Total de Renovações por Período", margin, y);
      y += 6;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.text(`• Hoje (Diário): ${renovacoesHoje.length} renovações | Líder: ${statsHoje.top1?.nome || "—"}`, margin + 4, y);
      y += 5;
      pdf.text(`• Esta Semana (Semanal): ${renovacoesSemana.length} renovações (Média ~${statsSemana.mediaDiaria}/dia) | Líder: ${statsSemana.top1?.nome || "—"}`, margin + 4, y);
      y += 5;
      pdf.text(`• Este Mês (${nomeMesAtual}): ${renovacoesMes.length} renovações (Média ~${statsMes.mediaDiaria}/dia) | Líder: ${statsMes.top1?.nome || "—"}`, margin + 4, y);
      y += 9;

      // Ranking
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.setTextColor(37, 99, 235);
      pdf.text(`Servidores Mais Vendidos (${rotuloAba})`, margin, y);
      y += 6;

      pdf.setFont("helvetica", "normal");
      if (rankingAtivo.length === 0) {
        pdf.text("Nenhuma renovação registrada no período.", margin + 4, y);
      } else {
        rankingAtivo.forEach((s) => {
          pdf.text(
            `${s.posicao}º Lugar: ${s.nome} (${s.categoria}) — ${s.qtd} renovações (${s.share.toFixed(1)}% do total)`,
            margin + 4,
            y,
          );
          y += 6;
        });
      }

      pdf.save(`renovacoes-servidores-${stamp()}.pdf`);
      toast.success("Relatório PDF exportado!");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao exportar PDF");
    }
  };

  const exportPNG = () => {
    try {
      const scale = 2;
      const width = 800;
      const height = Math.max(340, 220 + rankingAtivo.length * 20);
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(scale, scale);

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);

      let y = 25;
      ctx.fillStyle = "#111827";
      ctx.font = "bold 16px Arial";
      ctx.fillText("Performance de Renovações por Servidor", 25, y);
      y += 18;

      ctx.fillStyle = "#6b7280";
      ctx.font = "11px Arial";
      ctx.fillText(`Exportado em ${new Date().toLocaleString("pt-BR")}`, 25, y);
      y += 22;

      ctx.fillStyle = "#10b981";
      ctx.font = "bold 12px Arial";
      ctx.fillText(`• Hoje: ${renovacoesHoje.length} renovações | Líder: ${statsHoje.top1?.nome || "—"}`, 25, y);
      y += 18;
      ctx.fillStyle = "#f59e0b";
      ctx.fillText(`• Esta Semana: ${renovacoesSemana.length} renovações (Média ~${statsSemana.mediaDiaria}/dia)`, 25, y);
      y += 18;
      ctx.fillStyle = "#3b82f6";
      ctx.fillText(`• Este Mês (${nomeMesAtual}): ${renovacoesMes.length} renovações (Média ~${statsMes.mediaDiaria}/dia)`, 25, y);
      y += 26;

      ctx.fillStyle = "#2563eb";
      ctx.font = "bold 13px Arial";
      ctx.fillText(`Servidores Mais Vendidos — ${rotuloAba}:`, 25, y);
      y += 20;

      ctx.fillStyle = "#111827";
      ctx.font = "11px Arial";
      if (rankingAtivo.length === 0) {
        ctx.fillText("Sem renovações registradas no período.", 25, y);
      } else {
        rankingAtivo.forEach((s) => {
          ctx.fillText(
            `${s.posicao}º Lugar: ${s.nome} (${s.categoria}) — ${s.qtd} renovações (${s.share.toFixed(1)}%)`,
            25,
            y,
          );
          y += 18;
        });
      }

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `renovacoes-servidores-${stamp()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("Imagem PNG exportada!");
      }, "image/png");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao exportar PNG");
    }
  };

  return (
    <Card className="p-3.5 space-y-3 border-border/80 bg-card/60 backdrop-blur-sm shadow-sm">
      {/* =========================================================
          CABEÇALHO COM ABAS E BOTÕES DE EXPORTAÇÃO
      ========================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
            <Zap className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold tracking-tight flex items-center gap-1.5">
              Performance de Renovações
              <Badge variant="outline" className="text-[10px] font-semibold py-0 h-4 text-primary bg-primary/5 border-primary/20">
                Servidores
              </Badge>
            </h2>
            <p className="text-xs text-muted-foreground">
              Acompanhamento diário, semanal e mensal com ranking de servidores mais vendidos.
            </p>
          </div>
        </div>

        {/* Abas de subdivisão e botões de exportação */}
        <div className="flex items-center gap-2 flex-wrap">
          <Tabs value={aba} onValueChange={(v) => setAba(v as Subdivisao)} className="w-auto">
            <TabsList className="h-7 p-0.5 bg-muted/80">
              <TabsTrigger value="diario" className="h-6 px-2.5 text-xs gap-1 data-[state=active]:bg-background data-[state=active]:shadow-xs font-semibold">
                <Calendar className="h-3.5 w-3.5 text-emerald-400" /> Diário
              </TabsTrigger>
              <TabsTrigger value="semanal" className="h-6 px-2.5 text-xs gap-1 data-[state=active]:bg-background data-[state=active]:shadow-xs font-semibold">
                <CalendarClock className="h-3.5 w-3.5 text-amber-400" /> Semanal
              </TabsTrigger>
              <TabsTrigger value="mensal" className="h-6 px-2.5 text-xs gap-1 data-[state=active]:bg-background data-[state=active]:shadow-xs font-semibold">
                <CalendarDays className="h-3.5 w-3.5 text-blue-400" /> Mensal
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-1 border-l border-border/60 pl-2">
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={exportPDF} title="Exportar PDF">
              <FileText className="h-3.5 w-3.5 mr-1 text-red-400" /> PDF
            </Button>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={exportExcel} title="Exportar Excel">
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1 text-emerald-400" /> Excel
            </Button>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={exportPNG} title="Exportar PNG">
              <FileImage className="h-3.5 w-3.5 mr-1 text-blue-400" /> PNG
            </Button>
            <ExportConsolidado
              reportName="Renovações por Servidor"
              sections={getExportSections}
              label="Exportar"
            />
          </div>
        </div>
      </div>

      {/* =========================================================
          GRID PRINCIPAL: TOTAIS (DIA / SEMANA / MÊS) + SERVIDORES MAIS VENDIDOS
      ========================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Coluna da Esquerda: 3 Subdivisões de Renovações (7 Colunas) */}
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* Card Diário */}
          <div
            onClick={() => setAba("diario")}
            className={cn(
              "rounded-xl border p-3 transition cursor-pointer flex flex-col justify-between space-y-2.5 select-none relative overflow-hidden",
              aba === "diario"
                ? "border-emerald-500/70 bg-emerald-500/10 ring-2 ring-emerald-500/40 shadow-sm"
                : "border-border/60 bg-background/60 hover:bg-muted/40 hover:border-emerald-500/30",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-emerald-400" /> Diário
              </span>
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-bold border-emerald-500/40 text-emerald-400 bg-emerald-500/10">
                Hoje
              </Badge>
            </div>

            <div>
              <div className="text-3xl sm:text-4xl font-black tracking-tight text-emerald-400 tabular-nums">
                {statsHoje.total}
              </div>
              <div className="text-xs text-muted-foreground font-semibold mt-0.5">renovações hoje</div>
            </div>

            {/* Informações detalhadas do bloco Diário */}
            <div className="pt-2 border-t border-border/50 space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-1">
                <span className="text-muted-foreground text-[11px] flex items-center gap-1">
                  <Flame className="h-3 w-3 text-amber-400" /> Mais vendido:
                </span>
                <span className="font-bold text-foreground text-[11px] truncate max-w-[110px]" title={statsHoje.top1?.nome}>
                  {statsHoje.top1 ? statsHoje.top1.nome : "—"}
                </span>
              </div>
              {statsHoje.top1 && (
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Volume do líder:</span>
                  <span className="font-semibold text-emerald-400">{statsHoje.top1.qtd} ({statsHoje.top1.share.toFixed(0)}%)</span>
                </div>
              )}
              <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5 border-t border-border/30">
                <span>Servidores ativos:</span>
                <span className="font-semibold text-foreground">{statsHoje.servidoresAtivos}</span>
              </div>
            </div>
          </div>

          {/* Card Semanal */}
          <div
            onClick={() => setAba("semanal")}
            className={cn(
              "rounded-xl border p-3 transition cursor-pointer flex flex-col justify-between space-y-2.5 select-none relative overflow-hidden",
              aba === "semanal"
                ? "border-amber-500/70 bg-amber-500/10 ring-2 ring-amber-500/40 shadow-sm"
                : "border-border/60 bg-background/60 hover:bg-muted/40 hover:border-amber-500/30",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <CalendarClock className="h-4 w-4 text-amber-400" /> Semanal
              </span>
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-bold border-amber-500/40 text-amber-400 bg-amber-500/10">
                Esta Semana
              </Badge>
            </div>

            <div>
              <div className="text-3xl sm:text-4xl font-black tracking-tight text-amber-400 tabular-nums">
                {statsSemana.total}
              </div>
              <div className="text-xs text-muted-foreground font-semibold mt-0.5">renovações na semana</div>
            </div>

            {/* Informações detalhadas do bloco Semanal */}
            <div className="pt-2 border-t border-border/50 space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-1">
                <span className="text-muted-foreground text-[11px] flex items-center gap-1">
                  <Flame className="h-3 w-3 text-amber-400" /> Mais vendido:
                </span>
                <span className="font-bold text-foreground text-[11px] truncate max-w-[110px]" title={statsSemana.top1?.nome}>
                  {statsSemana.top1 ? statsSemana.top1.nome : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Média por dia:</span>
                <span className="font-semibold text-amber-400">~{statsSemana.mediaDiaria} / dia</span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5 border-t border-border/30">
                <span>Servidores ativos:</span>
                <span className="font-semibold text-foreground">{statsSemana.servidoresAtivos}</span>
              </div>
            </div>
          </div>

          {/* Card Mensal */}
          <div
            onClick={() => setAba("mensal")}
            className={cn(
              "rounded-xl border p-3 transition cursor-pointer flex flex-col justify-between space-y-2.5 select-none relative overflow-hidden",
              aba === "mensal"
                ? "border-blue-500/70 bg-blue-500/10 ring-2 ring-blue-500/40 shadow-sm"
                : "border-border/60 bg-background/60 hover:bg-muted/40 hover:border-blue-500/30",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 text-blue-400" /> Mensal
              </span>
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-bold border-blue-500/40 text-blue-400 bg-blue-500/10">
                {nomeMesAtual}
              </Badge>
            </div>

            <div>
              <div className="text-3xl sm:text-4xl font-black tracking-tight text-blue-400 tabular-nums">
                {statsMes.total}
              </div>
              <div className="text-xs text-muted-foreground font-semibold mt-0.5">renovações no mês</div>
            </div>

            {/* Informações detalhadas do bloco Mensal */}
            <div className="pt-2 border-t border-border/50 space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-1">
                <span className="text-muted-foreground text-[11px] flex items-center gap-1">
                  <Flame className="h-3 w-3 text-amber-400" /> Mais vendido:
                </span>
                <span className="font-bold text-foreground text-[11px] truncate max-w-[110px]" title={statsMes.top1?.nome}>
                  {statsMes.top1 ? statsMes.top1.nome : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Média diária:</span>
                <span className="font-semibold text-blue-400">~{statsMes.mediaDiaria} / dia</span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5 border-t border-border/30">
                <span>Projeção mês:</span>
                <span className="font-semibold text-foreground">~{statsMes.projecao} renov.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Coluna da Direita: Servidores Mais Vendidos com Barra de Rolagem (5 Colunas) */}
        <div className="lg:col-span-5 rounded-xl border border-border/60 bg-background/60 p-3 space-y-2 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-1.5 border-b border-border/40">
            <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <Award className="h-4 w-4 text-amber-400 shrink-0" /> Servidores Mais Vendidos
            </h3>
            <Badge variant="secondary" className="text-[10px] h-4.5 px-2 font-semibold">
              {rotuloAba} ({rankingAtivo.length} servidores)
            </Badge>
          </div>

          {rankingAtivo.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground font-medium">
              Nenhuma renovação registrada para {rotuloAba.toLowerCase()}.
            </div>
          ) : (
            <div className="max-h-[175px] overflow-y-auto pr-1 space-y-1.5">
              {rankingAtivo.map((serv) => {
                const isTop1 = serv.posicao === 1;
                const isTop2 = serv.posicao === 2;
                const isTop3 = serv.posicao === 3;
                const catStyle = CATEGORIA_CORES[serv.categoria] || CATEGORIA_CORES.IPTV;

                return (
                  <div
                    key={serv.nome}
                    className="flex items-center justify-between gap-2 p-1.5 px-2.5 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/40 transition"
                  >
                    {/* Medalha / Posição e Nome */}
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={cn(
                          "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0",
                          isTop1 && "bg-amber-400/20 text-amber-400 border border-amber-400/50",
                          isTop2 && "bg-slate-400/20 text-slate-300 border border-slate-400/50",
                          isTop3 && "bg-amber-700/20 text-amber-600 border border-amber-700/50",
                          !isTop1 && !isTop2 && !isTop3 && "bg-muted text-muted-foreground border border-border/50",
                        )}
                      >
                        {serv.posicao}º
                      </div>
                      <span className="font-bold text-xs sm:text-sm text-foreground truncate">{serv.nome}</span>
                      <Badge
                        variant="outline"
                        className={cn("text-[9px] h-4 px-1.5 font-semibold", catStyle.border, catStyle.text, catStyle.bg)}
                      >
                        {serv.categoria}
                      </Badge>
                    </div>

                    {/* Quantidade de Renovações e % */}
                    <div className="text-right shrink-0 text-xs">
                      <span className="font-extrabold text-foreground tabular-nums text-xs sm:text-sm">{serv.qtd}</span>
                      <span className="text-[11px] text-muted-foreground ml-1 font-medium">
                        renov. ({serv.share.toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
