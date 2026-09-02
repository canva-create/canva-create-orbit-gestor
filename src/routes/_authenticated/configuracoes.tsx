import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { COMPACT_TABLE_CLASS } from "@/components/density-toggle";
import { confirmDialog } from "@/lib/confirm";
import * as XLSX from "xlsx";
import {
  MessageSquareText,
  CreditCard,
  Plus,
  Copy,
  Pencil,
  Trash2,
  Files,
  Search,
  UserCheck,
  CheckCircle2,
  Clock,
  Ban,
  RefreshCw,
  Mail,
  Phone,
  MessageSquare,
  ShieldCheck,
  ExternalLink,
  ClipboardList,
  Download,
  Upload,
  FileDown,
  FileSpreadsheet,
  ListPlus,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { fetchIsAdmin, gerarCodigoLicenca, statusInfo } from "@/lib/licencas";
import { formatDateBR } from "@/lib/iptv";
import { StatCard } from "@/components/stat-card";

const searchSchema = z.object({
  tab: z.enum(["mensagens", "links", "acessos"]).catch("mensagens"),
});

export const Route = createFileRoute("/_authenticated/configuracoes")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Configurações — Mensagens, Pagamento e Liberação de Acessos" },
      { name: "description", content: "Gerencie mensagens de atendimento, links de pagamento e liberação de acessos de novos usuários." },
      { property: "og:title", content: "Configurações — ORBIT" },
      { property: "og:description", content: "Configurações de atendimento e gerenciamento de usuários e liberações." },
    ],
  }),
  component: ConfiguracoesPage,
});

