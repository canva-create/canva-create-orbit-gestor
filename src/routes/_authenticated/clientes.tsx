import { ServidorSelectItems, ServidorDropdownItems } from "@/lib/servidores-ui";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { custoCliente, creditosPorDias, registrarMovimentacaoCredito } from "@/lib/creditos";
import { z } from "zod";
import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchClientes, fetchServidores, fetchHistorico } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Search, Pencil, Trash2, Copy, RefreshCw, CalendarPlus, MessageCircle, FileText, Eye, Download, Upload, Users, ClipboardCopy, FileDown, DollarSign as DollarIcon, Trash, Send, MoreVertical, Smartphone, Phone, User, Archive, Columns3, Undo2, Image as ImageIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { addDaysISO, currencyBRL, diasParaVencer, formatDateBR, formatDateTimeBR, maskPhoneBR, statusMeta, toISODate, whatsappLink } from "@/lib/iptv";
import { ClienteDialog } from "@/components/cliente-dialog";
import { AcrescentarDiasDialog } from "@/components/acrescentar-dias-dialog";
import { reverterUltimaRenovacao } from "@/lib/reverter-renovacao";
import { FichaClienteDialog } from "@/components/ficha-cliente-dialog";
import {
  copyComprovanteVencimentoImageToClipboard,
  exportComprovanteVencimentoPNG,
} from "@/lib/comprovante-vencimento-generator";
import { ImportReviewDialog } from "@/components/import-review-dialog";
import { EnviosMassaDialog } from "@/components/envios-massa-dialog";
import { normalizeImportRows, type NormalizedRow, type ColumnMapping } from "@/lib/import-clientes.functions";
import { toast } from "sonner";
import { StatCard } from "@/components/stat-card";
import { AlertTriangle, Clock, CalendarClock, DollarSign, TrendingUp } from "lucide-react";
import * as XLSX from "xlsx";
import { PaginationControls, INITIAL_LOAD, LOAD_STEP, type PageSize } from "@/components/pagination-controls";
import { DensityToggle, densityClass, type Density } from "@/components/density-toggle";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { confirmDialog } from "@/lib/confirm";
import { AtivacaoClienteDialog } from "@/components/ativacao-cliente-dialog";
import { logAudit } from "@/lib/audit";

const DIAS_RAPIDOS = [1, 2, 30, 31, 90, 180, 365];

const COLUNAS_TABELA = [
  "Celular",
  "Servidor",
  "Início",
  "Vencimento",
  "Status",
  "Dias",
  "Pgto",
  "Custo",
  "Valor",
  "Lucro",
  "MAC",
  "Device",
  "App",
] as const;

type ColunaTabela = (typeof COLUNAS_TABELA)[number];
const COLUNAS_STORAGE_KEY = "clientes:colunas-visiveis";

const COLUNAS_PADRAO = [
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
  "MAC",
  "Device",
  "Aplicativo",
  "Observação",
];

