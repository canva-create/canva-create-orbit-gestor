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
import { formatDateTimeBR } from "@/lib/iptv";
import { ShieldCheck, Search, Download, Eye, RefreshCw } from "lucide-react";
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
    .select("id, acao, categoria, entidade, entidade_id, entidade_nome, descricao, user_email, created_at, dados_anteriores, dados_novos, metadata")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data as any as AuditRow[]) ?? [];
}

const CATEGORIAS: Record<string, { label: string; className: string }> = {
  cliente: { label: "Cliente", className: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  renovacao: { label: "Renovação", className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  revendedor: { label: "Revendedor", className: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  venda_credito: { label: "Venda crédito", className: "bg-pink-500/20 text-pink-300 border-pink-500/30" },
  compra_credito: { label: "Compra crédito", className: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  credito: { label: "Crédito", className: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
  servidor: { label: "Servidor", className: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" },
  painel: { label: "Painel", className: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" },
  financeiro: { label: "Financeiro", className: "bg-lime-500/20 text-lime-300 border-lime-500/30" },
  importacao: { label: "Importação", className: "bg-slate-500/20 text-slate-200 border-slate-500/30" },
  exportacao: { label: "Exportação", className: "bg-slate-500/20 text-slate-200 border-slate-500/30" },
  backup: { label: "Backup", className: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
  auth: { label: "Autenticação", className: "bg-teal-500/20 text-teal-300 border-teal-500/30" },
  outro: { label: "Outro", className: "bg-muted text-muted-foreground border-border" },
};

const ACAO_COR: Record<string, string> = {
  criar: "text-emerald-400",
  editar: "text-blue-400",
  excluir: "text-red-400",
  excluir_definitivo: "text-red-500",
  restaurar: "text-emerald-400",
  reativar: "text-emerald-400",
  renovar: "text-emerald-400",
  cancelar: "text-orange-400",
  cancelar_venda: "text-orange-400",
  duplicar: "text-blue-400",
  vender: "text-pink-400",
  comprar: "text-amber-400",
  ajustar: "text-yellow-400",
  transferir: "text-cyan-400",
  importar: "text-slate-300",
  exportar: "text-slate-300",
  alterar_pagamento: "text-lime-400",
  outro: "text-muted-foreground",
};

function ChipCategoria({ c }: { c: string }) {
  const meta = CATEGORIAS[c] ?? CATEGORIAS.outro;
  return <Badge variant="outline" className={`${meta.className} text-[10px]`}>{meta.label}</Badge>;
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
  valor_custo: "Valor de custo",
  valor_venda: "Valor de venda",
  custo_unitario: "Custo unitário",
  custo_mensal: "Custo mensal",
  preco_venda: "Preço de venda",
  quantidade: "Quantidade",
  quantidade_creditos: "Quantidade de créditos",
  creditos: "Créditos",
  saldo: "Saldo",
  data_vencimento: "Vencimento",
  vencimento: "Vencimento",
  data_ativacao: "Data de ativação",
  ativacao: "Data de ativação",
  data_pagamento: "Data de pagamento",
  validade: "Validade",
  validade_dias: "Validade (dias)",
  dias: "Dias",
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
    if (/valor|preco|custo|saldo|total|lucro|receita|despesa/.test(key)) {
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

function buildDescricaoDetalhada(r: AuditRow): string {
  const base = r.descricao?.trim() || "";
  const bits: string[] = [];
  const acao = r.acao;
  const cat = CATEGORIAS[r.categoria]?.label ?? r.categoria;
  const alvo = r.entidade_nome ? `${r.entidade ?? cat}: ${r.entidade_nome}` : r.entidade ?? cat;
  if (!base) bits.push(`${acao} em ${alvo}`);
  const d = (r.dados_novos ?? {}) as Record<string, any>;
  const a = (r.dados_anteriores ?? {}) as Record<string, any>;
  const changed = Object.keys(d).filter((k) => !HIDE_KEYS.has(k) && JSON.stringify(a[k]) !== JSON.stringify(d[k]));
  if (changed.length > 0 && (acao === "editar" || acao === "ajustar" || acao === "alterar_pagamento")) {
    const preview = changed.slice(0, 4).map((k) => {
      const from = formatValue(k, a[k]);
      const to = formatValue(k, d[k]);
      return `${humanizeKey(k)}: ${from} → ${to}`;
    }).join(" • ");
    const rest = changed.length > 4 ? ` (+${changed.length - 4})` : "";
    bits.push(preview + rest);
  } else if (acao === "criar" && Object.keys(d).length > 0) {
    const preview = Object.entries(d).filter(([k, v]) => !HIDE_KEYS.has(k) && v !== null && v !== "").slice(0, 3)
      .map(([k, v]) => `${humanizeKey(k)}: ${formatValue(k, v)}`).join(" • ");
    if (preview) bits.push(preview);
  }
  if (r.metadata && typeof r.metadata === "object") {
    const md = r.metadata as Record<string, any>;
    const extras = Object.entries(md).filter(([, v]) => v !== null && v !== "").slice(0, 3)
      .map(([k, v]) => `${humanizeKey(k)}: ${formatValue(k, v)}`).join(" • ");
    if (extras) bits.push(extras);
  }
  return [base, ...bits].filter(Boolean).join(" — ");
}

export function AuditoriaPage() {
  const { data: rows = [], refetch, isFetching } = useQuery({ queryKey: ["audit_logs"], queryFn: fetchAudit });
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

  function exportar() {
    if (filtradas.length === 0) return toast.error("Nada para exportar");
    const dados = filtradas.map((r) => ({
      Data: formatDateTimeBR(r.created_at),
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
    toast.success("Exportado!");
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" /> Auditoria
          </h1>
          <p className="text-sm text-muted-foreground">
            Histórico completo de ações do sistema — quem fez, quando, o que mudou.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={exportar}>
            <Download className="h-4 w-4 mr-1" /> Exportar
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
                <TableHead className="w-[150px]">Data / Hora</TableHead>
                <TableHead className="w-[140px]">Categoria</TableHead>
                <TableHead className="w-[130px]">Ação</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-[180px]">Usuário</TableHead>
                <TableHead className="w-[80px] text-right">Detalhes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{formatDateTimeBR(r.created_at)}</TableCell>
                  <TableCell><ChipCategoria c={r.categoria} /></TableCell>
                  <TableCell className={`text-xs font-semibold ${ACAO_COR[r.acao] ?? ""}`}>{r.acao}</TableCell>
                  <TableCell className="text-sm">
                    <div className="whitespace-pre-wrap">{buildDescricaoDetalhada(r) || "-"}</div>
                    {r.entidade_nome && (
                      <div className="text-xs text-muted-foreground mt-0.5">{r.entidade}: {r.entidade_nome}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.user_email ?? "-"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setDetalhe(r)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtradas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                    Nenhum registro encontrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" /> Detalhes da ação
            </DialogTitle>
          </DialogHeader>
          {detalhe && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <Info label="Data" value={formatDateTimeBR(detalhe.created_at)} />
                <Info label="Usuário" value={detalhe.user_email ?? "-"} />
                <Info label="Categoria" value={CATEGORIAS[detalhe.categoria]?.label ?? detalhe.categoria} />
                <Info label="Ação" value={detalhe.acao} />
                {detalhe.entidade && <Info label="Entidade" value={detalhe.entidade} />}
                {detalhe.entidade_nome && <Info label="Nome" value={detalhe.entidade_nome} />}
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Descrição</div>
                <div className="rounded-md border border-border/60 p-2">{detalhe.descricao ?? "-"}</div>
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
                <TextFields title="Informações adicionais" data={detalhe.metadata} tone="border-border/60" />
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
      <div className="text-sm">{value}</div>
    </div>
  );
}
