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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/components/stat-card";
import { COMPACT_TABLE_CLASS } from "@/components/density-toggle";
import { Plus, Pencil, Trash2, RefreshCw, Users, Wallet, TrendingUp, CalendarDays, Calculator, FileText, FileSpreadsheet, FileDown, FileImage, FileType } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { APP_NAME } from "@/lib/app-version";
import {
  exportPDF, exportPNG, exportTXT, exportXLSX, exportDOCX,
  type PagamentoRow, type PagamentoResumo,
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
      { title: "Pagamento de Funcionários — Orbit" },
      { name: "description", content: "Cadastro de funcionários e planilha de pagamentos com comissões e diárias mínimas." },
      { property: "og:title", content: "Pagamento de Funcionários — Orbit" },
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
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [selId, setSelId] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Funcionario | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  /* ---------- Apuração ---------- */
  const selecionado = useMemo(
    () => funcionarios.find((f) => f.id === selId) ?? funcionarios[0] ?? null,
    [funcionarios, selId],
  );

  const linhas = useMemo(
    () => (selecionado ? apurarMes(selecionado, porDia, ano, mes) : []),
    [selecionado, porDia, ano, mes],
  );

  const resumo = useMemo(() => {
    if (!selecionado) return null;
    const total = diasNoMes(ano, mes);
    const hojeISO = localISODate(hoje);
    const mesAtual = `${ano}-${String(mes).padStart(2, "0")}` === hojeISO.slice(0, 7);
    const decorridos = mesAtual ? Number(hojeISO.slice(8, 10)) : total;
    const acumulado = linhas.reduce((s, l) => s + l.considerado, 0);
    const fatMes = linhas.reduce((s, l) => s + l.faturamento, 0);
    const mediaDiaria = decorridos > 0 ? fatMes / decorridos : 0;
    const mediaGanho = decorridos > 0 ? acumulado / decorridos : 0;
    const projecaoVariavel = acumulado + mediaGanho * Math.max(0, total - decorridos);
    const fixo = Number(selecionado.salario_fixo || 0);
    return {
      total, decorridos, acumulado, fatMes, mediaDiaria, fixo,
      totalPrevisto: fixo + acumulado,
      projecao: fixo + projecaoVariavel,
      diariasAplicadas: linhas.filter((l) => l.usouDiaria).length,
      comissoes: linhas.filter((l) => !l.futuro && !l.usouDiaria).reduce((s, l) => s + l.comissao, 0),
      diarias: linhas.filter((l) => l.usouDiaria).reduce((s, l) => s + l.diaria, 0),
    };
  }, [linhas, selecionado, ano, mes]);

  /* ---------- Linhas da planilha de pagamentos ---------- */
  const pagamentos: PagamentoRow[] = useMemo(() => {
    if (!selecionado) return [];
    const pct = Number(selecionado.percentual || 0);
    const baseLabel = selecionado.base_calculo === "lucro" ? "lucro" : "faturamento";
    return linhas.map((l) => {
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
  }, [linhas, selecionado]);

  const totalRecebido = useMemo(() => {
    if (!resumo) return 0;
    const fixoProporcional = resumo.total > 0 ? (resumo.fixo * resumo.decorridos) / resumo.total : 0;
    return fixoProporcional + resumo.acumulado;
  }, [resumo]);

  function resumoExport(): PagamentoResumo {
    return {
      funcionario: selecionado?.nome ?? "—",
      cargo: selecionado?.cargo ?? "",
      periodo: `${meses[mes - 1]}/${ano}`,
      salarioFixo: resumo?.fixo ?? 0,
      totalRecebido,
      totalPrevisto: resumo?.totalPrevisto ?? 0,
    };
  }

  async function exportar(tipo: "pdf" | "xlsx" | "txt" | "docx" | "png") {
    if (!selecionado) return;
    try {
      const res = resumoExport();
      if (tipo === "pdf") exportPDF(pagamentos, res);
      else if (tipo === "xlsx") exportXLSX(pagamentos, res);
      else if (tipo === "txt") exportTXT(pagamentos, res);
      else if (tipo === "png") exportPNG(pagamentos, res);
      else await exportDOCX(pagamentos, res);
      toast.success(`Planilha exportada (${tipo.toUpperCase()}).`);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao exportar.");
    }
  }

  /* ---------- CRUD ---------- */
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
      await logAudit({ categoria: "financeiro", acao: "editar", entidade: "funcionario", entidade_id: editing.id, descricao: `Funcionário atualizado: ${payload.nome}`, dados_novos: payload, dados_anteriores: editing as any });
    } else {
      const { data, error } = await supabase.from("funcionarios").insert({ ...payload, user_id: user.id }).select().single();
      if (error) return toast.error(error.message);
      await logAudit({ categoria: "financeiro", acao: "criar", entidade: "funcionario", entidade_id: data?.id, descricao: `Funcionário cadastrado: ${payload.nome}`, dados_novos: payload });
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
    await logAudit({ categoria: "financeiro", acao: "excluir", entidade: "funcionario", entidade_id: f.id, descricao: `Funcionário excluído: ${f.nome}`, dados_anteriores: f as any });
    toast.success("Funcionário excluído.");
    qc.invalidateQueries({ queryKey: ["funcionarios"] });
  }

  function atualizar() {
    qc.invalidateQueries({ queryKey: ["funcionarios"] });
    qc.invalidateQueries({ queryKey: ["faturamento_bruto_dia"] });
    toast.success("Dados sincronizados.");
  }

  const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const anos = Array.from({ length: 5 }, (_, i) => hoje.getFullYear() - 3 + i);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Pagamento de Funcionários</h1>
          <p className="text-xs text-muted-foreground">Cadastro de funcionários e planilha de pagamentos.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={atualizar} disabled={loadingF || loadingFin}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loadingF || loadingFin ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo funcionário</Button>
        </div>
      </div>

      {/* Cadastro de funcionários */}
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
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">Nenhum funcionário cadastrado.</TableCell></TableRow>
              )}
              {funcionarios.map((f) => (
                <TableRow key={f.id} className={selecionado?.id === f.id ? "bg-accent/40" : ""} onClick={() => setSelId(f.id)}>
                  <TableCell className="font-medium">{f.nome}</TableCell>
                  <TableCell>{f.cargo || "—"}</TableCell>
                  <TableCell>{f.data_admissao ? formatDateBR(f.data_admissao) : "—"}</TableCell>
                  <TableCell className="text-right">{currencyBRL(Number(f.salario_fixo))}</TableCell>
                  <TableCell className="text-right">{currencyBRL(Number(f.diaria_minima))}</TableCell>
                  <TableCell className="text-right">{Number(f.percentual)}%</TableCell>
                  <TableCell><Badge variant="outline">{f.base_calculo === "lucro" ? "Lucro" : "Faturamento"}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={f.ativo ? "default" : "secondary"}>{f.ativo ? "Ativo" : "Inativo"}</Badge>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(f); }}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); excluir(f); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Planilha de pagamentos */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Planilha de Pagamentos</h2>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selecionado?.id ?? ""} onValueChange={setSelId}>
              <SelectTrigger className="h-9 w-[200px]"><SelectValue placeholder="Funcionário" /></SelectTrigger>
              <SelectContent>
                {funcionarios.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {meses.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger className="h-9 w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {anos.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={!selecionado}><FileDown className="h-4 w-4 mr-1" /> Exportar</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportar("pdf")}><FileText className="h-4 w-4 mr-2" /> PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportar("xlsx")}><FileSpreadsheet className="h-4 w-4 mr-2" /> Excel (.xlsx)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportar("txt")}><FileDown className="h-4 w-4 mr-2" /> TXT</DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportar("docx")}><FileType className="h-4 w-4 mr-2" /> Word (.docx)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportar("png")}><FileImage className="h-4 w-4 mr-2" /> PNG</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {!selecionado ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Cadastre um funcionário para ver a planilha de pagamentos.</div>
        ) : (
          <>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6 mb-4">
              <StatCard label="Salário fixo" value={currencyBRL(resumo!.fixo)} icon={Wallet} tone="purple" />
              <StatCard label="Comissões" value={currencyBRL(resumo!.comissoes)} icon={TrendingUp} tone="green" />
              <StatCard label="Diárias mínimas" value={currencyBRL(resumo!.diarias)} icon={CalendarDays} tone="orange" sub={`${resumo!.diariasAplicadas} dia(s)`} />
              <StatCard label="Acumulado variável" value={currencyBRL(resumo!.acumulado)} icon={Calculator} tone="blue" />
              <StatCard label="Total recebido até o momento" value={currencyBRL(totalRecebido)} icon={Wallet} tone="green" />
              <StatCard label="Total previsto (mês)" value={currencyBRL(resumo!.totalPrevisto)} icon={TrendingUp} tone="blue" />
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
                  {pagamentos.map((p, i) => (
                    <TableRow key={p.dia} className={linhas[i]?.futuro ? "opacity-50" : ""}>
                      <TableCell className="font-medium">{String(p.dia).padStart(2, "0")}</TableCell>
                      <TableCell className="text-right">{currencyBRL(p.faturamento)}</TableCell>
                      <TableCell className="text-right">{currencyBRL(p.diaria)}</TableCell>
                      <TableCell className="text-right">{currencyBRL(p.comissao)}</TableCell>
                      <TableCell className="text-right font-semibold">{currencyBRL(p.considerado)}</TableCell>
                      <TableCell className="text-right">{currencyBRL(p.acumulado)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.descricao}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              Salário fixo do mês: <strong>{currencyBRL(resumo!.fixo)}</strong> · Total recebido até o momento:{" "}
              <strong className="text-foreground">{currencyBRL(totalRecebido)}</strong> · Total previsto para o mês:{" "}
              <strong className="text-foreground">{currencyBRL(resumo!.totalPrevisto)}</strong> · Relatórios emitidos como{" "}
              <strong>RODOLFO TV — {APP_NAME}</strong>
            </div>
          </>
        )}
      </Card>

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
