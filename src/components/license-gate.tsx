import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Clock, LogOut, RefreshCw, ShieldAlert, Mail, Send, CheckCircle, User, Phone, MessageSquare } from "lucide-react";
import { fetchIsAdmin, fetchMinhaLicenca } from "@/lib/licencas";
import { formatDateBR } from "@/lib/iptv";

type GateState = "loading" | "ok" | "block";

export function LicenseGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>("loading");
  const [licenca, setLicenca] = useState<any>(null);
  const [email, setEmail] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [checking, setChecking] = useState(false);

  // Solicitação de acesso
  const [solicitacao, setSolicitacao] = useState<any | null>(null);
  const [solicitando, setSolicitando] = useState(false);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [showForm, setShowForm] = useState(false);

  async function check(manual = false) {
    if (manual) setChecking(true);
    else setState("loading");

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      const userEmail = user?.email || "";
      setEmail(userEmail);
      setUserId(user?.id || "");

      const admin = await fetchIsAdmin();
      if (admin) {
        setState("ok");
        if (manual) toast.success("Acesso de administrador confirmado!");
        return;
      }

      const lic = await fetchMinhaLicenca();
      if (lic) {
        setLicenca(lic);
        setState("ok");
        if (manual) toast.success("Acesso liberado com sucesso!");
        return;
      }

      // Verifica se já existe uma solicitação enviada por este usuário
      if (user) {
        const { data: req } = await supabase
          .from("solicitacoes_acesso")
          .select("*")
          .or(`user_id.eq.${user.id},user_email.ilike.${userEmail}`)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        setSolicitacao(req);
      }

      setState("block");
      if (manual) {
        toast.info("Seu e-mail ainda aguarda liberação do administrador.");
      }
    } finally {
      if (manual) setChecking(false);
    }
  }

  useEffect(() => {
    check();
  }, []);

  async function enviarSolicitacao(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return toast.error("E-mail não identificado");

    setSolicitando(true);
    try {
      const { data, error } = await supabase.from("solicitacoes_acesso").upsert(
        {
          user_id: userId || null,
          user_email: email.trim().toLowerCase(),
          nome: nome.trim() || null,
          telefone: telefone.trim() || null,
          mensagem: mensagem.trim() || null,
          status: "pendente",
          updated_at: new Date().toISOString(),
        } as any,
        { onConflict: "user_email" }
      ).select().single();

      if (error) throw error;
      setSolicitacao(data);
      setShowForm(false);
      toast.success("Solicitação de acesso enviada com sucesso ao administrador!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao enviar solicitação");
    } finally {
      setSolicitando(false);
    }
  }

  async function sair() {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }

  if (state === "loading") {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground text-sm bg-background">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 animate-spin text-primary" />
          <span>Verificando liberação de acesso…</span>
        </div>
      </div>
    );
  }

  if (state === "block") {
    return (
      <div className="min-h-screen grid place-items-center p-4 bg-background">
        <Card className="w-full max-w-md p-6 space-y-5 shadow-xl border-border/80 bg-card/90 backdrop-blur">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="h-12 w-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 grid place-items-center">
              <Clock className="h-6 w-6 text-amber-500 animate-pulse" />
            </div>
            <div className="space-y-1">
              <h1 className="text-xl font-bold tracking-tight">Acesso Pendente</h1>
              <p className="text-sm text-muted-foreground">
                Sua conta foi cadastrada, mas aguarda liberação do administrador para acessar o sistema.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>E-mail cadastrado</span>
              <span className="inline-flex items-center gap-1 text-amber-400 font-medium bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                <ShieldAlert className="h-3 w-3" /> Aguardando liberação
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm font-medium text-foreground break-all">
              <Mail className="h-4 w-4 text-primary shrink-0" />
              <span>{email || "—"}</span>
            </div>
          </div>

          {solicitacao ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5 space-y-1 text-xs text-emerald-400">
              <div className="flex items-center gap-1.5 font-semibold">
                <CheckCircle className="h-4 w-4 shrink-0" />
                <span>Solicitação de acesso enviada</span>
              </div>
              <p className="text-emerald-400/80 leading-relaxed">
                O administrador já recebeu seu pedido e liberará seu acesso em breve.
              </p>
            </div>
          ) : showForm ? (
            <form onSubmit={enviarSolicitacao} className="space-y-3 border border-border/60 rounded-lg p-3.5 bg-muted/20">
              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Send className="h-3.5 w-3.5 text-primary" /> Informações para liberação
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Seu nome</Label>
                <div className="relative">
                  <User className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="pl-8 text-xs h-8"
                    placeholder="Ex.: João da Silva"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">WhatsApp / Telefone</Label>
                <div className="relative">
                  <Phone className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="pl-8 text-xs h-8"
                    placeholder="(00) 00000-0000"
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mensagem (opcional)</Label>
                <div className="relative">
                  <MessageSquare className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="pl-8 text-xs h-8"
                    placeholder="Ex.: Olá, criei minha conta e gostaria da liberação."
                    value={mensagem}
                    onChange={(e) => setMensagem(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="button" size="sm" variant="ghost" className="flex-1 text-xs" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" className="flex-1 text-xs gap-1.5" disabled={solicitando}>
                  <Send className="h-3 w-3" />
                  {solicitando ? "Enviando…" : "Enviar Pedido"}
                </Button>
              </div>
            </form>
          ) : (
            <Button
              type="button"
              variant="secondary"
              className="w-full text-xs gap-2"
              onClick={() => setShowForm(true)}
            >
              <Send className="h-3.5 w-3.5 text-primary" />
              Solicitar Liberação de Acesso
            </Button>
          )}

          <div className="space-y-2 pt-2">
            <Button
              type="button"
              className="w-full gap-2"
              onClick={() => check(true)}
              disabled={checking}
            >
              <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
              {checking ? "Verificando…" : "Verificar se já foi liberado"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2 text-muted-foreground hover:text-foreground"
              onClick={sair}
            >
              <LogOut className="h-4 w-4" />
              Sair da conta
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <>
      {licenca && <LicencaBadge licenca={licenca} />}
      {children}
    </>
  );
}

function LicencaBadge({ licenca }: { licenca: any }) {
  const dias = Math.ceil((new Date(licenca.data_expiracao).getTime() - Date.now()) / 86400000);
  if (dias > 7) return null;
  return (
    <div
      className={`px-4 py-2 text-xs text-center border-b ${
        dias <= 2
          ? "bg-red-500/10 text-red-400 border-red-500/30"
          : "bg-orange-500/10 text-orange-400 border-orange-500/30"
      }`}
    >
      Seu acesso expira em <strong>{dias} dia{dias === 1 ? "" : "s"}</strong> (
      {formatDateBR(licenca.data_expiracao)}). Contate o administrador para renovar.
    </div>
  );
}