import { ServidorSelectItems, ServidorDropdownItems } from "@/lib/servidores-ui";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { fetchRevendedores, fetchServidores, fetchRevendedoresMovs, fetchSaldosCreditos } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { registrarMovimentacaoCredito } from "@/lib/creditos";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/components/stat-card";
import { Handshake, Plus, Pencil, Trash2, RefreshCw, Wallet, DollarSign, TrendingUp, Users, Upload, Download, ClipboardCopy, UserCheck, UserX, Package, CalendarDays, FileDown, Copy, Search, ArrowUpDown, KeyRound, Send, FileText, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { currencyBRL, formatDateBR, formatDateTimeBR, maskPhoneBR, toISODate, parseDateOnly, whatsappLink, phoneToE164 } from "@/lib/iptv";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { MessageCircle } from "lucide-react";
import * as XLSX from "xlsx";

import { logAudit, diffObjects } from "@/lib/audit";
import { DensityToggle, densityClass, type Density } from "@/components/density-toggle";
import { PaginationControls, type PageSize } from "@/components/pagination-controls";
import { confirmDialog } from "@/lib/confirm";

const COLUNAS_REV = [
  "Nome",
  "Telefone",
  "Servidor",
  "Login",
  "Senha",
  "Data Recarga",
  "Dias Validade",
  "Créditos",
  "Status",
  "Pagamento",
  "Valor Venda",
  "Custo",
  "Lucro",
  "Observação",
];

export const Route = createFileRoute("/_authenticated/revendedores")({
  component: RevendedoresPage,
});

function diasRestantes(r: any): number | null {
  if (!r.data_recarga) return null;
  const base = parseDateOnly(r.data_recarga);
  const fim = new Date(base);
  fim.setDate(fim.getDate() + Number(r.dias_validade || 0));
  const diff = Math.ceil((fim.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return diff;
}

function statusBadge(r: any) {
  const s = r.status;
  const map: Record<string, string> = {
    ativo: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
    vencido: "bg-red-500/20 text-red-400 border-red-500/40",
    suspenso: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  };
  return <Badge variant="outline" className={map[s] ?? ""}>{s?.toUpperCase()}</Badge>;
}

function RevendedoresPage() {
  const qc = useQueryClient();
  const { data: revs = [] } = useQuery({ queryKey: ["revendedores"], queryFn: fetchRevendedores });
  const { data: servidores = [] } = useQuery({ queryKey: ["servidores"], queryFn: fetchServidores });
  const { data: movs = [] } = useQuery({ queryKey: ["revendedores_movs"], queryFn: fetchRevendedoresMovs });
  const { data: saldos = {} } = useQuery({ queryKey: ["creditos_saldos"], queryFn: fetchSaldosCreditos });
  const { data: paineis = [] } = useQuery({
    queryKey: ["paineis_info"],
    queryFn: async () => {
      const { data, error } = await supabase.from("paineis_info").select("servidor,url");
      if (error) throw error;
      return data ?? [];
    },
  });
  const urlPorServidor = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of paineis as any[]) {
      const key = String(p?.servidor ?? "").trim().toLowerCase();
      if (key && p?.url) map.set(key, String(p.url));
    }
    return map;
  }, [paineis]);
  const painelUrlDoRev = (r: any) => {
    const nome = String(r?.servidor?.nome ?? "").trim().toLowerCase();
    return nome ? (urlPorServidor.get(nome) ?? "") : "";
  };

  // Assina realtime para atualizar créditos automaticamente a cada movimentação
  useEffect(() => {
    const ch = supabase
      .channel("revendedores-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "revendedores_movimentacoes" }, () => {
        qc.invalidateQueries({ queryKey: ["revendedores_movs"] });
        qc.invalidateQueries({ queryKey: ["revendedores"] });
        qc.invalidateQueries({ queryKey: ["creditos_saldos"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "revendedores" }, () => {
        qc.invalidateQueries({ queryKey: ["revendedores"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "creditos_movimentacoes" }, () => {
        qc.invalidateQueries({ queryKey: ["creditos_saldos"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [renovOpen, setRenovOpen] = useState(false);
  const [renovRev, setRenovRev] = useState<any | null>(null);
  const [ajusteOpen, setAjusteOpen] = useState(false);
  const [ajusteRev, setAjusteRev] = useState<any | null>(null);
  const [importProgress, setImportProgress] = useState<{ total: number; done: number; ok: number; fail: number } | null>(null);
  const [importing, setImporting] = useState(false);
  type FailedRow = { id: string; row: any; error: string; retrying?: boolean };
  const [failedRows, setFailedRows] = useState<FailedRow[]>([]);
  const [filtro, setFiltro] = useState("");
  const [sortMode, setSortMode] = useState<"recente" | "antiga" | "az" | "za">("recente");
  const [desempSort, setDesempSort] = useState<"recente" | "antiga" | "az" | "za">("recente");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelMov, setCancelMov] = useState<any | null>(null);
  const [cancelMotivo, setCancelMotivo] = useState("");
  const [cancelSaving, setCancelSaving] = useState(false);
  const [relatorioOpen, setRelatorioOpen] = useState(false);
  const [relatorioRev, setRelatorioRev] = useState<any | null>(null);

  const [density, setDensity] = useState<Density>("compact");
  const [pageRevs, setPageRevs] = useState(1);
  const [pageSizeRevs, setPageSizeRevs] = useState<PageSize>(10);
  const [pageDesemp, setPageDesemp] = useState(1);
  const [pageSizeDesemp, setPageSizeDesemp] = useState<PageSize>(10);
  const [pageMovs, setPageMovs] = useState(1);
  const [pageSizeMovs, setPageSizeMovs] = useState<PageSize>(10);


  async function confirmarCancelamento() {
    if (!cancelMov) return;
    setCancelSaving(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;
      const qtd = Number(cancelMov.quantidade || 0);
      const valor = Number(cancelMov.valor_pago || 0);
      const custo = Number(cancelMov.custo || 0);
      const lucro = Number(cancelMov.lucro || 0);

      const { error: upErr } = await supabase
        .from("revendedores_movimentacoes")
        .update({
          status_venda: "cancelada",
          cancelada_em: new Date().toISOString(),
          cancelada_por: user.id,
          motivo_cancelamento: cancelMotivo || null,
        })
        .eq("id", cancelMov.id);
      if (upErr) throw upErr;

      // Devolve o crédito ao servidor (a venda havia debitado o servidor)
      if (cancelMov.servidor_id && qtd > 0) {
        await registrarMovimentacaoCredito({
          servidor_id: cancelMov.servidor_id,
          quantidade: qtd,
          tipo: "ajuste_add",
          motivo: `Estorno de venda p/ ${cancelMov.revendedor?.nome ?? "revendedor"}${cancelMotivo ? ` — ${cancelMotivo}` : ""}`,
        });
      }

      // Reduz créditos do revendedor
      if (cancelMov.revendedor_id && qtd > 0) {
        const { data: rev } = await supabase
          .from("revendedores")
          .select("creditos")
          .eq("id", cancelMov.revendedor_id)
          .maybeSingle();
        const atual = Number(rev?.creditos || 0);
        await supabase
          .from("revendedores")
          .update({ creditos: Math.max(0, atual - qtd) })
          .eq("id", cancelMov.revendedor_id);
      }

      // Estorno no histórico financeiro (valores negativos, não apaga)
      await supabase.from("historico_financeiro").insert({
        user_id: user.id,
        tipo: "estorno_revendedor",
        valor: -valor,
        custo: -custo,
        lucro: -lucro,
        descricao: `Estorno de venda ${qtd} créditos p/ ${cancelMov.revendedor?.nome ?? "revendedor"}${cancelMotivo ? ` — ${cancelMotivo}` : ""}`,
      });

      toast.success("Venda cancelada e valores estornados");
      await logAudit({ categoria: "venda_credito", acao: "cancelar_venda", descricao: `Venda de ${qtd} créditos p/ ${cancelMov.revendedor?.nome ?? "revendedor"} cancelada`, entidade: "revendedores_movimentacoes", entidade_id: cancelMov.id, entidade_nome: cancelMov.revendedor?.nome ?? null, metadata: { qtd, valor, custo, lucro, motivo: cancelMotivo || null } });
      qc.invalidateQueries();
      setCancelOpen(false);
      setCancelMov(null);
      setCancelMotivo("");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao cancelar venda");
    } finally {
      setCancelSaving(false);
    }
  }

  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const validStatus = new Set(["ativo", "vencido", "suspenso"]);
  const validPag = new Set(["pago", "devendo"]);
  const normStatus = (v: any) => {
    const s = norm(String(v ?? ""));
    if (validStatus.has(s)) return s;
    if (s.startsWith("ativ")) return "ativo";
    if (s.startsWith("venc")) return "vencido";
    if (s.startsWith("susp")) return "suspenso";
    return "ativo";
  };
  const normPag = (v: any) => {
    const s = norm(String(v ?? ""));
    if (validPag.has(s)) return s;
    if (s.startsWith("pag") || s === "ok" || s === "sim") return "pago";
    return "devendo";
  };

  async function insertRevendedor(r: any, userId: string) {
    let sid = r.servidor_id as string | undefined;
    const servNome = String(r.servidor ?? "").trim();
    if (!sid && servNome) {
      const found = (servidores as any[]).find(
        (s) => norm(s.nome) === norm(servNome)
      );
      if (found) {
        sid = found.id;
      } else {
        // Cria o servidor se não existir
        const { data: newServ } = await supabase
          .from("servidores")
          .insert({
            nome: servNome,
            user_id: userId,
            categoria: "IPTV",
            custo_mensal: 0,
          } as any)
          .select("id")
          .single();
        if (newServ?.id) sid = newServ.id;
      }
    }

    const payload = {
      user_id: userId,
      nome: String(r.nome ?? "").trim(),
      telefone: r.telefone ? String(r.telefone).replace(/\D/g, "") : null,
      servidor_id: sid ?? null,
      login: r.login ? String(r.login).trim() : null,
      senha: r.senha ? String(r.senha).trim() : "123456",
      data_recarga: r.data_recarga ?? null,
      dias_validade: Number(r.dias_validade) || 30,
      creditos: Number(r.creditos) || 0,
      status: normStatus(r.status) as any,
      status_pagamento: normPag(r.status_pagamento) as any,
      valor_compra: Number(r.valor_compra) || 0,
      valor_venda: Number(r.valor_venda) || 0,
      custo: Number(r.custo) || (Number(r.valor_compra) || 0),
      lucro: Number(r.lucro) || ((Number(r.valor_venda) || 0) - (Number(r.custo) || Number(r.valor_compra) || 0)),
      observacao: r.observacao ? String(r.observacao) : null,
      updated_at: new Date().toISOString(),
    };

    // Verifica se já existe um revendedor com o mesmo login ou mesmo nome+servidor
    let existingId: string | null = null;
    if (payload.login) {
      const { data: ex } = await supabase
        .from("revendedores")
        .select("id")
        .eq("login", payload.login)
        .maybeSingle();
      if (ex?.id) existingId = ex.id;
    }
    if (!existingId && payload.nome) {
      let query = supabase.from("revendedores").select("id").eq("nome", payload.nome);
      if (payload.servidor_id) query = query.eq("servidor_id", payload.servidor_id);
      const { data: ex } = await query.maybeSingle();
      if (ex?.id) existingId = ex.id;
    }

    if (existingId) {
      return await supabase.from("revendedores").update(payload as any).eq("id", existingId);
    } else {
      return await supabase.from("revendedores").insert(payload as any);
    }
  }

  function updateFailed(id: string, patch: Partial<any>) {
    setFailedRows((prev) => prev.map((f) => f.id === id ? { ...f, row: { ...f.row, ...patch } } : f));
  }

  async function retryFailed(id: string) {
    const target = failedRows.find((f) => f.id === id);
    if (!target) return;
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) { toast.error("Sessão expirada"); return; }
    setFailedRows((prev) => prev.map((f) => f.id === id ? { ...f, retrying: true } : f));
    const { error } = await insertRevendedor(target.row, user.id);
    if (error) {
      setFailedRows((prev) => prev.map((f) => f.id === id ? { ...f, retrying: false, error: error.message } : f));
      toast.error(`Falhou: ${error.message}`);
      return;
    }
    setFailedRows((prev) => prev.filter((f) => f.id !== id));
    setImportProgress((p) => p ? { ...p, ok: p.ok + 1, fail: Math.max(0, p.fail - 1) } : p);
    toast.success("Revendedor importado");
    qc.invalidateQueries();
  }

  async function retryAllFailed() {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) { toast.error("Sessão expirada"); return; }
    const snapshot = [...failedRows];
    for (const f of snapshot) {
      setFailedRows((prev) => prev.map((x) => x.id === f.id ? { ...x, retrying: true } : x));
      const { error } = await insertRevendedor(f.row, user.id);
      if (error) {
        setFailedRows((prev) => prev.map((x) => x.id === f.id ? { ...x, retrying: false, error: error.message } : x));
      } else {
        setFailedRows((prev) => prev.filter((x) => x.id !== f.id));
        setImportProgress((p) => p ? { ...p, ok: p.ok + 1, fail: Math.max(0, p.fail - 1) } : p);
      }
    }
    qc.invalidateQueries();
    toast.success("Reprocessamento concluído");
  }

  function dismissFailed(id: string) {
    setFailedRows((prev) => prev.filter((f) => f.id !== id));
  }

  const totalRevendedores = revs.length;
  // Vendas canceladas/estornadas não entram em nenhum cálculo financeiro,
  // mas continuam no histórico para auditoria.
  const isCancelada = (m: any) => m?.status_venda === "cancelada";
  const movsAtivos = (movs as any[]).filter((m) => !isCancelada(m));
  // Totais somados a partir das movimentações de venda ATIVAS — reflete todo o
  // histórico e atualiza automaticamente a cada nova venda/ajuste/cancelamento.
  const isDevendo = (m: any) => (m.status_pagamento ?? "pago") === "devendo";
  const valorEfetivo = (m: any) => isDevendo(m) ? 0 : Number(m.valor_pago || 0);
  const lucroEfetivo = (m: any) => isDevendo(m) ? -Number(m.custo || 0) : Number(m.lucro ?? (Number(m.valor_pago || 0) - Number(m.custo || 0)));

  const receitaTotal = movsAtivos
    .filter((m) => m.tipo === "venda")
    .reduce((s, m) => s + valorEfetivo(m), 0);
  const custoTotal = movsAtivos
    .filter((m) => m.tipo === "venda")
    .reduce((s, m) => s + Number(m.custo || 0), 0);
  const lucroTotal = movsAtivos
    .filter((m) => m.tipo === "venda")
    .reduce((s, m) => s + lucroEfetivo(m), 0);

  // ---------- Métricas de atividade / vendas ----------
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);

  const vendas = movsAtivos.filter((m) => m.tipo === "venda" && Number(m.quantidade) > 0);

  const lastMovByRev = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of movs as any[]) {
      if (isCancelada(m)) continue;
      if (!m.revendedor_id) continue;
      const t = new Date(m.created_at).getTime();
      const prev = map.get(m.revendedor_id) ?? 0;
      if (t > prev) map.set(m.revendedor_id, t);
    }
    return map;
  }, [movs]);

  // Quantidade da ÚLTIMA venda de cada revendedor — cada compra é um registro
  // individual, sem acumular créditos de compras anteriores.
  const ultimaVendaQtdPorRev = useMemo(() => {
    const map = new Map<string, { t: number; qtd: number }>();
    for (const m of movs as any[]) {
      if (isCancelada(m)) continue;
      if (!m.revendedor_id) continue;
      if (m.tipo !== "venda" && m.tipo !== "renovacao") continue;
      const t = new Date(m.created_at).getTime();
      const prev = map.get(m.revendedor_id);
      if (!prev || t > prev.t) map.set(m.revendedor_id, { t, qtd: Number(m.quantidade || 0) });
    }
    return map;
  }, [movs]);
  const creditosDoRev = (r: any) => {
    const v = ultimaVendaQtdPorRev.get(r.id);
    return v ? v.qtd : Number(r.creditos || 0);
  };

  const revsAtivos = (revs as any[]).filter((r) => {
    const t = lastMovByRev.get(r.id);
    return t && t >= sixtyDaysAgo.getTime();
  }).length;
  const revsInativos = (revs as any[]).length - revsAtivos;

  const creditosHoje = vendas
    .filter((m) => new Date(m.created_at) >= startOfDay)
    .reduce((s, m) => s + Number(m.quantidade || 0), 0);
  const creditosMes = vendas
    .filter((m) => new Date(m.created_at) >= startOfMonth)
    .reduce((s, m) => s + Number(m.quantidade || 0), 0);
  const receitaHoje = movsAtivos
    .filter((m) => m.tipo === "venda" && new Date(m.created_at) >= startOfDay)
    .reduce((s, m) => s + valorEfetivo(m), 0);
  const receitaMes = movsAtivos
    .filter((m) => m.tipo === "venda" && new Date(m.created_at) >= startOfMonth)
    .reduce((s, m) => s + valorEfetivo(m), 0);
  const lucroHoje = movsAtivos
    .filter((m) => m.tipo === "venda" && new Date(m.created_at) >= startOfDay)
    .reduce((s, m) => s + lucroEfetivo(m), 0);
  const lucroMes = movsAtivos
    .filter((m) => m.tipo === "venda" && new Date(m.created_at) >= startOfMonth)
    .reduce((s, m) => s + lucroEfetivo(m), 0);

  // Painel "Revendedores" (movido da Dashboard)
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const vendasHoje = vendas.filter((m) => new Date(m.created_at) >= startOfDay).length;
  const creditosAno = vendas
    .filter((m) => new Date(m.created_at) >= startOfYear)
    .reduce((s, m) => s + Number(m.quantidade || 0), 0);
  const semMov30 = (revs as any[]).filter((r) => {
    const t = lastMovByRev.get(r.id);
    return !t || t < thirtyDaysAgo.getTime();
  }).length;
  const semMov60 = (revs as any[]).filter((r) => {
    const t = lastMovByRev.get(r.id);
    return !t || t < sixtyDaysAgo.getTime();
  }).length;

  // ---------- Filtro + ordenação global ----------
  const revsFiltrados = useMemo(() => {
    const term = filtro.trim().toLowerCase();
    let list = (revs as any[]).filter((r) => {
      if (!term) return true;
      return [r.nome, r.telefone, r.login, r.servidor?.nome]
        .some((x) => String(x ?? "").toLowerCase().includes(term));
    });
    const nameOf = (r: any) => String(r.nome ?? "").toLowerCase();
    const lastOf = (r: any) => {
      const t = lastMovByRev.get(r.id);
      if (t) return t;
      if (r.data_recarga) return parseDateOnly(r.data_recarga).getTime();
      return 0;
    };
    list = [...list].sort((a, b) => {
      const aAtivo = String(a.status ?? "").toLowerCase().startsWith("ativ") ? 0 : 1;
      const bAtivo = String(b.status ?? "").toLowerCase().startsWith("ativ") ? 0 : 1;
      if (aAtivo !== bAtivo) return aAtivo - bAtivo;
      if (sortMode === "az") return nameOf(a).localeCompare(nameOf(b));
      if (sortMode === "za") return nameOf(b).localeCompare(nameOf(a));
      if (sortMode === "antiga") return lastOf(a) - lastOf(b);
      return lastOf(b) - lastOf(a);
    });
    return list;
  }, [revs, filtro, sortMode, lastMovByRev]);

  // ---------- Tabela de desempenho ----------
  const desempenho = useMemo(() => {
    const list = (revsFiltrados as any[]).map((r) => {
      const mine = vendas.filter((m) => m.revendedor_id === r.id);
      const mesMine = mine.filter((m) => new Date(m.created_at) >= startOfMonth);
      const creditosMesRev = mesMine.reduce((s, m) => s + Number(m.quantidade || 0), 0);
      const receitaMesRev = mesMine.reduce((s, m) => s + Number(m.valor_pago || 0), 0);
      const lastT = lastMovByRev.get(r.id);
      const ativo = !!lastT && lastT >= sixtyDaysAgo.getTime();
      const ultima = lastT ? new Date(lastT) : null;
      return {
        id: r.id,
        nome: r.nome,
        ultima,
        creditosMes: creditosMesRev,
        receitaMes: receitaMesRev,
        ativo,
      };
    });
    const sorted = [...list].sort((a, b) => {
      if (a.ativo !== b.ativo) return a.ativo ? -1 : 1;
      const nA = String(a.nome ?? "").toLowerCase();
      const nB = String(b.nome ?? "").toLowerCase();
      const tA = a.ultima ? a.ultima.getTime() : 0;
      const tB = b.ultima ? b.ultima.getTime() : 0;
      if (desempSort === "az") return nA.localeCompare(nB);
      if (desempSort === "za") return nB.localeCompare(nA);
      if (desempSort === "antiga") return tA - tB;
      return tB - tA;
    });
    return sorted;
  }, [revsFiltrados, vendas, lastMovByRev, startOfMonth, sixtyDaysAgo, desempSort]);

  async function excluir(r: any) {
    const { confirmDialog } = await import("@/lib/confirm");
    const ok = await confirmDialog({ title: `Excluir revendedor "${r.nome}"?`, description: "Esta ação não pode ser desfeita.", confirmText: "Excluir", destructive: true });
    if (!ok) return;
    const { error } = await supabase.from("revendedores").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    await logAudit({ categoria: "revendedor", acao: "excluir", descricao: `Revendedor "${r.nome}" excluído`, entidade: "revendedores", entidade_id: r.id, entidade_nome: r.nome, dados_anteriores: r });
    toast.success("Excluído");
    qc.invalidateQueries();
  }

  /**
   * Alterna (ou força) o status de pagamento de um revendedor e de todas as
   * suas vendas ativas pendentes, lançando/estornando no faturamento do dia.
   */
  async function alternarPagamentoRev(r: any, forcar?: "pago" | "devendo") {
    const novo = forcar ?? (r.status_pagamento === "pago" ? "devendo" : "pago");
    const pendentes = (movs as any[]).filter(
      (m) => m.revendedor_id === r.id
        && m.tipo === "venda"
        && m.status_venda !== "cancelada"
        && (m.status_pagamento ?? "devendo") !== novo,
    );
    const { error: errRev } = await supabase
      .from("revendedores")
      .update({ status_pagamento: novo } as any)
      .eq("id", r.id);
    if (errRev) { toast.error(errRev.message); return; }
    const user = (await supabase.auth.getUser()).data.user;
    for (const m of pendentes) {
      const { error } = await supabase
        .from("revendedores_movimentacoes")
        .update({ status_pagamento: novo } as any)
        .eq("id", m.id);
      if (error) { toast.error(error.message); continue; }
      if (user) {
        if (novo === "pago") {
          await supabase.from("historico_financeiro").insert({
            user_id: user.id,
            tipo: "revendedor",
            valor: Number(m.valor_pago || 0),
            custo: 0,
            lucro: Number(m.valor_pago || 0),
            descricao: `Recebimento venda ${m.quantidade} créd p/ ${r.nome}`,
          });
        } else {
          await supabase.from("historico_financeiro").insert({
            user_id: user.id,
            tipo: "estorno_revendedor",
            valor: -Number(m.valor_pago || 0),
            custo: 0,
            lucro: -Number(m.valor_pago || 0),
            descricao: `Estorno recebimento venda ${m.quantidade} créd p/ ${r.nome}`,
          });
        }
      }
    }
    await logAudit({
      categoria: "venda_credito",
      acao: "alterar_pagamento",
      descricao: `Revendedor "${r.nome}" marcado como ${novo.toUpperCase()} (${pendentes.length} venda(s) atualizada(s))`,
      entidade: "revendedores",
      entidade_id: r.id,
      entidade_nome: r.nome,
      metadata: { status_pagamento: novo, vendas_afetadas: pendentes.length },
    });
    toast.success(novo === "pago"
      ? `Revendedor marcado como PAGO (${pendentes.length} venda(s))`
      : `Revendedor marcado como DEVENDO (${pendentes.length} venda(s))`);
    qc.invalidateQueries();
  }

  /**
   * Dá baixa em uma venda individual pendente de revendedor.
   * Lança o valor recebido no faturamento e lucro do dia de hoje.
   */
  async function confirmarPagamentoVendaIndividual(m: any) {
    const valor = Number(m.valor_pago || 0);
    const revNome = m.revendedor?.nome ?? (revs as any[]).find((r) => r.id === m.revendedor_id)?.nome ?? "Revendedor";
    const ok = await confirmDialog({
      title: "Confirmar recebimento de venda",
      description: `Revendedor: ${revNome}\nCréditos: ${m.quantidade}\nValor: ${currencyBRL(valor)}\n\nDeseja confirmar o recebimento desta venda? O valor será lançado no faturamento e lucro do dia de hoje.`,
      confirmText: "Confirmar Recebimento",
    });
    if (!ok) return;

    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const isSameDay = toISODate(new Date(m.created_at)) === toISODate(new Date());

      if (isSameDay) {
        // Se foi vendido hoje e pago hoje: atualiza a venda para paga
        await supabase.from("revendedores_movimentacoes").update({
          status_pagamento: "pago" as any,
          lucro: valor - Number(m.custo || 0),
        } as any).eq("id", m.id);
      } else {
        // Se a venda ocorreu em data anterior:
        // 1. Marca a venda original como liquidada e zera valor_pago para não duplicar receita na data antiga
        await supabase.from("revendedores_movimentacoes").update({
          status_pagamento: "pago" as any,
          valor_pago: 0,
          motivo: `${m.motivo || "Venda"} (liquidada em ${formatDateBR(new Date())})`,
        } as any).eq("id", m.id);

        // 2. Insere a entrada de recebimento com data de HOJE somando no faturamento e lucro do dia
        await supabase.from("revendedores_movimentacoes").insert({
          user_id: user.id,
          revendedor_id: m.revendedor_id,
          servidor_id: m.servidor_id,
          tipo: "venda" as any,
          quantidade: 0, // créditos já foram debitados no dia da venda
          valor_pago: valor,
          custo: 0, // custo já foi debitado no dia da venda
          lucro: valor, // entra 100% como receita e lucro de hoje
          status_pagamento: "pago" as any,
          motivo: `Recebimento venda pendente (${m.quantidade} créd) - ${revNome}`,
        } as any);
      }

      // Sincroniza status geral do revendedor: se não houver outras vendas pendentes, marca como pago
      const outrasPendentes = (movs as any[]).filter(
        (x) => x.id !== m.id && x.revendedor_id === m.revendedor_id && x.tipo === "venda" && x.status_venda !== "cancelada" && (x.status_pagamento ?? "devendo") !== "pago"
      );
      if (outrasPendentes.length === 0 && m.revendedor_id) {
        await supabase.from("revendedores").update({ status_pagamento: "pago" } as any).eq("id", m.revendedor_id);
      }

      await logAudit({
        categoria: "venda_credito",
        acao: "receber_venda",
        descricao: `Venda de ${m.quantidade} créditos p/ ${revNome} liquidada (${currencyBRL(valor)})`,
        entidade: "revendedores_movimentacoes",
        entidade_id: m.id,
        entidade_nome: revNome,
        metadata: { valor, quantidade: m.quantidade, revendedor_id: m.revendedor_id },
      });

      toast.success(`Venda recebida! ${currencyBRL(valor)} inserido no faturamento e lucro de hoje.`);
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao confirmar pagamento");
    }
  }

  function exportarRevendedores() {
    if (revs.length === 0) return toast.error("Nada para exportar");
    const rows = (revs as any[]).map((r) => {
      const srvNome = r.servidor?.nome ?? (servidores as any[]).find((s) => s.id === r.servidor_id)?.nome ?? "";
      return {
        Nome: r.nome ?? "",
        Telefone: r.telefone ? maskPhoneBR(r.telefone) : "",
        Servidor: srvNome,
        Login: r.login ?? "",
        Senha: r.senha ?? "",
        "Data Recarga": r.data_recarga ? formatDateBR(r.data_recarga) : "",
        "Dias Validade": Number(r.dias_validade || 0),
        "Créditos": Number(r.creditos || 0),
        Status: (r.status ?? "ativo").toUpperCase(),
        Pagamento: (r.status_pagamento ?? "pago").toUpperCase(),
        "Valor Compra": Number(r.valor_compra || 0),
        "Valor Venda": Number(r.valor_venda || 0),
        Custo: Number(r.custo || 0),
        Lucro: Number(r.lucro || 0),
        "Observação": r.observacao ?? "",
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows, { header: COLUNAS_REV });
    ws["!cols"] = COLUNAS_REV.map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Revendedores");
    XLSX.writeFile(wb, `revendedores-${toISODate(new Date())}.xlsx`);
    toast.success("Lista de revendedores exportada com sucesso em Excel (.xlsx)!");
  }

  function baixarModelo() {
    const exemplo = [{
      Nome: "João Revendedor Exemplo",
      Telefone: "(11) 99999-9999",
      Servidor: (servidores as any[])[0]?.nome ?? "UNITV 01",
      Login: "rev_joao",
      Senha: "senha123",
      "Data Recarga": formatDateBR(new Date()),
      "Dias Validade": 30,
      "Créditos": 50,
      Status: "ATIVO",
      Pagamento: "PAGO",
      "Valor Compra": 200,
      "Valor Venda": 350,
      Custo: 200,
      Lucro: 150,
      "Observação": "Exemplo de preenchimento — apague ou altere esta linha",
    }];
    const ws = XLSX.utils.json_to_sheet(exemplo, { header: COLUNAS_REV });
    ws["!cols"] = COLUNAS_REV.map(() => ({ wch: 20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Revendedores");
    XLSX.writeFile(wb, "modelo-importacao-revendedores.xlsx");
    toast.success("Modelo de revendedores baixado!");
  }

  async function importarRevendedores(file: File) {
    try {
      const name = file.name.toLowerCase();
      let rows: any[] = [];
      if (name.endsWith(".json")) {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) throw new Error("Arquivo JSON inválido (deve ser uma lista de revendedores)");
        rows = parsed;
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
        rows = raw.map((r) => ({
          nome: r.Nome ?? r.nome ?? r.Revendedor ?? r["Nome do Revendedor"],
          telefone: r.Telefone ?? r.telefone ?? r.WhatsApp ?? r["WhatsApp"],
          servidor: r.Servidor ?? r.servidor ?? r.Painel,
          servidor_id: r.servidor_id ?? r["ID Servidor"],
          login: r.Login ?? r.login ?? r.Usuario ?? r["Usuário"],
          senha: r.Senha ?? r.senha,
          data_recarga: (() => {
            const v = r["Data Recarga"] ?? r.data_recarga ?? r.Data ?? r["Data"];
            if (!v) return null;
            if (typeof v === "number") {
              const date = new Date(Math.round((v - 25569) * 86400 * 1000));
              return toISODate(date);
            }
            const s = String(v).trim();
            const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
            if (m) {
              let [, d, mo, y] = m;
              if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
              return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
            }
            return s.slice(0, 10);
          })(),
          dias_validade: r["Dias Validade"] ?? r.dias_validade ?? r.Validade ?? 30,
          creditos: r["Créditos"] ?? r.Creditos ?? r.creditos ?? r.Qtd ?? 0,
          status: r.Status ?? r.status ?? "ativo",
          status_pagamento: r.Pagamento ?? r.status_pagamento ?? r["Status Pagamento"] ?? "pago",
          valor_compra: r["Valor Compra"] ?? r.valor_compra ?? 0,
          valor_venda: r["Valor Venda"] ?? r.valor_venda ?? 0,
          custo: r.Custo ?? r.custo ?? 0,
          lucro: r.Lucro ?? r.lucro ?? 0,
          observacao: r["Observação"] ?? r.Observacao ?? r.observacao ?? r.Obs ?? "",
        }));
      }
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) { toast.error("Sessão expirada"); return; }

      const validRows = rows.filter((r) => r && (r.nome ?? "").toString().trim());
      const total = validRows.length;
      if (total === 0) { toast.error("Nenhuma linha de revendedor válida encontrada"); return; }

      setImporting(true);
      setImportProgress({ total, done: 0, ok: 0, fail: 0 });
      setFailedRows([]);
      let ok = 0;
      let fail = 0;

      for (let i = 0; i < validRows.length; i++) {
        const r = validRows[i];
        try {
          const { error } = await insertRevendedor(r, user.id);
          if (error) {
            fail++;
            const fr: FailedRow = { id: `${Date.now()}-${i}`, row: { ...r }, error: `Linha ${i + 1}: ${error.message}` };
            setFailedRows((prev) => [...prev, fr]);
          } else {
            ok++;
          }
        } catch (e: any) {
          fail++;
          const fr: FailedRow = { id: `${Date.now()}-${i}`, row: { ...r }, error: `Linha ${i + 1}: ${e?.message ?? "erro"}` };
          setFailedRows((prev) => [...prev, fr]);
        }
        setImportProgress({ total, done: i + 1, ok, fail });
      }

      if (ok > 0) toast.success(`${ok} revendedor(es) importado(s) com sucesso!`);
      if (fail > 0) {
        toast.error(`${fail} revendedor(es) com falha — você pode corrigir e reenviar na lista abaixo.`);
      }
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao importar arquivo");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Revendedores</h1>
          <p className="text-sm text-muted-foreground">Gestão de créditos e vendas para revendedores</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={baixarModelo} disabled={importing}>
            <FileDown className="h-4 w-4 mr-1" /> Modelo
          </Button>
          <Button variant="outline" onClick={exportarRevendedores} disabled={importing}>
            <Download className="h-4 w-4 mr-1" /> Exportar
          </Button>
          <label className="inline-flex">
            <input
              type="file"
              accept=".xlsx,.xls,application/json,.json"
              className="hidden"
              disabled={importing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importarRevendedores(f);
                e.target.value = "";
              }}
            />
            <Button asChild variant="outline" disabled={importing}>
              <span><Upload className="h-4 w-4 mr-1" /> {importing ? "Importando..." : "Importar"}</span>
            </Button>
          </label>
          <Button onClick={() => { setEditing(null); setEditOpen(true); }} disabled={importing}>
            <Plus className="h-4 w-4 mr-1" /> Novo revendedor
          </Button>
        </div>
      </div>

      {importProgress && (
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {importing ? "Importando revendedores..." : "Importação concluída"}
            </span>
            <span className="text-muted-foreground">
              {importProgress.done}/{importProgress.total}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${importProgress.total > 0 ? (importProgress.done / importProgress.total) * 100 : 0}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40">
              OK: {importProgress.ok}
            </Badge>
            <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/40">
              Erros: {importProgress.fail}
            </Badge>
            <span className="text-muted-foreground ml-auto">
              Processando 1 por vez com pausa de 1s
            </span>
            {!importing && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setImportProgress(null); setFailedRows([]); }}
              >
                Fechar
              </Button>
            )}
          </div>
        </Card>
      )}

      {failedRows.length > 0 && (
        <Card className="p-4 space-y-3 border-red-500/40">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-semibold text-red-400">
                {failedRows.length} linha(s) com erro
              </h3>
              <p className="text-xs text-muted-foreground">
                Edite os campos abaixo e clique em "Reenviar" para forçar a importação.
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setFailedRows([])}>
                Descartar todos
              </Button>
              <Button size="sm" onClick={retryAllFailed}>
                Forçar reimportação de todos
              </Button>
            </div>
          </div>
          <div className="space-y-2 max-h-[420px] overflow-auto">
            {failedRows.map((f) => (
              <div key={f.id} className="border rounded-md p-3 bg-red-500/5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs text-red-400 font-mono break-all flex-1">
                    {f.error}
                  </div>
                  <button
                    onClick={() => dismissFailed(f.id)}
                    className="h-6 w-6 grid place-items-center rounded hover:bg-accent"
                    title="Descartar"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div>
                    <Label className="text-xs">Nome</Label>
                    <Input className="h-8" value={f.row.nome ?? ""} onChange={(e) => updateFailed(f.id, { nome: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Telefone</Label>
                    <Input className="h-8" value={f.row.telefone ?? ""} onChange={(e) => updateFailed(f.id, { telefone: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Servidor</Label>
                    <Select
                      value={f.row.servidor_id ?? (servidores as any[]).find((s) => s.nome?.toLowerCase() === String(f.row.servidor ?? "").toLowerCase())?.id ?? "none"}
                      onValueChange={(v) => {
                        const sid = v === "none" ? null : v;
                        const snome = sid ? (servidores as any[]).find((s) => s.id === sid)?.nome ?? null : null;
                        updateFailed(f.id, { servidor_id: sid, servidor: snome });
                      }}
                    >
                      <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— sem —</SelectItem>
                        <ServidorSelectItems servidores={servidores as any[]} />
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Login</Label>
                    <Input className="h-8" value={f.row.login ?? ""} onChange={(e) => updateFailed(f.id, { login: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Data recarga</Label>
                    <Input type="date" className="h-8" value={f.row.data_recarga ?? ""} onChange={(e) => updateFailed(f.id, { data_recarga: e.target.value || null })} />
                  </div>
                  <div>
                    <Label className="text-xs">Dias validade</Label>
                    <Input type="number" className="h-8" value={f.row.dias_validade ?? 30} onChange={(e) => updateFailed(f.id, { dias_validade: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Créditos</Label>
                    <Input type="number" className="h-8" value={f.row.creditos ?? 0} onChange={(e) => updateFailed(f.id, { creditos: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Status</Label>
                    <Select value={normStatus(f.row.status)} onValueChange={(v) => updateFailed(f.id, { status: v })}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ativo">ativo</SelectItem>
                        <SelectItem value="vencido">vencido</SelectItem>
                        <SelectItem value="suspenso">suspenso</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Pagamento</Label>
                    <Select value={normPag(f.row.status_pagamento)} onValueChange={(v) => updateFailed(f.id, { status_pagamento: v })}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pago">pago</SelectItem>
                        <SelectItem value="devendo">devendo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Valor compra</Label>
                    <Input type="number" className="h-8" value={f.row.valor_compra ?? 0} onChange={(e) => updateFailed(f.id, { valor_compra: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Valor venda</Label>
                    <Input type="number" className="h-8" value={f.row.valor_venda ?? 0} onChange={(e) => updateFailed(f.id, { valor_venda: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Custo</Label>
                    <Input type="number" className="h-8" value={f.row.custo ?? 0} onChange={(e) => updateFailed(f.id, { custo: e.target.value })} />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => retryFailed(f.id)} disabled={f.retrying}>
                    <RefreshCw className={`h-3.5 w-3.5 mr-1 ${f.retrying ? "animate-spin" : ""}`} />
                    {f.retrying ? "Reenviando..." : "Reenviar"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {(() => {
        const vendasPendentes = (movs as any[])
          .filter(
            (m) => m.tipo === "venda"
              && m.status_venda !== "cancelada"
              && (m.status_pagamento ?? "devendo") !== "pago"
              && Number(m.valor_pago || 0) > 0,
          )
          .map((m) => {
            const rev = (revs as any[]).find((r) => r.id === m.revendedor_id) ?? m.revendedor;
            const serv = (servidores as any[]).find((s) => s.id === m.servidor_id) ?? m.servidor;
            return {
              ...m,
              revendedor: rev,
              servidor: serv,
            };
          });

        const totalDevido = vendasPendentes.reduce((s, m) => s + Number(m.valor_pago || 0), 0);
        const totalCreditosDevidos = vendasPendentes.reduce((s, m) => s + Number(m.quantidade || 0), 0);

        return (
          <Card className="p-4 border-red-500/40">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-red-400" />
                <h2 className="font-semibold text-red-400">Vendas Pendentes de Revendedores</h2>
                <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/40">
                  {vendasPendentes.length} {vendasPendentes.length === 1 ? "venda pendente" : "vendas pendentes"}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span>Créditos pendentes: <b className="text-foreground">{totalCreditosDevidos}</b></span>
                <span>Total a receber: <b className="text-red-400 font-bold">{currencyBRL(totalDevido)}</b></span>
              </div>
            </div>
            {vendasPendentes.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                Nenhuma venda de revendedor com pagamento pendente. 🎉
              </div>
            ) : (
              <div className={`overflow-x-auto overflow-y-auto max-h-[320px] ${densityClass(density)}`}>
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10">
                    <TableRow>
                      <TableHead>Data da Venda</TableHead>
                      <TableHead>Revendedor</TableHead>
                      <TableHead className="whitespace-nowrap">Contato</TableHead>
                      <TableHead>Servidor</TableHead>
                      <TableHead className="text-right">Créditos</TableHead>
                      <TableHead className="text-right">Custo Debitado</TableHead>
                      <TableHead className="text-right">Valor a Receber</TableHead>
                      <TableHead className="text-right">Lucro Previsto</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendasPendentes.map((m) => {
                      const valor = Number(m.valor_pago || 0);
                      const custo = Number(m.custo || 0);
                      const lucroPrev = valor - custo;
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="whitespace-nowrap text-xs">
                            {formatDateBR(m.created_at)}
                          </TableCell>
                          <TableCell className="font-medium">
                            {m.revendedor?.nome ?? "Revendedor"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {m.revendedor?.telefone ? (
                              <a
                                href={whatsappLink(m.revendedor.telefone)}
                                target="_blank"
                                rel="noreferrer"
                                className="text-emerald-400 hover:underline inline-flex items-center gap-1 text-xs"
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                                {maskPhoneBR(m.revendedor.telefone)}
                              </a>
                            ) : "-"}
                          </TableCell>
                          <TableCell>{m.servidor?.nome ?? "-"}</TableCell>
                          <TableCell className="text-right font-semibold">{m.quantidade} créd</TableCell>
                          <TableCell className="text-right text-red-400">{currencyBRL(custo)}</TableCell>
                          <TableCell className="text-right font-bold text-amber-400">{currencyBRL(valor)}</TableCell>
                          <TableCell className="text-right text-emerald-400 font-semibold">{currencyBRL(lucroPrev)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              className="h-7 px-3 gap-1 bg-emerald-600 hover:bg-emerald-500 text-white"
                              title="Marcar esta venda como paga e lançar no faturamento/lucro de hoje"
                              onClick={() => confirmarPagamentoVendaIndividual(m)}
                            >
                              <DollarSign className="h-3.5 w-3.5" /> Receber
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        );
      })()}

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Pesquisar por nome, login, celular ou servidor…"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
            <Select value={sortMode} onValueChange={(v) => setSortMode(v as any)}>
              <SelectTrigger className="w-56 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="recente">Recarga: mais recente</SelectItem>
                <SelectItem value="antiga">Recarga: mais antiga</SelectItem>
                <SelectItem value="az">Nome (A-Z)</SelectItem>
                <SelectItem value="za">Nome (Z-A)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DensityToggle value={density} onChange={setDensity} />
          <span className="text-xs text-muted-foreground ml-auto">
            {revsFiltrados.length} de {revs.length}
          </span>
        </div>
        <div className={`overflow-x-auto overflow-y-auto max-h-[300px] ${densityClass(density)}`}>
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="whitespace-nowrap">Celular</TableHead>
                <TableHead>Servidor</TableHead>
                <TableHead>Login</TableHead>
                <TableHead>Senha</TableHead>
                <TableHead>Recarga</TableHead>
                <TableHead className="text-right">Dias</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Créditos</TableHead>
                <TableHead>Pgto</TableHead>
                <TableHead className="text-right">V.Venda</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="text-right">Lucro</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {revsFiltrados.slice((pageRevs - 1) * pageSizeRevs, pageRevs * pageSizeRevs).map((r: any) => {
                const dr = diasRestantes(r);
                const tone = dr === null ? "text-muted-foreground" : dr < 0 ? "text-red-400" : dr <= 3 ? "text-orange-400" : "text-emerald-400";
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1">
                        <span>{r.nome}</span>
                        <Button size="icon" variant="ghost" className="h-6 w-6" title="Copiar nome"
                          onClick={async () => { try { await navigator.clipboard.writeText(String(r.nome ?? "")); toast.success("Nome copiado!"); } catch { toast.error("Falha ao copiar"); } }}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.telefone ? (() => {
                        const e = phoneToE164(r.telefone);
                        return (
                          <HoverCard openDelay={120} closeDelay={80}>
                            <HoverCardTrigger asChild>
                              <span className={`whitespace-nowrap cursor-pointer ${e.valid ? "text-emerald-400 hover:underline" : "text-amber-400"}`}>
                                {maskPhoneBR(r.telefone)}
                              </span>
                            </HoverCardTrigger>
                            <HoverCardContent side="top" align="start" className="w-56 p-2 space-y-1">
                              <div className="text-xs text-muted-foreground px-1 pb-1 border-b border-border/60 font-mono">
                                {e.valid ? `+${e.digits}` : (e.reason ?? "Número inválido")}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start h-8"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(e.digits || (r.telefone ?? "").replace(/\D/g, ""));
                                    toast.success("Número copiado!");
                                  } catch {
                                    toast.error("Falha ao copiar");
                                  }
                                }}
                              >
                                <Copy className="h-3.5 w-3.5 mr-2" /> Copiar número
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start h-8 text-emerald-400 hover:text-emerald-300"
                                disabled={!e.valid}
                                onClick={() => {
                                  if (!e.valid) { toast.error(e.reason ?? "Número inválido"); return; }
                                  window.open(whatsappLink(`+${e.digits}`), "_blank", "noopener,noreferrer");
                                }}
                                title={e.valid ? "Abrir conversa no WhatsApp" : e.reason}
                              >
                                <MessageCircle className="h-3.5 w-3.5 mr-2" /> Enviar WhatsApp
                              </Button>
                              {!e.valid && (
                                <div className="text-[11px] text-amber-400 px-1 pt-1">
                                  WhatsApp desabilitado: {e.reason}
                                </div>
                              )}
                            </HoverCardContent>
                          </HoverCard>
                        );
                      })() : "-"}
                    </TableCell>
                    <TableCell>{r.servidor?.nome ?? "-"}</TableCell>
                    <TableCell className="text-xs">
                      {r.login ? (
                        <div className="flex items-center gap-1">
                          <span className="font-mono">{r.login}</span>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={async () => { try { await navigator.clipboard.writeText(r.login!); toast.success("Login copiado!"); } catch { toast.error("Falha ao copiar"); } }} title="Copiar login"><Copy className="h-3.5 w-3.5"/></Button>
                        </div>
                      ) : "-"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.senha ? (
                        <div className="flex items-center gap-1">
                          <span className="font-mono tracking-widest text-muted-foreground">••••••••</span>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={async () => { try { await navigator.clipboard.writeText(r.senha!); toast.success("Senha copiada!"); } catch { toast.error("Falha ao copiar"); } }} title="Copiar senha"><Copy className="h-3.5 w-3.5"/></Button>
                        </div>
                      ) : "-"}
                    </TableCell>
                    <TableCell>{r.data_recarga ? formatDateBR(r.data_recarga) : "-"}</TableCell>
                    <TableCell className={`text-right font-semibold ${tone}`}>{dr ?? "-"}</TableCell>
                    <TableCell>{statusBadge(r)}</TableCell>
                    <TableCell className="text-right font-bold">{creditosDoRev(r)}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        title={r.status_pagamento === "pago"
                          ? "PAGO — clique para marcar todas as vendas como DEVENDO"
                          : "DEVENDO — clique para marcar todas as vendas como PAGO"}
                        className={`h-7 px-2 gap-1 ${r.status_pagamento === "pago"
                          ? "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                          : "text-red-400 hover:text-red-300 hover:bg-red-500/10"}`}
                        onClick={() => alternarPagamentoRev(r)}
                      >
                        <DollarSign className="h-3.5 w-3.5" />
                        {r.status_pagamento === "pago" ? "Pago" : "Devendo"}
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">{currencyBRL(r.valor_venda)}</TableCell>
                    <TableCell className="text-right text-red-400">{currencyBRL(r.custo)}</TableCell>
                    <TableCell className="text-right text-emerald-400 font-semibold">{currencyBRL(r.lucro)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <button title="Vender" className="h-7 w-7 rounded-md grid place-items-center hover:bg-accent inline-flex"
                          onClick={() => { setRenovRev(r); setRenovOpen(true); }}>
                          <RefreshCw className="h-3.5 w-3.5 text-primary" />
                        </button>
                        <button title="Ajuste manual" className="h-7 w-7 rounded-md grid place-items-center hover:bg-accent inline-flex"
                          onClick={() => { setAjusteRev(r); setAjusteOpen(true); }}>
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        <button title="Copiar comprovante de recarga" className="h-7 w-7 rounded-md grid place-items-center hover:bg-accent inline-flex"
                          onClick={() => {
                            const dataStr = r.data_recarga ? formatDateBR(r.data_recarga) : formatDateBR(new Date().toISOString().slice(0, 10));
                            const servidorNome = r.servidor?.nome ?? "-";
                            const msg = `📺 *RODOLFO TV – Área do Revendedor*\n\n♻️ *RECARGA REALIZADA COM SUCESSO!* ✅\n\n👤 Revendedor: *${r.nome ?? "-"}*\n🔑 Login: *${r.login ?? "-"}*\n📅 Data da Recarga: *${dataStr}*\n📦 Quantidade Adicionada: *${creditosDoRev(r)} Créditos*\n🗒️ Servidor: *${servidorNome}*\n\n🚀 *Seus créditos já estão liberados para novas ativações e renovações*.\n\n🙏 _Agradecemos pela parceria - Bons negócios e ótimas vendas!_`;
                            navigator.clipboard.writeText(msg);
                            toast.success("Comprovante copiado!");
                          }}>
                          <ClipboardCopy className="h-3.5 w-3.5 text-emerald-400" />
                        </button>
                        <button title="Enviar Login e Senha" className="h-7 w-7 rounded-md grid place-items-center hover:bg-accent inline-flex"
                          onClick={async () => {
                            const usuario = r.login || "-";
                            const senha = r.senha || "-";
                            const serv = (servidores as any[]).find((s) => s.id === r.servidor_id)
                              ?? (servidores as any[]).find((s) => String(s.nome ?? "").toLowerCase() === String(r.servidor?.nome ?? "").toLowerCase());
                            const urls = [serv?.url, serv?.url2, serv?.url3, serv?.url4, serv?.url5]
                              .map((u) => (u ? String(u).trim() : ""))
                              .filter(Boolean);
                            if (urls.length === 0) {
                              const fb = painelUrlDoRev(r);
                              if (fb) urls.push(fb);
                            }
                            const paineisTxt = urls.length
                              ? urls.map((u) => `🌐 Painel: ${u}`).join("\n")
                              : "🌐 Painel: (cadastre a URL na aba Servidores)";
                            const msg = `😀 Segue os dados de acesso:\n\n👤 Login: ${usuario}\n🔑 Senha: ${senha}\n\n${paineisTxt}`;
                            try {
                              await navigator.clipboard.writeText(msg);
                              toast.success("Informações copiadas com sucesso.");
                            } catch {
                              toast.error("Falha ao copiar informações");
                            }
                          }}>
                          <Send className="h-3.5 w-3.5 text-sky-400" />
                        </button>
                        <button title="Editar" className="h-7 w-7 rounded-md grid place-items-center hover:bg-accent inline-flex"
                          onClick={() => { setEditing(r); setEditOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button title="Reverter última venda/recarga (estorna créditos e valores)" className="h-7 w-7 rounded-md grid place-items-center hover:bg-accent inline-flex"
                          onClick={() => {
                            const ultima = (movs as any[])
                              .filter((m) => m.revendedor_id === r.id && m.tipo === "venda" && m.status_venda !== "cancelada")
                              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
                            if (!ultima) { toast.error("Nenhuma venda ativa para reverter."); return; }
                            setCancelMov({ ...ultima, revendedor: ultima.revendedor ?? r });
                            setCancelMotivo("");
                            setCancelOpen(true);
                          }}>
                          <Undo2 className="h-3.5 w-3.5 text-amber-400" />
                        </button>
                        <button title="Excluir" className="h-7 w-7 rounded-md grid place-items-center hover:bg-accent inline-flex"
                          onClick={() => excluir(r)}>
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {revsFiltrados.length === 0 && (
                <TableRow><TableCell colSpan={15} className="text-center text-muted-foreground py-8">Nenhum revendedor cadastrado.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <PaginationControls
          total={revsFiltrados.length}
          loaded={revsFiltrados.length}
          pageSize={pageSizeRevs}
          page={pageRevs}
          onPageSizeChange={(v) => { setPageSizeRevs(v); setPageRevs(1); }}
          onPageChange={setPageRevs}
          onLoadMore={() => {}}
          label="revendedores"
        />
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Desempenho dos revendedores</h3>
          <div className="ml-auto flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
            <Select value={desempSort} onValueChange={(v) => setDesempSort(v as any)}>
              <SelectTrigger className="w-56 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="recente">Recarga: mais recente</SelectItem>
                <SelectItem value="antiga">Recarga: mais antiga</SelectItem>
                <SelectItem value="az">Nome (A-Z)</SelectItem>
                <SelectItem value="za">Nome (Z-A)</SelectItem>
              </SelectContent>
            </Select>
            <DensityToggle value={density} onChange={setDensity} />
            <span className="text-xs text-muted-foreground hidden md:inline">Base: vendas do mês</span>
          </div>
        </div>
        <div className={`overflow-x-auto ${densityClass(density)}`}>
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead>Revendedor</TableHead>
                <TableHead>Última recarga</TableHead>
                <TableHead className="text-right">Créditos no mês</TableHead>
                <TableHead className="text-right">Receita gerada</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {desempenho.slice((pageDesemp - 1) * pageSizeDesemp, pageDesemp * pageSizeDesemp).map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.nome}</TableCell>
                  <TableCell>{d.ultima ? formatDateTimeBR(d.ultima) : "-"}</TableCell>
                  <TableCell className="text-right font-semibold">{d.creditosMes}</TableCell>
                  <TableCell className="text-right text-emerald-400">{currencyBRL(d.receitaMes)}</TableCell>
                  <TableCell>
                    {d.ativo ? (
                      <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40">🟢 ATIVO</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/40">🔴 INATIVO</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {desempenho.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum revendedor cadastrado.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <PaginationControls
          total={desempenho.length}
          loaded={desempenho.length}
          pageSize={pageSizeDesemp}
          page={pageDesemp}
          onPageSizeChange={(v) => { setPageSizeDesemp(v); setPageDesemp(1); }}
          onPageChange={setPageDesemp}
          onLoadMore={() => {}}
          label="registros"
        />
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Handshake className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Histórico de movimentações</h3>
          <div className="ml-auto">
            <DensityToggle value={density} onChange={setDensity} />
          </div>
        </div>
        <div className={`overflow-x-auto ${densityClass(density)}`}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Revendedor</TableHead>
                <TableHead>Servidor</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="text-right">Lucro</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead className="text-center">Pgto</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(movs as any[]).slice((pageMovs - 1) * pageSizeMovs, pageMovs * pageSizeMovs).map((m: any) => (
                <TableRow key={m.id} className={m.status_venda === "cancelada" ? "opacity-60" : ""}>
                  <TableCell className="text-xs">{formatDateTimeBR(m.created_at)}</TableCell>
                  <TableCell className={m.status_venda === "cancelada" ? "line-through" : ""}>{m.revendedor?.nome ?? "-"}</TableCell>
                  <TableCell>{m.servidor?.nome ?? "-"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-xs">{m.tipo}</Badge>
                      {m.status_venda === "cancelada" && (
                        <Badge variant="outline" className="text-[10px] bg-red-500/15 text-red-400 border-red-500/40">CANCELADA</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{m.quantidade}</TableCell>
                  <TableCell className="text-right">{currencyBRL(m.valor_pago)}</TableCell>
                  <TableCell className="text-right text-red-400">{currencyBRL(m.custo)}</TableCell>
                  <TableCell className="text-right text-emerald-400">{currencyBRL(m.lucro)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {m.motivo ?? "-"}
                    {m.status_venda === "cancelada" && m.motivo_cancelamento && (
                      <div className="text-red-400 mt-0.5">Estorno: {m.motivo_cancelamento}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {m.tipo === "venda" && m.status_venda !== "cancelada" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        title={m.status_pagamento === "pago" ? "Pago — clique para marcar como Devendo" : "Devendo — clique para marcar como Pago"}
                        className={`h-7 px-2 ${m.status_pagamento === "pago" ? "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10" : "text-red-400 hover:text-red-300 hover:bg-red-500/10"}`}
                        onClick={async () => {
                          const novo = m.status_pagamento === "pago" ? "devendo" : "pago";
                          const { error } = await supabase
                            .from("revendedores_movimentacoes")
                            .update({ status_pagamento: novo } as any)
                            .eq("id", m.id);
                          if (error) { toast.error(error.message); return; }
                          const user = (await supabase.auth.getUser()).data.user;
                          if (user) {
                            if (novo === "pago") {
                              await supabase.from("historico_financeiro").insert({
                                user_id: user.id,
                                tipo: "revendedor",
                                valor: Number(m.valor_pago || 0),
                                custo: 0,
                                lucro: Number(m.valor_pago || 0),
                                descricao: `Recebimento venda ${m.quantidade} créd p/ ${m.revendedor?.nome ?? "revendedor"}`,
                              });
                            } else {
                              await supabase.from("historico_financeiro").insert({
                                user_id: user.id,
                                tipo: "estorno_revendedor",
                                valor: -Number(m.valor_pago || 0),
                                custo: 0,
                                lucro: -Number(m.valor_pago || 0),
                                descricao: `Estorno recebimento venda ${m.quantidade} créd p/ ${m.revendedor?.nome ?? "revendedor"}`,
                              });
                            }
                          }
                          await logAudit({
                            categoria: "venda_credito",
                            acao: "alterar_pagamento",
                            descricao: `Venda ${m.quantidade} créd p/ ${m.revendedor?.nome ?? "revendedor"} marcada como ${novo.toUpperCase()}`,
                            entidade: "revendedores_movimentacoes",
                            entidade_id: m.id,
                            entidade_nome: m.revendedor?.nome ?? null,
                            metadata: { valor: m.valor_pago, custo: m.custo, lucro: m.lucro, status_pagamento: novo },
                          });
                          toast.success(novo === "pago" ? "Marcado como PAGO" : "Marcado como DEVENDO");
                          qc.invalidateQueries();
                        }}
                      >
                        <DollarSign className="h-3.5 w-3.5 mr-1" />
                        {m.status_pagamento === "pago" ? "Pago" : "Devendo"}
                      </Button>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {m.tipo === "venda" && m.status_venda !== "cancelada" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        onClick={() => { setCancelMov(m); setCancelMotivo(""); setCancelOpen(true); }}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Cancelar
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
              {movs.length === 0 && (
                <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">Sem movimentações.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <PaginationControls
          total={movs.length}
          loaded={movs.length}
          pageSize={pageSizeMovs}
          page={pageMovs}
          onPageSizeChange={(v) => { setPageSizeMovs(v); setPageMovs(1); }}
          onPageChange={setPageMovs}
          onLoadMore={() => {}}
          label="movimentações"
        />
      </Card>

      <RevendedorDialog open={editOpen} onOpenChange={setEditOpen} editing={editing} servidores={servidores} />
      <RenovarDialog open={renovOpen} onOpenChange={setRenovOpen} revendedor={renovRev} saldos={saldos} />
      <AjusteDialog open={ajusteOpen} onOpenChange={setAjusteOpen} revendedor={ajusteRev} saldos={saldos} />
      

      <Dialog open={cancelOpen} onOpenChange={(o) => { setCancelOpen(o); if (!o) { setCancelMov(null); setCancelMotivo(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Cancelar / Estornar venda</DialogTitle></DialogHeader>
          {cancelMov && (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border border-border/60 p-3 space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Revendedor</span><span>{cancelMov.revendedor?.nome ?? "-"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Data</span><span>{formatDateTimeBR(cancelMov.created_at)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Créditos</span><span>{cancelMov.quantidade}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Valor</span><span className="text-emerald-400">{currencyBRL(cancelMov.valor_pago)}</span></div>
              </div>
              <div>
                <Label>Motivo (opcional)</Label>
                <Textarea value={cancelMotivo} onChange={(e) => setCancelMotivo(e.target.value)} placeholder="Ex.: venda lançada em duplicidade" />
              </div>
              <p className="text-xs text-muted-foreground">
                Ao confirmar: os créditos serão retirados do revendedor, devolvidos ao saldo do servidor e todos os cards financeiros da dashboard serão recalculados. O registro é preservado para auditoria.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>Voltar</Button>
            <Button variant="destructive" onClick={confirmarCancelamento} disabled={cancelSaving}>
              {cancelSaving ? "Cancelando..." : "Confirmar cancelamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RevendedorDialog({ open, onOpenChange, editing, servidores }: { open: boolean; onOpenChange: (o: boolean) => void; editing: any; servidores: any[] }) {
  const qc = useQueryClient();
  const isEdit = !!editing?.id;
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useMemo(() => {
    if (open) {
      setForm({
        nome: editing?.nome ?? "",
        telefone: editing?.telefone ?? "",
        servidor_id: editing?.servidor_id ?? "",
        login: editing?.login ?? "",
        senha: editing?.senha ?? "",
        status: editing?.status ?? "ativo",
        status_pagamento: editing?.status_pagamento ?? "pago",
        creditos: editing?.creditos ?? 0,
        dias_validade: editing?.dias_validade ?? 30,
        data_recarga: editing?.data_recarga ?? toISODate(new Date()),
        valor_compra: editing?.valor_compra ?? 0,
        valor_venda: editing?.valor_venda ?? 0,
        custo: editing?.custo ?? 0,
        lucro: editing?.lucro ?? 0,
        observacao: editing?.observacao ?? "",
      });
    }
  }, [open, editing]);

  async function salvar() {
    if (!form.nome?.trim()) return toast.error("Informe o nome do revendedor");
    setSaving(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const vVenda = Number(form.valor_venda) || 0;
      const vCusto = Number(form.custo) || Number(form.valor_compra) || 0;
      const vLucro = form.lucro !== undefined && form.lucro !== "" ? Number(form.lucro) : (vVenda - vCusto);

      const payload = {
        nome: form.nome.trim(),
        telefone: form.telefone ? String(form.telefone).trim() : null,
        servidor_id: form.servidor_id || null,
        login: form.login ? form.login.trim() : null,
        senha: form.senha ? form.senha.trim() : "123456",
        status: form.status || "ativo",
        status_pagamento: form.status_pagamento || "pago",
        creditos: Number(form.creditos) || 0,
        dias_validade: Number(form.dias_validade) || 30,
        data_recarga: form.data_recarga || toISODate(new Date()),
        valor_compra: Number(form.valor_compra) || vCusto,
        valor_venda: vVenda,
        custo: vCusto,
        lucro: vLucro,
        observacao: form.observacao ? form.observacao.trim() : null,
        updated_at: new Date().toISOString(),
      };

      if (isEdit) {
        const { error } = await supabase.from("revendedores").update(payload as any).eq("id", editing.id);
        if (error) throw error;
        await logAudit({
          categoria: "revendedor",
          acao: "editar",
          descricao: `Revendedor "${payload.nome}" editado`,
          entidade: "revendedores",
          entidade_id: editing.id,
          entidade_nome: payload.nome,
          dados_novos: payload,
        });
        toast.success("Revendedor atualizado com sucesso!");
      } else {
        const { data: ins, error } = await supabase.from("revendedores").insert({
          ...payload,
          user_id: user.id,
        } as any).select().single();
        if (error) throw error;
        await logAudit({
          categoria: "revendedor",
          acao: "criar",
          descricao: `Revendedor "${payload.nome}" cadastrado`,
          entidade: "revendedores",
          entidade_id: ins?.id ?? null,
          entidade_nome: payload.nome,
          dados_novos: payload,
        });
        toast.success("Novo revendedor cadastrado com sucesso!");
      }

      await qc.invalidateQueries({ queryKey: ["revendedores"] });
      await qc.invalidateQueries({ queryKey: ["revendedores_movs"] });
      await qc.invalidateQueries({ queryKey: ["creditos_saldos"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar revendedor");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar revendedor" : "Novo revendedor"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Nome Completo *</Label>
            <Input
              placeholder="Ex: João da Silva"
              value={form.nome ?? ""}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Celular / WhatsApp</Label>
              <Input
                placeholder="(11) 99999-9999"
                value={form.telefone ?? ""}
                onChange={(e) => setForm({ ...form, telefone: maskPhoneBR(e.target.value) })}
              />
            </div>
            <div>
              <Label>Servidor Principal</Label>
              <Select value={form.servidor_id ?? ""} onValueChange={(v) => setForm({ ...form, servidor_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o servidor..." /></SelectTrigger>
                <SelectContent>
                  <ServidorSelectItems servidores={servidores as any[]} />
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Login / Usuário no Painel</Label>
              <Input
                placeholder="Ex: joao_rev01"
                value={form.login ?? ""}
                onChange={(e) => setForm({ ...form, login: e.target.value })}
              />
            </div>
            <div>
              <Label>Senha de Acesso</Label>
              <Input
                type="text"
                autoComplete="new-password"
                placeholder="Senha de acesso"
                value={form.senha ?? ""}
                onChange={(e) => setForm({ ...form, senha: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label>Créditos</Label>
              <Input
                type="number"
                min={0}
                value={form.creditos ?? 0}
                onChange={(e) => setForm({ ...form, creditos: e.target.value })}
              />
            </div>
            <div>
              <Label>Validade (Dias)</Label>
              <Input
                type="number"
                min={1}
                value={form.dias_validade ?? 30}
                onChange={(e) => setForm({ ...form, dias_validade: e.target.value })}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status ?? "ativo"} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="vencido">Vencido</SelectItem>
                  <SelectItem value="suspenso">Suspenso</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Pagamento</Label>
              <Select value={form.status_pagamento ?? "pago"} onValueChange={(v) => setForm({ ...form, status_pagamento: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pago">Pago</SelectItem>
                  <SelectItem value="devendo">Devendo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>Valor Venda (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={form.valor_venda ?? 0}
                onChange={(e) => {
                  const vv = Number(e.target.value) || 0;
                  const c = Number(form.custo) || 0;
                  setForm({ ...form, valor_venda: e.target.value, lucro: vv - c });
                }}
              />
            </div>
            <div>
              <Label>Custo / Compra (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={form.custo ?? 0}
                onChange={(e) => {
                  const c = Number(e.target.value) || 0;
                  const vv = Number(form.valor_venda) || 0;
                  setForm({ ...form, custo: e.target.value, valor_compra: e.target.value, lucro: vv - c });
                }}
              />
            </div>
            <div>
              <Label>Lucro Calculado (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.lucro ?? 0}
                onChange={(e) => setForm({ ...form, lucro: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label>Data de Recarga</Label>
            <Input
              type="date"
              value={form.data_recarga ?? ""}
              onChange={(e) => setForm({ ...form, data_recarga: e.target.value })}
            />
          </div>

          <div>
            <Label>Observação</Label>
            <Textarea
              rows={2}
              placeholder="Notas adicionais sobre o revendedor..."
              value={form.observacao ?? ""}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>{saving ? "Salvando..." : "Salvar Revendedor"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenovarDialog({ open, onOpenChange, revendedor, saldos }: { open: boolean; onOpenChange: (o: boolean) => void; revendedor: any; saldos: Record<string, number> }) {
  const qc = useQueryClient();
  const [qtd, setQtd] = useState("10");
  const [dias, setDias] = useState("60");
  const [valorVenda, setValorVenda] = useState("");
  const [custoUnit, setCustoUnit] = useState("");
  const [custoManual, setCustoManual] = useState(false);
  const [pago, setPago] = useState(true);
  const [saving, setSaving] = useState(false);

  useMemo(() => {
    if (open) {
      setQtd("10"); setDias("60"); setValorVenda(""); setPago(true);
      const custoServ = Number(revendedor?.servidor?.custo_mensal ?? 0);
      setCustoManual(false);
      setCustoUnit(custoServ > 0 ? String(custoServ) : "");
    }
  }, [open, revendedor]);

  if (!revendedor) return null;
  const nQtd = Number(qtd) || 0;
  const nCustoUnit = Number(custoUnit) || 0;
  const nVenda = Number(valorVenda) || 0;
  const custoTotal = nQtd * nCustoUnit;
  const lucro = nVenda - custoTotal;
  const saldoAtual = revendedor.servidor_id ? (saldos[revendedor.servidor_id] ?? 0) : 0;
  const semSaldo = revendedor.servidor_id && nQtd > saldoAtual;

  async function confirmar() {
    if (!revendedor.servidor_id) return toast.error("Revendedor sem servidor");
    if (nQtd <= 0) return toast.error("Quantidade inválida");
    if (semSaldo) {
      const { confirmDialog } = await import("@/lib/confirm");
      const ok = await confirmDialog({
        title: `Saldo do servidor insuficiente (${saldoAtual} créditos)`,
        description: `Você está vendendo ${nQtd} créditos, mas o servidor "${revendedor.servidor?.nome ?? "-"}" possui apenas ${saldoAtual} créditos disponíveis. Deseja continuar mesmo assim?`,
        confirmText: "Continuar e Confirmar",
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;
      const hoje = toISODate(new Date());
      // Cada venda é um registro individual: os créditos refletem apenas a última compra.
      const novoCreditos = nQtd;
      const lucroVenda = pago ? lucro : -custoTotal;
      const { error: upErr } = await supabase.from("revendedores").update({
        creditos: novoCreditos,
        data_recarga: hoje,
        dias_validade: Number(dias) || 30,
        valor_compra: custoTotal,
        valor_venda: nVenda,
        custo: custoTotal,
        lucro: lucroVenda,
        status: "ativo",
        status_pagamento: pago ? "pago" : "devendo",
      }).eq("id", revendedor.id);
      if (upErr) throw upErr;

      await supabase.from("revendedores_movimentacoes").insert({
        user_id: user.id,
        revendedor_id: revendedor.id,
        servidor_id: revendedor.servidor_id,
        tipo: "venda",
        quantidade: nQtd,
        valor_pago: nVenda,
        custo: custoTotal,
        lucro: lucroVenda,
        motivo: `Venda ${nQtd} créditos / ${dias} dias${pago ? "" : " (DEVENDO)"}`,
        status_pagamento: pago ? "pago" : "devendo",
      } as any);

      // Deduct from server credit balance no mesmo instante
      await registrarMovimentacaoCredito({
        servidor_id: revendedor.servidor_id,
        quantidade: -nQtd,
        tipo: "venda_revendedor",
        motivo: `Venda p/ revendedor ${revendedor.nome}${pago ? "" : " (Devendo)"}`,
      });

      // Financeiro: custo sempre é lançado; receita/lucro só quando PAGO.
      // Devendo → registra apenas saída (custo) com lucro negativo.
      await supabase.from("historico_financeiro").insert({
        user_id: user.id,
        tipo: pago ? "revendedor" : "revendedor_devendo",
        valor: pago ? nVenda : 0,
        custo: custoTotal,
        lucro: pago ? lucro : -custoTotal,
        descricao: pago
          ? `Venda ${nQtd} créditos p/ ${revendedor.nome}`
          : `Venda ${nQtd} créditos p/ ${revendedor.nome} (DEVENDO — custo)`,
      });

      toast.success("Venda registrada");
      await logAudit({ categoria: "venda_credito", acao: "vender", descricao: `Venda de ${nQtd} créditos p/ ${revendedor.nome}`, entidade: "revendedores", entidade_id: revendedor.id, entidade_nome: revendedor.nome, metadata: { quantidade: nQtd, dias: Number(dias) || 30, valor_venda: nVenda, custo_total: custoTotal, lucro, pago } });
      qc.invalidateQueries();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Erro");
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Vender créditos — {revendedor.nome}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Servidor: <span className="text-foreground">{revendedor.servidor?.nome ?? "-"}</span> · Saldo atual: <span className={semSaldo ? "text-red-400" : "text-emerald-400"}>{saldoAtual}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Créditos</Label><Input type="number" value={qtd} onChange={(e) => setQtd(e.target.value)} /></div>
            <div><Label>Dias validade</Label><Input type="number" value={dias} onChange={(e) => setDias(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between">
                <Label>Custo unitário (R$)</Label>
                <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={custoManual}
                    onChange={(e) => {
                      const manual = e.target.checked;
                      setCustoManual(manual);
                      if (!manual) {
                        const custoServ = Number(revendedor?.servidor?.custo_mensal ?? 0);
                        setCustoUnit(custoServ > 0 ? String(custoServ) : "");
                      }
                    }}
                  />
                  Editar manual
                </label>
              </div>
              <Input
                type="number"
                step="0.01"
                value={custoUnit}
                disabled={!custoManual}
                onChange={(e) => setCustoUnit(e.target.value)}
              />
              {!custoManual && (
                <div className="text-[11px] text-muted-foreground mt-1">
                  Puxado do servidor ({revendedor.servidor?.nome ?? "-"})
                </div>
              )}
            </div>
            <div><Label>Valor de venda (R$)</Label><Input type="number" step="0.01" value={valorVenda} onChange={(e) => setValorVenda(e.target.value)} /></div>
          </div>
          <div className="space-y-2">
            <Label>Status do pagamento</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={pago ? "default" : "secondary"}
                onClick={() => setPago(true)}
                className={`h-10 gap-2 ${pago ? "bg-emerald-600 hover:bg-emerald-500 text-white" : ""}`}
              >
                🟢 Pago
              </Button>
              <Button
                type="button"
                variant={!pago ? "default" : "secondary"}
                onClick={() => setPago(false)}
                className={`h-10 gap-2 ${!pago ? "bg-red-600 hover:bg-red-500 text-white" : ""}`}
              >
                🔴 Devendo
              </Button>
            </div>
          </div>
          <div className="rounded-md border border-border/60 p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Custo total ({nQtd} × {currencyBRL(nCustoUnit)})</span><span className="text-red-400">{currencyBRL(custoTotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Venda</span><span>{currencyBRL(nVenda)}</span></div>
            <div className="flex justify-between font-semibold"><span>Lucro</span><span className="text-emerald-400">{currencyBRL(lucro)}</span></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={confirmar} disabled={saving}>Confirmar venda</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AjusteDialog({ open, onOpenChange, revendedor, saldos }: { open: boolean; onOpenChange: (o: boolean) => void; revendedor: any; saldos: Record<string, number> }) {
  const qc = useQueryClient();
  const [qtd, setQtd] = useState("");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  if (!revendedor) return null;

  const n = Number(qtd) || 0;
  const saldoServidor = revendedor.servidor_id ? (saldos[revendedor.servidor_id] ?? 0) : 0;

  async function aplicar() {
    if (n === 0) return toast.error("Quantidade inválida");
    setSaving(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;
      const novo = Math.max(0, Number(revendedor.creditos || 0) + n);
      await supabase.from("revendedores").update({ creditos: novo }).eq("id", revendedor.id);
      await supabase.from("revendedores_movimentacoes").insert({
        user_id: user.id,
        revendedor_id: revendedor.id,
        servidor_id: revendedor.servidor_id,
        tipo: n > 0 ? "ajuste_add" : "ajuste_rem",
        quantidade: n,
        motivo: motivo || (n > 0 ? "Ajuste manual +" : "Ajuste manual -"),
      });
      // Also reflect in server balance
      if (revendedor.servidor_id) {
        await registrarMovimentacaoCredito({
          servidor_id: revendedor.servidor_id,
          quantidade: -n, // if we give creditos to reseller, we debit server
          tipo: n > 0 ? "venda_revendedor" : "ajuste_add",
          motivo: `Ajuste revendedor ${revendedor.nome}`,
        });
      }
      toast.success("Ajuste aplicado");
      await logAudit({ categoria: "revendedor", acao: "ajustar", descricao: `Ajuste manual de ${n} créditos em "${revendedor.nome}"`, entidade: "revendedores", entidade_id: revendedor.id, entidade_nome: revendedor.nome, metadata: { quantidade: n, motivo } });
      qc.invalidateQueries();
      onOpenChange(false);
      setQtd(""); setMotivo("");
    } catch (e: any) {
      toast.error(e?.message || "Erro");
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Ajuste manual — {revendedor.nome}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Créditos atuais: <span className="text-foreground">{revendedor.creditos}</span> · Saldo servidor: {saldoServidor}
          </div>
          <div>
            <Label>Quantidade (use negativo para remover)</Label>
            <Input type="number" value={qtd} onChange={(e) => setQtd(e.target.value)} />
          </div>
          <div>
            <Label>Motivo</Label>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={aplicar} disabled={saving}>Aplicar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
