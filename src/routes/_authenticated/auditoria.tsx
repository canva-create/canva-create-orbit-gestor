import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { COMPACT_TABLE_CLASS } from "@/components/density-toggle";
import { currencyBRL, formatDateBR, formatDateTimeBR, maskMAC } from "@/lib/iptv";
import { confirmDialog } from "@/lib/confirm";
import { logAudit } from "@/lib/audit";
import { creditosPorDias, registrarMovimentacaoCredito } from "@/lib/creditos";
import { reverterRenovacaoRegistro } from "@/lib/reverter-renovacao";
import { fetchHistorico, fetchRevendedoresMovs, fetchAtivacoesApps } from "@/lib/queries";
import { ComprovanteAtivacaoModal } from "@/components/comprovante-ativacao-modal";
import { type ComprovanteData } from "@/lib/comprovante-ativacao-generator";
import {
  exportAuditRowPNG,
  exportAuditRowPDF,
  copyAuditRowImageToClipboard,
} from "@/lib/comprovante-auditoria-generator";
import {
  ShieldCheck,
  Search,
  Download,
  Eye,
  RefreshCw,
  Trash2,
  FileDown,
  Image as ImageIcon,
  Copy,
  Users,
  Store,
  Smartphone,
  CheckCircle2,
  Undo2,
  AlertTriangle,
  TrendingUp,
  Coins,
  Receipt,
} from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";

const searchSchema = z.object({
  tab: z.enum(["alteracoes", "clientes", "revendedores", "aplicativos"]).catch("alteracoes"),
});

export const Route = createFileRoute("/_authenticated/auditoria")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Auditoria & Histórico | ORBIT" },
      { name: "description", content: "Auditoria completa de alterações, histórico de renovações de clientes, vendas de revendedores e ativações de aplicativos." },
      { property: "og:title", content: "Auditoria & Histórico | ORBIT" },
    ],
  }),
  component: AuditoriaPage,
});

type AuditRow = {
  id: string;
  user_email: string | null;
  categoria: string;
  acao: string;
  descricao: string | null;
  entidade: string | null;
  entidade_id: string | null;
  entidade_nome: string | null;
  dados_anteriores: any;
  dados_novos: any;
  metadata: any;
  created_at: string;
};

async function fetchAudit(): Promise<AuditRow[]> {
  const { data, error } = await supabase
    .from("audit_logs" as any)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data as any as AuditRow[]) ?? [];
}

