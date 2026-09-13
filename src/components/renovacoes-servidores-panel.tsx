import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchClientes, fetchServidores, fetchHistorico, fetchAtivacoesApps } from "@/lib/queries";
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
  Smartphone,
  DollarSign,
  TrendingUp,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { currencyBRL } from "@/lib/iptv";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { toast } from "sonner";

type TipoPainel = "servidores" | "aplicativos";
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
  const { data: ativacoes = [] } = useQuery({ queryKey: ["ativacoes_apps"], queryFn: () => fetchAtivacoesApps() });

  // Visão principal: Servidores ou Aplicativos
  const [tipoPainel, setTipoPainel] = useState<TipoPainel>("servidores");
  // Subdivisão ativa: Diário, Semanal ou Mensal
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

  // Lista normalizada de ativações válidas
  const ativacoesLista = useMemo(() => {
    return (ativacoes as any[])
      .filter((a) => !!a.ativado_em || !!a.created_at)
      .map((a) => {
        const dStr = a.ativado_em || a.created_at;
        return {
          id: a.id,
          created_at: dStr,
          data_obj: new Date(dStr),
          cliente_nome: a.cliente_nome || "Cliente",
          aplicativo: (a.aplicativo || "Aplicativo").trim(),
          servidor_nome: a.servidor?.nome || "Servidor",
          valor: Number(a.valor || 0),
          custo: Number(a.custo || 0),
          lucro: Number(a.valor || 0) - Number(a.custo || 0),
        };
      });
  }, [ativacoes]);

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

  // -------------------------------------------------------------
  // FILTRAGEM: RENOVAÇÕES
  // -------------------------------------------------------------
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

  const calcularRankingServidores = (lista: typeof renovacoes) => {
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

  const rankingServHoje = useMemo(() => calcularRankingServidores(renovacoesHoje), [renovacoesHoje]);
  const rankingServSemana = useMemo(() => calcularRankingServidores(renovacoesSemana), [renovacoesSemana]);
  const rankingServMes = useMemo(() => calcularRankingServidores(renovacoesMes), [renovacoesMes]);

  const statsServHoje = useMemo(() => {
    const total = renovacoesHoje.length;
    const top1 = rankingServHoje[0] || null;
    const servidoresAtivos = rankingServHoje.length;
    const shareSemana = renovacoesSemana.length > 0 ? Math.round((total / renovacoesSemana.length) * 100) : 0;
    return { total, top1, servidoresAtivos, shareSemana };
  }, [renovacoesHoje, rankingServHoje, renovacoesSemana]);

  const statsServSemana = useMemo(() => {
    const total = renovacoesSemana.length;
    const top1 = rankingServSemana[0] || null;
    const servidoresAtivos = rankingServSemana.length;
    const diasDecorridos = Math.max(1, hoje.getDay() + 1);
    const mediaDiaria = (total / diasDecorridos).toFixed(1);
    const shareMes = renovacoesMes.length > 0 ? Math.round((total / renovacoesMes.length) * 100) : 0;
    return { total, top1, servidoresAtivos, diasDecorridos, mediaDiaria, shareMes };
  }, [renovacoesSemana, rankingServSemana, renovacoesMes, hoje]);

  const statsServMes = useMemo(() => {
    const total = renovacoesMes.length;
    const top1 = rankingServMes[0] || null;
    const servidoresAtivos = rankingServMes.length;
    const diaAtual = hoje.getDate();
    const diasTotalMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    const mediaDiaria = (total / Math.max(1, diaAtual)).toFixed(1);
    const projecao = Math.round((total / Math.max(1, diaAtual)) * diasTotalMes);
    return { total, top1, servidoresAtivos, diaAtual, diasTotalMes, mediaDiaria, projecao };
  }, [renovacoesMes, rankingServMes, hoje]);

  // -------------------------------------------------------------
  // FILTRAGEM: ATIVAÇÕES DE APLICATIVOS
  // -------------------------------------------------------------
  const ativacoesHoje = useMemo(() => {
    const hojeTime = hoje.getTime();
    return ativacoesLista.filter((a) => {
      const t = new Date(a.data_obj);
      t.setHours(0, 0, 0, 0);
      return t.getTime() === hojeTime;
    });
  }, [ativacoesLista, hoje]);

  const ativacoesSemana = useMemo(() => {
    const inicio = startOfWeek.getTime();
    return ativacoesLista.filter((a) => a.data_obj.getTime() >= inicio);
  }, [ativacoesLista, startOfWeek]);

  const ativacoesMes = useMemo(() => {
    const inicio = startOfMonth.getTime();
    return ativacoesLista.filter((a) => a.data_obj.getTime() >= inicio);
  }, [ativacoesLista, startOfMonth]);

  const calcularRankingApps = (lista: typeof ativacoesLista) => {
    const mapa = new Map<string, { nome: string; qtd: number; receita: number; custo: number; lucro: number }>();
    lista.forEach((a) => {
      const appNome = a.aplicativo || "Outro";
      const cur = mapa.get(appNome) || {
        nome: appNome,
        qtd: 0,
        receita: 0,
        custo: 0,
        lucro: 0,
      };
      cur.qtd += 1;
      cur.receita += a.valor;
      cur.custo += a.custo;
      cur.lucro += a.lucro;
      mapa.set(appNome, cur);
    });

    const total = lista.length;
    return Array.from(mapa.values())
      .sort((a, b) => b.qtd - a.qtd)
      .map((item, idx) => ({
        posicao: idx + 1,
        nome: item.nome,
        qtd: item.qtd,
        receita: item.receita,
        custo: item.custo,
        lucro: item.lucro,
        share: total > 0 ? (item.qtd / total) * 100 : 0,
      }));
  };

  const rankingAppsHoje = useMemo(() => calcularRankingApps(ativacoesHoje), [ativacoesHoje]);
  const rankingAppsSemana = useMemo(() => calcularRankingApps(ativacoesSemana), [ativacoesSemana]);
  const rankingAppsMes = useMemo(() => calcularRankingApps(ativacoesMes), [ativacoesMes]);

  const statsAppsHoje = useMemo(() => {
    const total = ativacoesHoje.length;
    const receita = ativacoesHoje.reduce((s, a) => s + a.valor, 0);
    const custo = ativacoesHoje.reduce((s, a) => s + a.custo, 0);
    const lucro = receita - custo;
    const top1 = rankingAppsHoje[0] || null;
    const appsAtivos = rankingAppsHoje.length;
    return { total, receita, custo, lucro, top1, appsAtivos };
  }, [ativacoesHoje, rankingAppsHoje]);

  const statsAppsSemana = useMemo(() => {
    const total = ativacoesSemana.length;
    const receita = ativacoesSemana.reduce((s, a) => s + a.valor, 0);
    const custo = ativacoesSemana.reduce((s, a) => s + a.custo, 0);
    const lucro = receita - custo;
    const top1 = rankingAppsSemana[0] || null;
    const appsAtivos = rankingAppsSemana.length;
    const diasDecorridos = Math.max(1, hoje.getDay() + 1);
    const mediaDiaria = (total / diasDecorridos).toFixed(1);
    return { total, receita, custo, lucro, top1, appsAtivos, mediaDiaria };
  }, [ativacoesSemana, rankingAppsSemana, hoje]);

  const statsAppsMes = useMemo(() => {
    const total = ativacoesMes.length;
    const receita = ativacoesMes.reduce((s, a) => s + a.valor, 0);
    const custo = ativacoesMes.reduce((s, a) => s + a.custo, 0);
    const lucro = receita - custo;
    const top1 = rankingAppsMes[0] || null;
    const appsAtivos = rankingAppsMes.length;
    const diaAtual = hoje.getDate();
    const diasTotalMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    const mediaDiaria = (total / Math.max(1, diaAtual)).toFixed(1);
    const projecao = Math.round((total / Math.max(1, diaAtual)) * diasTotalMes);
    return { total, receita, custo, lucro, top1, appsAtivos, mediaDiaria, projecao };
  }, [ativacoesMes, rankingAppsMes, hoje]);

  // Ranking ativo conforme as abas selecionadas
  const { rankingAtivoServidores, rankingAtivoApps, rotuloAba } = useMemo(() => {
    if (aba === "diario") {
      return {
        rankingAtivoServidores: rankingServHoje,
        rankingAtivoApps: rankingAppsHoje,
        rotuloAba: "Hoje",
      };
    }
    if (aba === "semanal") {
      return {
        rankingAtivoServidores: rankingServSemana,
        rankingAtivoApps: rankingAppsSemana,
        rotuloAba: "Esta Semana",
      };
    }
    return {
      rankingAtivoServidores: rankingServMes,
      rankingAtivoApps: rankingAppsMes,
      rotuloAba: `Mês (${nomeMesAtual})`,
    };
  }, [aba, rankingServHoje, rankingServSemana, rankingServMes, rankingAppsHoje, rankingAppsSemana, rankingAppsMes, nomeMesAtual]);

  // -------------------------------------------------------------
  // EXPORTAÇÕES (PDF, Excel, PNG, Consolidado)
  // -------------------------------------------------------------
  const stamp = () => new Date().toISOString().slice(0, 10);

  const getExportSections = (): ExportSection[] => {
    if (tipoPainel === "aplicativos") {
      return [
        {
          title: "Resumo de Ativações de Aplicativos por Período",
          description: "Total de ativações, receita, despesas e lucro nos períodos diário, semanal e mensal.",
          columns: ["Período", "Ativações", "Receita", "Custo", "Lucro", "App Líder"],
          rows: [
            ["Hoje (Diário)", statsAppsHoje.total, currencyBRL(statsAppsHoje.receita), currencyBRL(statsAppsHoje.custo), currencyBRL(statsAppsHoje.lucro), statsAppsHoje.top1 ? `${statsAppsHoje.top1.nome} (${statsAppsHoje.top1.qtd})` : "—"],
            ["Esta Semana (Semanal)", statsAppsSemana.total, currencyBRL(statsAppsSemana.receita), currencyBRL(statsAppsSemana.custo), currencyBRL(statsAppsSemana.lucro), statsAppsSemana.top1 ? `${statsAppsSemana.top1.nome} (${statsAppsSemana.top1.qtd})` : "—"],
            [`Este Mês (${nomeMesAtual})`, statsAppsMes.total, currencyBRL(statsAppsMes.receita), currencyBRL(statsAppsMes.custo), currencyBRL(statsAppsMes.lucro), statsAppsMes.top1 ? `${statsAppsMes.top1.nome} (${statsAppsMes.top1.qtd})` : "—"],
          ],
        },
        {
          title: `Aplicativos Mais Ativados — ${rotuloAba}`,
          description: "Ranking de aplicativos mais ativados com faturamento e participação percentual.",
          columns: ["Posição", "Aplicativo", "Ativações", "Receita", "Lucro", "Participação (%)"],
          rows: rankingAtivoApps.map((a) => [
            `${a.posicao}º`,
            a.nome,
            a.qtd,
            currencyBRL(a.receita),
            currencyBRL(a.lucro),
            `${a.share.toFixed(1)}%`,
          ]),
        },
      ];
    }

    return [
      {
        title: "Resumo de Renovações por Período",
        description: "Total de renovações realizadas no dia, na semana e no mês atual.",
        columns: ["Período", "Total de Renovações", "Servidores Ativos", "Mais Vendido"],
        rows: [
          ["Hoje (Diário)", renovacoesHoje.length, statsServHoje.servidoresAtivos, statsServHoje.top1 ? `${statsServHoje.top1.nome} (${statsServHoje.top1.qtd})` : "—"],
          ["Esta Semana (Semanal)", renovacoesSemana.length, statsServSemana.servidoresAtivos, statsServSemana.top1 ? `${statsServSemana.top1.nome} (${statsServSemana.top1.qtd})` : "—"],
          [`Este Mês (${nomeMesAtual})`, renovacoesMes.length, statsServMes.servidoresAtivos, statsServMes.top1 ? `${statsServMes.top1.nome} (${statsServMes.top1.qtd})` : "—"],
        ],
      },
      {
        title: `Servidores Mais Vendidos — ${rotuloAba}`,
        description: `Ranking de servidores por número de renovações no período selecionado.`,
        columns: ["Posição", "Servidor", "Categoria", "Renovações", "Participação (%)"],
        rows: rankingAtivoServidores.map((s) => [
          `${s.posicao}º`,
          s.nome,
          s.categoria,
          s.qtd,
          `${s.share.toFixed(1)}%`,
        ]),
      },
    ];
  };

  const exportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      if (tipoPainel === "aplicativos") {
        const resumoRows = [
          { Período: "Hoje (Diário)", Ativações: statsAppsHoje.total, Receita: statsAppsHoje.receita, Custo: statsAppsHoje.custo, Lucro: statsAppsHoje.lucro, "Líder": statsAppsHoje.top1 ? `${statsAppsHoje.top1.nome} (${statsAppsHoje.top1.qtd})` : "—" },
          { Período: "Esta Semana (Semanal)", Ativações: statsAppsSemana.total, Receita: statsAppsSemana.receita, Custo: statsAppsSemana.custo, Lucro: statsAppsSemana.lucro, "Líder": statsAppsSemana.top1 ? `${statsAppsSemana.top1.nome} (${statsAppsSemana.top1.qtd})` : "—" },
          { Período: `Este Mês (${nomeMesAtual})`, Ativações: statsAppsMes.total, Receita: statsAppsMes.receita, Custo: statsAppsMes.custo, Lucro: statsAppsMes.lucro, "Líder": statsAppsMes.top1 ? `${statsAppsMes.top1.nome} (${statsAppsMes.top1.qtd})` : "—" },
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumoRows), "Resumo Ativações");

        const appRows = rankingAtivoApps.map((a) => ({
          Posição: `${a.posicao}º`,
          Aplicativo: a.nome,
          Ativações: a.qtd,
          Receita: a.receita,
          Lucro: a.lucro,
          "Participação (%)": Number(a.share.toFixed(1)),
        }));
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(appRows.length ? appRows : [{ Info: "Sem ativações no período" }]),
          "Apps Mais Ativados",
        );
        XLSX.writeFile(wb, `ativacoes-aplicativos-${stamp()}.xlsx`);
      } else {
        const resumoRows = [
          { Período: "Hoje (Diário)", Renovações: renovacoesHoje.length, "Servidores Ativos": statsServHoje.servidoresAtivos, "Líder": statsServHoje.top1 ? `${statsServHoje.top1.nome} (${statsServHoje.top1.qtd})` : "—" },
          { Período: "Esta Semana (Semanal)", Renovações: renovacoesSemana.length, "Servidores Ativos": statsServSemana.servidoresAtivos, "Líder": statsServSemana.top1 ? `${statsServSemana.top1.nome} (${statsServSemana.top1.qtd})` : "—" },
          { Período: `Este Mês (${nomeMesAtual})`, Renovações: renovacoesMes.length, "Servidores Ativos": statsServMes.servidoresAtivos, "Líder": statsServMes.top1 ? `${statsServMes.top1.nome} (${statsServMes.top1.qtd})` : "—" },
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumoRows), "Resumo Renovações");

        const servRows = rankingAtivoServidores.map((s) => ({
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
      }
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
      const titulo = tipoPainel === "aplicativos" ? "Performance de Ativações de Aplicativos" : "Performance de Renovações por Servidor";
      pdf.text(titulo, margin, y);
      y += 6;

      pdf.setFontSize(9);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, margin, y);
      y += 8;

      if (tipoPainel === "aplicativos") {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.setTextColor(17, 24, 39);
        pdf.text("Ativações de Apps por Período", margin, y);
        y += 6;

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(10);
        pdf.text(`• Hoje (Diário): ${statsAppsHoje.total} ativações | Receita: ${currencyBRL(statsAppsHoje.receita)} | Lucro: ${currencyBRL(statsAppsHoje.lucro)} | Líder: ${statsAppsHoje.top1?.nome || "—"}`, margin + 4, y);
        y += 5;
        pdf.text(`• Esta Semana: ${statsAppsSemana.total} ativações (~${statsAppsSemana.mediaDiaria}/dia) | Receita: ${currencyBRL(statsAppsSemana.receita)} | Lucro: ${currencyBRL(statsAppsSemana.lucro)}`, margin + 4, y);
        y += 5;
        pdf.text(`• Este Mês (${nomeMesAtual}): ${statsAppsMes.total} ativações (~${statsAppsMes.mediaDiaria}/dia) | Receita: ${currencyBRL(statsAppsMes.receita)} | Lucro: ${currencyBRL(statsAppsMes.lucro)}`, margin + 4, y);
        y += 9;

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.setTextColor(37, 99, 235);
        pdf.text(`Aplicativos Mais Ativados (${rotuloAba})`, margin, y);
        y += 6;

        pdf.setFont("helvetica", "normal");
        if (rankingAtivoApps.length === 0) {
          pdf.text("Nenhuma ativação registrada no período.", margin + 4, y);
        } else {
          rankingAtivoApps.forEach((a) => {
            pdf.text(
              `${a.posicao}º Lugar: ${a.nome} — ${a.qtd} ativação(ões) (${a.share.toFixed(1)}%) | Receita: ${currencyBRL(a.receita)} | Lucro: ${currencyBRL(a.lucro)}`,
              margin + 4,
              y,
            );
            y += 6;
          });
        }
        pdf.save(`ativacoes-aplicativos-${stamp()}.pdf`);
      } else {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.setTextColor(17, 24, 39);
        pdf.text("Total de Renovações por Período", margin, y);
        y += 6;

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(10);
        pdf.text(`• Hoje (Diário): ${renovacoesHoje.length} renovações | Líder: ${statsServHoje.top1?.nome || "—"}`, margin + 4, y);
        y += 5;
        pdf.text(`• Esta Semana: ${renovacoesSemana.length} renovações (Média ~${statsServSemana.mediaDiaria}/dia) | Líder: ${statsServSemana.top1?.nome || "—"}`, margin + 4, y);
        y += 5;
        pdf.text(`• Este Mês (${nomeMesAtual}): ${renovacoesMes.length} renovações (Média ~${statsServMes.mediaDiaria}/dia) | Líder: ${statsServMes.top1?.nome || "—"}`, margin + 4, y);
        y += 9;

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.setTextColor(37, 99, 235);
        pdf.text(`Servidores Mais Vendidos (${rotuloAba})`, margin, y);
        y += 6;

        pdf.setFont("helvetica", "normal");
        if (rankingAtivoServidores.length === 0) {
          pdf.text("Nenhuma renovação registrada no período.", margin + 4, y);
        } else {
          rankingAtivoServidores.forEach((s) => {
            pdf.text(
              `${s.posicao}º Lugar: ${s.nome} (${s.categoria}) — ${s.qtd} renovações (${s.share.toFixed(1)}% do total)`,
              margin + 4,
              y,
            );
            y += 6;
          });
        }
        pdf.save(`renovacoes-servidores-${stamp()}.pdf`);
      }

      toast.success("Relatório PDF exportado!");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao exportar PDF");
    }
  };

  const exportPNG = () => {
    try {
      const isApps = tipoPainel === "aplicativos";
      const itemsList = isApps ? rankingAtivoApps : rankingAtivoServidores;
      const scale = 2;
      const width = 800;
      const height = Math.max(360, 240 + itemsList.length * 20);
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
      ctx.fillText(isApps ? "Performance de Ativações de Aplicativos" : "Performance de Renovações por Servidor", 25, y);
      y += 18;

      ctx.fillStyle = "#6b7280";
      ctx.font = "11px Arial";
      ctx.fillText(`Exportado em ${new Date().toLocaleString("pt-BR")}`, 25, y);
      y += 22;

      ctx.fillStyle = "#10b981";
      ctx.font = "bold 12px Arial";
      if (isApps) {
        ctx.fillText(`• Hoje: ${statsAppsHoje.total} ativações | Receita: ${currencyBRL(statsAppsHoje.receita)} | Lucro: ${currencyBRL(statsAppsHoje.lucro)}`, 25, y);
        y += 18;
        ctx.fillStyle = "#f59e0b";
        ctx.fillText(`• Esta Semana: ${statsAppsSemana.total} ativações (Média ~${statsAppsSemana.mediaDiaria}/dia) | Receita: ${currencyBRL(statsAppsSemana.receita)}`, 25, y);
        y += 18;
        ctx.fillStyle = "#3b82f6";
        ctx.fillText(`• Este Mês (${nomeMesAtual}): ${statsAppsMes.total} ativações | Receita: ${currencyBRL(statsAppsMes.receita)} | Lucro: ${currencyBRL(statsAppsMes.lucro)}`, 25, y);
      } else {
        ctx.fillText(`• Hoje: ${renovacoesHoje.length} renovações | Líder: ${statsServHoje.top1?.nome || "—"}`, 25, y);
        y += 18;
        ctx.fillStyle = "#f59e0b";
        ctx.fillText(`• Esta Semana: ${renovacoesSemana.length} renovações (Média ~${statsServSemana.mediaDiaria}/dia)`, 25, y);
        y += 18;
        ctx.fillStyle = "#3b82f6";
        ctx.fillText(`• Este Mês (${nomeMesAtual}): ${renovacoesMes.length} renovações (Média ~${statsMes.mediaDiaria}/dia)`, 25, y);
      }
      y += 26;

      ctx.fillStyle = "#2563eb";
      ctx.font = "bold 13px Arial";
      ctx.fillText(isApps ? `Aplicativos Mais Ativados — ${rotuloAba}:` : `Servidores Mais Vendidos — ${rotuloAba}:`, 25, y);
      y += 20;

      ctx.fillStyle = "#111827";
      ctx.font = "11px Arial";
      if (itemsList.length === 0) {
        ctx.fillText("Sem registros no período.", 25, y);
      } else {
        itemsList.forEach((item: any) => {
          const info = isApps
            ? `${item.posicao}º Lugar: ${item.nome} — ${item.qtd} ativação(ões) (${item.share.toFixed(1)}%) | Lucro: ${currencyBRL(item.lucro)}`
            : `${item.posicao}º Lugar: ${item.nome} (${item.categoria}) — ${item.qtd} renovações (${item.share.toFixed(1)}%)`;
          ctx.fillText(info, 25, y);
          y += 18;
        });
      }

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = isApps ? `ativacoes-aplicativos-${stamp()}.png` : `renovacoes-servidores-${stamp()}.png`;
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
          CABEÇALHO COM SELEÇÃO PRINCIPAL, ABAS TEMPORAIS E EXPORTAÇÃO
      ========================================================= */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-2.5 border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
            {tipoPainel === "servidores" ? <Zap className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-bold tracking-tight">
                {tipoPainel === "servidores" ? "Performance de Renovações" : "Performance de Ativações"}
              </h2>
              {/* Botões de troca de visão (Servidores / Aplicativos) */}
              <div className="inline-flex rounded-lg border border-border/70 p-0.5 bg-muted/60">
                <button
                  type="button"
                  onClick={() => setTipoPainel("servidores")}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-md transition",
                    tipoPainel === "servidores"
                      ? "bg-background text-primary shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Server className="h-3 w-3" /> Servidores
                </button>
                <button
                  type="button"
                  onClick={() => setTipoPainel("aplicativos")}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-md transition",
                    tipoPainel === "aplicativos"
                      ? "bg-background text-primary shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Smartphone className="h-3 w-3 text-cyan-400" /> Ativação de Apps
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {tipoPainel === "servidores"
                ? "Acompanhamento diário, semanal e mensal com ranking de servidores mais vendidos."
                : "Acompanhamento diário, semanal e mensal de ativação de aplicativos com receita e lucro."}
            </p>
          </div>
        </div>

        {/* Abas temporais e botões de exportação */}
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
              reportName={tipoPainel === "aplicativos" ? "Ativações de Aplicativos" : "Renovações por Servidor"}
              sections={getExportSections}
              label="Exportar"
            />
          </div>
        </div>
      </div>

      {/* =========================================================
          CONTEÚDO: SERVIDORES OU APLICATIVOS
      ========================================================= */}
      {tipoPainel === "servidores" ? (
        /* ==================== VISÃO SERVIDORES ==================== */
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
                  {statsServHoje.total}
                </div>
                <div className="text-xs text-muted-foreground font-semibold mt-0.5">renovações hoje</div>
              </div>

              <div className="pt-2 border-t border-border/50 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-muted-foreground text-[11px] flex items-center gap-1">
                    <Flame className="h-3 w-3 text-amber-400" /> Mais vendido:
                  </span>
                  <span className="font-bold text-foreground text-[11px] truncate max-w-[110px]" title={statsServHoje.top1?.nome}>
                    {statsServHoje.top1 ? statsServHoje.top1.nome : "—"}
                  </span>
                </div>
                {statsServHoje.top1 && (
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Volume do líder:</span>
                    <span className="font-semibold text-emerald-400">{statsServHoje.top1.qtd} ({statsServHoje.top1.share.toFixed(0)}%)</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5 border-t border-border/30">
                  <span>Servidores ativos:</span>
                  <span className="font-semibold text-foreground">{statsServHoje.servidoresAtivos}</span>
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
                  {statsServSemana.total}
                </div>
                <div className="text-xs text-muted-foreground font-semibold mt-0.5">renovações na semana</div>
              </div>

              <div className="pt-2 border-t border-border/50 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-muted-foreground text-[11px] flex items-center gap-1">
                    <Flame className="h-3 w-3 text-amber-400" /> Mais vendido:
                  </span>
                  <span className="font-bold text-foreground text-[11px] truncate max-w-[110px]" title={statsServSemana.top1?.nome}>
                    {statsServSemana.top1 ? statsServSemana.top1.nome : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Média por dia:</span>
                  <span className="font-semibold text-amber-400">~{statsServSemana.mediaDiaria} / dia</span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5 border-t border-border/30">
                  <span>Servidores ativos:</span>
                  <span className="font-semibold text-foreground">{statsServSemana.servidoresAtivos}</span>
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
                  {statsServMes.total}
                </div>
                <div className="text-xs text-muted-foreground font-semibold mt-0.5">renovações no mês</div>
              </div>

              <div className="pt-2 border-t border-border/50 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-muted-foreground text-[11px] flex items-center gap-1">
                    <Flame className="h-3 w-3 text-amber-400" /> Mais vendido:
                  </span>
                  <span className="font-bold text-foreground text-[11px] truncate max-w-[110px]" title={statsServMes.top1?.nome}>
                    {statsServMes.top1 ? statsServMes.top1.nome : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Média diária:</span>
                  <span className="font-semibold text-blue-400">~{statsServMes.mediaDiaria} / dia</span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5 border-t border-border/30">
                  <span>Projeção mês:</span>
                  <span className="font-semibold text-foreground">~{statsServMes.projecao} renov.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Coluna da Direita: Servidores Mais Vendidos (5 Colunas) */}
          <div className="lg:col-span-5 rounded-xl border border-border/60 bg-background/60 p-3 space-y-2 flex flex-col justify-between">
            <div className="flex items-center justify-between pb-1.5 border-b border-border/40">
              <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Award className="h-4 w-4 text-amber-400 shrink-0" /> Servidores Mais Vendidos
              </h3>
              <Badge variant="secondary" className="text-[10px] h-4.5 px-2 font-semibold">
                {rotuloAba} ({rankingAtivoServidores.length} servidores)
              </Badge>
            </div>

            {rankingAtivoServidores.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground font-medium">
                Nenhuma renovação registrada para {rotuloAba.toLowerCase()}.
              </div>
            ) : (
              <div className="max-h-[175px] overflow-y-auto pr-1 space-y-1.5">
                {rankingAtivoServidores.map((serv) => {
                  const isTop1 = serv.posicao === 1;
                  const isTop2 = serv.posicao === 2;
                  const isTop3 = serv.posicao === 3;
                  const catStyle = CATEGORIA_CORES[serv.categoria] || CATEGORIA_CORES.IPTV;

                  return (
                    <div
                      key={serv.nome}
                      className="flex items-center justify-between gap-2 p-1.5 px-2.5 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/40 transition"
                    >
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
      ) : (
        /* ==================== VISÃO ATIVAÇÃO DE APLICATIVOS ==================== */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* Coluna da Esquerda: 3 Subdivisões de Ativações (7 Colunas) */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* Card Diário Apps */}
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
                  {statsAppsHoje.total}
                </div>
                <div className="text-xs text-muted-foreground font-semibold mt-0.5">ativações hoje</div>
              </div>

              <div className="pt-2 border-t border-border/50 space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-[11px]">Receita:</span>
                  <span className="font-bold text-emerald-400">{currencyBRL(statsAppsHoje.receita)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-[11px]">Lucro Líquido:</span>
                  <span className="font-bold text-blue-400">{currencyBRL(statsAppsHoje.lucro)}</span>
                </div>
                <div className="flex items-center justify-between pt-0.5 border-t border-border/30 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Flame className="h-3 w-3 text-amber-400" /> App líder:
                  </span>
                  <span className="font-semibold text-foreground truncate max-w-[90px]" title={statsAppsHoje.top1?.nome}>
                    {statsAppsHoje.top1 ? statsAppsHoje.top1.nome : "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* Card Semanal Apps */}
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
                  {statsAppsSemana.total}
                </div>
                <div className="text-xs text-muted-foreground font-semibold mt-0.5">ativações na semana</div>
              </div>

              <div className="pt-2 border-t border-border/50 space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-[11px]">Receita:</span>
                  <span className="font-bold text-emerald-400">{currencyBRL(statsAppsSemana.receita)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-[11px]">Lucro Líquido:</span>
                  <span className="font-bold text-blue-400">{currencyBRL(statsAppsSemana.lucro)}</span>
                </div>
                <div className="flex items-center justify-between pt-0.5 border-t border-border/30 text-[10px] text-muted-foreground">
                  <span>Média / dia:</span>
                  <span className="font-semibold text-amber-400">~{statsAppsSemana.mediaDiaria} / dia</span>
                </div>
              </div>
            </div>

            {/* Card Mensal Apps */}
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
                  {statsAppsMes.total}
                </div>
                <div className="text-xs text-muted-foreground font-semibold mt-0.5">ativações no mês</div>
              </div>

              <div className="pt-2 border-t border-border/50 space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-[11px]">Receita:</span>
                  <span className="font-bold text-emerald-400">{currencyBRL(statsAppsMes.receita)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-[11px]">Lucro Líquido:</span>
                  <span className="font-bold text-blue-400">{currencyBRL(statsAppsMes.lucro)}</span>
                </div>
                <div className="flex items-center justify-between pt-0.5 border-t border-border/30 text-[10px] text-muted-foreground">
                  <span>Projeção mês:</span>
                  <span className="font-semibold text-foreground">~{statsAppsMes.projecao} ativ.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Coluna da Direita: Aplicativos Mais Ativados (5 Colunas) */}
          <div className="lg:col-span-5 rounded-xl border border-border/60 bg-background/60 p-3 space-y-2 flex flex-col justify-between">
            <div className="flex items-center justify-between pb-1.5 border-b border-border/40">
              <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Smartphone className="h-4 w-4 text-cyan-400 shrink-0" /> Aplicativos Mais Ativados
              </h3>
              <Badge variant="secondary" className="text-[10px] h-4.5 px-2 font-semibold">
                {rotuloAba} ({rankingAtivoApps.length} apps)
              </Badge>
            </div>

            {rankingAtivoApps.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground font-medium">
                Nenhuma ativação registrada para {rotuloAba.toLowerCase()}.
              </div>
            ) : (
              <div className="max-h-[175px] overflow-y-auto pr-1 space-y-1.5">
                {rankingAtivoApps.map((app) => {
                  const isTop1 = app.posicao === 1;
                  const isTop2 = app.posicao === 2;
                  const isTop3 = app.posicao === 3;

                  return (
                    <div
                      key={app.nome}
                      className="flex items-center justify-between gap-2 p-1.5 px-2.5 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/40 transition"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={cn(
                            "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0",
                            isTop1 && "bg-cyan-400/20 text-cyan-400 border border-cyan-400/50",
                            isTop2 && "bg-slate-400/20 text-slate-300 border border-slate-400/50",
                            isTop3 && "bg-amber-700/20 text-amber-600 border border-amber-700/50",
                            !isTop1 && !isTop2 && !isTop3 && "bg-muted text-muted-foreground border border-border/50",
                          )}
                        >
                          {app.posicao}º
                        </div>
                        <span className="font-bold text-xs sm:text-sm text-foreground truncate">{app.nome}</span>
                        <Badge
                          variant="outline"
                          className="text-[9px] h-4 px-1.5 font-semibold border-cyan-500/40 text-cyan-400 bg-cyan-500/10"
                        >
                          {currencyBRL(app.lucro)} lucro
                        </Badge>
                      </div>

                      <div className="text-right shrink-0 text-xs">
                        <span className="font-extrabold text-foreground tabular-nums text-xs sm:text-sm">{app.qtd}</span>
                        <span className="text-[11px] text-muted-foreground ml-1 font-medium">
                          ativ. ({app.share.toFixed(0)}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