async function copyText(text: string) {
  if (!text?.trim()) return toast.error("Nada para copiar");
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Texto copiado!");
  } catch {
    toast.error("Falha ao copiar");
  }
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function ConfiguracoesPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: "/configuracoes" });
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  useEffect(() => {
    fetchIsAdmin().then(setIsAdmin);
  }, []);

  const { data: pendentes = [] } = useQuery({
    queryKey: ["solicitacoes_pendentes_count"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitacoes_acesso")
        .select("id")
        .eq("status", "pendente");
      if (error) return [];
      return data ?? [];
    },
    enabled: isAdmin,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie mensagens rápidas, links de pagamento e liberações de acesso.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => navigate({ search: { tab: v as any }, replace: true })}>
        <TabsList className="mb-2">
          <TabsTrigger value="mensagens" className="gap-2">
            <MessageSquareText className="h-4 w-4" /> Mensagens Rápidas
          </TabsTrigger>
          <TabsTrigger value="links" className="gap-2">
            <CreditCard className="h-4 w-4" /> Links de Pagamento
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="acessos" className="gap-2 text-emerald-400 data-[state=active]:text-emerald-400 font-medium">
              <UserCheck className="h-4 w-4" /> Liberação de Acessos
              {pendentes.length > 0 && (
                <span className="ml-1 bg-amber-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {pendentes.length}
                </span>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="mensagens">
          <MensagensRapidas />
        </TabsContent>
        <TabsContent value="links">
          <LinksPagamento />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="acessos">
            <LiberacaoAcessosAdmin />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

/* ---------------- Liberação de Acessos pelo Administrador ---------------- */

function addDays(d: Date, n: number) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function LiberacaoAcessosAdmin() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todas" | "ativa" | "expirada" | "bloqueada">("todas");
  const [openNova, setOpenNova] = useState(false);
  const [aprovarDialog, setAprovarDialog] = useState<any | null>(null);
  const [renovarDialog, setRenovarDialog] = useState<any | null>(null);

  // Consulta de solicitações pendentes
  const { data: solicitacoes = [], isLoading: loadingSol } = useQuery({
    queryKey: ["solicitacoes_acesso"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitacoes_acesso")
        .select("*")
        .eq("status", "pendente")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // Consulta de acessos liberados
  const { data: licencas = [] } = useQuery({
    queryKey: ["licencas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("licencas")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const stats = useMemo(() => {
    const now = Date.now();
    let ativas = 0, expiradas = 0;
    for (const l of licencas) {
      const exp = new Date(l.data_expiracao).getTime();
      const expirou = exp < now || l.status === "expirada";
      if (l.status === "bloqueada") continue;
      if (expirou) expiradas++;
      else if (l.status === "utilizada" || l.status === "ativa") ativas++;
    }
    return { pendentes: solicitacoes.length, ativas, expiradas, total: licencas.length };
  }, [licencas, solicitacoes]);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return licencas.filter((l: any) => {
      const info = statusInfo(l.status, l.data_expiracao);
      if (filtro === "ativa" && info.label !== "Liberado" && info.label !== "Ativa" && info.label !== "Disponível") return false;
      if (filtro === "expirada" && info.label !== "Expirada") return false;
      if (filtro === "bloqueada" && info.label !== "Bloqueada") return false;
      if (!t) return true;
      return (
        (l.usuario_email || "").toLowerCase().includes(t) ||
        (l.nome_cliente || "").toLowerCase().includes(t) ||
        (l.codigo || "").toLowerCase().includes(t)
      );
    });
  }, [licencas, filtro, busca]);

  async function rejeitarSolicitacao(sol: any) {
    const ok = await confirmDialog({
      title: `Recusar solicitação de ${sol.user_email}?`,
      description: "O usuário não terá acesso liberado ao sistema.",
      destructive: true,
      confirmText: "Recusar",
    });
    if (!ok) return;
    const { error } = await supabase
      .from("solicitacoes_acesso")
      .update({ status: "rejeitado", updated_at: new Date().toISOString() })
      .eq("id", sol.id);
    if (error) return toast.error(error.message);
    toast.info("Solicitação recusada.");
    qc.invalidateQueries({ queryKey: ["solicitacoes_acesso"] });
    qc.invalidateQueries({ queryKey: ["solicitacoes_pendentes_count"] });
  }

  async function bloquear(l: any) {
    const novo = l.status === "bloqueada" ? (l.usuario_id ? "utilizada" : "ativa") : "bloqueada";
    const { error } = await supabase.from("licencas").update({ status: novo }).eq("id", l.id);
    if (error) return toast.error(error.message);
    toast.success(novo === "bloqueada" ? "Acesso bloqueado" : "Acesso desbloqueado");
    qc.invalidateQueries({ queryKey: ["licencas"] });
  }

  async function excluir(l: any) {
    const ok = await confirmDialog({
      title: `Excluir liberação de ${l.usuario_email || l.nome_cliente || l.codigo}?`,
      destructive: true,
      confirmText: "Excluir",
    });
    if (!ok) return;
    const { error } = await supabase.from("licencas").delete().eq("id", l.id);
    if (error) return toast.error(error.message);
    toast.success("Acesso excluído");
    qc.invalidateQueries({ queryKey: ["licencas"] });
  }

  async function copiarTudo(l: any) {
    const linhas = [
      `Cliente: ${l.nome_cliente || "—"}`,
      `E-mail liberado: ${l.usuario_email || "—"}`,
      `Data de liberação: ${formatDateBR(l.created_at)}`,
      `Data de vencimento: ${formatDateBR(l.data_expiracao)}`,
      `Link de acesso ao painel: ${l.site_url || window.location.origin}`,
      `Dados de acesso: ${l.dados_acesso || "—"}`,
    ];
    await navigator.clipboard.writeText(linhas.join("\n"));
    toast.success("Informações de acesso copiadas!");
  }

  return (
    <div className="space-y-6">
      {/* Resumo de cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Solicitações Pendentes" value={String(stats.pendentes)} icon={Clock} />
        <StatCard label="Acessos Ativos" value={String(stats.ativas)} icon={CheckCircle2} />
        <StatCard label="Acessos Expirados" value={String(stats.expiradas)} icon={Ban} />
        <StatCard label="Total de Liberações" value={String(stats.total)} icon={ShieldCheck} />
      </div>

      {/* Seção 1: Solicitações Pendentes */}
      <Card className="p-4 space-y-4 border-amber-500/30 bg-amber-500/5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" />
            <h2 className="font-semibold text-base text-foreground">
              Solicitações de Acesso Pendentes ({solicitacoes.length})
            </h2>
          </div>
          <span className="text-xs text-muted-foreground">
            Usuários que se cadastraram e aguardam liberação do administrador.
          </span>
        </div>

        {solicitacoes.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground border border-dashed border-border/60 rounded-lg">
            Nenhuma solicitação de acesso pendente no momento.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <Table className={COMPACT_TABLE_CLASS}>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead>E-mail do Usuário</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>WhatsApp / Telefone</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead>Data do Pedido</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {solicitacoes.map((sol: any) => {
                  const cleanPhone = (sol.telefone || "").replace(/\D/g, "");
                  const zapUrl = cleanPhone ? `https://wa.me/55${cleanPhone}` : null;
                  return (
                    <TableRow key={sol.id}>
                      <TableCell className="font-medium text-xs">
                        <div className="flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span>{sol.user_email}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{sol.nome || "—"}</TableCell>
                      <TableCell className="text-xs">
                        {sol.telefone ? (
                          <div className="flex items-center gap-1">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            <span>{sol.telefone}</span>
                            {zapUrl && (
                              <a
                                href={zapUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] text-emerald-400 hover:underline inline-flex items-center gap-0.5 ml-1"
                                title="Chamar no WhatsApp"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate text-muted-foreground" title={sol.mensagem || ""}>
                        {sol.mensagem || "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateBR(sol.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="sm"
                            className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500 text-white gap-1"
                            onClick={() => setAprovarDialog(sol)}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Liberar Acesso
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-red-400 hover:text-red-300"
                            onClick={() => rejeitarSolicitacao(sol)}
                          >
                            Recusar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Seção 2: Todos os Acessos Liberados */}
      <Card className="p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-base flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" /> Usuários com Acesso Liberado
            </h2>
            <p className="text-xs text-muted-foreground">
              Acompanhe a validade e gerencie os acessos autorizados no sistema.
            </p>
          </div>
          <Button onClick={() => setOpenNova(true)} className="gap-1.5 text-xs">
            <Plus className="h-4 w-4" /> Liberar Novo E-mail
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 justify-between">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 text-xs h-9"
              placeholder="Pesquisar por e-mail ou nome..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <Tabs value={filtro} onValueChange={(v) => setFiltro(v as any)}>
            <TabsList>
              <TabsTrigger value="todas" className="text-xs">Todas ({licencas.length})</TabsTrigger>
              <TabsTrigger value="ativa" className="text-xs">Liberados ({stats.ativas})</TabsTrigger>
              <TabsTrigger value="expirada" className="text-xs">Expirados ({stats.expiradas})</TabsTrigger>
              <TabsTrigger value="bloqueada" className="text-xs">Bloqueados</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="overflow-x-auto rounded-md border border-border">
          <Table className={COMPACT_TABLE_CLASS}>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>E-mail Liberado</TableHead>
                <TableHead>Nome do Cliente</TableHead>
                <TableHead>Liberado em</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((l: any) => {
                const info = statusInfo(l.status, l.data_expiracao);
                return (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs font-medium">
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span>{l.usuario_email || "E-mail não especificado"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{l.nome_cliente || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateBR(l.created_at)}</TableCell>
                    <TableCell className="text-xs font-semibold">{formatDateBR(l.data_expiracao)}</TableCell>
                    <TableCell>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${info.tone}`}>
                        {info.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Copiar dados" onClick={() => copiarTudo(l)}>
                          <ClipboardList className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Renovar / Adicionar dias" onClick={() => setRenovarDialog(l)}>
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" title={l.status === "bloqueada" ? "Desbloquear" : "Bloquear"} onClick={() => bloquear(l)}>
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400" title="Excluir" onClick={() => excluir(l)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtradas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-xs text-muted-foreground">
                    Nenhum acesso encontrado com os filtros aplicados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Diálogos */}
      <AprovarSolicitacaoDialog
        solicitacao={aprovarDialog}
        onOpenChange={(o) => !o && setAprovarDialog(null)}
      />
      <NovaLiberacaoDialog open={openNova} onOpenChange={setOpenNova} />
      <RenovarDialog licenca={renovarDialog} onOpenChange={(o) => !o && setRenovarDialog(null)} />
    </div>
  );
}

function AprovarSolicitacaoDialog({
  solicitacao,
  onOpenChange,
}: {
  solicitacao: any | null;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [dias, setDias] = useState<number>(30);
  const [dataCustom, setDataCustom] = useState("");
  const [saving, setSaving] = useState(false);

  async function confirmarAprovacao() {
    if (!solicitacao) return;
    setSaving(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const expira = dataCustom ? new Date(dataCustom + "T23:59:59") : addDays(new Date(), dias);
      if (isNaN(expira.getTime())) return toast.error("Data inválida");

      // 1. Cria ou atualiza a licença para o usuário
      const emailLower = solicitacao.user_email.trim().toLowerCase();
      const { error: licError } = await supabase.from("licencas").insert({
        codigo: gerarCodigoLicenca(),
        dias_duracao: dataCustom ? null : dias,
        data_expiracao: expira.toISOString(),
        dispositivos_permitidos: 1,
        usuario_email: emailLower,
        usuario_id: solicitacao.user_id || null,
        nome_cliente: solicitacao.nome || null,
        observacoes: solicitacao.mensagem || null,
        criada_por: user.id,
        status: "ativa",
      } as any);

      if (licError) throw licError;

      // 2. Atualiza o status da solicitação para aprovado
      await supabase
        .from("solicitacoes_acesso")
        .update({
          status: "aprovado",
          aprovado_por: user.id,
          aprovado_em: new Date().toISOString(),
          dias_liberados: dias,
          updated_at: new Date().toISOString(),
        })
        .eq("id", solicitacao.id);

      toast.success(`Acesso liberado com sucesso para ${emailLower}!`);
      qc.invalidateQueries({ queryKey: ["solicitacoes_acesso"] });
      qc.invalidateQueries({ queryKey: ["solicitacoes_pendentes_count"] });
      qc.invalidateQueries({ queryKey: ["licencas"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Erro ao aprovar solicitação");
    } finally {
      setSaving(false);
    }
  }

  const opcoes = [30, 90, 180, 365];

  return (
    <Dialog open={!!solicitacao} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" /> Liberar Acesso do Solicitante
          </DialogTitle>
        </DialogHeader>

        {solicitacao && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/70 p-3 bg-muted/30 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <Mail className="h-3.5 w-3.5 text-primary" />
                <span>{solicitacao.user_email}</span>
              </div>
              {solicitacao.nome && <div className="text-muted-foreground">Nome: {solicitacao.nome}</div>}
              {solicitacao.telefone && <div className="text-muted-foreground">WhatsApp: {solicitacao.telefone}</div>}
              {solicitacao.mensagem && <div className="text-muted-foreground italic">"{solicitacao.mensagem}"</div>}
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Tempo de liberação</Label>
              <div className="grid grid-cols-4 gap-2">
                {opcoes.map((d) => (
                  <Button
                    key={d}
                    type="button"
                    variant={!dataCustom && dias === d ? "default" : "secondary"}
                    onClick={() => {
                      setDias(d);
                      setDataCustom("");
                    }}
                  >
                    {d}d
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Ou data personalizada</Label>
              <Input type="date" value={dataCustom} onChange={(e) => setDataCustom(e.target.value)} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={confirmarAprovacao} disabled={saving} className="bg-emerald-600 hover:bg-emerald-500 text-white">
            {saving ? "Liberando…" : "Confirmar e Liberar Acesso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NovaLiberacaoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [dias, setDias] = useState<number>(30);
  const [dataCustom, setDataCustom] = useState("");
  const [email, setEmail] = useState("");
  const [nomeCliente, setNomeCliente] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [dadosAcesso, setDadosAcesso] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDias(30);
      setDataCustom("");
      setEmail("");
      setNomeCliente("");
      setSiteUrl("");
      setDadosAcesso("");
      setObservacoes("");
    }
  }, [open]);

  async function liberar() {
    if (!email.trim()) {
      return toast.error("Informe o e-mail do usuário.");
    }
    setSaving(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;
      const expira = dataCustom ? new Date(dataCustom + "T23:59:59") : addDays(new Date(), dias);
      if (isNaN(expira.getTime())) return toast.error("Data inválida");

      const emailLower = email.trim().toLowerCase();
      const { error } = await supabase.from("licencas").insert({
        codigo: gerarCodigoLicenca(),
        dias_duracao: dataCustom ? null : dias,
        data_expiracao: expira.toISOString(),
        dispositivos_permitidos: 1,
        usuario_email: emailLower,
        nome_cliente: nomeCliente.trim() || null,
        site_url: siteUrl.trim() || null,
        dados_acesso: dadosAcesso.trim() || null,
        observacoes: observacoes.trim() || null,
        criada_por: user.id,
        status: "ativa",
      } as any);

      if (error) return toast.error(error.message);
      toast.success(`Acesso liberado com sucesso para ${emailLower}!`);
      qc.invalidateQueries({ queryKey: ["licencas"] });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  const opcoes = [30, 90, 180, 365];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" /> Liberar Novo E-mail
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">E-mail do usuário / cliente <span className="text-red-400">*</span></Label>
            <div className="relative">
              <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="email"
                className="pl-8 text-xs"
                placeholder="usuario@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Nome do cliente (opcional)</Label>
            <Input className="text-xs" placeholder="Ex.: João da Silva" value={nomeCliente} onChange={(e) => setNomeCliente(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Duração do acesso</Label>
            <div className="grid grid-cols-4 gap-2">
              {opcoes.map((d) => (
                <Button key={d} type="button" variant={!dataCustom && dias === d ? "default" : "secondary"} onClick={() => { setDias(d); setDataCustom(""); }}>
                  {d}d
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Ou data de vencimento personalizada</Label>
            <Input type="date" value={dataCustom} onChange={(e) => setDataCustom(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Site / link do painel (opcional)</Label>
            <Input className="text-xs" placeholder="https://..." value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Dados de acesso ao painel (opcional)</Label>
            <Input className="text-xs" placeholder="Ex.: Login: cliente · Senha: 123" value={dadosAcesso} onChange={(e) => setDadosAcesso(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Observações internas</Label>
            <Input className="text-xs" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={liberar} disabled={saving}>{saving ? "Liberando…" : "Liberar Acesso"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenovarDialog({ licenca, onOpenChange }: { licenca: any | null; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [dias, setDias] = useState(30);
  const [saving, setSaving] = useState(false);

  async function aplicar() {
    if (!licenca) return;
    setSaving(true);
    const base = new Date(Math.max(Date.now(), new Date(licenca.data_expiracao).getTime()));
    const nova = addDays(base, dias);
    const { error } = await supabase.from("licencas").update({
      data_expiracao: nova.toISOString(),
      status: licenca.status === "expirada" ? (licenca.usuario_id ? "utilizada" : "ativa") : licenca.status,
    }).eq("id", licenca.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`+${dias} dias adicionados para ${licenca.usuario_email || "o usuário"}`);
    qc.invalidateQueries({ queryKey: ["licencas"] });
    onOpenChange(false);
  }

  return (
    <Dialog open={!!licenca} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" /> Renovar Acesso
          </DialogTitle>
        </DialogHeader>
        {licenca && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 p-3 text-xs space-y-1 bg-muted/30">
              <div className="font-medium flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-primary" />
                <span>{licenca.usuario_email || licenca.nome_cliente || "Usuário"}</span>
              </div>
              <div className="text-muted-foreground">Vencimento atual: {formatDateBR(licenca.data_expiracao)}</div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Adicionar dias</Label>
              <div className="grid grid-cols-4 gap-2">
                {[30, 90, 180, 365].map((d) => (
                  <Button key={d} type="button" variant={dias === d ? "default" : "secondary"} onClick={() => setDias(d)}>
                    {d}d
                  </Button>
                ))}
              </div>
              <Input type="number" min={1} value={dias} onChange={(e) => setDias(Number(e.target.value) || 0)} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={aplicar} disabled={saving}>{saving ? "Aplicando…" : "Aplicar Renovação"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Mensagens rápidas ---------------- */

type Mensagem = { id: string; titulo: string; conteudo: string };

function MensagensRapidas() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Mensagem | null>(null);
  const [form, setForm] = useState({ titulo: "", conteudo: "" });
  const [saving, setSaving] = useState(false);

  const { data = [] } = useQuery({
    queryKey: ["mensagens_rapidas"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("mensagens_rapidas")
        .select("*")
        .order("titulo", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Mensagem[];
    },
  });

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return data;
    return data.filter((m) => m.titulo.toLowerCase().includes(t) || m.conteudo.toLowerCase().includes(t));
  }, [data, busca]);

  function novo() {
    setEditing(null);
    setForm({ titulo: "", conteudo: "" });
    setOpen(true);
  }
  function editar(m: Mensagem) {
    setEditing(m);
    setForm({ titulo: m.titulo, conteudo: m.conteudo });
    setOpen(true);
  }

  async function salvar() {
    if (!form.titulo.trim()) return toast.error("Informe o título");
    if (!form.conteudo.trim()) return toast.error("Informe o conteúdo da mensagem");
    setSaving(true);
    try {
      if (editing) {
        const { error } = await (supabase as any)
          .from("mensagens_rapidas")
          .update({ titulo: form.titulo.trim(), conteudo: form.conteudo })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Mensagem atualizada");
      } else {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await (supabase as any)
          .from("mensagens_rapidas")
          .insert({ user_id: u.user?.id, titulo: form.titulo.trim(), conteudo: form.conteudo });
        if (error) throw error;
        toast.success("Mensagem criada");
      }
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["mensagens_rapidas"] });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function duplicar(m: Mensagem) {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await (supabase as any)
      .from("mensagens_rapidas")
      .insert({ user_id: u.user?.id, titulo: `${m.titulo} (cópia)`, conteudo: m.conteudo });
    if (error) return toast.error(error.message);
    toast.success("Mensagem duplicada");
    qc.invalidateQueries({ queryKey: ["mensagens_rapidas"] });
  }

  async function excluir(m: Mensagem) {
    const ok = await confirmDialog({
      title: "Excluir mensagem",
      description: `Excluir "${m.titulo}"? Esta ação não pode ser desfeita.`,
      destructive: true,
      confirmText: "Excluir",
    });
    if (!ok) return;
    const { error } = await (supabase as any).from("mensagens_rapidas").delete().eq("id", m.id);
    if (error) return toast.error(error.message);
    toast.success("Mensagem excluída");
    qc.invalidateQueries({ queryKey: ["mensagens_rapidas"] });
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 text-xs" placeholder="Pesquisar mensagem..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Button onClick={novo} className="gap-2 text-xs">
          <Plus className="h-4 w-4" /> Nova mensagem
        </Button>
      </div>

      <div className="max-h-[520px] overflow-auto rounded-md border border-border">
        <Table className={COMPACT_TABLE_CLASS}>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium text-xs">{m.titulo}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="default" className="gap-1 text-xs h-7" onClick={() => copyText(m.conteudo)}>
                      <Copy className="h-3 w-3" /> Copiar
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => editar(m)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Duplicar" onClick={() => duplicar(m)}>
                      <Files className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Excluir" onClick={() => excluir(m)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtradas.length === 0 && (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground py-8 text-xs">
                  Nenhuma mensagem cadastrada.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar mensagem" : "Nova mensagem"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Título</Label>
              <Input className="text-xs" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Pagamento via Pix" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Conteúdo</Label>
              <Textarea
                rows={10}
                className="text-xs"
                value={form.conteudo}
                onChange={(e) => setForm({ ...form, conteudo: e.target.value })}
                placeholder="Texto completo que será copiado para o WhatsApp"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ---------------- Links de pagamento ---------------- */

type LinkPg = { id: string; titulo: string; valor: number; link: string; mensagem: string };

type ItemImportLink = {
  titulo: string;
  valor: number;
  link: string;
  mensagem: string;
  valido: boolean;
  motivoInvalido?: string;
};

const MSG_PADRAO = `💳 *Pagamento por cartão de crédito*

Valor: *{valor}*
Link seguro: {link}

Após o pagamento, envie o comprovante para liberarmos seu acesso. 🙌`;

function montarMensagem(l: LinkPg) {
  const base = l.mensagem?.trim() ? l.mensagem : MSG_PADRAO;
  return base
    .replaceAll("{valor}", brl(Number(l.valor) || 0))
    .replaceAll("{link}", l.link ?? "")
    .replaceAll("{titulo}", l.titulo ?? "");
}

function parseNumeroBR(v: any): number {
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  if (!v) return 0;
  const s = String(v).replace(/R\$/gi, "").replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function exportarLinks(links: LinkPg[]) {
  if (links.length === 0) return toast.error("Nenhum link cadastrado para baixar.");
  const linhas = links.map((l) => [
    l.titulo || "",
    Number(l.valor) || 0,
    l.link || "",
    l.mensagem || MSG_PADRAO,
  ]);
  const ws = XLSX.utils.aoa_to_sheet([
    ["Título", "Valor (R$)", "Link de Pagamento", "Mensagem de Apresentação"],
    ...linhas,
  ]);
  ws["!cols"] = [{ wch: 30 }, { wch: 15 }, { wch: 45 }, { wch: 60 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Links de Pagamento");
  XLSX.writeFile(wb, `links-pagamento-${new Date().toISOString().slice(0, 10)}.xlsx`);
  toast.success(`${links.length} link(s) baixado(s) com sucesso!`);
}

function baixarModeloLinks() {
  const exemplo = [
    {
      "Título": "Plano Mensal - 1 Tela",
      "Valor (R$)": 35.00,
      "Link de Pagamento": "https://mpago.la/exemplo-1",
      "Mensagem de Apresentação": "💳 *Pagamento por cartão de crédito*\n\nValor: *{valor}*\nLink seguro: {link}\n\nApós o pagamento, envie o comprovante. 🙌",
    },
    {
      "Título": "Plano Trimestral - 2 Telas",
      "Valor (R$)": 95.00,
      "Link de Pagamento": "https://mpago.la/exemplo-2",
      "Mensagem de Apresentação": "",
    },
    {
      "Título": "Plano Anual Especial",
      "Valor (R$)": 280.00,
      "Link de Pagamento": "https://mpago.la/exemplo-3",
      "Mensagem de Apresentação": "",
    },
  ];
  const ws = XLSX.utils.json_to_sheet(exemplo);
  ws["!cols"] = [{ wch: 30 }, { wch: 15 }, { wch: 45 }, { wch: 60 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Modelo Links");
  XLSX.writeFile(wb, "modelo-links-pagamento.xlsx");
  toast.success("Modelo de links baixado!");
}

function processarLinhasPlanilha(rows: any[]): ItemImportLink[] {
  return rows
    .map((r, idx) => {
      const titulo = String(
        r["Título"] ?? r["Titulo"] ?? r["titulo"] ?? r["Nome"] ?? r["nome"] ?? r["Plano"] ?? r["Descricao"] ?? r["Descrição"] ?? ""
      ).trim();

      const link = String(
        r["Link de Pagamento"] ?? r["Link Pagamento"] ?? r["Link"] ?? r["link"] ?? r["URL"] ?? r["url"] ?? ""
      ).trim();

      const valor = parseNumeroBR(
        r["Valor (R$)"] ?? r["Valor"] ?? r["valor"] ?? r["Preço"] ?? r["Preco"] ?? r["preco"] ?? 0
      );

      const mensagem = String(
        r["Mensagem de Apresentação"] ?? r["Mensagem"] ?? r["mensagem"] ?? r["Texto"] ?? r["texto"] ?? ""
      ).trim();

      if (!link && !titulo) {
        return { titulo: `Linha ${idx + 1}`, valor: 0, link: "", mensagem: "", valido: false, motivoInvalido: "Linha vazia" };
      }
      if (!link) {
        return { titulo, valor, link: "", mensagem, valido: false, motivoInvalido: "Link ausente" };
      }
      const finalTitulo = titulo || `Link de Pagamento ${idx + 1}`;
      return {
        titulo: finalTitulo,
        valor,
        link,
        mensagem: mensagem || MSG_PADRAO,
        valido: true,
      };
    })
    .filter((item) => item.link || item.titulo !== "");
}

function processarTextoEmLote(texto: string): ItemImportLink[] {
  const linhas = texto.split("\n").map((l) => l.trim()).filter(Boolean);
  return linhas.map((linha, idx) => {
    let partes: string[] = [];
    if (linha.includes("\t")) {
      partes = linha.split("\t");
    } else if (linha.includes("|")) {
      partes = linha.split("|");
    } else if (linha.includes(";")) {
      partes = linha.split(";");
    } else if (linha.includes(",")) {
      partes = linha.split(",");
    } else {
      partes = [linha];
    }

    partes = partes.map((p) => p.trim());

    let titulo = "";
    let valor = 0;
    let link = "";
    let mensagem = MSG_PADRAO;

    if (partes.length === 1) {
      link = partes[0];
      titulo = `Link ${idx + 1}`;
    } else if (partes.length === 2) {
      if (partes[0].startsWith("http://") || partes[0].startsWith("https://")) {
        link = partes[0];
        titulo = partes[1];
      } else if (partes[1].startsWith("http://") || partes[1].startsWith("https://")) {
        titulo = partes[0];
        link = partes[1];
      } else {
        titulo = partes[0];
        link = partes[1];
      }
    } else if (partes.length >= 3) {
      titulo = partes[0];
      valor = parseNumeroBR(partes[1]);
      link = partes[2];
      if (partes[3]) {
        mensagem = partes.slice(3).join(" ");
      }
    }

    if (!link) {
      return { titulo: titulo || `Linha ${idx + 1}`, valor, link: "", mensagem, valido: false, motivoInvalido: "Link ausente" };
    }

    return {
      titulo: titulo || `Link ${idx + 1}`,
      valor,
      link,
      mensagem: mensagem || MSG_PADRAO,
      valido: true,
    };
  });
}

function ImportarLinksLoteDialog({
  open,
  onOpenChange,
  onImportado,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onImportado: () => void;
}) {
  const [tab, setTab] = useState<"planilha" | "texto">("planilha");
  const [itens, setItens] = useState<ItemImportLink[]>([]);
  const [textoColado, setTextoColado] = useState("");
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setItens([]);
    setTextoColado("");
    setNomeArquivo("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNomeArquivo(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws);
      if (rows.length === 0) {
        toast.error("Planilha vazia.");
        setItens([]);
        return;
      }
      const parsed = processarLinhasPlanilha(rows);
      setItens(parsed);
      const qtdValidos = parsed.filter((p) => p.valido).length;
      if (qtdValidos > 0) {
        toast.info(`${qtdValidos} link(s) identificado(s) na planilha.`);
      } else {
        toast.warning("Nenhum link válido encontrado no arquivo.");
      }
    } catch {
      toast.error("Erro ao processar o arquivo Excel/CSV.");
    }
  };

  const handleTextoChange = (val: string) => {
    setTextoColado(val);
    if (!val.trim()) {
      setItens([]);
      return;
    }
    const parsed = processarTextoEmLote(val);
    setItens(parsed);
  };

  const validos = useMemo(() => itens.filter((i) => i.valido), [itens]);

  const executarImportacao = async () => {
    if (validos.length === 0) return toast.error("Nenhum link válido para importar.");
    setImporting(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Usuário não autenticado.");

      const payload = validos.map((v) => ({
        user_id: u.user.id,
        titulo: v.titulo,
        valor: v.valor,
        link: v.link,
        mensagem: v.mensagem || MSG_PADRAO,
      }));

      const { error } = await (supabase as any).from("links_pagamento").insert(payload);
      if (error) throw error;

      toast.success(`${validos.length} link(s) de pagamento adicionado(s) com sucesso!`);
      reset();
      onOpenChange(false);
      onImportado();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao importar links em lote.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" /> Subir Links de Pagamento em Lote
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
          <TabsList className="grid grid-cols-2 w-full mb-4">
            <TabsTrigger value="planilha" className="gap-2">
              <FileSpreadsheet className="h-4 w-4" /> Planilha Excel / CSV
            </TabsTrigger>
            <TabsTrigger value="texto" className="gap-2">
              <ListPlus className="h-4 w-4" /> Colar Lista / Texto
            </TabsTrigger>
          </TabsList>

          <TabsContent value="planilha" className="space-y-4">
            <div className="border-2 border-dashed border-border/80 rounded-xl p-6 text-center hover:border-primary/50 transition-colors bg-muted/20">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFileUpload}
              />
              <FileSpreadsheet className="h-10 w-10 mx-auto text-primary/80 mb-2" />
              <h3 className="font-semibold text-sm">Selecione ou envie sua planilha</h3>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Colunas aceitas: <code>Título</code>, <code>Valor (R$)</code>, <code>Link de Pagamento</code> e <code>Mensagem</code>
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1.5">
                  <Upload className="h-4 w-4" /> Escolher Arquivo
                </Button>
                <Button size="sm" variant="outline" onClick={baixarModeloLinks} className="gap-1.5">
                  <FileDown className="h-4 w-4" /> Baixar Planilha Modelo
                </Button>
              </div>
              {nomeArquivo && (
                <div className="mt-3 text-xs font-medium text-emerald-400">
                  Arquivo carregado: {nomeArquivo}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="texto" className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Cole as linhas com os links:</Label>
                <span className="text-[11px] text-muted-foreground font-mono">Formato: Título | Valor | Link</span>
              </div>
              <Textarea
                rows={5}
                className="font-mono text-xs"
                placeholder={`Plano Mensal | 35.00 | https://mpago.la/exemplo1\nPlano Trimestral | 95.00 | https://mpago.la/exemplo2\nPlano Anual | 280.00 | https://mpago.la/exemplo3`}
                value={textoColado}
                onChange={(e) => handleTextoChange(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Aceita separadores como <code>|</code>, <code>;</code>, <code>,</code> ou Tab (ao copiar direto do Excel).
              </p>
            </div>
          </TabsContent>
        </Tabs>

        {itens.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                Pré-visualização ({validos.length} válidos de {itens.length} detectados)
              </span>
              {validos.length !== itens.length && (
                <Badge variant="destructive" className="text-[10px]">
                  {itens.length - validos.length} com pendência
                </Badge>
              )}
            </div>

            <div className="max-h-56 overflow-auto border rounded-lg">
              <Table className={COMPACT_TABLE_CLASS}>
                <TableHeader className="sticky top-0 bg-card z-10 text-xs">
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Link</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {itens.map((item, idx) => (
                    <TableRow key={idx} className={item.valido ? "hover:bg-muted/30" : "bg-destructive/10"}>
                      <TableCell className="font-medium">{item.titulo}</TableCell>
                      <TableCell>{brl(item.valor)}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-muted-foreground font-mono">{item.link || "—"}</TableCell>
                      <TableCell className="text-right">
                        {item.valido ? (
                          <Badge variant="secondary" className="text-[10px] text-emerald-400 border-emerald-500/30">
                            Pronto
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">
                            {item.motivoInvalido}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={executarImportacao} disabled={importing || validos.length === 0} className="gap-1.5">
            {importing ? "Importando..." : `Confirmar Importação (${validos.length} links)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinksPagamento() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [open, setOpen] = useState(false);
  const [openLote, setOpenLote] = useState(false);
  const [editing, setEditing] = useState<LinkPg | null>(null);
  const [form, setForm] = useState({ titulo: "", valor: "", link: "", mensagem: MSG_PADRAO });
  const [saving, setSaving] = useState(false);

  const { data = [] } = useQuery({
    queryKey: ["links_pagamento"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("links_pagamento")
        .select("*")
        .order("titulo", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LinkPg[];
    },
  });

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return data;
    return data.filter((l) => l.titulo.toLowerCase().includes(t) || (l.link ?? "").toLowerCase().includes(t));
  }, [data, busca]);

  function novo() {
    setEditing(null);
    setForm({ titulo: "", valor: "", link: "", mensagem: MSG_PADRAO });
    setOpen(true);
  }

  function editar(l: LinkPg) {
    setEditing(l);
    setForm({ titulo: l.titulo, valor: String(l.valor ?? ""), link: l.link ?? "", mensagem: l.mensagem || MSG_PADRAO });
    setOpen(true);
  }

  async function salvar() {
    if (!form.titulo.trim()) return toast.error("Informe o título");
    if (!form.link.trim()) return toast.error("Informe o link de pagamento");
    const valor = Number(String(form.valor).replace(",", ".")) || 0;
    setSaving(true);
    try {
      const payload = { titulo: form.titulo.trim(), valor, link: form.link.trim(), mensagem: form.mensagem };
      if (editing) {
        const { error } = await (supabase as any).from("links_pagamento").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Link atualizado");
      } else {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await (supabase as any).from("links_pagamento").insert({ ...payload, user_id: u.user?.id });
        if (error) throw error;
        toast.success("Link criado");
      }
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["links_pagamento"] });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function duplicar(l: LinkPg) {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("links_pagamento").insert({
      user_id: u.user?.id,
      titulo: `${l.titulo} (cópia)`,
      valor: l.valor,
      link: l.link,
      mensagem: l.mensagem,
    });
    if (error) return toast.error(error.message);
    toast.success("Link duplicado");
    qc.invalidateQueries({ queryKey: ["links_pagamento"] });
  }

  async function excluir(l: LinkPg) {
    const ok = await confirmDialog({
      title: "Excluir link de pagamento",
      description: `Excluir "${l.titulo}"?`,
      destructive: true,
      confirmText: "Excluir",
    });
    if (!ok) return;
    const { error } = await (supabase as any).from("links_pagamento").delete().eq("id", l.id);
    if (error) return toast.error(error.message);
    toast.success("Link excluído");
    qc.invalidateQueries({ queryKey: ["links_pagamento"] });
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8 text-xs" placeholder="Pesquisar por título ou link..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <Badge variant="secondary" className="text-xs font-normal shrink-0">
            {filtrados.length} {filtrados.length === 1 ? "link" : "links"}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportarLinks(data)}
            disabled={data.length === 0}
            className="gap-1.5 text-xs h-8"
            title="Baixar todas as informações e links em planilha Excel"
          >
            <Download className="h-3.5 w-3.5" /> Baixar Links
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={baixarModeloLinks}
            className="gap-1.5 text-xs h-8"
            title="Baixar planilha modelo de exemplo"
          >
            <FileDown className="h-3.5 w-3.5" /> Modelo
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpenLote(true)}
            className="gap-1.5 text-xs h-8"
            title="Adicionar múltiplos links em lote via planilha ou texto"
          >
            <Upload className="h-3.5 w-3.5" /> Subir em Lote
          </Button>

          <Button onClick={novo} size="sm" className="gap-1.5 text-xs h-8">
            <Plus className="h-3.5 w-3.5" /> Novo link
          </Button>
        </div>
      </div>

      <div className="max-h-[520px] overflow-auto rounded-md border border-border">
        <Table className={COMPACT_TABLE_CLASS}>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Link</TableHead>
              <TableHead className="text-right pr-4">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrados.map((l) => (
              <TableRow key={l.id} className="hover:bg-muted/30 transition-colors">
                <TableCell className="font-medium text-xs">{l.titulo}</TableCell>
                <TableCell className="text-xs font-semibold text-emerald-400">{brl(Number(l.valor) || 0)}</TableCell>
                <TableCell className="max-w-[320px] truncate text-muted-foreground text-xs font-mono">
                  {l.link ? (
                    <a
                      href={l.link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 hover:text-primary transition-colors max-w-full truncate"
                      title={l.link}
                    >
                      <span className="truncate">{l.link}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                    </a>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-right pr-2">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="default" className="gap-1 text-xs h-7" onClick={() => copyText(montarMensagem(l))}>
                      <Copy className="h-3 w-3" /> Copiar
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => editar(l)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Duplicar" onClick={() => duplicar(l)}>
                      <Files className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" title="Excluir" onClick={() => excluir(l)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtrados.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-10 text-xs">
                  <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  Nenhum link de pagamento cadastrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar link de pagamento" : "Novo link de pagamento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Título</Label>
                <Input className="text-xs" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Plano mensal" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Valor (R$)</Label>
                <Input className="text-xs" inputMode="decimal" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} placeholder="35,00" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Link de pagamento</Label>
              <Input className="text-xs" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://..." />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mensagem de apresentação</Label>
              <Textarea rows={8} className="text-xs" value={form.mensagem} onChange={(e) => setForm({ ...form, mensagem: e.target.value })} />
              <p className="text-[11px] text-muted-foreground">
                Use {"{valor}"}, {"{link}"} e {"{titulo}"} — são substituídos automaticamente ao copiar.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportarLinksLoteDialog
        open={openLote}
        onOpenChange={setOpenLote}
        onImportado={() => qc.invalidateQueries({ queryKey: ["links_pagamento"] })}
      />
    </Card>
  );
}