const CATEGORIAS: Record<string, { label: string; className: string }> = {
  cliente: { label: "Cliente", className: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  renovacao: { label: "Renovação", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  revendedor: { label: "Revendedor", className: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
  venda_credito: { label: "Venda crédito", className: "bg-pink-500/15 text-pink-300 border-pink-500/30" },
  compra_credito: { label: "Compra crédito", className: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  credito: { label: "Crédito", className: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
  servidor: { label: "Servidor", className: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30" },
  painel: { label: "Painel", className: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" },
  financeiro: { label: "Financeiro", className: "bg-lime-500/15 text-lime-300 border-lime-500/30" },
  importacao: { label: "Importação", className: "bg-slate-500/15 text-slate-200 border-slate-500/30" },
  exportacao: { label: "Exportação", className: "bg-slate-500/15 text-slate-200 border-slate-500/30" },
  backup: { label: "Backup", className: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  auth: { label: "Autenticação", className: "bg-teal-500/15 text-teal-300 border-teal-500/30" },
  outro: { label: "Outro", className: "bg-muted text-muted-foreground border-border" },
};

const ACAO_META: Record<string, { label: string; className: string }> = {
  criar: { label: "CRIAR", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  editar: { label: "EDITAR", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  excluir: { label: "EXCLUIR", className: "bg-red-500/15 text-red-400 border-red-500/30" },
  excluir_definitivo: { label: "EXCLUIR DEFINITIVO", className: "bg-red-500/25 text-red-300 border-red-500/40" },
  restaurar: { label: "RESTAURAR", className: "bg-teal-500/15 text-teal-300 border-teal-500/30" },
  reativar: { label: "REATIVAR", className: "bg-teal-500/15 text-teal-300 border-teal-500/30" },
  renovar: { label: "RENOVAR", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  cancelar: { label: "CANCELAR", className: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  cancelar_venda: { label: "CANCELAR VENDA", className: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  duplicar: { label: "DUPLICAR", className: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" },
  vender: { label: "VENDER", className: "bg-pink-500/15 text-pink-400 border-pink-500/30" },
  comprar: { label: "COMPRAR", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  ajustar: { label: "AJUSTAR", className: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
  transferir: { label: "TRANSFERIR", className: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30" },
  importar: { label: "IMPORTAR", className: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  exportar: { label: "EXPORTAR", className: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  alterar_pagamento: { label: "PAGAMENTO", className: "bg-lime-500/15 text-lime-400 border-lime-500/30" },
  outro: { label: "OUTRO", className: "bg-muted text-muted-foreground border-border" },
};

function ChipCategoria({ c }: { c: string }) {
  const meta = CATEGORIAS[c] ?? CATEGORIAS.outro;
  return <Badge variant="outline" className={`${meta.className} text-[10px]`}>{meta.label}</Badge>;
}

function ChipAcao({ a }: { a: string }) {
  const meta = ACAO_META[a] ?? { label: a.toUpperCase(), className: "bg-muted text-muted-foreground border-border" };
  return <Badge variant="outline" className={`${meta.className} text-[10px] font-semibold tracking-wider`}>{meta.label}</Badge>;
}

const LABELS: Record<string, string> = {
  nome: "Nome",
  telefone: "Telefone",
  celular: "Celular",
  email: "E-mail",
  login: "Login",
  senha: "Senha",
  mac: "MAC",
  device: "Device",
  device_id: "Device ID",
  device_key: "Device Key",
  app: "Aplicativo",
  aplicativo: "Aplicativo",
  servidor: "Servidor",
  servidor_id: "Servidor",
  servidor_nome: "Servidor",
  painel: "Painel",
  url: "URL",
  observacao: "Observação",
  observacoes: "Observações",
  valor: "Valor",
  valor_pago: "Valor pago",
  valor_custo: "Valor custo",
  valor_venda: "Valor venda",
  valor_compra: "Valor compra",
  custo_unitario: "Custo unitário",
  custo_mensal: "Custo mensal",
  preco_venda: "Preço de venda",
  quantidade: "Quantidade",
  quantidade_creditos: "Qtd. créditos",
  creditos: "Créditos",
  saldo: "Saldo",
  data_vencimento: "Vencimento",
  vencimento: "Vencimento",
  data_recarga: "Data recarga",
  data_ativacao: "Data ativação",
  ativacao: "Data ativação",
  data_pagamento: "Data pagamento",
  validade: "Validade",
  validade_dias: "Validade (dias)",
  dias: "Dias",
  dias_validade: "Dias validade",
  status: "Status",
  status_pagamento: "Status do pagamento",
  status_venda: "Status da venda",
  forma_pagamento: "Forma de pagamento",
  metodo_pagamento: "Método de pagamento",
  tipo: "Tipo",
  revendedor: "Revendedor",
  revendedor_id: "Revendedor",
  revendedor_nome: "Revendedor",
  cliente: "Cliente",
  cliente_id: "Cliente",
  cliente_nome: "Cliente",
  id: "ID",
  user_id: "Usuário",
  created_at: "Criado em",
  updated_at: "Atualizado em",
  deleted_at: "Excluído em",
  ativada_em: "Ativada em",
  codigo: "Código",
  descricao: "Descrição",
  motivo: "Motivo",
  origem: "Origem",
  destino: "Destino",
};

function humanizeKey(k: string): string {
  if (LABELS[k]) return LABELS[k];
  const s = k.replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isIsoDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}|$)/.test(v);
}

function formatValue(key: string, v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "number") {
    const isCurrency = /(valor|preco|custo|saldo|lucro|receita|despesa)/i.test(key) &&
      !/(quantidade|qtd|total|registros|clientes|dias|duracao|done|failures|inseridos|atualizados)/i.test(key);
    if (isCurrency) {
      try {
        return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      } catch {
        return `R$ ${v.toFixed(2)}`;
      }
    }
    return String(v);
  }
  if (typeof v === "string") {
    if (isIsoDate(v)) {
      try { return formatDateTimeBR(v); } catch { return v; }
    }
    return v;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return "—";
    return v.map((it) => (typeof it === "object" ? renderObjectInline(it) : String(it))).join(", ");
  }
  if (typeof v === "object") return renderObjectInline(v);
  return String(v);
}

function renderObjectInline(obj: Record<string, any>): string {
  const nomeLike = obj.nome ?? obj.name ?? obj.titulo ?? obj.label;
  if (nomeLike && typeof nomeLike === "string") return nomeLike;
  const parts: string[] = [];
  Object.entries(obj).slice(0, 4).forEach(([k, v]) => {
    if (v === null || v === undefined || v === "") return;
    if (k === "id" || k === "user_id") return;
    parts.push(`${humanizeKey(k)}: ${formatValue(k, v)}`);
  });
  return parts.join(" • ") || "—";
}

const HIDE_KEYS = new Set(["id", "user_id", "created_at", "updated_at", "deleted_at"]);

function TextFields({ title, data, tone }: { title: string; data: any; tone: string }) {
  if (!data || typeof data !== "object") return null;
  const entries = Object.entries(data).filter(([k]) => !HIDE_KEYS.has(k));
  if (entries.length === 0) return null;
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{title}</div>
      <div className={`rounded-md border ${tone} p-3 space-y-1.5`}>
        {entries.map(([k, v]) => (
          <div key={k} className="flex gap-2 text-sm">
            <span className="text-muted-foreground min-w-[140px]">{humanizeKey(k)}:</span>
            <span className="font-medium break-words">{formatValue(k, v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DiffTable({ antes, depois }: { antes: any; depois: any }) {
  const a = antes && typeof antes === "object" ? antes : {};
  const d = depois && typeof depois === "object" ? depois : {};
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(d)])).filter(
    (k) => !HIDE_KEYS.has(k),
  );
  if (keys.length === 0) return null;
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">Alterações</div>
      <div className="rounded-md border border-border/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-3 py-1.5 font-medium text-xs text-muted-foreground">Campo</th>
              <th className="text-left px-3 py-1.5 font-medium text-xs text-muted-foreground">Antes</th>
              <th className="text-left px-3 py-1.5 font-medium text-xs text-muted-foreground">Depois</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k} className="border-t border-border/40">
                <td className="px-3 py-1.5 text-muted-foreground align-top">{humanizeKey(k)}</td>
                <td className="px-3 py-1.5 text-red-300/90 align-top break-words">{formatValue(k, (a as any)[k])}</td>
                <td className="px-3 py-1.5 text-emerald-300/90 align-top break-words">{formatValue(k, (d as any)[k])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Renderiza na tabela a descrição simplificada e sintetizada da operação
 */
function DescricaoCell({ r }: { r: AuditRow }) {
  const breve = r.descricao?.trim() || `${humanizeKey(r.acao)} em ${r.entidade_nome || r.entidade || "registro"}`;

  return (
    <div className="py-1">
      <span className="font-medium text-foreground text-sm">
        {breve}
      </span>
      {r.entidade_nome && !breve.includes(r.entidade_nome) && (
        <span className="text-xs text-muted-foreground ml-1.5">
          ({r.entidade ? `${r.entidade}: ` : ""}{r.entidade_nome})
        </span>
      )}
    </div>
  );
}

export function AuditoriaPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const activeTab = (search?.tab as any) || "alteracoes";

  const setTab = (t: string) => {
    navigate({
      search: { tab: t as any },
      replace: true,
    });
  };

  // Queries
  const { data: auditRows = [], refetch: refetchAudit, isFetching: isFetchingAudit } = useQuery({
    queryKey: ["audit_logs"],
    queryFn: fetchAudit,
    staleTime: 60_000,
  });

  const { data: renovacoes = [], refetch: refetchRenovacoes } = useQuery({
    queryKey: ["historico"],
    queryFn: () => fetchHistorico(5000),
  });

  const { data: movsRev = [], refetch: refetchRev } = useQuery({
    queryKey: ["revendedores_movs"],
    queryFn: () => fetchRevendedoresMovs(5000),
  });

  const { data: ativacoesApps = [], refetch: refetchApps } = useQuery({
    queryKey: ["ativacoes_apps"],
    queryFn: () => fetchAtivacoesApps(5000),
  });

  // ----------------------------------------------------
  // Estados da Aba: ALTERAÇÕES
  // ----------------------------------------------------
  const [buscaAlteracoes, setBuscaAlteracoes] = useState("");
  const [catAlteracoes, setCatAlteracoes] = useState<string>("todas");
  const [acaoAlteracoes, setAcaoAlteracoes] = useState<string>("todas");
  const [detalheAudit, setDetalheAudit] = useState<AuditRow | null>(null);

  const acoesDisponiveis = useMemo(() => {
    const set = new Set<string>();
    auditRows.forEach((r) => set.add(r.acao));
    return Array.from(set).sort();
  }, [auditRows]);

  const auditFiltradas = useMemo(() => {
    const q = buscaAlteracoes.trim().toLowerCase();
    return auditRows.filter((r) => {
      if (catAlteracoes !== "todas" && r.categoria !== catAlteracoes) return false;
      if (acaoAlteracoes !== "todas" && r.acao !== acaoAlteracoes) return false;
      if (!q) return true;
      const hay = [
        r.descricao,
        r.entidade,
        r.entidade_nome,
        r.user_email,
        r.categoria,
        r.acao,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [auditRows, buscaAlteracoes, catAlteracoes, acaoAlteracoes]);

  // ----------------------------------------------------
  // Estados da Aba: CLIENTES (Renovações)
  // ----------------------------------------------------
  const [buscaCli, setBuscaCli] = useState("");
  const [filtroCli, setFiltroCli] = useState<"todas" | "ativas" | "canceladas">("todas");
  const [filtroPagCli, setFiltroPagCli] = useState<"todos" | "pagos" | "devendo">("todos");
  const [cancelandoCli, setCancelandoCli] = useState<string | null>(null);
  const [marcandoCli, setMarcandoCli] = useState<string | null>(null);

  const renovacoesFiltradas = useMemo(() => {
    const q = buscaCli.trim().toLowerCase();
    return (renovacoes as any[]).filter((h) => {
      if (filtroCli === "ativas" && h.status === "cancelada") return false;
      if (filtroCli === "canceladas" && h.status !== "cancelada") return false;
      if (filtroPagCli === "pagos" && h.status_pagamento === "devendo") return false;
      if (filtroPagCli === "devendo" && h.status_pagamento !== "devendo") return false;
      if (q) {
        const nome = String(h.cliente?.nome || "").toLowerCase();
        if (!nome.includes(q)) return false;
      }
      return true;
    });
  }, [renovacoes, filtroCli, filtroPagCli, buscaCli]);

  const statsCli = useMemo(() => {
    const ativas = (renovacoes as any[]).filter((h) => h.status !== "cancelada");
    const totalRec = ativas.reduce((s, h) => s + Number(h.valor_recebido || 0), 0);
    const totalPend = ativas.reduce((s, h) => s + Number(h.valor_pendente || 0), 0);
    const totalLucro = ativas.reduce((s, h) => s + Number(h.lucro || 0), 0);
    return { count: ativas.length, totalRec, totalPend, totalLucro };
  }, [renovacoes]);

  // ----------------------------------------------------
  // Estados da Aba: REVENDEDORES
  // ----------------------------------------------------
  const [buscaRev, setBuscaRev] = useState("");
  const [filtroRev, setFiltroRev] = useState<"todas" | "realizadas" | "canceladas">("todas");
  const [filtroPagRev, setFiltroPagRev] = useState<"todos" | "pagos" | "devendo">("todos");
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelandoMov, setCancelandoMov] = useState<any | null>(null);
  const [cancelMotivo, setCancelMotivo] = useState("");
  const [cancelSaving, setCancelSaving] = useState(false);
  const [marcandoRev, setMarcandoRev] = useState<string | null>(null);

  const todasVendasRev = useMemo(() => {
    return (movsRev as any[]).filter((m) => m.tipo === "venda" && Number(m.quantidade) > 0);
  }, [movsRev]);

  const vendasRevFiltradas = useMemo(() => {
    const q = buscaRev.trim().toLowerCase();
    return todasVendasRev.filter((m) => {
      if (filtroRev === "realizadas" && m.status_venda === "cancelada") return false;
      if (filtroRev === "canceladas" && m.status_venda !== "cancelada") return false;
      const isPago = (m.status_pagamento || "pago") === "pago";
      if (filtroPagRev === "pagos" && !isPago) return false;
      if (filtroPagRev === "devendo" && isPago) return false;
      if (q) {
        const rev = String(m.revendedor?.nome || "").toLowerCase();
        const serv = String(m.servidor?.nome || "").toLowerCase();
        if (!rev.includes(q) && !serv.includes(q)) return false;
      }
      return true;
    });
  }, [todasVendasRev, filtroRev, filtroPagRev, buscaRev]);

  const statsRev = useMemo(() => {
    const ativas = todasVendasRev.filter((m) => m.status_venda !== "cancelada");
    const totalCreds = ativas.reduce((s, m) => s + Number(m.quantidade || 0), 0);
    const totalValor = ativas.reduce((s, m) => s + Number(m.valor_pago || 0), 0);
    const totalPend = ativas.filter((m) => m.status_pagamento === "devendo").reduce((s, m) => s + Number(m.valor_pago || 0), 0);
    return { count: ativas.length, totalCreds, totalValor, totalPend };
  }, [todasVendasRev]);

  // ----------------------------------------------------
  // Estados da Aba: APLICATIVOS
  // ----------------------------------------------------
  const [buscaApps, setBuscaApps] = useState("");
  const [comprovanteModalOpen, setComprovanteModalOpen] = useState(false);
  const [comprovanteModalData, setComprovanteModalData] = useState<ComprovanteData | null>(null);

  const appsFiltrados = useMemo(() => {
    const q = buscaApps.trim().toLowerCase();
    return (ativacoesApps as any[]).filter((a) => {
      if (!q) return true;
      const hay = [
        a.cliente_nome,
        a.mac,
        a.device,
        a.aplicativo,
        a.servidor?.nome,
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [ativacoesApps, buscaApps]);

  const statsApps = useMemo(() => {
    const totalAtiv = ativacoesApps.length;
    const totalFat = (ativacoesApps as any[]).reduce((s, a) => s + Number(a.valor || 0), 0);
    const totalCusto = (ativacoesApps as any[]).reduce((s, a) => s + Number(a.custo || 0), 0);
    const totalLucro = totalFat - totalCusto;
    return { totalAtiv, totalFat, totalLucro };
  }, [ativacoesApps]);

  // ----------------------------------------------------
  // Funções de Clientes
  // ----------------------------------------------------
  async function marcarComoPagoCli(h: any) {
    setMarcandoCli(h.id);
    try {
      const valor = Number(h.valor_pendente || 0);
      const custoH = Number(h.custo || 0);
      const { error: eH } = await supabase.from("historico_renovacoes").update({
        status_pagamento: "pago" as any,
        valor_recebido: valor,
        valor_pendente: 0,
        lucro: valor - custoH,
        pago_em: new Date().toISOString(),
      } as any).eq("id", h.id);
      if (eH) throw eH;
      await supabase.from("clientes").update({
        status_pagamento: "pago",
        valor_pago: valor,
      }).eq("id", h.cliente_id);
      await logAudit({
        categoria: "financeiro",
        acao: "alterar_pagamento",
        descricao: `Renovação de "${h.cliente?.nome ?? "-"}" marcada como PAGA (${currencyBRL(valor)})`,
        entidade: "historico_renovacoes",
        entidade_id: h.id,
        entidade_nome: h.cliente?.nome ?? null,
        dados_anteriores: { status_pagamento: "devendo", valor_pendente: valor, valor_recebido: 0 },
        dados_novos: { status_pagamento: "pago", valor_recebido: valor, lucro: valor - custoH, pago_em: new Date().toISOString() },
      });
      toast.success(`Pagamento recebido: ${currencyBRL(valor)}`);
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao marcar como pago");
    } finally {
      setMarcandoCli(null);
    }
  }

  async function cancelarRenovacaoCli(h: any) {
    if (h.status === "cancelada") return;
    setCancelandoCli(h.id);
    try {
      const ok = await reverterRenovacaoRegistro(h);
      if (ok) {
        qc.invalidateQueries();
      }
    } finally {
      setCancelandoCli(null);
    }
  }

  // ----------------------------------------------------
  // Funções de Revendedores
  // ----------------------------------------------------
  function abrirCancelamentoRev(m: any) {
    setCancelandoMov(m);
    setCancelMotivo("");
    setCancelModalOpen(true);
  }

  async function confirmarCancelamentoRev() {
    if (!cancelandoMov) return;
    setCancelSaving(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;
      const qtd = Number(cancelandoMov.quantidade || 0);
      const valor = Number(cancelandoMov.valor_pago || 0);
      const custo = Number(cancelandoMov.custo || 0);
      const lucro = Number(cancelandoMov.lucro || 0);
      const revNome = cancelandoMov.revendedor?.nome ?? "Revendedor";

      const { error: upErr } = await supabase
        .from("revendedores_movimentacoes")
        .update({
          status_venda: "cancelada",
          cancelada_em: new Date().toISOString(),
          cancelada_por: user.id,
          motivo_cancelamento: cancelMotivo || null,
        })
        .eq("id", cancelandoMov.id);
      if (upErr) throw upErr;

      // Devolve crédito ao servidor
      if (cancelandoMov.servidor_id && qtd > 0) {
        await registrarMovimentacaoCredito({
          servidor_id: cancelandoMov.servidor_id,
          quantidade: qtd,
          tipo: "ajuste_add",
          motivo: `Estorno de recarga p/ ${revNome}${cancelMotivo ? ` — ${cancelMotivo}` : ""}`,
        });
      }

      // Reduz créditos do revendedor
      if (cancelandoMov.revendedor_id && qtd > 0) {
        const { data: rev } = await supabase
          .from("revendedores")
          .select("creditos")
          .eq("id", cancelandoMov.revendedor_id)
          .maybeSingle();
        const atual = Number(rev?.creditos || 0);
        await supabase
          .from("revendedores")
          .update({ creditos: Math.max(0, atual - qtd) })
          .eq("id", cancelandoMov.revendedor_id);
      }

      // Estorno no histórico financeiro
      await supabase.from("historico_financeiro").insert({
        user_id: user.id,
        tipo: "estorno_revendedor",
        valor: -valor,
        custo: -custo,
        lucro: -lucro,
        descricao: `Estorno de recarga ${qtd} créditos p/ ${revNome}${cancelMotivo ? ` — ${cancelMotivo}` : ""}`,
      });

      await logAudit({
        categoria: "venda_credito",
        acao: "cancelar_venda",
        descricao: `Recarga de ${qtd} créditos p/ ${revNome} CANCELADA`,
        entidade: "revendedores_movimentacoes",
        entidade_id: cancelandoMov.id,
        entidade_nome: revNome,
        metadata: {
          quantidade: qtd,
          valor,
          custo,
          lucro,
          motivo: cancelMotivo || null,
        },
      });

      toast.success(`Recarga cancelada com sucesso. ${qtd} créditos e valores estornados.`);
      qc.invalidateQueries();
      setCancelModalOpen(false);
      setCancelandoMov(null);
      setCancelMotivo("");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao cancelar recarga");
    } finally {
      setCancelSaving(false);
    }
  }

  async function marcarComoPagoRev(m: any) {
    setMarcandoRev(m.id);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;
      const valor = Number(m.valor_pago || 0);
      const revNome = m.revendedor?.nome ?? "Revendedor";

      const { error: upErr } = await supabase
        .from("revendedores_movimentacoes")
        .update({ status_pagamento: "pago" } as any)
        .eq("id", m.id);
      if (upErr) throw upErr;

      await supabase.from("historico_financeiro").insert({
        user_id: user.id,
        tipo: "revendedor",
        valor: valor,
        custo: 0,
        lucro: valor,
        descricao: `Recebimento recarga ${m.quantidade} créd p/ ${revNome}`,
      });

      await logAudit({
        categoria: "venda_credito",
        acao: "alterar_pagamento",
        descricao: `Recarga de ${m.quantidade} créditos p/ ${revNome} marcada como PAGA (${currencyBRL(valor)})`,
        entidade: "revendedores_movimentacoes",
        entidade_id: m.id,
        entidade_nome: revNome,
        metadata: { valor, quantidade: m.quantidade },
      });

      toast.success(`Pagamento da recarga recebido: ${currencyBRL(valor)}`);
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao marcar como pago");
    } finally {
      setMarcandoRev(null);
    }
  }

  // ----------------------------------------------------
  // Funções de Aplicativos
  // ----------------------------------------------------
  function abrirComprovanteApp(a: any) {
    setComprovanteModalData({
      id: a.id,
      cliente_nome: a.cliente_nome,
      aplicativo: a.aplicativo,
      mac: a.mac,
      device: a.device,
      ativado_em: a.ativado_em,
      expira_em: a.expira_em,
      servidor_nome: a.servidor?.nome,
      observacao: a.observacao,
    });
    setComprovanteModalOpen(true);
  }

  async function reverterAtivacaoApp(a: any) {
    const ident = a.cliente_nome ? `do cliente "${a.cliente_nome}"` : `(${a.mac || a.device || "aplicativo"})`;
    const ok = await confirmDialog({
      title: "Reverter ativação de aplicativo?",
      description: `Tem certeza que deseja reverter a ativação de ${a.aplicativo || "aplicativo"} ${ident}?\n\n• As saídas de créditos associadas serão canceladas e estornadas no servidor ${a.servidor?.nome ? `"${a.servidor.nome}"` : ""}.\n• Os valores de faturamento (${currencyBRL(Number(a.valor || 0))}) e custo (${currencyBRL(Number(a.custo || 0))}) serão retirados do faturamento do dia.\n• O registro desta ativação será excluído.`,
      confirmText: "Reverter Ativação",
      cancelText: "Cancelar",
      destructive: true,
    });
    if (!ok) return;

    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Não autenticado");

      let creditosEstornados = 0;

      // 1. Reverter saída de créditos no servidor
      if (a.servidor_id) {
        const termoBusca = a.mac || a.device || a.aplicativo || "";
        const { data: movs } = await supabase
          .from("creditos_movimentacoes")
          .select("id, quantidade, motivo, created_at")
          .eq("servidor_id", a.servidor_id)
          .eq("tipo", "ativacao")
          .order("created_at", { ascending: false })
          .limit(20);

        const movMatch = (movs ?? []).find((m: any) => {
          const isNegative = Number(m.quantidade) < 0;
          const hasTerm = termoBusca ? String(m.motivo || "").includes(termoBusca) : true;
          return isNegative && hasTerm;
        });

        if (movMatch) {
          creditosEstornados = Math.abs(Number(movMatch.quantidade));
          await supabase.from("creditos_movimentacoes").delete().eq("id", movMatch.id);
        } else {
          const fracaoEstimada = a.servidor?.custo_mensal && a.custo ? Number((a.custo / a.servidor.custo_mensal).toFixed(2)) : 1;
          if (fracaoEstimada > 0) {
            creditosEstornados = fracaoEstimada;
            await registrarMovimentacaoCredito({
              servidor_id: a.servidor_id,
              quantidade: fracaoEstimada,
              tipo: "ajuste_add",
              motivo: `Reversão/estorno de ativação: ${a.aplicativo || "App"} (${a.mac || a.device || ""})`,
            });
          }
        }
      }

      // 2. Retirar registros financeiros em historico_financeiro
      const termoFinanceiro = a.mac || a.device || a.aplicativo || "";
      const { data: histRecords } = await supabase
        .from("historico_financeiro")
        .select("id, descricao, valor, custo, created_at")
        .eq("tipo", "ativacao_app")
        .order("created_at", { ascending: false })
        .limit(30);

      const targetHist = (histRecords ?? []).find((h: any) => {
        const descMatch = termoFinanceiro ? String(h.descricao || "").includes(termoFinanceiro) : false;
        const valMatch = Math.abs(Number(h.valor) - Number(a.valor)) < 0.01 && Math.abs(Number(h.custo) - Number(a.custo)) < 0.01;
        return descMatch || valMatch;
      });

      if (targetHist) {
        await supabase.from("historico_financeiro").delete().eq("id", targetHist.id);
      }

      // 3. Excluir a ativação de ativacoes_apps
      const { error: eDel } = await supabase.from("ativacoes_apps").delete().eq("id", a.id);
      if (eDel) throw eDel;

      // 4. Log de auditoria da reversão
      await logAudit({
        categoria: "outro",
        acao: "cancelar",
        descricao: `Reversão de ativação de aplicativo ${a.aplicativo ?? ""} para ${a.cliente_nome || a.device || a.mac || "sem device"} no servidor ${a.servidor?.nome ?? "-"} — estornados ${currencyBRL(Number(a.valor || 0))} de faturamento, ${currencyBRL(Number(a.custo || 0))} de custo e ${creditosEstornados} crédito(s)`,
        entidade: "ativacoes_apps",
        entidade_id: a.id,
        metadata: { valor: a.valor, custo: a.custo, creditos_estornados: creditosEstornados, servidor_id: a.servidor_id },
      });

      toast.success("Ativação revertida com sucesso! Créditos e lançamentos financeiros foram estornados.");
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao reverter ativação");
    }
  }

  // ----------------------------------------------------
  // Exportações Excel
  // ----------------------------------------------------
  function exportarAudit() {
    if (auditFiltradas.length === 0) return toast.error("Nada para exportar");
    const dados = auditFiltradas.map((r) => ({
      "Data e Hora": formatDateTimeBR(r.created_at),
      Usuário: r.user_email ?? "-",
      Categoria: CATEGORIAS[r.categoria]?.label ?? r.categoria,
      Ação: r.acao,
      Descrição: r.descricao ?? "",
      Entidade: r.entidade ?? "",
      "Nome/Ref.": r.entidade_nome ?? r.entidade_id ?? "",
      "Dados anteriores": r.dados_anteriores ? JSON.stringify(r.dados_anteriores) : "",
      "Dados novos": r.dados_novos ? JSON.stringify(r.dados_novos) : "",
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Auditoria");
    XLSX.writeFile(wb, `auditoria-alteracoes-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Exportado em Excel!");
  }

  function exportarClientes() {
    if (renovacoesFiltradas.length === 0) return toast.error("Nada para exportar");
    const rows = renovacoesFiltradas.map((h) => ({
      Data: formatDateTimeBR(h.created_at),
      Cliente: h.cliente?.nome ?? "-",
      Status: h.status === "cancelada" ? "CANCELADA" : "RENOVADO",
      Dias: h.dias_adicionados,
      Créditos: creditosPorDias(Number(h.dias_adicionados || 0)),
      "Vencimento anterior": formatDateBR(h.vencimento_anterior),
      "Novo vencimento": formatDateBR(h.vencimento_novo),
      "Status Pagamento": (h.status_pagamento || "pago").toUpperCase(),
      Valor: Number(h.valor_recebido || h.valor_pendente || 0),
      Custo: Number(h.custo || 0),
      Lucro: Number(h.lucro || 0),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Renovacoes-Clientes");
    XLSX.writeFile(wb, `historico-clientes-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Exportado!");
  }

  function exportarRevendedores() {
    if (vendasRevFiltradas.length === 0) return toast.error("Nada para exportar");
    const rows = vendasRevFiltradas.map((m: any) => ({
      Data: formatDateTimeBR(m.created_at),
      Revendedor: m.revendedor?.nome ?? "-",
      Servidor: m.servidor?.nome ?? "-",
      Status: m.status_venda === "cancelada" ? "CANCELADA" : "REALIZADA",
      Créditos: Number(m.quantidade || 0),
      Valor: Number(m.valor_pago || 0),
      Pagamento: (m.status_pagamento || "pago").toUpperCase(),
      Motivo: m.motivo_cancelamento ?? m.motivo ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vendas-Revendedores");
    XLSX.writeFile(wb, `historico-revendedores-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Exportado!");
  }

  function exportarAplicativos() {
    if (appsFiltrados.length === 0) return toast.error("Nada para exportar");
    const rows = appsFiltrados.map((a: any) => ({
      Data: formatDateTimeBR(a.ativado_em),
      Cliente: a.cliente_nome ?? "-",
      Aplicativo: a.aplicativo ?? "-",
      MAC: a.mac ?? "-",
      Device: a.device ?? "-",
      Servidor: a.servidor?.nome ?? "-",
      "Expira em": formatDateTimeBR(a.expira_em),
      Valor: Number(a.valor || 0),
      Custo: Number(a.custo || 0),
      Lucro: Number(a.valor || 0) - Number(a.custo || 0),
      Observação: a.observacao ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ativacoes-Aplicativos");
    XLSX.writeFile(wb, `historico-aplicativos-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Exportado!");
  }

  async function excluirLog(r: AuditRow) {
    const ok = await confirmDialog({
      title: "Excluir registro de auditoria?",
      description: `Isto removerá permanentemente o log de auditoria "${r.descricao || r.acao}". Esta ação não pode ser desfeita.`,
      confirmText: "Excluir Registro",
      cancelText: "Cancelar",
      destructive: true,
    });
    if (!ok) return;

    try {
      const { error } = await supabase.from("audit_logs" as any).delete().eq("id", r.id);
      if (error) throw error;
      toast.success("Registro de auditoria excluído");
      refetchAudit();
    } catch (err: any) {
      toast.error(err?.message || "Falha ao excluir registro");
    }
  }

  return (
    <div className="p-6 space-y-4">
      {/* Cabeçalho Principal */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" /> Auditoria & Histórico
          </h1>
          <p className="text-sm text-muted-foreground">
            Central unificada de auditoria, alterações cadastrais, renovações de clientes, revendedores e aplicativos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchAudit();
              refetchRenovacoes();
              refetchRev();
              refetchApps();
              toast.success("Dados atualizados!");
            }}
            disabled={isFetchingAudit}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${isFetchingAudit ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </div>

      {/* Tabs Principais da Central de Auditoria */}
      <Tabs value={activeTab} onValueChange={(v) => setTab(v)}>
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full max-w-2xl h-auto p-1 bg-muted/70">
          <TabsTrigger value="alteracoes" className="gap-2 py-2 data-[state=active]:bg-background">
            <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
            <span className="truncate">Alterações ({auditRows.length})</span>
          </TabsTrigger>
          <TabsTrigger value="clientes" className="gap-2 py-2 data-[state=active]:bg-background">
            <Users className="h-4 w-4 text-blue-400 shrink-0" />
            <span className="truncate">Clientes ({renovacoes.length})</span>
          </TabsTrigger>
          <TabsTrigger value="revendedores" className="gap-2 py-2 data-[state=active]:bg-background">
            <Store className="h-4 w-4 text-purple-400 shrink-0" />
            <span className="truncate">Revendedores ({todasVendasRev.length})</span>
          </TabsTrigger>
          <TabsTrigger value="aplicativos" className="gap-2 py-2 data-[state=active]:bg-background">
            <Smartphone className="h-4 w-4 text-emerald-400 shrink-0" />
            <span className="truncate">Aplicativos ({ativacoesApps.length})</span>
          </TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------------------------ */}
        {/* SUB-ABA 1: ALTERAÇÕES (Auditoria Geral) */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="alteracoes" className="mt-4 space-y-4">
          <Card className="p-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Pesquisar por descrição, nome, usuário..."
                value={buscaAlteracoes}
                onChange={(e) => setBuscaAlteracoes(e.target.value)}
              />
            </div>
            <Select value={catAlteracoes} onValueChange={setCatAlteracoes}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as categorias</SelectItem>
                {Object.entries(CATEGORIAS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={acaoAlteracoes} onValueChange={setAcaoAlteracoes}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Ação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as ações</SelectItem>
                {acoesDisponiveis.map((a) => (
                  <SelectItem key={a} value={a}>{a.toUpperCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportarAudit}>
              <Download className="h-4 w-4 mr-1" /> Exportar Excel
            </Button>
            <div className="text-xs text-muted-foreground ml-auto">
              {auditFiltradas.length} de {auditRows.length} registro(s)
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="max-h-[calc(100vh-280px)] overflow-auto">
              <Table className={COMPACT_TABLE_CLASS}>
                <TableHeader className="bg-primary/10 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="w-[165px] whitespace-nowrap">Data / Hora</TableHead>
                    <TableHead className="w-[125px]">Categoria</TableHead>
                    <TableHead className="w-[125px]">Ação</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-[110px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditFiltradas.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs whitespace-nowrap text-foreground/90">
                        {formatDateTimeBR(r.created_at)}
                      </TableCell>
                      <TableCell>
                        <ChipCategoria c={r.categoria} />
                      </TableCell>
                      <TableCell>
                        <ChipAcao a={r.acao} />
                      </TableCell>
                      <TableCell className="text-sm">
                        <DescricaoCell r={r} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() => setDetalheAudit(r)}
                            title="Ver detalhes completos"
                          >
                            <Eye className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                          </Button>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-cyan-400 hover:text-cyan-300"
                                title="Baixar registro em PDF ou PNG"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem
                                className="cursor-pointer text-cyan-400 focus:text-cyan-300"
                                onClick={async () => {
                                  try {
                                    await exportAuditRowPNG(r);
                                    toast.success("Imagem PNG de auditoria baixada!");
                                  } catch (err: any) {
                                    toast.error(err?.message || "Falha ao gerar PNG");
                                  }
                                }}
                              >
                                <ImageIcon className="h-4 w-4 mr-2" />
                                Baixar em PNG
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="cursor-pointer text-blue-400 focus:text-blue-300"
                                onClick={async () => {
                                  try {
                                    await exportAuditRowPDF(r);
                                    toast.success("Documento PDF de auditoria baixado!");
                                  } catch (err: any) {
                                    toast.error(err?.message || "Falha ao gerar PDF");
                                  }
                                }}
                              >
                                <FileDown className="h-4 w-4 mr-2" />
                                Baixar em PDF
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="cursor-pointer"
                                onClick={async () => {
                                  const ok = await copyAuditRowImageToClipboard(r);
                                  if (ok) {
                                    toast.success("Imagem de auditoria copiada! Cole no WhatsApp.");
                                  } else {
                                    toast.error("Falha ao copiar imagem.");
                                  }
                                }}
                              >
                                <Copy className="h-4 w-4 mr-2" />
                                Copiar Imagem
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>

                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            onClick={() => excluirLog(r)}
                            title="Excluir este log de auditoria"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {auditFiltradas.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                        Nenhum registro de auditoria encontrado.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* SUB-ABA 2: CLIENTES (Histórico de Renovações) */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="clientes" className="mt-4 space-y-4">
          {/* Métricas Resumidas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-3 bg-card/60">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                <Users className="h-3.5 w-3.5 text-blue-400" /> Renovações Ativas
              </div>
              <div className="text-2xl font-bold mt-1">{statsCli.count}</div>
            </Card>
            <Card className="p-3 bg-card/60">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Faturamento Recebido
              </div>
              <div className="text-2xl font-bold mt-1 text-emerald-400">{currencyBRL(statsCli.totalRec)}</div>
            </Card>
            <Card className="p-3 bg-card/60">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> Pendente (Devendo)
              </div>
              <div className="text-2xl font-bold mt-1 text-amber-400">{currencyBRL(statsCli.totalPend)}</div>
            </Card>
            <Card className="p-3 bg-card/60">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                <TrendingUp className="h-3.5 w-3.5 text-primary" /> Lucro Líquido
              </div>
              <div className="text-2xl font-bold mt-1 text-primary">{currencyBRL(statsCli.totalLucro)}</div>
            </Card>
          </div>

          {/* Filtros e Ações */}
          <Card className="p-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative min-w-[200px] flex-1 max-w-xs">
                <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8 h-8 text-xs"
                  placeholder="Buscar cliente..."
                  value={buscaCli}
                  onChange={(e) => setBuscaCli(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant={filtroCli === "todas" ? "default" : "outline"}
                  className="h-8 text-xs"
                  onClick={() => setFiltroCli("todas")}
                >
                  Todas ({renovacoes.length})
                </Button>
                <Button
                  size="sm"
                  variant={filtroCli === "ativas" ? "default" : "outline"}
                  className="h-8 text-xs text-emerald-400"
                  onClick={() => setFiltroCli("ativas")}
                >
                  Renovadas ({(renovacoes as any[]).filter((h) => h.status !== "cancelada").length})
                </Button>
                <Button
                  size="sm"
                  variant={filtroCli === "canceladas" ? "default" : "outline"}
                  className="h-8 text-xs text-red-400"
                  onClick={() => setFiltroCli("canceladas")}
                >
                  Canceladas ({(renovacoes as any[]).filter((h) => h.status === "cancelada").length})
                </Button>
              </div>

              <Select value={filtroPagCli} onValueChange={(v) => setFiltroPagCli(v as any)}>
                <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Pagamento" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos pagamentos</SelectItem>
                  <SelectItem value="pagos">Apenas Pagos</SelectItem>
                  <SelectItem value="devendo">Apenas Devendo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={exportarClientes}>
              <Download className="h-3.5 w-3.5 mr-1" /> Exportar Planilha
            </Button>
          </Card>

          <Card className="overflow-hidden">
            <div className="max-h-[calc(100vh-340px)] overflow-auto">
              <Table className={COMPACT_TABLE_CLASS}>
                <TableHeader className="bg-primary/10 sticky top-0 z-10">
                  <TableRow>
                    <TableHead>Data / Hora</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Dias</TableHead>
                    <TableHead>Créditos</TableHead>
                    <TableHead>Venc. anterior</TableHead>
                    <TableHead>Novo venc.</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Custo</TableHead>
                    <TableHead>Lucro</TableHead>
                    <TableHead>Pagto</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {renovacoesFiltradas.map((h: any) => {
                    const isCancelada = h.status === "cancelada";
                    const isDevendo = h.status_pagamento === "devendo";

                    return (
                      <TableRow key={h.id} className={isCancelada ? "opacity-60 bg-muted/20" : ""}>
                        <TableCell className="text-xs font-mono whitespace-nowrap">
                          {formatDateTimeBR(h.created_at)}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium text-foreground">{h.cliente?.nome ?? "-"}</span>
                        </TableCell>
                        <TableCell>
                          {isCancelada ? (
                            <Badge variant="destructive" className="text-[10px] uppercase tracking-wider font-semibold">
                              CANCELADA
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px] uppercase tracking-wider font-semibold">
                              RENOVADO
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className={`font-semibold ${isCancelada ? "text-muted-foreground line-through" : "text-blue-400"}`}>
                          +{h.dias_adicionados}
                        </TableCell>
                        <TableCell className="font-semibold text-primary">
                          {creditosPorDias(Number(h.dias_adicionados || 0))}
                        </TableCell>
                        <TableCell>{formatDateBR(h.vencimento_anterior)}</TableCell>
                        <TableCell>{formatDateBR(h.vencimento_novo)}</TableCell>
                        <TableCell className={isDevendo ? "text-amber-400 font-semibold" : "text-emerald-400"}>
                          {currencyBRL(isDevendo ? h.valor_pendente : h.valor_recebido)}
                        </TableCell>
                        <TableCell className="text-red-400">{currencyBRL(h.custo)}</TableCell>
                        <TableCell className="font-semibold">{currencyBRL(h.lucro)}</TableCell>
                        <TableCell>
                          {isDevendo ? (
                            <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[10px]">DEVENDO</Badge>
                          ) : (
                            <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px]">PAGO</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {isCancelada ? (
                            <span className="text-xs text-muted-foreground italic">Estornada</span>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              {isDevendo && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-emerald-400 hover:text-emerald-300 h-8 text-xs gap-1"
                                  disabled={marcandoCli === h.id}
                                  onClick={() => marcarComoPagoCli(h)}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  {marcandoCli === h.id ? "..." : "Pago"}
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-400 hover:text-red-300 h-8 text-xs gap-1 hover:bg-red-500/10"
                                disabled={cancelandoCli === h.id}
                                onClick={() => cancelarRenovacaoCli(h)}
                                title="Cancelar renovação e estornar dias e créditos"
                              >
                                <Undo2 className="h-3.5 w-3.5" />
                                {cancelandoCli === h.id ? "..." : "Cancelar"}
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {renovacoesFiltradas.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center text-muted-foreground py-10">
                        Nenhuma renovação encontrada neste filtro.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* SUB-ABA 3: REVENDEDORES (Vendas de Crédito & Movimentações) */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="revendedores" className="mt-4 space-y-4">
          {/* Métricas Resumidas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-3 bg-card/60">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                <Store className="h-3.5 w-3.5 text-purple-400" /> Recargas Realizadas
              </div>
              <div className="text-2xl font-bold mt-1">{statsRev.count}</div>
            </Card>
            <Card className="p-3 bg-card/60">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                <Coins className="h-3.5 w-3.5 text-primary" /> Créditos Injetados
              </div>
              <div className="text-2xl font-bold mt-1 text-primary">{statsRev.totalCreds}</div>
            </Card>
            <Card className="p-3 bg-card/60">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Faturamento Total
              </div>
              <div className="text-2xl font-bold mt-1 text-emerald-400">{currencyBRL(statsRev.totalValor)}</div>
            </Card>
            <Card className="p-3 bg-card/60">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> Pendente de Recebimento
              </div>
              <div className="text-2xl font-bold mt-1 text-amber-400">{currencyBRL(statsRev.totalPend)}</div>
            </Card>
          </div>

          {/* Filtros e Ações */}
          <Card className="p-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative min-w-[200px] flex-1 max-w-xs">
                <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8 h-8 text-xs"
                  placeholder="Buscar revendedor ou servidor..."
                  value={buscaRev}
                  onChange={(e) => setBuscaRev(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant={filtroRev === "todas" ? "default" : "outline"}
                  className="h-8 text-xs"
                  onClick={() => setFiltroRev("todas")}
                >
                  Todas ({todasVendasRev.length})
                </Button>
                <Button
                  size="sm"
                  variant={filtroRev === "realizadas" ? "default" : "outline"}
                  className="h-8 text-xs text-emerald-400"
                  onClick={() => setFiltroRev("realizadas")}
                >
                  Realizadas ({todasVendasRev.filter((m) => m.status_venda !== "cancelada").length})
                </Button>
                <Button
                  size="sm"
                  variant={filtroRev === "canceladas" ? "default" : "outline"}
                  className="h-8 text-xs text-red-400"
                  onClick={() => setFiltroRev("canceladas")}
                >
                  Canceladas ({todasVendasRev.filter((m) => m.status_venda === "cancelada").length})
                </Button>
              </div>

              <Select value={filtroPagRev} onValueChange={(v) => setFiltroPagRev(v as any)}>
                <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Pagamento" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos pagamentos</SelectItem>
                  <SelectItem value="pagos">Apenas Pagos</SelectItem>
                  <SelectItem value="devendo">Apenas Devendo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={exportarRevendedores}>
              <Download className="h-3.5 w-3.5 mr-1" /> Exportar Planilha
            </Button>
          </Card>

          <Card className="overflow-hidden">
            <div className="max-h-[calc(100vh-340px)] overflow-auto">
              <Table className={COMPACT_TABLE_CLASS}>
                <TableHeader className="bg-primary/10 sticky top-0 z-10">
                  <TableRow>
                    <TableHead>Data / Hora</TableHead>
                    <TableHead>Revendedor</TableHead>
                    <TableHead>Servidor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Créditos</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendasRevFiltradas.map((m: any) => {
                    const isCancelada = m.status_venda === "cancelada";
                    const isPago = (m.status_pagamento || "pago") === "pago";

                    return (
                      <TableRow key={m.id} className={isCancelada ? "opacity-60 bg-muted/20" : ""}>
                        <TableCell className="text-xs font-mono whitespace-nowrap">
                          {formatDateTimeBR(m.created_at)}
                        </TableCell>
                        <TableCell>
                          <span className="font-semibold text-foreground">{m.revendedor?.nome ?? "-"}</span>
                        </TableCell>
                        <TableCell>{m.servidor?.nome ?? "-"}</TableCell>
                        <TableCell>
                          {isCancelada ? (
                            <Badge variant="destructive" className="text-[10px] uppercase tracking-wider font-semibold">
                              CANCELADA
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px] uppercase tracking-wider font-semibold">
                              REALIZADA
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className={`text-right font-semibold ${isCancelada ? "text-muted-foreground line-through" : "text-blue-400"}`}>
                          +{Number(m.quantidade || 0)}
                        </TableCell>
                        <TableCell className={`text-right font-medium ${isCancelada ? "text-muted-foreground line-through" : isPago ? "text-emerald-400" : "text-amber-400"}`}>
                          {currencyBRL(m.valor_pago)}
                        </TableCell>
                        <TableCell>
                          {isPago ? (
                            <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px]">
                              PAGO
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[10px]">
                              DEVENDO
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {isCancelada ? (
                            <span className="text-xs text-muted-foreground italic">
                              {m.motivo_cancelamento ? `Estornada (${m.motivo_cancelamento})` : "Estornada"}
                            </span>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              {!isPago && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-emerald-400 hover:text-emerald-300 h-8 text-xs gap-1"
                                  disabled={marcandoRev === m.id}
                                  onClick={() => marcarComoPagoRev(m)}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  {marcandoRev === m.id ? "..." : "Pago"}
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-400 hover:text-red-300 h-8 text-xs gap-1 hover:bg-red-500/10"
                                onClick={() => abrirCancelamentoRev(m)}
                                title="Cancelar recarga e estornar créditos e faturamento"
                              >
                                <Undo2 className="h-3.5 w-3.5" />
                                Cancelar Recarga
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {vendasRevFiltradas.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                        Nenhuma recarga encontrada neste filtro.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* SUB-ABA 4: APLICATIVOS (Histórico de Ativações de Apps) */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="aplicativos" className="mt-4 space-y-4">
          {/* Métricas Resumidas */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card className="p-3 bg-card/60">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                <Smartphone className="h-3.5 w-3.5 text-emerald-400" /> Total de Ativações
              </div>
              <div className="text-2xl font-bold mt-1">{statsApps.totalAtiv}</div>
            </Card>
            <Card className="p-3 bg-card/60">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Faturamento em Apps
              </div>
              <div className="text-2xl font-bold mt-1 text-emerald-400">{currencyBRL(statsApps.totalFat)}</div>
            </Card>
            <Card className="p-3 bg-card/60">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                <TrendingUp className="h-3.5 w-3.5 text-primary" /> Lucro Líquido em Apps
              </div>
              <div className="text-2xl font-bold mt-1 text-primary">{currencyBRL(statsApps.totalLucro)}</div>
            </Card>
          </div>

          {/* Filtros e Ações */}
          <Card className="p-3 flex flex-wrap items-center justify-between gap-2">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8 h-8 text-xs"
                placeholder="Buscar por cliente, MAC, device ou app..."
                value={buscaApps}
                onChange={(e) => setBuscaApps(e.target.value)}
              />
            </div>

            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={exportarAplicativos}>
              <Download className="h-3.5 w-3.5 mr-1" /> Exportar Planilha
            </Button>
          </Card>

          <Card className="overflow-hidden">
            <div className="max-h-[calc(100vh-340px)] overflow-auto">
              <Table className={COMPACT_TABLE_CLASS}>
                <TableHeader className="bg-primary/10 sticky top-0 z-10">
                  <TableRow>
                    <TableHead>Data / Hora</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Aplicativo</TableHead>
                    <TableHead>MAC / Device</TableHead>
                    <TableHead>Servidor</TableHead>
                    <TableHead>Expira em</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Custo</TableHead>
                    <TableHead>Lucro</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appsFiltrados.map((a: any) => {
                    const lucro = Number(a.valor || 0) - Number(a.custo || 0);

                    return (
                      <TableRow key={a.id}>
                        <TableCell className="font-mono text-xs whitespace-nowrap">
                          {formatDateTimeBR(a.ativado_em)}
                        </TableCell>
                        <TableCell>
                          <span className="font-semibold text-foreground">{a.cliente_nome || "-"}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs">
                            {a.aplicativo || "-"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {a.mac ? maskMAC(a.mac) : a.device || "-"}
                        </TableCell>
                        <TableCell className="text-xs">{a.servidor?.nome || "-"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{formatDateBR(a.expira_em)}</TableCell>
                        <TableCell className="font-medium text-emerald-400">{currencyBRL(a.valor)}</TableCell>
                        <TableCell className="text-red-400">{currencyBRL(a.custo)}</TableCell>
                        <TableCell className="font-semibold text-primary">{currencyBRL(lucro)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-cyan-400 hover:text-cyan-300 h-8 text-xs gap-1"
                              onClick={() => abrirComprovanteApp(a)}
                              title="Ver e emitir comprovante"
                            >
                              <Receipt className="h-3.5 w-3.5" />
                              Comprovante
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-400 hover:text-red-300 h-8 text-xs gap-1 hover:bg-red-500/10"
                              onClick={() => reverterAtivacaoApp(a)}
                              title="Reverter ativação e estornar créditos"
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                              Reverter
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {appsFiltrados.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-10">
                        Nenhuma ativação de aplicativo encontrada.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal de Detalhes da Ação (Sub-aba Alterações) */}
      <Dialog open={!!detalheAudit} onOpenChange={(o) => !o && setDetalheAudit(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader className="flex flex-row items-center justify-between pr-6">
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" /> Detalhes da ação
            </DialogTitle>
            {detalheAudit && (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1"
                  onClick={async () => {
                    try {
                      await exportAuditRowPNG(detalheAudit);
                      toast.success("Imagem PNG gerada!");
                    } catch {
                      toast.error("Falha ao gerar PNG");
                    }
                  }}
                >
                  <ImageIcon className="h-3.5 w-3.5" /> PNG
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1"
                  onClick={async () => {
                    try {
                      await exportAuditRowPDF(detalheAudit);
                      toast.success("Documento PDF gerado!");
                    } catch {
                      toast.error("Falha ao gerar PDF");
                    }
                  }}
                >
                  <FileDown className="h-3.5 w-3.5" /> PDF
                </Button>
              </div>
            )}
          </DialogHeader>
          {detalheAudit && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <Info label="Data e Hora (com segundos)" value={formatDateTimeBR(detalheAudit.created_at)} />
                <Info label="Usuário" value={detalheAudit.user_email ?? "-"} />
                <Info label="Categoria" value={CATEGORIAS[detalheAudit.categoria]?.label ?? detalheAudit.categoria} />
                <Info label="Ação" value={detalheAudit.acao.toUpperCase()} />
                {detalheAudit.entidade && <Info label="Entidade" value={detalheAudit.entidade} />}
                {detalheAudit.entidade_nome && <Info label="Nome / Referência" value={detalheAudit.entidade_nome} />}
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Descrição Oficial</div>
                <div className="rounded-md border border-border/60 p-2 font-medium">{detalheAudit.descricao ?? "-"}</div>
              </div>
              {detalheAudit.acao === "editar" || detalheAudit.acao === "ajustar" || detalheAudit.acao === "alterar_pagamento" ? (
                <DiffTable antes={detalheAudit.dados_anteriores} depois={detalheAudit.dados_novos} />
              ) : (
                <>
                  {detalheAudit.dados_anteriores && (
                    <TextFields title="Dados anteriores" data={detalheAudit.dados_anteriores} tone="border-red-500/30 bg-red-500/5" />
                  )}
                  {detalheAudit.dados_novos && (
                    <TextFields title="Dados novos" data={detalheAudit.dados_novos} tone="border-emerald-500/30 bg-emerald-500/5" />
                  )}
                </>
              )}
              {detalheAudit.metadata && (
                <TextFields title="Informações adicionais / Metadados" data={detalheAudit.metadata} tone="border-border/60" />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Cancelamento de Recarga de Revendedor (Sub-aba Revendedores) */}
      <Dialog open={cancelModalOpen} onOpenChange={(o) => !o && setCancelModalOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="h-5 w-5" /> Cancelar Recarga de Revendedor
            </DialogTitle>
            <DialogDescription>
              Esta ação cancelará a recarga, estornará os créditos do revendedor, devolverá os créditos ao servidor e registrará o estorno no histórico financeiro.
            </DialogDescription>
          </DialogHeader>
          {cancelandoMov && (
            <div className="space-y-3 py-2 text-sm">
              <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Revendedor:</span>
                  <span className="font-semibold">{cancelandoMov.revendedor?.nome ?? "Revendedor"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Servidor:</span>
                  <span>{cancelandoMov.servidor?.nome ?? "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Créditos a estornar:</span>
                  <span className="font-bold text-red-400">{cancelandoMov.quantidade} créditos</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor da venda:</span>
                  <span className="font-medium">{currencyBRL(cancelandoMov.valor_pago)}</span>
                </div>
              </div>

              <div>
                <Label htmlFor="motivo-cancel">Motivo do cancelamento (opcional)</Label>
                <Input
                  id="motivo-cancel"
                  placeholder="Ex: Erro de digitação, estorno solicitado..."
                  value={cancelMotivo}
                  onChange={(e) => setCancelMotivo(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelModalOpen(false)} disabled={cancelSaving}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmarCancelamentoRev}
              disabled={cancelSaving}
            >
              {cancelSaving ? "Cancelando..." : "Confirmar Cancelamento e Estornar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Comprovante de Ativação (Sub-aba Aplicativos) */}
      <ComprovanteAtivacaoModal
        open={comprovanteModalOpen}
        onOpenChange={setComprovanteModalOpen}
        data={comprovanteModalData}
      />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