const COLUNAS_EXPORT = [
  ...COLUNAS_PADRAO,
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

export const Route = createFileRoute("/_authenticated/clientes")({
  validateSearch: zodValidator(z.object({
    q: fallback(z.string(), "").default(""),
    clienteId: fallback(z.string(), "").default(""),
  })),
  component: ClientesPage,
});

function ClientesPage() {
  const qc = useQueryClient();
  const searchParams = Route.useSearch();
  const { data: clientes = [] } = useQuery({ queryKey: ["clientes"], queryFn: fetchClientes });
  const { data: servidores = [] } = useQuery({ queryKey: ["servidores"], queryFn: fetchServidores });
  const { data: historico = [] } = useQuery({ queryKey: ["historico"], queryFn: fetchHistorico });
  const [q, setQ] = useState(searchParams.q ?? "");
  useEffect(() => {
    if (searchParams.q) setQ(searchParams.q);
  }, [searchParams.q]);
  const [filtro, setFiltro] = useState("todos");
  const [servidorFiltro, setServidorFiltro] = useState("todos");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [renovOpen, setRenovOpen] = useState(false);
  const [renovCliente, setRenovCliente] = useState<any | null>(null);
  const [ativOpen, setAtivOpen] = useState(false);
  const [ativCliente, setAtivCliente] = useState<any | null>(null);
  const [fichaOpen, setFichaOpen] = useState(false);
  const [fichaCliente, setFichaCliente] = useState<any | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const updateFileRef = useRef<HTMLInputElement>(null);
  const [updateProgress, setUpdateProgress] = useState<{ total: number; done: number; updated: number; skipped: number; notFound: number } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importRows, setImportRows] = useState<NormalizedRow[]>([]);
  const [importMapping, setImportMapping] = useState<ColumnMapping[]>([]);
  const [importUnmapped, setImportUnmapped] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ total: number; done: number; ok: number; fail: number } | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadedCount, setLoadedCount] = useState<number>(INITIAL_LOAD);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [page, setPage] = useState<number>(1);
  const [density, setDensity] = useState<Density>("compact");
  const [hiddenCols, setHiddenCols] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLUNAS_STORAGE_KEY);
      if (raw) setHiddenCols(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);
  const showCol = (c: ColunaTabela) => !hiddenCols[c];
  function toggleCol(c: ColunaTabela) {
    setHiddenCols((prev) => {
      const next = { ...prev, [c]: !prev[c] };
      if (!next[c]) delete next[c];
      try { localStorage.setItem(COLUNAS_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }
  const colunasVisiveis = COLUNAS_TABELA.filter(showCol).length;
  const [deleteAllProgress, setDeleteAllProgress] = useState<{ total: number; done: number; display: number } | null>(null);
  const openedFromSearchRef = useRef<string | null>(null);

  useEffect(() => {
    if (!searchParams.clienteId || openedFromSearchRef.current === searchParams.clienteId) return;
    const cliente = (clientes as any[]).find((c) => c.id === searchParams.clienteId);
    if (!cliente) return;
    openedFromSearchRef.current = searchParams.clienteId;
    setQ(cliente.nome ?? searchParams.q ?? "");
    setFiltro("todos");
    setServidorFiltro("todos");
    setPage(1);
  }, [clientes, searchParams.clienteId, searchParams.q]);

  const clientesAtivos = useMemo(
    () => clientes.filter((c: any) => {
      const d = diasParaVencer(c.data_vencimento);
      return d === null || d >= -2;
    }),
    [clientes]
  );

  const filtered = useMemo(() => {
    const normalize = (s: any) =>
      String(s ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    const tokens = normalize(q).split(/\s+/).filter(Boolean);
    return clientesAtivos.filter((c: any) => {
      const dias = diasParaVencer(c.data_vencimento);
      const haystack = normalize(
        [c.nome, c.telefone, c.mac, c.device, c.aplicativo, c.servidor?.nome]
          .filter(Boolean)
          .join(" "),
      );
      const matchQ = tokens.length === 0 || tokens.every((t) => haystack.includes(t));
      const matchServ = servidorFiltro === "todos" || c.servidor_id === servidorFiltro;
      let matchF = true;
      if (filtro === "ativos") matchF = c.status === "ativo";
      else if (filtro === "vencidos") matchF = (dias ?? 0) < 0;
      else if (filtro === "hoje") matchF = dias === 0;
      else if (filtro === "amanha") matchF = dias === 1;
      else if (filtro === "pagos") matchF = c.status_pagamento === "pago";
      else if (filtro === "devendo") matchF = c.status_pagamento === "devendo";
      return matchQ && matchServ && matchF;
    }).sort((a: any, b: any) => {
      const da = diasParaVencer(a.data_vencimento);
      const db = diasParaVencer(b.data_vencimento);
      if (da !== db) {
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
      }
      return String(a.nome ?? "").localeCompare(String(b.nome ?? ""), "pt-BR", { sensitivity: "base" });
    });
  }, [clientesAtivos, q, filtro, servidorFiltro]);

  const totalFiltered = filtered.length;
  const loaded = Math.min(loadedCount, totalFiltered);
  const totalPages = Math.max(1, Math.ceil(loaded / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pageItems = useMemo(
    () => filtered.slice(0, loaded).slice(pageStart, pageStart + pageSize),
    [filtered, loaded, pageStart, pageSize],
  );

  const stats = useMemo(() => {
    const vencidos = clientesAtivos.filter((c: any) => (diasParaVencer(c.data_vencimento) ?? 0) < 0).length;
    const vencidos1 = clientesAtivos.filter((c: any) => diasParaVencer(c.data_vencimento) === -1).length;
    const vencidos2 = clientesAtivos.filter((c: any) => diasParaVencer(c.data_vencimento) === -2).length;
    const total = clientesAtivos.length - vencidos;
    const hoje = clientesAtivos.filter((c: any) => diasParaVencer(c.data_vencimento) === 0).length;
    const amanha = clientesAtivos.filter((c: any) => diasParaVencer(c.data_vencimento) === 1).length;
    const pendentes = clientesAtivos.filter((c: any) => c.status_pagamento === "devendo").length;
    const receita = clientesAtivos.reduce((s: number, c: any) => s + Number(c.valor_pago || 0), 0);
    const custo = clientesAtivos.reduce((s: number, c: any) => s + custoCliente(c, historico), 0);
    return { total, vencidos, vencidos1, vencidos2, hoje, amanha, pendentes, receita, lucro: receita - custo };
  }, [clientesAtivos]);

  function newCliente() { setEditing(null); setOpen(true); }
  function editCliente(c: any) { setEditing(c); setOpen(true); }

  async function remove(id: string) {
    const ok = await confirmDialog({
      title: "Mover para a lixeira?",
      description: "O cliente poderá ser restaurado em Backup › Excluídos.",
      confirmText: "Mover para lixeira",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("clientes").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    await logAudit({ categoria: "cliente", acao: "excluir", descricao: "Cliente movido para a lixeira", entidade: "clientes", entidade_id: id });
    toast.success("Cliente movido para a lixeira");
    qc.invalidateQueries({ queryKey: ["clientes"] });
  }

  async function excluirTodosClientes() {
    const ok = await confirmDialog({
      title: "Mover TODOS os clientes para a lixeira?",
      description: "Todos os clientes serão movidos para Backup › Excluídos e poderão ser restaurados.\nOs SERVIDORES NÃO serão afetados.",
      confirmText: "Mover todos",
      destructive: true,
    });
    if (!ok) return;
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return toast.error("Sessão expirada");

    // Buscar todos os IDs de clientes do usuário
    const { data: ids, error: idsErr } = await supabase
      .from("clientes")
      .select("id")
      .eq("user_id", user.id)
      .is("deleted_at", null);
    if (idsErr) return toast.error(idsErr.message);
    const allIds = (ids ?? []).map((r: any) => r.id as string);
    const total = allIds.length;
    if (total === 0) {
      toast.info("Nenhum cliente para excluir.");
      return;
    }

    const BATCH = 20;
    let done = 0;
    let failures = 0;
    setDeleteAllProgress({ total, done: 0, display: 0 });
    await new Promise((r) => setTimeout(r, 0));

    for (let i = 0; i < allIds.length; i += BATCH) {
      const chunk = allIds.slice(i, i + BATCH);
      const { error } = await supabase.from("clientes").update({ deleted_at: new Date().toISOString() }).in("id", chunk);
      if (error) {
        failures += chunk.length;
        console.error("Erro ao excluir lote:", error);
      } else {
        done += chunk.length;
      }
      const rawPct = Math.floor(((i + chunk.length) / total) * 100);
      const display = Math.min(100, Math.floor(rawPct / 5) * 5);
      setDeleteAllProgress({ total, done: i + chunk.length, display });
      await new Promise((r) => setTimeout(r, 0));
    }

    setDeleteAllProgress({ total, done: total, display: 100 });
    await new Promise((r) => setTimeout(r, 300));
    setDeleteAllProgress(null);

    if (failures > 0) {
      toast.error(`${done} excluído(s), ${failures} falharam.`);
    } else {
      toast.success(`${done} cliente(s) movido(s) para a lixeira. Servidores preservados.`);
    }
    await logAudit({ categoria: "cliente", acao: "excluir", descricao: `Exclusão em massa: ${done} cliente(s) movido(s) para a lixeira`, entidade: "clientes", metadata: { total, done, failures } });
    qc.invalidateQueries();
  }

  function toggleSelectionMode() {
    setSelectionMode((v) => {
      if (v) setSelected(new Set());
      return !v;
    });
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelected((prev) => {
      const visibleIds = filtered.map((c: any) => c.id as string);
      const allSelected = visibleIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function excluirSelecionados() {
    if (selected.size === 0) return toast.error("Nenhum cliente selecionado");
    const ok = await confirmDialog({
      title: `Mover ${selected.size} cliente(s) para a lixeira?`,
      description: "Você poderá restaurá-los em Backup › Excluídos.",
      confirmText: "Mover para lixeira",
      destructive: true,
    });
    if (!ok) return;
    const ids = Array.from(selected);
    const { error } = await supabase.from("clientes").update({ deleted_at: new Date().toISOString() }).in("id", ids);
    if (error) return toast.error(error.message);
    await logAudit({ categoria: "cliente", acao: "excluir", descricao: `${ids.length} cliente(s) selecionado(s) movido(s) para a lixeira`, entidade: "clientes", metadata: { ids } });
    toast.success(`${ids.length} cliente(s) movido(s) para a lixeira`);
    setSelected(new Set());
    setSelectionMode(false);
    qc.invalidateQueries({ queryKey: ["clientes"] });
  }

  async function changeServidor(clienteId: string, servidorId: string) {
    const { error } = await supabase.from("clientes").update({ servidor_id: servidorId }).eq("id", clienteId);
    if (error) return toast.error(error.message);
    await logAudit({ categoria: "cliente", acao: "transferir", descricao: "Servidor do cliente alterado", entidade: "clientes", entidade_id: clienteId, dados_novos: { servidor_id: servidorId } });
    toast.success("Servidor atualizado!");
    qc.invalidateQueries({ queryKey: ["clientes"] });
  }

  async function duplicate(c: any) {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;
    const { id, created_at, updated_at, servidor, ...rest } = c;
    const { error } = await supabase.from("clientes").insert({ ...rest, user_id: user.id, nome: `${c.nome} (cópia)` });
    if (error) return toast.error(error.message);
    await logAudit({ categoria: "cliente", acao: "duplicar", descricao: `Cliente "${c.nome}" duplicado`, entidade: "clientes", entidade_id: c.id, entidade_nome: c.nome });
    toast.success("Duplicado!");
    qc.invalidateQueries({ queryKey: ["clientes"] });
  }

  async function addDias(c: any, dias: number) {
    const diasRestantes = diasParaVencer(c.data_vencimento) ?? 0;
    const baseVenc = c.data_vencimento && diasRestantes >= 0 ? c.data_vencimento : toISODate(new Date());
    const novo = addDaysISO(baseVenc, dias);
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;
    const custo = custoCliente(c, historico);
    const { error } = await supabase.from("clientes").update({ data_vencimento: novo }).eq("id", c.id);
    if (error) return toast.error(error.message);
    await supabase.from("historico_renovacoes").insert({
      user_id: user.id,
      cliente_id: c.id,
      dias_adicionados: dias,
      valor_recebido: 0,
      custo,
      lucro: -custo,
      vencimento_anterior: c.data_vencimento,
      vencimento_novo: novo,
    });
    toast.success(`+${dias} dias`);
    qc.invalidateQueries({ queryKey: ["clientes"] });
    qc.invalidateQueries({ queryKey: ["historico"] });
  }

  async function renovar(c: any) {
    const diasStr = prompt("Quantos dias renovar?", "30");
    if (!diasStr) return;
    const dias = Number(diasStr);
    const valorStr = prompt("Valor recebido (R$)?", String(c.valor_pago || 30));
    if (valorStr === null) return;
    const valor = Number(valorStr);
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;
    const diasRestantes = diasParaVencer(c.data_vencimento) ?? 0;
    const baseVenc = c.data_vencimento && diasRestantes >= 0 ? c.data_vencimento : toISODate(new Date());
    const novo = addDaysISO(baseVenc, dias);
    const custo = custoCliente(c, historico);
    const { error } = await supabase.from("clientes").update({
      data_vencimento: novo,
      valor_pago: valor,
      status_pagamento: "pago",
      status: "ativo",
    }).eq("id", c.id);
    if (error) return toast.error(error.message);
    await supabase.from("historico_renovacoes").insert({
      user_id: user.id,
      cliente_id: c.id,
      dias_adicionados: dias,
      valor_recebido: valor,
      custo: custo,
      lucro: valor - custo,
      vencimento_anterior: c.data_vencimento,
      vencimento_novo: novo,
      status_pagamento: "pago"
    });

    toast.success("Renovação concluída!");
    await logAudit({ categoria: "renovacao", acao: "renovar", descricao: `Renovação rápida de "${c.nome}" (+${dias} dias)`, entidade: "clientes", entidade_id: c.id, entidade_nome: c.nome, dados_anteriores: { data_vencimento: c.data_vencimento }, dados_novos: { data_vencimento: novo, valor_recebido: valor } });
    qc.invalidateQueries();
  }

  async function renovarDevendo(c: any) {
    const diasStr = prompt("Quantos dias renovar?", "30");
    if (!diasStr) return;
    const dias = Number(diasStr);
    if (!dias || dias <= 0) return toast.error("Informe uma quantidade válida de dias");
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;
    const diasRestantes = diasParaVencer(c.data_vencimento) ?? 0;
    const baseVenc = c.data_vencimento && diasRestantes >= 0 ? c.data_vencimento : toISODate(new Date());
    const novo = addDaysISO(baseVenc, dias);
    const custo = custoCliente(c, historico);
    const valorPendente = Number(c.valor_pago || 0);

    const { error } = await supabase.from("clientes").update({
      data_vencimento: novo,
      status_pagamento: "devendo",
      status: "ativo",
    }).eq("id", c.id);
    if (error) return toast.error(error.message);

    await supabase.from("historico_renovacoes").insert({
      user_id: user.id,
      cliente_id: c.id,
      dias_adicionados: dias,
      valor_recebido: 0,
      valor_pendente: valorPendente,
      custo: custo,
      lucro: -custo,
      vencimento_anterior: c.data_vencimento,
      vencimento_novo: novo,
      status_pagamento: "devendo"
    });

    // Debita o crédito do servidor no mesmo instante
    const creditos = creditosPorDias(dias);
    if (c.servidor_id && creditos > 0) {
      await registrarMovimentacaoCredito({
        servidor_id: c.servidor_id,
        quantidade: -creditos,
        tipo: "renovacao",
        motivo: `Renovação ${dias}d (Devendo) — ${c.nome}`,
        cliente_id: c.id,
      });
    }

    toast.success(`+${dias} dias adicionados como devendo! Crédito e custo debitados.`);
    await logAudit({ categoria: "renovacao", acao: "renovar", descricao: `Renovação rápida (Devendo) de "${c.nome}" (+${dias} dias)`, entidade: "clientes", entidade_id: c.id, entidade_nome: c.nome, dados_anteriores: { data_vencimento: c.data_vencimento }, dados_novos: { data_vencimento: novo, status_pagamento: "devendo" } });
    qc.invalidateQueries();
  }

  function ficha(c: any) {
    setFichaCliente(c);
    setFichaOpen(true);
  }

  async function reverterRenovacao(c: any) {
    const ok = await reverterUltimaRenovacao(c);
    if (ok) qc.invalidateQueries();
  }

  async function copiarComprovante(c: any) {
    const app = c.aplicativo || "-";
    const nome = c.nome || "-";
    const contatoRaw = (c.telefone || c.celular || c.whatsapp || "").toString();
    const contato = contatoRaw.replace(/\D/g, "") || "-";
    const { data: ultima } = await supabase
      .from("historico_renovacoes")
      .select("created_at, vencimento_novo, dias_adicionados")
      .eq("cliente_id", c.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const dataRenovDate = ultima?.created_at ? new Date(ultima.created_at) : new Date();
    const hh = String(dataRenovDate.getHours()).padStart(2, "0");
    const mm = String(dataRenovDate.getMinutes()).padStart(2, "0");
    const ss = String(dataRenovDate.getSeconds()).padStart(2, "0");
    const dataRenov = `${formatDateBR(dataRenovDate)} às ${hh}:${mm}:${ss}`;
    const vencISO = c.data_vencimento || ultima?.vencimento_novo;
    const dataVenc = vencISO ? `${formatDateBR(vencISO)} às ${hh}:${mm}:${ss}` : "-";
    const dias = diasParaVencer(vencISO);
    const diasTxt = dias == null ? "-" : `${dias} dias`;
    const msg = `📺 *RODOLFO TV*\n\n✅ *Renovação Realizada com Sucesso!*\n\n👤 *Cliente:* *${nome}*\n📱 *APP:* *${app}*\n📞 *Contato:* *${contato}*\n\n🗓️ *Renovação:* *${dataRenov}*\n📅 *Vencimento:* *${dataVenc}*\n\n⏳ *Dias para Vencer:* *${diasTxt}*`;
    navigator.clipboard.writeText(msg);
    toast.success("Comprovante copiado!");
  }

  async function handleCopiarImagemVencimento(c: any) {
    try {
      const ok = await copyComprovanteVencimentoImageToClipboard(c);
      if (ok) {
        toast.success("Imagem de vencimento copiada! Cole no WhatsApp com Ctrl + V.");
      } else {
        toast.error("Seu navegador não suporta cópia direta de imagem. Use 'Gerar Imagem de Vencimento'.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Falha ao copiar imagem de vencimento");
    }
  }

  async function handleGerarImagemVencimento(c: any) {
    try {
      await exportComprovanteVencimentoPNG(c);
      toast.success("Imagem de vencimento baixada com sucesso!");
    } catch (err: any) {
      toast.error(err?.message || "Falha ao gerar imagem de vencimento");
    }
  }

  function enviarCredenciais(c: any) {
    const macVal = String(c.mac ?? "").trim();
    const devVal = String(c.device ?? "").trim();
    const macLabel = macVal.includes(":") ? "MAC" : "Login";
    const devLabel = macVal.includes(":") ? "Device" : "Senha";
    const app = c.aplicativo || "-";
    const linhas = [
      `📺 *RODOLFO TV*`,
      ``,
      `👤 Cliente: *${c.nome || "-"}*`,
      `📱 APP: *${app}*`,
      ``,
      `🔑 ${macLabel}: *${macVal || "-"}*`,
      `🔐 ${devLabel}: *${devVal || "-"}*`,
      ``,
      `📅 Vencimento: *${formatDateBR(c.data_vencimento)}*`,
    ];
    const msg = linhas.join("\n");
    navigator.clipboard.writeText(msg);
    toast.success("Credenciais copiadas!");
  }

  async function togglePagamento(c: any) {
    const novo = c.status_pagamento === "pago" ? "devendo" : "pago";
    const { error } = await supabase.from("clientes").update({ status_pagamento: novo }).eq("id", c.id);
    if (error) return toast.error(error.message);

    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (user) {
        if (novo === "pago") {
          const { data: pend } = await supabase
            .from("historico_renovacoes")
            .select("id, valor_pendente, custo, created_at")
            .eq("cliente_id", c.id)
            .eq("status_pagamento", "devendo" as any)
            .neq("status", "cancelada")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const valor = Number((pend as any)?.valor_pendente || c.valor_pago || 0);
          const custoH = Number((pend as any)?.custo || 0);
          const isSameDay = pend && toISODate(new Date((pend as any).created_at)) === toISODate(new Date());

          if (pend && isSameDay) {
            // Cadastrado hoje como devendo e pago hoje: atualiza o mesmo registro
            await supabase.from("historico_renovacoes").update({
              status_pagamento: "pago" as any,
              valor_recebido: valor,
              valor_pendente: 0,
              lucro: valor - custoH,
              pago_em: new Date().toISOString(),
            } as any).eq("id", (pend as any).id);
          } else {
            // Cadastrado em data anterior: o custo já foi debitado na data passada.
            // Hoje dá baixa na pendência e lança o recebimento no dia atual.
            if (pend) {
              await supabase.from("historico_renovacoes").update({
                valor_pendente: 0,
                pago_em: new Date().toISOString(),
              } as any).eq("id", (pend as any).id);
            }
            await supabase.from("historico_renovacoes").insert({
              user_id: user.id,
              cliente_id: c.id,
              dias_adicionados: 0,
              valor_recebido: valor,
              valor_pendente: 0,
              custo: 0, // Custo já deduzido na criação/renovação
              lucro: valor, // Entra integralmente como faturamento e lucro do dia de hoje
              vencimento_anterior: c.data_vencimento,
              vencimento_novo: c.data_vencimento,
              status_pagamento: "pago" as any,
              pago_em: new Date().toISOString(),
            } as any);
          }
        } else {
          // Revertendo para devendo:
          // Se houver lançamento de recebimento avulso (dias_adicionados = 0), cancela
          const { data: recHoje } = await supabase
            .from("historico_renovacoes")
            .select("id")
            .eq("cliente_id", c.id)
            .eq("dias_adicionados", 0)
            .eq("status_pagamento", "pago" as any)
            .neq("status", "cancelada")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (recHoje) {
            await supabase.from("historico_renovacoes").update({
              status: "cancelada" as any,
              cancelado_em: new Date().toISOString(),
            } as any).eq("id", (recHoje as any).id);
          }

          // Restaura valor_pendente na renovação base
          const { data: ult } = await supabase
            .from("historico_renovacoes")
            .select("id, custo")
            .eq("cliente_id", c.id)
            .neq("status", "cancelada")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (ult) {
            await supabase.from("historico_renovacoes").update({
              status_pagamento: "devendo" as any,
              valor_pendente: Number(c.valor_pago || 0),
              valor_recebido: 0,
              lucro: -Number((ult as any).custo || 0),
              pago_em: null,
            } as any).eq("id", (ult as any).id);
          }
        }
      }
    } catch {
      // não bloqueia
    }
    await logAudit({ categoria: "financeiro", acao: "alterar_pagamento", descricao: `Pagamento de "${c.nome}" alterado para ${novo.toUpperCase()}`, entidade: "clientes", entidade_id: c.id, entidade_nome: c.nome, dados_anteriores: { status_pagamento: c.status_pagamento }, dados_novos: { status_pagamento: novo } });
    toast.success(novo === "pago" ? "Marcado como PAGO — faturamento atualizado" : "Marcado como DEVENDO");
    qc.invalidateQueries({ queryKey: ["clientes"] });
    qc.invalidateQueries({ queryKey: ["historico"] });
  }

  function exportar(kind: "todos" | "ativos" | "pendentes" | "vencidos" | "vencidos_2d" | "vencidos_1d" | "vence_hoje" | "vence_amanha") {
    let rows = clientes;
    // A exportação de ativos exige cadastro com status ativo e vencimento hoje ou futuro.
    // Isso evita incluir registros já marcados como vencidos cuja data ainda seja o dia atual.
    if (kind === "ativos") rows = clientes.filter((c: any) => {
      const d = diasParaVencer(c.data_vencimento);
      return d !== null && d >= 0 && c.status === "ativo";
    });
    if (kind === "pendentes") rows = clientes.filter((c: any) => c.status_pagamento === "devendo");
    if (kind === "vencidos") rows = clientes.filter((c: any) => {
      const d = diasParaVencer(c.data_vencimento);
      return d !== null && d < 0;
    });
    if (kind === "vencidos_2d") rows = clientes.filter((c: any) => diasParaVencer(c.data_vencimento) === -2);
    if (kind === "vencidos_1d") rows = clientes.filter((c: any) => diasParaVencer(c.data_vencimento) === -1);
    if (kind === "vence_hoje") rows = clientes.filter((c: any) => diasParaVencer(c.data_vencimento) === 0);
    if (kind === "vence_amanha") rows = clientes.filter((c: any) => diasParaVencer(c.data_vencimento) === 1);
    const ordenados = [...rows].sort((a: any, b: any) => {
      const va = a.data_vencimento ? new Date(a.data_vencimento).getTime() : Infinity;
      const vb = b.data_vencimento ? new Date(b.data_vencimento).getTime() : Infinity;
      if (va !== vb) return va - vb;
      return String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR", { sensitivity: "base" });
    });
    const sim = (v: any) => (v ? "Sim" : "Não");
    // AOA garante que TODAS as colunas apareçam sempre, na mesma ordem do cabeçalho.
    const linhas = ordenados.map((c: any) => {
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
        d === null ? "Sem vencimento" : d < 0 ? `Vencido há ${Math.abs(d)} dia(s)` : d === 0 ? "Vence hoje" : `Faltam ${d} dia(s)`,
        sim(c.lembrete_no_dia),
        sim(c.lembrete_1_dia_antes),
        sim(c.lembrete_vencimento),
        sim(c.lembrete_apos),
        formatDateTimeBR(c.created_at),
        formatDateTimeBR(c.updated_at),
        c.id,
      ];
    });
    const data = linhas;
    const ws = XLSX.utils.aoa_to_sheet([COLUNAS_EXPORT, ...linhas]);
    ws["!cols"] = COLUNAS_EXPORT.map(() => ({ wch: 18 }));
    ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: data.length, c: COLUNAS_EXPORT.length - 1 } }) };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clientes");
    XLSX.writeFile(wb, `clientes-${kind}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    logAudit({ categoria: "exportacao", acao: "exportar", descricao: `Exportação de clientes (${kind})`, entidade: "clientes", metadata: { kind, total: rows.length } });
  }

  async function importar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any>(ws);
    e.target.value = "";
    if (rows.length === 0) return toast.error("Planilha vazia.");
    const MAX_ROWS = 5000;
    if (rows.length > MAX_ROWS) {
      return toast.error(`Limite de ${MAX_ROWS} clientes por importação. Sua planilha tem ${rows.length} linhas.`);
    }
    setImportOpen(true);
    setImportLoading(true);
    setImportRows([]);
    setImportMapping([]);
    setImportUnmapped([]);
    try {
      // Normaliza em blocos para suportar planilhas grandes (até 5000 linhas)
      // sem estourar o limite de payload do servidor.
      const CHUNK = 500;
      const servs = (servidores as any[]).map((s) => ({ id: s.id, nome: s.nome }));
      let allRows: NormalizedRow[] = [];
      let mapping: any[] = [];
      let unmapped: string[] = [];
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK) as Record<string, unknown>[];
        const res = await normalizeImportRows({ data: { rows: slice, servidores: servs } });
        allRows = allRows.concat(res.rows);
        if (i === 0) {
          mapping = res.mapping ?? [];
          unmapped = res.unmapped ?? [];
        }
      }
      setImportRows(allRows);
      setImportMapping(mapping);
      setImportUnmapped(unmapped);
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao processar planilha");
      setImportOpen(false);
    } finally {
      setImportLoading(false);
    }
  }

  async function confirmImport(rows: NormalizedRow[]) {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;
    const toPayload = (r: NormalizedRow) => ({
      user_id: user.id,
      nome: r.nome || "Sem nome",
      telefone: r.telefone || "",
      servidor_id: r.servidor_id,
      data_inicio: r.data_inicio ?? undefined,
      data_vencimento: r.data_vencimento,
      status: r.status as any,
      status_pagamento: r.status_pagamento as any,
      valor_pago: r.valor_pago,
      mac: r.mac,
      device: r.device,
      aplicativo: r.aplicativo,
      observacao: r.observacao,
    });

    // Insert in smaller batches so the UI can render progress between chunks.
    // On batch failure, fall back to per-row inserts to isolate bad rows.
    const BATCH = 100;
    const total = rows.length;
    let done = 0;
    let ok = 0;
    let fail = 0;
    const failures: { nome: string; msg: string }[] = [];

    setImporting(true);
    setImportProgress({ total, done: 0, ok: 0, fail: 0 });
    // Yield to the browser so the progress bar shows before the first insert
    await new Promise((r) => setTimeout(r, 0));

    try {
      for (let i = 0; i < rows.length; i += BATCH) {
        const chunkRows = rows.slice(i, i + BATCH);
        const chunk = chunkRows.map(toPayload);
        const { error } = await supabase.from("clientes").insert(chunk);
        if (!error) {
          ok += chunk.length;
          done += chunk.length;
        } else {
          for (let j = 0; j < chunk.length; j++) {
            const { error: e2 } = await supabase.from("clientes").insert(chunk[j]);
            if (e2) {
              failures.push({ nome: chunkRows[j].nome || `(linha ${i + j + 1})`, msg: e2.message });
              fail++;
            } else {
              ok++;
            }
            done++;
            if (done % 25 === 0) {
              setImportProgress({ total, done, ok, fail });
              await new Promise((r) => setTimeout(r, 0));
            }
          }
        }
        setImportProgress({ total, done, ok, fail });
        await new Promise((r) => setTimeout(r, 0));
        // Pausa leve a cada 50 registros processados para não travar a UI
        if (Math.floor(done / 50) > Math.floor((done - chunkRows.length) / 50)) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    } finally {
      setImporting(false);
    }

    if (ok > 0) toast.success(`${ok} cliente(s) importado(s)!`);
    await logAudit({ categoria: "importacao", acao: "importar", descricao: `Importação de clientes concluída`, entidade: "clientes", metadata: { total, ok, fail } });
    if (failures.length > 0) {
      toast.error(`${failures.length} linha(s) com erro. Corrija manualmente. Ex: ${failures[0].nome} — ${failures[0].msg}`);
      console.error("Falhas na importação:", failures);
    }
    qc.invalidateQueries({ queryKey: ["clientes"] });
    if (failures.length === 0) {
      setImportOpen(false);
      setImportProgress(null);
    }
  }

  function baixarModelo() {
    const exemplo = [
      {
        Cliente: "João da Silva",
        Telefone: "11999999999",
        Servidor: (servidores as any[])[0]?.nome ?? "UNITV 01",
        "Data Início": formatDateTimeBR(new Date()),
        Vencimento: formatDateBR(new Date()),
        Status: "ativo",
        Pagamento: "pago",
        Custo: 9,
        "Valor Pago": 30,
        Lucro: 21,
        MAC: "00:1A:2B:3C:4D:5E",
        Device: "Smart TV Samsung",
        Aplicativo: "IBO Player",
        "Observação": "Cliente exemplo - remova esta linha",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(exemplo, {
      header: COLUNAS_PADRAO,
    });
    ws["!cols"] = COLUNAS_PADRAO.map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clientes");
    XLSX.writeFile(wb, "modelo-importacao-clientes.xlsx");
    toast.success("Modelo baixado!");
  }

  async function atualizarDaPlanilha(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any>(ws);
    e.target.value = "";
    if (rows.length === 0) return toast.error("Planilha vazia.");

    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return toast.error("Sessão expirada");

    // Normaliza via server fn em blocos
    const CHUNK = 500;
    const servs = (servidores as any[]).map((s) => ({ id: s.id, nome: s.nome }));
    let normRows: NormalizedRow[] = [];
    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK) as Record<string, unknown>[];
        const res = await normalizeImportRows({ data: { rows: slice, servidores: servs } });
        normRows = normRows.concat(res.rows);
      }
    } catch (err: any) {
      return toast.error(err?.message ?? "Falha ao processar planilha");
    }

    const normKey = (s: string) =>
      String(s ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const digits = (s: string) => String(s ?? "").replace(/\D/g, "");

    const byNome = new Map<string, any>();
    const byTel = new Map<string, any>();
    for (const c of clientes as any[]) {
      const kn = normKey(c.nome);
      if (kn) byNome.set(kn, c);
      const kt = digits(c.telefone);
      if (kt) byTel.set(kt, c);
    }

    const total = normRows.length;
    let done = 0, updated = 0, skipped = 0, notFound = 0;
    setUpdateProgress({ total, done: 0, updated: 0, skipped: 0, notFound: 0 });
    await new Promise((r) => setTimeout(r, 0));

    const FIELDS: (keyof NormalizedRow)[] = [
      "telefone", "servidor_id", "data_inicio", "data_vencimento",
      "status", "status_pagamento", "valor_pago",
      "mac", "device", "aplicativo", "observacao",
    ];

    for (const r of normRows) {
      done++;
      const existing =
        byNome.get(normKey(r.nome)) ||
        (r.telefone ? byTel.get(digits(r.telefone)) : undefined);
      if (!existing) { notFound++; continue; }

      const patch: Record<string, any> = {};
      for (const f of FIELDS) {
        const val = (r as any)[f];
        const isEmpty = val === null || val === undefined || val === "" || (typeof val === "number" && val === 0 && f === "valor_pago" && Number(existing.valor_pago || 0) > 0);
        if (isEmpty) continue;
        const cur = (existing as any)[f];
        const curCmp = cur ?? "";
        const valCmp = val ?? "";
        if (String(curCmp) !== String(valCmp)) patch[f] = val;
      }

      if (Object.keys(patch).length === 0) {
        skipped++;
      } else {
        const { error } = await supabase.from("clientes").update(patch as any).eq("id", existing.id);
        if (error) {
          console.error("Falha ao atualizar", existing.nome, error);
          skipped++;
        } else {
          updated++;
        }
      }

      if (done % 25 === 0) {
        setUpdateProgress({ total, done, updated, skipped, notFound });
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    setUpdateProgress({ total, done, updated, skipped, notFound });
    await new Promise((r) => setTimeout(r, 400));
    setUpdateProgress(null);

    if (updated > 0) toast.success(`${updated} cliente(s) atualizado(s).`);
    await logAudit({ categoria: "importacao", acao: "atualizar_planilha", descricao: `Atualização em massa via planilha`, entidade: "clientes", metadata: { total, updated, skipped, notFound } });
    if (notFound > 0) toast.warning(`${notFound} não encontrado(s) pelo nome/telefone.`);
    if (updated === 0 && notFound === 0) toast.info("Nenhuma divergência encontrada.");
    qc.invalidateQueries({ queryKey: ["clientes"] });
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="h-6 w-6 text-primary"/> Clientes</h1>
          <p className="text-sm text-muted-foreground">Cadastro e gerenciamento completo</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={importar} />
          <input ref={updateFileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={atualizarDaPlanilha} />
          <Button variant="outline" size="sm" onClick={baixarModelo}><FileDown className="h-4 w-4 mr-1"/> Modelo</Button>
          <Button variant="outline" size="sm" onClick={() => updateFileRef.current?.click()} title="Atualiza apenas dados divergentes de clientes existentes"><RefreshCw className="h-4 w-4 mr-1"/> Atualizar</Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 mr-1"/> Importar</Button>
          <EnviosMassaDialog clientes={clientes} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1"/> Exportar</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportar("todos")}>Todos</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportar("ativos")}>Apenas ativos</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportar("pendentes")}>Pendentes (devendo)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportar("vencidos_2d")}>Vencidos há 2 dias</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportar("vencidos_1d")}>Vencidos há 1 dia</DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportar("vence_hoje")}>Vence hoje</DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportar("vence_amanha")}>Vence amanhã</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={newCliente}><Plus className="h-4 w-4 mr-1"/> Novo cliente</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="destructive" size="sm" title="Opções de exclusão em massa">
                <Trash className="h-4 w-4 mr-1"/> Excluir…
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={excluirTodosClientes}>Excluir TODOS os clientes</DropdownMenuItem>
              <DropdownMenuItem onClick={toggleSelectionMode}>
                {selectionMode ? "Cancelar seleção" : "Selecionar para excluir"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {selectionMode && (
        <Card className="p-2 flex items-center justify-between gap-2 border-red-500/40 bg-red-500/5">
          <div className="text-sm">
            <span className="font-semibold">{selected.size}</span> selecionado(s) de {filtered.length} visível(is)
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={toggleSelectAllVisible}>
              {filtered.length > 0 && filtered.every((c: any) => selected.has(c.id)) ? "Desmarcar todos" : "Marcar todos visíveis"}
            </Button>
            <Button size="sm" variant="outline" onClick={toggleSelectionMode}>Cancelar</Button>
            <Button size="sm" variant="destructive" onClick={excluirSelecionados} disabled={selected.size === 0}>
              <Trash className="h-4 w-4 mr-1"/> Excluir selecionados ({selected.size})
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
        <StatCard label="Total" value={stats.total} icon={Users} tone="blue" />
        <StatCard label="Pendentes" value={stats.pendentes} icon={AlertTriangle} tone="yellow" />
        <StatCard label="Vencidos há 2 dias" value={stats.vencidos2} icon={AlertTriangle} tone="red" />
        <StatCard label="Vencidos há 1 dia" value={stats.vencidos1} icon={AlertTriangle} tone="red" />
        <StatCard label="Vence hoje" value={stats.hoje} icon={Clock} tone="orange" />
        <StatCard label="Vence amanhã" value={stats.amanha} icon={CalendarClock} tone="purple" />
      </div>

      <Card className="p-2 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, telefone, MAC, device, app..." className="pl-9 h-9" />
        </div>
        <Select value={filtro} onValueChange={setFiltro}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue/></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="ativos">Ativos</SelectItem>
            <SelectItem value="vencidos">Vencidos</SelectItem>
            <SelectItem value="hoje">Vencendo hoje</SelectItem>
            <SelectItem value="amanha">Vencendo amanhã</SelectItem>
            <SelectItem value="pagos">Pagos</SelectItem>
            <SelectItem value="devendo">Devendo</SelectItem>
          </SelectContent>
        </Select>
        <Select value={servidorFiltro} onValueChange={setServidorFiltro}>
          <SelectTrigger className="w-[170px] h-9">
            <SelectValue placeholder="Servidor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos servidores</SelectItem>
            <ServidorSelectItems servidores={servidores as any[]} />
          </SelectContent>
        </Select>
        <DensityToggle value={density} onChange={setDensity} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9" title="Escolher colunas">
              <Columns3 className="h-4 w-4 mr-1" /> Colunas
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Exibir colunas</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {COLUNAS_TABELA.map((col) => (
              <DropdownMenuItem key={col} onSelect={(e) => { e.preventDefault(); toggleCol(col); }}>
                <input type="checkbox" className="mr-2" checked={showCol(col)} readOnly />
                {col}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </Card>

      <Card className="overflow-hidden">
        <div className={`overflow-x-auto ${densityClass(density)}`}>
          <Table>
            <TableHeader className="bg-primary/10">
              <TableRow>
                {selectionMode && (
                  <TableHead className="w-8">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos visíveis"
                      checked={filtered.length > 0 && filtered.every((c: any) => selected.has(c.id))}
                      onChange={toggleSelectAllVisible}
                    />
                  </TableHead>
                )}
                <TableHead>Cliente</TableHead>
                {showCol("Celular") && <TableHead className="whitespace-nowrap">Celular</TableHead>}
                {showCol("Servidor") && <TableHead>Servidor</TableHead>}
                {showCol("Início") && <TableHead>Início</TableHead>}
                {showCol("Vencimento") && <TableHead>Vencimento</TableHead>}
                {showCol("Status") && <TableHead>Status</TableHead>}
                {showCol("Dias") && <TableHead>Dias</TableHead>}
                {showCol("Pgto") && <TableHead>Pgto</TableHead>}
                {showCol("Custo") && <TableHead>Custo</TableHead>}
                {showCol("Valor") && <TableHead>Valor</TableHead>}
                {showCol("Lucro") && <TableHead>Lucro</TableHead>}
                {showCol("MAC") && <TableHead>MAC</TableHead>}
                {showCol("Device") && <TableHead>Device</TableHead>}
                {showCol("App") && <TableHead>App</TableHead>}
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((c: any) => {
                const dias = diasParaVencer(c.data_vencimento);
                const custo = custoCliente(c, historico);
                const lucro = Number(c.valor_pago) - custo;
                const sm = statusMeta(c.status);
                return (
                  <TableRow key={c.id} className="text-xs">
                    {selectionMode && (
                      <TableCell className="w-8">
                        <input
                          type="checkbox"
                          aria-label={`Selecionar ${c.nome}`}
                          checked={selected.has(c.id)}
                          onChange={() => toggleSelected(c.id)}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium"><CopyableCell value={c.nome} /></TableCell>
                    {showCol("Celular") && <TableCell>
                      {c.telefone ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger className="text-blue-400 hover:underline whitespace-nowrap">{maskPhoneBR(c.telefone)}</DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => window.open(whatsappLink(c.telefone), "_blank")}>Abrir WhatsApp</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(c.telefone); toast.success("Copiado"); }}>Copiar</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : "-"}
                    </TableCell>}
                    {showCol("Servidor") && <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="text-blue-400 hover:underline">
                          {c.servidor?.nome ?? "Selecionar"}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="max-h-64 overflow-auto">
                          <ServidorDropdownItems servidores={servidores as any[]} onSelect={(s) => changeServidor(c.id, s.id)} />
                          {(servidores as any[]).length === 0 && (
                            <DropdownMenuItem disabled>Nenhum servidor cadastrado</DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>}
                    {showCol("Início") && <TableCell className="whitespace-nowrap">{formatDateBR(c.data_inicio)}</TableCell>}
                    {showCol("Vencimento") && <TableCell className="whitespace-nowrap">{formatDateBR(c.data_vencimento)}</TableCell>}
                    {showCol("Status") && <TableCell>{(() => {
                      let cls = `${sm.color} border`;
                      let label: string = sm.label;
                      if (dias !== null) {
                        if (dias < 0) { cls = "bg-red-500/20 text-red-400 border border-red-500/40"; label = "VENCIDO"; }
                        else if (dias === 0) { cls = "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40"; label = "VENCE HOJE"; }
                        else if (dias === 1) { cls = "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"; label = "VENCE EM 1 DIA"; }
                        else if (dias === 2) { cls = "bg-blue-500/20 text-blue-400 border border-blue-500/40"; label = "VENCE EM 2 DIAS"; }
                        else { cls = "border"; label = "ATIVO"; }
                      }
                      return <Badge className={cls}>{label}</Badge>;
                    })()}</TableCell>}
                    {showCol("Dias") && <TableCell className={`font-bold ${dias === null ? "" : dias < 0 ? "text-red-400" : dias <= 3 ? "text-orange-400" : "text-emerald-400"}`}>
                      {dias === null ? "-" : `${dias}d`}
                    </TableCell>}
                    {showCol("Pgto") && <TableCell>
                      <Badge className={c.status_pagamento === "pago" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" : "bg-red-500/20 text-red-400 border border-red-500/40"}>
                        {c.status_pagamento === "pago" ? "PAGO" : "DEVENDO"}
                      </Badge>
                    </TableCell>}
                    {showCol("Custo") && <TableCell className="text-red-400">{currencyBRL(custo)}</TableCell>}
                    {showCol("Valor") && <TableCell className="text-emerald-400">{currencyBRL(c.valor_pago)}</TableCell>}
                    {showCol("Lucro") && <TableCell className={lucro >= 0 ? "text-blue-400 font-semibold" : "text-red-400 font-semibold"}>{currencyBRL(lucro)}</TableCell>}
                    {showCol("MAC") && <TableCell className="font-mono">
                      <CopyableCell value={c.mac} />
                    </TableCell>}
                    {showCol("Device") && <TableCell className="font-mono">
                      <CopyableCell value={c.device} />
                    </TableCell>}
                    {showCol("App") && <TableCell>{c.aplicativo || "-"}</TableCell>}
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <IconBtn title="Editar" onClick={() => editCliente(c)}><Pencil className="h-3.5 w-3.5"/></IconBtn>
                        <IconBtn title="Renovar / Adicionar Dias" onClick={() => { setRenovCliente(c); setRenovOpen(true); }}>
                          <RefreshCw className="h-3.5 w-3.5"/>
                        </IconBtn>
                        <IconBtn title="Copiar comprovante" onClick={() => copiarComprovante(c)}><ClipboardCopy className="h-3.5 w-3.5 text-emerald-400"/></IconBtn>
                        <IconBtn title="Reverter renovação" onClick={() => reverterRenovacao(c)}><Undo2 className="h-3.5 w-3.5 text-amber-400"/></IconBtn>
                        <IconBtn
                          title={c.status_pagamento === "pago" ? "Marcar como DEVENDO" : "Marcar como PAGO"}
                          onClick={() => togglePagamento(c)}
                        >
                          <DollarIcon className={`h-3.5 w-3.5 ${c.status_pagamento === "pago" ? "text-emerald-400" : "text-red-400"}`}/>
                        </IconBtn>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" title="Mais ações" className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted">
                              <MoreVertical className="h-4 w-4"/>
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel className="truncate">{c.nome}</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => ficha(c)}><Eye className="h-4 w-4 mr-2"/>Visualizar</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => editCliente(c)}><Pencil className="h-4 w-4 mr-2"/>Editar</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => duplicate(c)}><Copy className="h-4 w-4 mr-2"/>Duplicar cliente</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setRenovCliente(c); setRenovOpen(true); }}><RefreshCw className="h-4 w-4 mr-2"/>Renovar</DropdownMenuItem>
                             <DropdownMenuItem onClick={() => { setAtivCliente(c); setAtivOpen(true); }}><Smartphone className="h-4 w-4 mr-2"/>Ativar aplicativo</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => enviarCredenciais(c)}><Send className="h-4 w-4 mr-2"/>Copiar credenciais</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => copiarComprovante(c)}><ClipboardCopy className="h-4 w-4 mr-2"/>Copiar comprovante</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleCopiarImagemVencimento(c)}><Copy className="h-4 w-4 mr-2 text-cyan-400"/>Copiar Imagem de Vencimento</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleGerarImagemVencimento(c)}><ImageIcon className="h-4 w-4 mr-2 text-emerald-400"/>Gerar Imagem de Vencimento</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(c.nome ?? ""); toast.success("Nome copiado"); }}><User className="h-4 w-4 mr-2"/>Copiar nome</DropdownMenuItem>
                            <DropdownMenuItem disabled={!c.telefone} onClick={() => { navigator.clipboard.writeText(c.telefone ?? ""); toast.success("Telefone copiado"); }}><Phone className="h-4 w-4 mr-2"/>Copiar telefone</DropdownMenuItem>
                            <DropdownMenuItem disabled={!c.mac} onClick={() => { navigator.clipboard.writeText(c.mac ?? ""); toast.success("MAC/Login copiado"); }}><Copy className="h-4 w-4 mr-2"/>Copiar MAC/Login</DropdownMenuItem>
                            <DropdownMenuItem disabled={!c.device} onClick={() => { navigator.clipboard.writeText(c.device ?? ""); toast.success("Device/Senha copiado"); }}><Copy className="h-4 w-4 mr-2"/>Copiar Device/Senha</DropdownMenuItem>
                            <DropdownMenuItem disabled={!c.telefone} onClick={() => window.open(whatsappLink(c.telefone), "_blank")}><MessageCircle className="h-4 w-4 mr-2"/>Abrir WhatsApp</DropdownMenuItem>
                             
                             <DropdownMenuSeparator />
                             <DropdownMenuItem onClick={() => remove(c.id)}><Archive className="h-4 w-4 mr-2"/>Arquivar</DropdownMenuItem>
                             <DropdownMenuItem className="text-red-400 focus:text-red-400" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4 mr-2"/>Excluir</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {pageItems.length === 0 && (
                <TableRow><TableCell colSpan={colunasVisiveis + (selectionMode ? 3 : 2)} className="text-center text-muted-foreground py-10">Nenhum cliente encontrado.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <PaginationControls
          total={totalFiltered}
          loaded={loaded}
          pageSize={pageSize}
          page={safePage}
          onPageSizeChange={(v) => { setPageSize(v); setPage(1); }}
          onPageChange={setPage}
          onLoadMore={() => setLoadedCount((n) => Math.min(n + LOAD_STEP, totalFiltered))}
          label="clientes"
        />
      </Card>

      <ImportReviewDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        rows={importRows}
        mapping={importMapping}
        unmapped={importUnmapped}
        servidores={(servidores as any[]).map((s) => ({ id: s.id, nome: s.nome }))}
        loading={importLoading}
        importing={importing}
        progress={importProgress}
        onConfirm={confirmImport}
      />

      <Dialog open={!!deleteAllProgress}>
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Excluindo todos os clientes</DialogTitle>
            <DialogDescription>
              Excluindo em lotes de 20. Não feche esta janela.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Progress value={deleteAllProgress?.display ?? 0} />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{deleteAllProgress?.done ?? 0} de {deleteAllProgress?.total ?? 0}</span>
              <span className="font-medium">{deleteAllProgress?.display ?? 0}%</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!updateProgress}>
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Atualizando clientes</DialogTitle>
            <DialogDescription>
              Comparando com a planilha e atualizando apenas dados divergentes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Progress value={updateProgress ? Math.floor((updateProgress.done / Math.max(1, updateProgress.total)) * 100) : 0} />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{updateProgress?.done ?? 0} de {updateProgress?.total ?? 0}</span>
              <span>Atualizados: <b className="text-foreground">{updateProgress?.updated ?? 0}</b> · Sem mudanças: {updateProgress?.skipped ?? 0} · Não encontrados: {updateProgress?.notFound ?? 0}</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {open && (
        <ClienteDialog
          open={open}
          onOpenChange={setOpen}
          editing={editing}
          servidores={servidores as any[]}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["clientes"] });
            setOpen(false);
            setEditing(null);
          }}
        />
      )}
      {renovOpen && renovCliente && (
        <AcrescentarDiasDialog
          open={renovOpen}
          onOpenChange={setRenovOpen}
          cliente={renovCliente}
        />
      )}
      {fichaOpen && fichaCliente && (
        <FichaClienteDialog
          open={fichaOpen}
          onOpenChange={setFichaOpen}
          cliente={fichaCliente}
          historico={historico}
        />
      )}
      {ativOpen && ativCliente && (
        <AtivacaoClienteDialog 
          open={ativOpen}
          onOpenChange={setAtivOpen}
          cliente={ativCliente} 
        />
      )}
    </div>
  );
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button title={title} onClick={onClick} className="h-7 w-7 rounded-md grid place-items-center hover:bg-accent">{children}</button>
  );
}

function CopyableCell({ value }: { value?: string | null }) {
  if (!value) return <>-</>;
  return (
    <div className="inline-flex items-center gap-1">
      <span>{value}</span>
      <button
        title="Copiar"
        onClick={() => { navigator.clipboard.writeText(value); toast.success("Copiado"); }}
        className="h-6 w-6 rounded-md grid place-items-center hover:bg-accent"
      >
        <Copy className="h-3 w-3" />
      </button>
    </div>
  );
}