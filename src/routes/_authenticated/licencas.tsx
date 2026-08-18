import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { UserCheck, Copy, Ban, RefreshCw, Trash2, Plus, Search, ShieldAlert, CheckCircle2, Clock, ListChecks, History, ClipboardList, Mail } from "lucide-react";
import { gerarCodigoLicenca, statusInfo } from "@/lib/licencas";
import { formatDateBR } from "@/lib/iptv";
import { StatCard } from "@/components/stat-card";
import { fetchIsAdmin } from "@/lib/licencas";

export const Route = createFileRoute("/_authenticated/licencas")({
  component: LicencasPage,
});

function LicencasPage() {
  const qc = useQueryClient();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [filtro, setFiltro] = useState<"todas" | "ativa" | "expirada" | "bloqueada" | "disponivel">("todas");
  const [busca, setBusca] = useState("");
  const [openNova, setOpenNova] = useState(false);
  const [openHistorico, setOpenHistorico] = useState(false);
  const [renovar, setRenovar] = useState<any | null>(null);

  useEffect(() => { fetchIsAdmin().then(setIsAdmin); }, []);

  const { data: licencas = [] } = useQuery({
    queryKey: ["licencas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("licencas").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!isAdmin,
  });

  const stats = useMemo(() => {
    const now = Date.now();
    let ativas = 0, expiradas = 0, proximos = 0;
    for (const l of licencas) {
      const exp = new Date(l.data_expiracao).getTime();
      const expirou = exp < now || l.status === "expirada";
      if (l.status === "bloqueada") continue;
      if (expirou) expiradas++;
      else if (l.status === "utilizada" || l.status === "ativa") {
        ativas++;
        if ((exp - now) / 86400000 <= 7) proximos++;
      }
    }
    return { total: licencas.length, ativas, expiradas, proximos };
  }, [licencas]);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return licencas.filter((l: any) => {
      const info = statusInfo(l.status, l.data_expiracao);
      if (filtro === "ativa" && info.label !== "Ativa" && info.label !== "Disponível") return false;
      if (filtro === "expirada" && info.label !== "Expirada") return false;
      if (filtro === "bloqueada" && info.label !== "Bloqueada") return false;
      if (filtro === "disponivel" && info.label !== "Disponível") return false;
      if (!t) return true;
      return (l.usuario_email || "").toLowerCase().includes(t) || (l.nome_cliente || "").toLowerCase().includes(t) || (l.codigo || "").toLowerCase().includes(t);
    });
  }, [licencas, filtro, busca]);

  if (isAdmin === null) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  if (!isAdmin) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center space-y-3">
        <ShieldAlert className="h-10 w-10 text-red-400 mx-auto" />
        <h1 className="text-lg font-bold">Acesso restrito</h1>
        <p className="text-sm text-muted-foreground">Apenas administradores podem gerenciar liberações de acesso.</p>
      </div>
    );
  }

  async function copiarEmail(email: string) {
    if (!email) return;
    await navigator.clipboard.writeText(email);
    toast.success("E-mail copiado!");
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

  async function bloquear(l: any) {
    const novo = l.status === "bloqueada" ? (l.usuario_id ? "utilizada" : "ativa") : "bloqueada";
    const { error } = await supabase.from("licencas").update({ status: novo }).eq("id", l.id);
    if (error) return toast.error(error.message);
    toast.success(novo === "bloqueada" ? "Acesso bloqueado" : "Acesso desbloqueado");
    qc.invalidateQueries({ queryKey: ["licencas"] });
  }

  async function excluir(l: any) {
    const { confirmDialog } = await import("@/lib/confirm");
    const ok = await confirmDialog({ title: `Excluir liberação do e-mail ${l.usuario_email || l.nome_cliente || l.codigo}?`, confirmText: "Excluir", destructive: true });
    if (!ok) return;
    const { error } = await supabase.from("licencas").delete().eq("id", l.id);
    if (error) return toast.error(error.message);
    toast.success("Acesso excluído");
    qc.invalidateQueries({ queryKey: ["licencas"] });
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserCheck className="h-6 w-6 text-primary" /> Liberação de Acessos por E-mail
          </h1>
          <p className="text-sm text-muted-foreground">
            Cadastre os e-mails dos usuários para autorizar o acesso automático após a autenticação.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setOpenHistorico(true)}>
            <History className="h-4 w-4 mr-2" /> Histórico
          </Button>
          <Button onClick={() => setOpenNova(true)}>
            <Plus className="h-4 w-4 mr-2" /> Liberar Novo E-mail
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total de Liberações" value={String(stats.total)} icon={ListChecks} />
        <StatCard label="Acessos Ativos" value={String(stats.ativas)} icon={CheckCircle2} />
        <StatCard label="Expirados" value={String(stats.expiradas)} icon={Clock} />
        <StatCard label="Próximos Vencimentos (7d)" value={String(stats.proximos)} icon={ShieldAlert} />
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Pesquisar por e-mail ou nome do cliente" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <Tabs value={filtro} onValueChange={(v) => setFiltro(v as any)}>
            <TabsList>
              <TabsTrigger value="todas">Todas</TabsTrigger>
              <TabsTrigger value="ativa">Ativas</TabsTrigger>
              <TabsTrigger value="expirada">Expiradas</TabsTrigger>
              <TabsTrigger value="bloqueada">Bloqueadas</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground border-b border-border/60">
              <tr>
                <th className="text-left py-2 px-2">E-mail do Usuário</th>
                <th className="text-left py-2 px-2">Nome do Cliente</th>
                <th className="text-left py-2 px-2">Painel / Site</th>
                <th className="text-left py-2 px-2">Liberado em</th>
                <th className="text-left py-2 px-2">Validade</th>
                <th className="text-left py-2 px-2">Status</th>
                <th className="text-right py-2 px-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((l: any) => {
                const info = statusInfo(l.status, l.data_expiracao);
                return (
                  <tr key={l.id} className="border-b border-border/40 hover:bg-accent/30">
                    <td className="py-2 px-2 text-xs">
                      <div className="flex items-center gap-1.5 font-medium">
                        <Mail className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span>{l.usuario_email || <span className="text-muted-foreground italic">E-mail não informado</span>}</span>
                        {l.usuario_email && (
                          <Button size="icon" variant="ghost" className="h-5 w-5" title="Copiar e-mail" onClick={() => copiarEmail(l.usuario_email)}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-xs">
                      <div className="font-medium">{l.nome_cliente || <span className="text-muted-foreground">—</span>}</div>
                    </td>
                    <td className="py-2 px-2 text-xs">
                      {l.site_url ? (
                        <a href={l.site_url} target="_blank" rel="noreferrer" className="text-primary hover:underline break-all">{l.site_url}</a>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2 px-2 text-xs">{formatDateBR(l.created_at)}</td>
                    <td className="py-2 px-2 text-xs font-semibold">{formatDateBR(l.data_expiracao)}</td>
                    <td className="py-2 px-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${info.tone}`}>
                        {info.label === "Disponível" || info.label === "Ativa" ? "Liberado" : info.label}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" title="Copiar dados de acesso" onClick={() => copiarTudo(l)}>
                          <ClipboardList className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Renovar / Adicionar dias" onClick={() => setRenovar(l)}>
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title={l.status === "bloqueada" ? "Desbloquear" : "Bloquear"} onClick={() => bloquear(l)}>
                          <Ban className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Excluir" onClick={() => excluir(l)}>
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtradas.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground text-sm">Nenhuma liberação encontrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <NovaLiberacaoDialog open={openNova} onOpenChange={setOpenNova} />
      <RenovarDialog licenca={renovar} onOpenChange={(o) => !o && setRenovar(null)} />
      <HistoricoDialog open={openHistorico} onOpenChange={setOpenHistorico} />
    </div>
  );
}

function addDays(d: Date, n: number) { const c = new Date(d); c.setDate(c.getDate() + n); return c; }

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
      return toast.error("Informe o e-mail do usuário para liberar o acesso.");
    }
    setSaving(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;
      const expira = dataCustom ? new Date(dataCustom + "T23:59:59") : addDays(new Date(), dias);
      if (isNaN(expira.getTime())) return toast.error("Data inválida");

      const { error } = await supabase.from("licencas").insert({
        codigo: gerarCodigoLicenca(),
        dias_duracao: dataCustom ? null : dias,
        data_expiracao: expira.toISOString(),
        dispositivos_permitidos: 1,
        usuario_email: email.trim().toLowerCase(),
        nome_cliente: nomeCliente.trim() || null,
        site_url: siteUrl.trim() || null,
        dados_acesso: dadosAcesso.trim() || null,
        observacoes: observacoes.trim() || null,
        criada_por: user.id,
        status: "ativa",
      } as any);

      if (error) return toast.error(error.message);
      toast.success(`Acesso liberado com sucesso para ${email.trim()}!`);
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
            <UserCheck className="h-5 w-5 text-primary" /> Liberar Acesso por E-mail
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>E-mail do usuário / cliente <span className="text-red-400">*</span></Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="email"
                className="pl-9"
                placeholder="usuario@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              O usuário terá acesso liberado automaticamente ao fazer login com este e-mail.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Nome do cliente (opcional)</Label>
            <Input placeholder="Ex.: João da Silva" value={nomeCliente} onChange={(e) => setNomeCliente(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Duração do acesso</Label>
            <div className="grid grid-cols-4 gap-2">
              {opcoes.map((d) => (
                <Button key={d} type="button" variant={!dataCustom && dias === d ? "default" : "secondary"} onClick={() => { setDias(d); setDataCustom(""); }}>
                  {d}d
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Ou data de vencimento personalizada</Label>
            <Input type="date" value={dataCustom} onChange={(e) => setDataCustom(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Site / link do painel (opcional)</Label>
            <Input placeholder="https://..." value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Dados de acesso ao painel (opcional)</Label>
            <Input placeholder="Ex.: Usuário: cliente01 · Senha: 1234" value={dadosAcesso} onChange={(e) => setDadosAcesso(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Observações internas</Label>
            <Input value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
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
            <div className="rounded-lg border border-border/60 p-3 text-sm space-y-1 bg-muted/30">
              <div className="font-medium text-xs flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-primary" />
                <span>{licenca.usuario_email || licenca.nome_cliente || "Usuário"}</span>
              </div>
              <div className="text-muted-foreground text-xs">Vencimento atual: {formatDateBR(licenca.data_expiracao)}</div>
            </div>
            <div className="space-y-2">
              <Label>Adicionar dias</Label>
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

function HistoricoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data = [] } = useQuery({
    queryKey: ["licencas_ativacoes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("licencas_ativacoes").select("*, licenca:licencas(codigo, usuario_email)").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" /> Histórico de Acessos
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {data.length === 0 && <div className="text-sm text-muted-foreground text-center py-6">Nenhum acesso registrado.</div>}
          {data.map((a: any) => (
            <div key={a.id} className="rounded-lg border border-border/60 p-3 text-sm flex items-center justify-between gap-3">
              <div>
                <div className="font-medium text-xs flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-primary" />
                  <span>{a.usuario_email || a.licenca?.usuario_email}</span>
                </div>
                <div className="text-xs text-muted-foreground">{a.dispositivo || "Dispositivo conectado"}</div>
              </div>
              <div className="text-xs text-muted-foreground">{formatDateBR(a.created_at)}</div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}