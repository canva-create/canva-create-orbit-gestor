import { createFileRoute } from "@tanstack/react-router";
import { COMPACT_TABLE_CLASS } from "@/components/density-toggle";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDateTimeBR } from "@/lib/iptv";
import { confirmDialog } from "@/lib/confirm";
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
} from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/auditoria")({
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
 * Renderiza na tabela a breve descrição + todas as informações puxadas das alterações
 */
function DescricaoDetalhadaCell({ r }: { r: AuditRow }) {
  const breve = r.descricao?.trim() || `${humanizeKey(r.acao)} em ${r.entidade_nome || r.entidade || "registro"}`;
  const acao = r.acao;
  const d = (r.dados_novos ?? {}) as Record<string, any>;
  const a = (r.dados_anteriores ?? {}) as Record<string, any>;

  const changed = Object.keys({ ...a, ...d }).filter(
    (k) => !HIDE_KEYS.has(k) && JSON.stringify(a[k]) !== JSON.stringify(d[k])
  );

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
  const { data: rows = [], refetch, isFetching } = useQuery({
    queryKey: ["audit_logs"],
    queryFn: fetchAudit,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const [busca, setBusca] = useState("");
  const [cat, setCat] = useState<string>("todas");
  const [acao, setAcao] = useState<string>("todas");
  const [detalhe, setDetalhe] = useState<AuditRow | null>(null);

  const acoes = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.acao));
    return Array.from(set).sort();
  }, [rows]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rows.filter((r) => {
      if (cat !== "todas" && r.categoria !== cat) return false;
      if (acao !== "todas" && r.acao !== acao) return false;
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
  }, [rows, busca, cat, acao]);

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
      toast.success("Registro de auditoria excluído com sucesso");
      refetch();
    } catch (err: any) {
      toast.error(err?.message || "Falha ao excluir registro de auditoria");
    }
  }

  function exportar() {
    if (filtradas.length === 0) return toast.error("Nada para exportar");
    const dados = filtradas.map((r) => ({
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
    XLSX.writeFile(wb, `auditoria-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Exportado em Excel!");
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" /> Auditoria
          </h1>
          <p className="text-sm text-muted-foreground">
            Histórico completo de ações do sistema — quem fez, data com segundos e exatamente o que mudou.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={exportar}>
            <Download className="h-4 w-4 mr-1" /> Exportar Geral (Excel)
          </Button>
        </div>
      </div>

      <Card className="p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Pesquisar por descrição, nome, usuário..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as categorias</SelectItem>
            {Object.entries(CATEGORIAS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={acao} onValueChange={setAcao}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Ação" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as ações</SelectItem>
            {acoes.map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-auto">
          {filtradas.length} de {rows.length} registro(s)
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="max-h-[calc(100vh-260px)] overflow-auto">
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
              {filtradas.map((r) => (
                <TableRow key={r.id}>
                  {/* Data com segundos obrigatória DD/MM/YYYY HH:mm:ss */}
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
                  {/* Botões: Detalhes, Baixar em PDF/PNG, Excluir */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={() => setDetalhe(r)}
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
              {filtradas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                    Nenhum registro encontrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Modal de Detalhes da Ação */}
      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader className="flex flex-row items-center justify-between pr-6">
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" /> Detalhes da ação
            </DialogTitle>
            {detalhe && (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1"
                  onClick={async () => {
                    try {
                      await exportAuditRowPNG(detalhe);
                      toast.success("Imagem PNG gerada com sucesso!");
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
                      await exportAuditRowPDF(detalhe);
                      toast.success("Documento PDF gerado com sucesso!");
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
          {detalhe && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <Info label="Data e Hora (com segundos)" value={formatDateTimeBR(detalhe.created_at)} />
                <Info label="Usuário" value={detalhe.user_email ?? "-"} />
                <Info label="Categoria" value={CATEGORIAS[detalhe.categoria]?.label ?? detalhe.categoria} />
                <Info label="Ação" value={detalhe.acao.toUpperCase()} />
                {detalhe.entidade && <Info label="Entidade" value={detalhe.entidade} />}
                {detalhe.entidade_nome && <Info label="Nome / Referência" value={detalhe.entidade_nome} />}
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Descrição Oficial</div>
                <div className="rounded-md border border-border/60 p-2 font-medium">{detalhe.descricao ?? "-"}</div>
              </div>
              {detalhe.acao === "editar" || detalhe.acao === "ajustar" || detalhe.acao === "alterar_pagamento" ? (
                <DiffTable antes={detalhe.dados_anteriores} depois={detalhe.dados_novos} />
              ) : (
                <>
                  {detalhe.dados_anteriores && (
                    <TextFields title="Dados anteriores" data={detalhe.dados_anteriores} tone="border-red-500/30 bg-red-500/5" />
                  )}
                  {detalhe.dados_novos && (
                    <TextFields title="Dados novos" data={detalhe.dados_novos} tone="border-emerald-500/30 bg-emerald-500/5" />
                  )}
                </>
              )}
              {detalhe.metadata && (
                <TextFields title="Informações adicionais / Metadados" data={detalhe.metadata} tone="border-border/60" />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
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
