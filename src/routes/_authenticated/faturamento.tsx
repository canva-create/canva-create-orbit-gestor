import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatCard } from "@/components/stat-card";
import { COMPACT_TABLE_CLASS } from "@/components/density-toggle";
import {
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Users,
  Wallet,
  TrendingUp,
  CalendarDays,
  Calculator,
  FileText,
  FileSpreadsheet,
  FileDown,
  FileImage,
  FileType,
  ArrowDownToLine,
  RotateCcw,
  Sparkles,
  Save,
  CheckCircle2,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { APP_NAME } from "@/lib/app-version";
import {
  exportPDF,
  exportPNG,
  exportTXT,
  exportXLSX,
  exportDOCX,
  type PagamentoRow,
  type PagamentoResumo,
} from "@/lib/pagamentos-export";
import { toast } from "sonner";
import { currencyBRL, formatDateBR } from "@/lib/iptv";
import { confirmDialog } from "@/lib/confirm";
import { logAudit } from "@/lib/audit";
import {
  fetchFuncionarios,
  fetchFinanceiro,
  agruparPorDia,
  apurarMes,
  diasNoMes,
  localISODate,
  type Funcionario,
} from "@/lib/faturamento";

export const Route = createFileRoute("/_authenticated/faturamento")({
  head: () => ({
    meta: [
      { title: "Pagamento de Funcionários — Rodolfo TV" },
      { name: "description", content: "Cadastro de funcionários e planilha de pagamentos com comissões e diárias mínimas." },
      { property: "og:title", content: "Pagamento de Funcionários — Rodolfo TV" },
      { property: "og:description", content: "Cadastro de funcionários e planilha de pagamentos com comissões e diárias mínimas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FaturamentoPage,
});

const emptyForm = {
  nome: "",
  cargo: "",
  data_admissao: "",
  salario_fixo: "0",
  diaria_minima: "50",
  percentual: "5",
  base_calculo: "faturamento" as "faturamento" | "lucro",
  ativo: true,
};

function FaturamentoPage() {
  const qc = useQueryClient();
  const { data: funcionarios = [], isFetching: loadingF } = useQuery({
    queryKey: ["funcionarios"],
    queryFn: fetchFuncionarios,
  });
  const { data: financeiro = [], isFetching: loadingFin } = useQuery({
    queryKey: ["faturamento_bruto_dia"],
    queryFn: fetchFinanceiro,
  });

  const porDia = useMemo(() => agruparPorDia(financeiro as any[]), [financeiro]);

  const hoje = new Date();
  const [subAba, setSubAba] = useState<"automatico" | "manual">("automatico");
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [selId, setSelId] = useState<string | null>(null);
  const [valorLote, setValorLote] = useState<string>("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Funcionario | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const STORAGE_KEYS = ["rodolfo_folha_manual_dados", "orbit_folha_manual_dados"];

  // Armazenamento local para registros manuais do dia a dia
  const [manualMap, setManualMap] = useState<Record<string, number>>(() => {
    try {
      for (const k of STORAGE_KEYS) {
        const raw = localStorage.getItem(k);
        if (raw) return JSON.parse(raw);
      }
      return {};
    } catch {
      return {};
    }
  });

  const [draftInputs, setDraftInputs] = useState<Record<string, string>>({});

  const selecionado = useMemo(
    () => funcionarios.find((f) => f.id === selId) ?? funcionarios[0] ?? null,
    [funcionarios, selId],
  );

  /* ---------- Helpers de dados manuais ---------- */
  const getManualKey = (d: number, fId?: string) => {
    const idFunc = fId || selecionado?.id || "global";
    return `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}_${idFunc}`;
  };

  const getManualValor = (d: number, fId?: string) => {
    const k = getManualKey(d, fId);
    if (manualMap[k] !== undefined) return manualMap[k];
    const kGlobal = `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}_global`;
    if (manualMap[kGlobal] !== undefined) return manualMap[kGlobal];
    return 0;
  };

  const setManualValor = (d: number, v: number, fId?: string) => {
    const k = getManualKey(d, fId);
    setManualMap((prev) => {
      const novo = { ...prev, [k]: v };
      try {
        STORAGE_KEYS.forEach((storageKey) => localStorage.setItem(storageKey, JSON.stringify(novo)));
      } catch (e) {
        console.error("Erro ao salvar no localStorage:", e);
      }
      return novo;
    });
  };

  const salvarManuaisAgora = () => {
    try {
      STORAGE_KEYS.forEach((storageKey) => localStorage.setItem(storageKey, JSON.stringify(manualMap)));
      toast.success("Todos os lançamentos manuais foram salvos com sucesso!");
    } catch (e: any) {
      toast.error("Erro ao salvar lançamentos: " + e?.message);
    }
  };

  const puxarDoAutomatico = () => {
    if (!selecionado) return;
    const total = diasNoMes(ano, mes);
    const novo = { ...manualMap };
    for (let d = 1; d <= total; d++) {
      const data = `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const agg = porDia[data] ?? { faturamento: 0, lucro: 0 };
      const base = selecionado.base_calculo === "lucro" ? agg.lucro : agg.faturamento;
      const k = getManualKey(d);
      novo[k] = base;
    }
    setManualMap(novo);
    setDraftInputs({});
    try {
      STORAGE_KEYS.forEach((storageKey) => localStorage.setItem(storageKey, JSON.stringify(novo)));
    } catch (e) {
      console.error(e);
    }
    toast.success("Valores do faturamento automático copiados para a planilha manual e salvos!");
  };

  const aplicarValorEmLote = () => {
    const num = Number(String(valorLote).trim().replace(/\s/g, "").replace(",", "."));
    if (isNaN(num) || num < 0) {
      return toast.error("Informe um valor válido para preencher em lote.");
    }
    const total = diasNoMes(ano, mes);
    const novo = { ...manualMap };
    for (let d = 1; d <= total; d++) {
      const k = getManualKey(d);
      novo[k] = num;
    }
    setManualMap(novo);
    setDraftInputs({});
    try {
      STORAGE_KEYS.forEach((storageKey) => localStorage.setItem(storageKey, JSON.stringify(novo)));
    } catch (e) {
      console.error(e);
    }
    toast.success(`Todos os ${total} dias preenchidos com ${currencyBRL(num)} e salvos!`);
    setValorLote("");
  };

  const zerarMesManual = async () => {
    const ok = await confirmDialog({
      title: "Zerar lançamentos manuais?",
      description: `Deseja zerar todos os lançamentos manuais de ${meses[mes - 1]}/${ano} para ${selecionado?.nome || "este funcionário"}?`,
      confirmText: "Zerar",
      destructive: true,
    });
    if (!ok) return;
    const total = diasNoMes(ano, mes);
    const novo = { ...manualMap };
    for (let d = 1; d <= total; d++) {
      const k = getManualKey(d);
      delete novo[k];
    }
    setManualMap(novo);
    setDraftInputs({});
    try {
      STORAGE_KEYS.forEach((storageKey) => localStorage.setItem(storageKey, JSON.stringify(novo)));
    } catch (e) {
      console.error(e);
    }
    toast.success("Lançamentos manuais do mês zerados!");
  };

  /* ---------- Apuração MODO AUTOMÁTICO ---------- */
  const linhasAuto = useMemo(
    () => (selecionado ? apurarMes(selecionado, porDia, ano, mes) : []),
    [selecionado, porDia, ano, mes],
  );

  const resumoAuto = useMemo(() => {
    if (!selecionado) return null;
    const total = diasNoMes(ano, mes);
    const hojeISO = localISODate(hoje);
    const mesAtual = `${ano}-${String(mes).padStart(2, "0")}` === hojeISO.slice(0, 7);
    const decorridos = mesAtual ? Math.min(total, Number(hojeISO.slice(8, 10))) : total;
    const acumulado = linhasAuto.reduce((s, l) => s + l.considerado, 0);
    const fatMes = linhasAuto.reduce((s, l) => s + l.faturamento, 0);
    const mediaDiaria = decorridos > 0 ? fatMes / decorridos : 0;
    
    // Autosoma de todas as comissões do dia geradas até o momento
    const totalComissoes = linhasAuto.filter((l) => !l.futuro).reduce((s, l) => s + l.comissao, 0);
    // Média de Comissão do Dia = soma de todas as comissões dividida pelo total de dias decorridos
    const mediaComissaoDia = decorridos > 0 ? totalComissoes / decorridos : 0;
    
    const fixo = Number(selecionado.salario_fixo || 0);
    // Total previsto = média vezes o total de dias do mês mais o salário fixo
    const totalPrevisto = (mediaComissaoDia * total) + fixo;

    const totalDiariaMinima = linhasAuto.filter((l) => !l.futuro).reduce((s, l) => s + l.diaria, 0);

    return {
      total,
      decorridos,
      acumulado,
      fatMes,
      mediaDiaria,
      totalComissoes,
      mediaComissaoDia,
      fixo,
      totalPrevisto,
      totalDiariaMinima,
      diariasAplicadas: linhasAuto.filter((l) => l.usouDiaria).length,
      comissoes: totalComissoes,
      diarias: linhasAuto.filter((l) => l.usouDiaria).reduce((s, l) => s + l.diaria, 0),
    };
  }, [linhasAuto, selecionado, ano, mes]);

  const totalRecebidoAuto = useMemo(() => {
    if (!resumoAuto) return 0;
    const fixoProporcional = resumoAuto.total > 0 ? (resumoAuto.fixo * resumoAuto.decorridos) / resumoAuto.total : 0;
    return fixoProporcional + resumoAuto.acumulado;
  }, [resumoAuto]);

  const pagamentosAuto: PagamentoRow[] = useMemo(() => {
    if (!selecionado) return [];
    const pct = Number(selecionado.percentual || 0);
    const baseLabel = selecionado.base_calculo === "lucro" ? "lucro" : "faturamento";
    return linhasAuto.map((l) => {
      let descricao: string;
      if (l.futuro) {
        descricao = "Dia futuro — sem lançamento de pagamento";
      } else if (l.usouDiaria) {
        descricao = `Diária mínima garantida (${currencyBRL(l.diaria)}) — comissão de ${pct}% sobre ${baseLabel} do dia (${currencyBRL(l.base)}) resultou em ${currencyBRL(l.comissao)}, valor inferior à diária`;
      } else if (l.considerado > 0) {
        descricao = `Comissão de ${pct}% sobre ${baseLabel} do dia (${currencyBRL(l.base)}) = ${currencyBRL(l.comissao)} — superior à diária mínima de ${currencyBRL(l.diaria)}`;
      } else {
        descricao = "Sem movimentação e sem diária mínima configurada";
      }
      return {
        dia: l.dia,
        faturamento: l.base,
        diaria: l.diaria,
        comissao: l.comissao,
        considerado: l.considerado,
        acumulado: l.acumulado,
        descricao,
      };
    });
  }, [linhasAuto, selecionado]);

  /* ---------- Apuração MODO MANUAL ---------- */
  const linhasManual = useMemo(() => {
    if (!selecionado) return [];
    const total = diasNoMes(ano, mes);
    const porDiaManual: Record<string, { faturamento: number; lucro: number }> = {};
    for (let d = 1; d <= total; d++) {
      const data = `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const v = getManualValor(d);
      porDiaManual[data] = { faturamento: v, lucro: v };
    }
    return apurarMes(selecionado, porDiaManual, ano, mes);
  }, [selecionado, manualMap, ano, mes]);

  const resumoManual = useMemo(() => {
    if (!selecionado) return null;
    const total = diasNoMes(ano, mes);
    const hojeISO = localISODate(hoje);
    const mesAtual = `${ano}-${String(mes).padStart(2, "0")}` === hojeISO.slice(0, 7);
    const decorridos = mesAtual ? Math.min(total, Number(hojeISO.slice(8, 10))) : total;
    const acumulado = linhasManual.reduce((s, l) => s + l.considerado, 0);
    const fatMes = linhasManual.reduce((s, l) => s + l.faturamento, 0);
    const mediaDiaria = decorridos > 0 ? fatMes / decorridos : 0;
    
    // Autosoma de todas as comissões do dia geradas até o momento
    const totalComissoes = linhasManual.filter((l) => !l.futuro).reduce((s, l) => s + l.comissao, 0);
    // Média de Comissão do Dia = soma de todas as comissões dividida pelo total de dias decorridos
    const mediaComissaoDia = decorridos > 0 ? totalComissoes / decorridos : 0;
    
    const fixo = Number(selecionado.salario_fixo || 0);
    // Total previsto = média vezes o total de dias do mês mais o salário fixo
    const totalPrevisto = (mediaComissaoDia * total) + fixo;

    const totalDiariaMinima = linhasManual.filter((l) => !l.futuro).reduce((s, l) => s + l.diaria, 0);

    return {
      total,
      decorridos,
      acumulado,
      fatMes,
      mediaDiaria,
      totalComissoes,
      mediaComissaoDia,
      fixo,
      totalPrevisto,
      totalDiariaMinima,
      diariasAplicadas: linhasManual.filter((l) => l.usouDiaria).length,
      comissoes: totalComissoes,
      diarias: linhasManual.filter((l) => l.usouDiaria).reduce((s, l) => s + l.diaria, 0),
    };
  }, [linhasManual, selecionado, ano, mes]);

  const totalRecebidoManual = useMemo(() => {
    if (!resumoManual) return 0;
    const fixoProporcional = resumoManual.total > 0 ? (resumoManual.fixo * resumoManual.decorridos) / resumoManual.total : 0;
    return fixoProporcional + resumoManual.acumulado;
  }, [resumoManual]);

  const pagamentosManual: PagamentoRow[] = useMemo(() => {
    if (!selecionado) return [];
    const pct = Number(selecionado.percentual || 0);
    const baseLabel = selecionado.base_calculo === "lucro" ? "lucro" : "faturamento";
    return linhasManual.map((l) => {
      let descricao: string;
      if (l.futuro) {
        descricao = "Dia futuro — sem lançamento de pagamento";
      } else if (l.usouDiaria) {
        descricao = `Diária mínima garantida (${currencyBRL(l.diaria)}) — comissão de ${pct}% sobre ${baseLabel} manual (${currencyBRL(l.base)}) resultou em ${currencyBRL(l.comissao)}, valor inferior à diária`;
      } else if (l.considerado > 0) {
        descricao = `Comissão de ${pct}% sobre ${baseLabel} manual (${currencyBRL(l.base)}) = ${currencyBRL(l.comissao)} — superior à diária mínima de ${currencyBRL(l.diaria)}`;
      } else {
        descricao = "Sem valor lançado e sem diária mínima configurada";
      }
      return {
        dia: l.dia,
        faturamento: l.base,
        diaria: l.diaria,
        comissao: l.comissao,
        considerado: l.considerado,
        acumulado: l.acumulado,
        descricao,
      };
    });
  }, [linhasManual, selecionado]);

  /* ---------- Exportação ---------- */
  function resumoExport(isManual: boolean): PagamentoResumo {
    const res = isManual ? resumoManual : resumoAuto;
    const totRec = isManual ? totalRecebidoManual : totalRecebidoAuto;
    return {
      funcionario: selecionado?.nome ?? "—",
      cargo: selecionado?.cargo ?? "",
      periodo: `${meses[mes - 1]}/${ano}${isManual ? " (Lançamento Manual)" : ""}`,
      salarioFixo: res?.fixo ?? 0,
      mediaComissaoDia: res?.mediaComissaoDia ?? 0,
      totalRecebido: totRec,
      totalPrevisto: res?.totalPrevisto ?? 0,
    };
  }

  async function exportar(tipo: "pdf" | "xlsx" | "txt" | "docx" | "png", isManual: boolean) {
    if (!selecionado) return;
    try {
      const res = resumoExport(isManual);
      const rows = isManual ? pagamentosManual : pagamentosAuto;
      if (tipo === "pdf") exportPDF(rows, res);
      else if (tipo === "xlsx") exportXLSX(rows, res);
      else if (tipo === "txt") exportTXT(rows, res);
      else if (tipo === "png") exportPNG(rows, res);
      else await exportDOCX(rows, res);
      toast.success(`Planilha ${isManual ? "manual" : "automática"} exportada (${tipo.toUpperCase()}).`);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao exportar.");
    }
  }

  /* ---------- CRUD de Funcionários ---------- */
  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm });
    setOpen(true);
  }

  function openEdit(f: Funcionario) {
    setEditing(f);
    setForm({
      nome: f.nome ?? "",
      cargo: f.cargo ?? "",
      data_admissao: f.data_admissao ?? "",
      salario_fixo: String(f.salario_fixo ?? 0),
      diaria_minima: String(f.diaria_minima ?? 0),
      percentual: String(f.percentual ?? 0),
      base_calculo: (f.base_calculo as any) ?? "faturamento",
      ativo: !!f.ativo,
    });
    setOpen(true);
  }

  async function salvar() {
    if (!form.nome.trim()) return toast.error("Informe o nome do funcionário.");
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;
    const payload: any = {
      nome: form.nome.trim(),
      cargo: form.cargo.trim() || null,
      data_admissao: form.data_admissao || null,
      salario_fixo: Number(form.salario_fixo) || 0,
      diaria_minima: Number(form.diaria_minima) || 0,
      percentual: Number(form.percentual) || 0,
      base_calculo: form.base_calculo,
      ativo: form.ativo,
    };
    if (editing) {
      const { error } = await supabase.from("funcionarios").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      await logAudit({
        categoria: "financeiro",
        acao: "editar",
        entidade: "funcionario",
        entidade_id: editing.id,
        descricao: `Funcionário atualizado: ${payload.nome}`,
        dados_novos: payload,
        dados_anteriores: editing as any,
      });
    } else {
      const { data, error } = await supabase.from("funcionarios").insert({ ...payload, user_id: user.id }).select().single();
      if (error) return toast.error(error.message);
      await logAudit({
        categoria: "financeiro",
        acao: "criar",
        entidade: "funcionario",
        entidade_id: data?.id,
        descricao: `Funcionário cadastrado: ${payload.nome}`,
        dados_novos: payload,
      });
    }
    setOpen(false);
    toast.success("Funcionário salvo.");
    qc.invalidateQueries({ queryKey: ["funcionarios"] });
  }

  async function excluir(f: Funcionario) {
    const ok = await confirmDialog(`Excluir o funcionário "${f.nome}"?`);
    if (!ok) return;
    const { error } = await supabase.from("funcionarios").delete().eq("id", f.id);
    if (error) return toast.error(error.message);
    await logAudit({
      categoria: "financeiro",
      acao: "excluir",
      entidade: "funcionario",
      entidade_id: f.id,
      descricao: `Funcionário excluído: ${f.nome}`,
      dados_anteriores: f as any,
    });
    toast.success("Funcionário excluído.");
    qc.invalidateQueries({ queryKey: ["funcionarios"] });
  }

  function atualizar() {
    qc.invalidateQueries({ queryKey: ["funcionarios"] });
    qc.invalidateQueries({ queryKey: ["faturamento_bruto_dia"] });
    toast.success("Dados sincronizados.");
  }

  const meses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const anos = Array.from({ length: 5 }, (_, i) => hoje.getFullYear() - 3 + i);

  return (
    <div className="p-6 space-y-6">
      {/* Abas no Topo */}
      <Tabs value={subAba} onValueChange={(v) => setSubAba(v as "automatico" | "manual")} className="w-full space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap pb-4 border-b">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> Pagamento de Funcionários
            </h1>
            <p className="text-xs text-muted-foreground">
              Cadastro de funcionários e apuração de pagamentos com comissões, diárias e projeções.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <TabsList className="h-9 bg-muted/80 p-1">
              <TabsTrigger value="automatico" className="text-xs flex items-center gap-1.5 px-3">
                <Calculator className="h-3.5 w-3.5" /> Automático (Sistema)
              </TabsTrigger>
              <TabsTrigger value="manual" className="text-xs flex items-center gap-1.5 px-3">
                <Pencil className="h-3.5 w-3.5 text-primary" /> Manual (Lançamento Diário)
              </TabsTrigger>
            </TabsList>
            <Button size="sm" variant="outline" onClick={atualizar} disabled={loadingF || loadingFin}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loadingF || loadingFin ? "animate-spin" : ""}`} /> Atualizar
            </Button>
            <Button size="sm" onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" /> Novo funcionário
            </Button>
          </div>
        </div>

        {/* Cadastro de funcionários (comum às duas abas) */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Cadastro de Funcionários</h2>
            <Badge variant="secondary" className="ml-1">{funcionarios.length}</Badge>
          </div>
          <div className="max-h-[320px] overflow-auto rounded-md border">
            <Table className={COMPACT_TABLE_CLASS}>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Admissão</TableHead>
                  <TableHead className="text-right">Salário fixo</TableHead>
                  <TableHead className="text-right">Diária mín.</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead>Base</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {funcionarios.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                      Nenhum funcionário cadastrado.
                    </TableCell>
                  </TableRow>
                )}
                {funcionarios.map((f) => (
                  <TableRow
                    key={f.id}
                    className={`cursor-pointer transition-colors ${selecionado?.id === f.id ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-muted/50"}`}
                    onClick={() => setSelId(f.id)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {selecionado?.id === f.id && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                        <span>{f.nome}</span>
                      </div>
                    </TableCell>
                    <TableCell>{f.cargo || "—"}</TableCell>
                    <TableCell>{f.data_admissao ? formatDateBR(f.data_admissao) : "—"}</TableCell>
                    <TableCell className="text-right">{currencyBRL(Number(f.salario_fixo))}</TableCell>
                    <TableCell className="text-right">{currencyBRL(Number(f.diaria_minima))}</TableCell>
                    <TableCell className="text-right">{Number(f.percentual)}%</TableCell>
                    <TableCell>
                      <Badge variant="outline">{f.base_calculo === "lucro" ? "Lucro" : "Faturamento"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={f.ativo ? "default" : "secondary"}>{f.ativo ? "Ativo" : "Inativo"}</Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(f); }} title="Editar funcionário">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); excluir(f); }} title="Excluir funcionário">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* SUB-ABA 1: AUTOMÁTICO (SISTEMA) */}
        <TabsContent value="automatico" className="space-y-6 mt-0">
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4 text-primary" />
                <h2 className="font-semibold text-sm">Planilha de Pagamentos (Faturamento Automático do Sistema)</h2>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={selecionado?.id ?? ""} onValueChange={setSelId}>
                  <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Funcionário" /></SelectTrigger>
                  <SelectContent>
                    {funcionarios.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                  <SelectTrigger className="h-9 w-[130px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {meses.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
                  <SelectTrigger className="h-9 w-[95px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {anos.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" disabled={!selecionado}><FileDown className="h-4 w-4 mr-1" /> Exportar</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => exportar("pdf", false)}><FileText className="h-4 w-4 mr-2" /> PDF</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportar("xlsx", false)}><FileSpreadsheet className="h-4 w-4 mr-2" /> Excel (.xlsx)</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportar("txt", false)}><FileDown className="h-4 w-4 mr-2" /> TXT</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportar("docx", false)}><FileType className="h-4 w-4 mr-2" /> Word (.docx)</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportar("png", false)}><FileImage className="h-4 w-4 mr-2" /> PNG</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {!selecionado ? (
              <div className="text-sm text-muted-foreground py-6 text-center">
                Cadastre ou selecione um funcionário para ver a planilha de pagamentos.
              </div>
            ) : (
              <>
                <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 mb-3">
                  <StatCard size="sm" label="Salário fixo" value={currencyBRL(resumoAuto!.fixo)} icon={Wallet} tone="purple" />
                  <StatCard size="sm" label="Autosoma Comissões" value={currencyBRL(resumoAuto!.totalComissoes)} icon={TrendingUp} tone="green" sub={`${linhasAuto.filter(l => !l.futuro).length} dia(s) calculados`} />
                  <StatCard size="sm" label="Diárias mínimas" value={currencyBRL(resumoAuto!.diarias)} icon={CalendarDays} tone="orange" sub={`${resumoAuto!.diariasAplicadas} dia(s) aplicadas`} />
                  <StatCard size="sm" label="Acumulado variável" value={currencyBRL(resumoAuto!.acumulado)} icon={Calculator} tone="blue" sub="Total considerado" />
                  <StatCard size="sm" label="Média Comissão / Dia" value={currencyBRL(resumoAuto!.mediaComissaoDia)} icon={TrendingUp} tone="yellow" sub={`Média (${resumoAuto!.decorridos}d)`} />
                  <StatCard size="sm" label="Total recebido" value={currencyBRL(totalRecebidoAuto)} icon={Wallet} tone="green" sub="Fixo prop. + Variável" />
                  <StatCard size="sm" label="Total previsto (mês)" value={currencyBRL(resumoAuto!.totalPrevisto)} icon={Calculator} tone="blue" sub={`Média × ${resumoAuto!.total}d + fixo`} />
                </div>

                <div className="max-h-[420px] overflow-auto rounded-md border">
                  <Table className={COMPACT_TABLE_CLASS}>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead>Dia</TableHead>
                        <TableHead className="text-right">Faturamento bruto</TableHead>
                        <TableHead className="text-right">Diária mín.</TableHead>
                        <TableHead className="text-right">Comissão do dia</TableHead>
                        <TableHead className="text-right">Considerado</TableHead>
                        <TableHead className="text-right">Saldo acumulado</TableHead>
                        <TableHead>Descrição</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagamentosAuto.map((p, i) => (
                        <TableRow key={p.dia} className={linhasAuto[i]?.futuro ? "opacity-50" : ""}>
                          <TableCell className="font-medium">{String(p.dia).padStart(2, "0")}</TableCell>
                          <TableCell className="text-right">{currencyBRL(p.faturamento)}</TableCell>
                          <TableCell className="text-right">{currencyBRL(p.diaria)}</TableCell>
                          <TableCell className="text-right font-medium text-emerald-400">{currencyBRL(p.comissao)}</TableCell>
                          <TableCell className="text-right font-semibold text-emerald-400">{currencyBRL(p.considerado)}</TableCell>
                          <TableCell className="text-right font-medium">{currencyBRL(p.acumulado)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{p.descricao}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter className="bg-muted/80 font-semibold sticky bottom-0 z-10 border-t-2 border-primary/30">
                      <TableRow>
                        <TableCell className="font-bold text-xs uppercase">Totais / Autosoma</TableCell>
                        <TableCell className="text-right font-bold text-xs">{currencyBRL(resumoAuto!.fatMes)}</TableCell>
                        <TableCell className="text-right font-bold text-xs">{currencyBRL(resumoAuto!.totalDiariaMinima)}</TableCell>
                        <TableCell className="text-right font-bold text-xs text-emerald-400">{currencyBRL(resumoAuto!.totalComissoes)}</TableCell>
                        <TableCell className="text-right font-bold text-xs text-emerald-400">{currencyBRL(resumoAuto!.acumulado)}</TableCell>
                        <TableCell className="text-right font-bold text-xs text-primary">{currencyBRL(resumoAuto!.acumulado)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">Autosoma das comissões do período: <strong className="text-foreground">{currencyBRL(resumoAuto!.totalComissoes)}</strong></TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  Salário fixo do mês: <strong>{currencyBRL(resumoAuto!.fixo)}</strong> · Autosoma de comissões:{" "}
                  <strong className="text-foreground text-emerald-400">{currencyBRL(resumoAuto!.totalComissoes)}</strong> · Média de comissão do dia:{" "}
                  <strong className="text-foreground">{currencyBRL(resumoAuto!.mediaComissaoDia)}</strong> · Total recebido até o momento:{" "}
                  <strong className="text-foreground">{currencyBRL(totalRecebidoAuto)}</strong> · Total previsto para o mês:{" "}
                  <strong className="text-foreground">{currencyBRL(resumoAuto!.totalPrevisto)}</strong> · Relatórios emitidos como{" "}
                  <strong>RODOLFO TV — {APP_NAME}</strong>
                </div>
              </>
            )}
          </Card>
        </TabsContent>

        {/* SUB-ABA 2: MANUAL (LANÇAMENTO DIÁRIO) */}
        <TabsContent value="manual" className="space-y-6 mt-0">
          <Card className="p-4 border-primary/20 bg-gradient-to-b from-primary/5 via-card to-card">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <div className="flex items-center gap-2">
                <Pencil className="h-4 w-4 text-primary" />
                <h2 className="font-semibold text-sm">Planilha de Pagamentos (Lançamento Manual Dia a Dia)</h2>
                <Badge variant="outline" className="border-primary/40 text-primary text-[10px]">Modo Manual</Badge>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={selecionado?.id ?? ""} onValueChange={setSelId}>
                  <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Funcionário" /></SelectTrigger>
                  <SelectContent>
                    {funcionarios.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                  <SelectTrigger className="h-9 w-[130px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {meses.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
                  <SelectTrigger className="h-9 w-[95px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {anos.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="secondary" onClick={puxarDoAutomatico} title="Preencher todos os dias com os valores do sistema para ajustar apenas os dias divergentes">
                  <ArrowDownToLine className="h-4 w-4 mr-1 text-primary" /> Puxar do Automático
                </Button>
                <Button size="sm" variant="outline" onClick={salvarManuaisAgora} title="Garantir persistência de todos os valores manuais">
                  <Save className="h-4 w-4 mr-1 text-emerald-400" /> Salvar
                </Button>
                <Button size="sm" variant="outline" onClick={zerarMesManual} title="Zerar valores manuais deste mês">
                  <RotateCcw className="h-4 w-4 mr-1 text-destructive" /> Zerar Mês
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" disabled={!selecionado}><FileDown className="h-4 w-4 mr-1" /> Exportar</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => exportar("pdf", true)}><FileText className="h-4 w-4 mr-2" /> PDF (Manual)</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportar("xlsx", true)}><FileSpreadsheet className="h-4 w-4 mr-2" /> Excel (.xlsx)</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportar("txt", true)}><FileDown className="h-4 w-4 mr-2" /> TXT</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportar("docx", true)}><FileType className="h-4 w-4 mr-2" /> Word (.docx)</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportar("png", true)}><FileImage className="h-4 w-4 mr-2" /> PNG</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Barra de preenchimento rápido em lote */}
            <div className="flex items-center justify-between gap-2 p-2.5 rounded-md bg-muted/40 border mb-3 flex-wrap text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span>Digite os valores diários diretamente na coluna <strong>"Valor Manual do Dia (R$)"</strong>. Os valores são salvos e recalculados na hora.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground font-medium">Preencher lote:</span>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="R$ 0,00"
                  value={valorLote}
                  onChange={(e) => setValorLote(e.target.value)}
                  className="h-7 w-24 text-xs"
                />
                <Button size="sm" variant="secondary" className="h-7 text-xs px-2" onClick={aplicarValorEmLote}>
                  Aplicar em todos os dias
                </Button>
              </div>
            </div>

            {!selecionado ? (
              <div className="text-sm text-muted-foreground py-6 text-center">
                Cadastre ou selecione um funcionário para registrar os valores manuais.
              </div>
            ) : (
              <>
                <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 mb-3">
                  <StatCard size="sm" label="Salário fixo" value={currencyBRL(resumoManual!.fixo)} icon={Wallet} tone="purple" />
                  <StatCard size="sm" label="Autosoma Comissões" value={currencyBRL(resumoManual!.totalComissoes)} icon={TrendingUp} tone="green" sub={`${linhasManual.filter(l => !l.futuro).length} dia(s) calculados`} />
                  <StatCard size="sm" label="Diárias mínimas" value={currencyBRL(resumoManual!.diarias)} icon={CalendarDays} tone="orange" sub={`${resumoManual!.diariasAplicadas} dia(s)`} />
                  <StatCard size="sm" label="Acumulado variável" value={currencyBRL(resumoManual!.acumulado)} icon={Calculator} tone="blue" sub="Total considerado" />
                  <StatCard size="sm" label="Média Comissão / Dia" value={currencyBRL(resumoManual!.mediaComissaoDia)} icon={TrendingUp} tone="yellow" sub={`Média (${resumoManual!.decorridos}d)`} />
                  <StatCard size="sm" label="Total recebido" value={currencyBRL(totalRecebidoManual)} icon={Wallet} tone="green" sub="Fixo prop. + Variável" />
                  <StatCard size="sm" label="Total previsto (mês)" value={currencyBRL(resumoManual!.totalPrevisto)} icon={Calculator} tone="blue" sub={`Média × ${resumoManual!.total}d + fixo`} />
                </div>

                <div className="max-h-[460px] overflow-auto rounded-md border">
                  <Table className={COMPACT_TABLE_CLASS}>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead className="w-14">Dia</TableHead>
                        <TableHead className="text-right w-44">Valor Manual do Dia (R$)</TableHead>
                        <TableHead className="text-right">Diária mín.</TableHead>
                        <TableHead className="text-right">Comissão do dia ({Number(selecionado.percentual)}%)</TableHead>
                        <TableHead className="text-right">Considerado</TableHead>
                        <TableHead className="text-right">Saldo acumulado</TableHead>
                        <TableHead>Descrição do Cálculo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagamentosManual.map((p, i) => {
                        const k = getManualKey(p.dia);
                        const valAtual = manualMap[k] !== undefined ? manualMap[k] : getManualValor(p.dia);
                        const displayVal = draftInputs[k] !== undefined
                          ? draftInputs[k]
                          : (valAtual > 0 ? String(valAtual) : (manualMap[k] === 0 ? "0" : ""));

                        return (
                          <TableRow key={p.dia} className={linhasManual[i]?.futuro ? "opacity-60" : ""}>
                            <TableCell className="font-medium text-xs">
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-muted/60 font-mono">
                                {String(p.dia).padStart(2, "0")}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="inline-flex items-center justify-end gap-1">
                                <span className="text-[11px] text-muted-foreground">R$</span>
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  value={displayVal}
                                  onChange={(e) => {
                                    const text = e.target.value;
                                    setDraftInputs((prev) => ({ ...prev, [k]: text }));
                                    const cleaned = text.trim().replace(/\s/g, "").replace(",", ".");
                                    if (cleaned === "") {
                                      setManualValor(p.dia, 0);
                                    } else {
                                      const num = parseFloat(cleaned);
                                      if (!isNaN(num) && num >= 0) {
                                        setManualValor(p.dia, num);
                                      }
                                    }
                                  }}
                                  onBlur={() => {
                                    setDraftInputs((prev) => {
                                      const n = { ...prev };
                                      delete n[k];
                                      return n;
                                    });
                                  }}
                                  placeholder="0,00"
                                  className="h-7 w-28 text-right text-xs font-semibold bg-background border-primary/30 focus-visible:border-primary focus-visible:ring-1"
                                />
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-xs">{currencyBRL(p.diaria)}</TableCell>
                            <TableCell className="text-right text-xs font-medium text-emerald-400">{currencyBRL(p.comissao)}</TableCell>
                            <TableCell className="text-right text-xs font-semibold text-emerald-400">{currencyBRL(p.considerado)}</TableCell>
                            <TableCell className="text-right text-xs font-medium">{currencyBRL(p.acumulado)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{p.descricao}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                    <TableFooter className="bg-muted/80 font-semibold sticky bottom-0 z-10 border-t-2 border-primary/30">
                      <TableRow>
                        <TableCell className="font-bold text-xs uppercase">Totais / Autosoma</TableCell>
                        <TableCell className="text-right font-bold text-xs">{currencyBRL(resumoManual!.fatMes)}</TableCell>
                        <TableCell className="text-right font-bold text-xs">{currencyBRL(resumoManual!.totalDiariaMinima)}</TableCell>
                        <TableCell className="text-right font-bold text-xs text-emerald-400">{currencyBRL(resumoManual!.totalComissoes)}</TableCell>
                        <TableCell className="text-right font-bold text-xs text-emerald-400">{currencyBRL(resumoManual!.acumulado)}</TableCell>
                        <TableCell className="text-right font-bold text-xs text-primary">{currencyBRL(resumoManual!.acumulado)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">Autosoma das comissões manuais: <strong className="text-foreground">{currencyBRL(resumoManual!.totalComissoes)}</strong></TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  Salário fixo do mês: <strong>{currencyBRL(resumoManual!.fixo)}</strong> · Autosoma de comissões:{" "}
                  <strong className="text-foreground text-emerald-400">{currencyBRL(resumoManual!.totalComissoes)}</strong> · Média de comissão do dia:{" "}
                  <strong className="text-foreground">{currencyBRL(resumoManual!.mediaComissaoDia)}</strong> · Total recebido até o momento:{" "}
                  <strong className="text-foreground">{currencyBRL(totalRecebidoManual)}</strong> · Total previsto para o mês:{" "}
                  <strong className="text-foreground">{currencyBRL(resumoManual!.totalPrevisto)}</strong> · Modo Manual ativo · Lançamentos salvos automaticamente
                </div>
              </>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal de cadastro/edição de funcionário */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Editar funcionário" : "Novo funcionário"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div>
              <Label>Cargo</Label>
              <Input value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} />
            </div>
            <div>
              <Label>Data de admissão</Label>
              <Input type="date" value={form.data_admissao} onChange={(e) => setForm({ ...form, data_admissao: e.target.value })} />
            </div>
            <div>
              <Label>Salário fixo mensal (R$)</Label>
              <Input type="number" step="0.01" value={form.salario_fixo} onChange={(e) => setForm({ ...form, salario_fixo: e.target.value })} />
            </div>
            <div>
              <Label>Diária mínima garantida (R$)</Label>
              <Input type="number" step="0.01" value={form.diaria_minima} onChange={(e) => setForm({ ...form, diaria_minima: e.target.value })} />
            </div>
            <div>
              <Label>Percentual (%)</Label>
              <Input type="number" step="0.01" value={form.percentual} onChange={(e) => setForm({ ...form, percentual: e.target.value })} />
            </div>
            <div>
              <Label>Base da comissão</Label>
              <Select value={form.base_calculo} onValueChange={(v) => setForm({ ...form, base_calculo: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="faturamento">Faturamento bruto</SelectItem>
                  <SelectItem value="lucro">Lucro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 flex items-center gap-2">
              <Button type="button" size="sm" variant={form.ativo ? "default" : "outline"} onClick={() => setForm({ ...form, ativo: true })}>Ativo</Button>
              <Button type="button" size="sm" variant={!form.ativo ? "destructive" : "outline"} onClick={() => setForm({ ...form, ativo: false })}>Inativo</Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={salvar}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
