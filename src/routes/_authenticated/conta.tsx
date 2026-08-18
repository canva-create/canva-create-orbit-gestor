import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { UserCog, Mail, Lock, KeyRound } from "lucide-react";

export const Route = createFileRoute("/_authenticated/conta")({
  component: ContaPage,
});

function ContaPage() {
  const [loading, setLoading] = useState(false);
  const [savingPass, setSavingPass] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [originalEmail, setOriginalEmail] = useState("");
  const [login, setLogin] = useState("");

  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      setEmail(u.email ?? "");
      setOriginalEmail(u.email ?? "");
      const meta = (u.user_metadata ?? {}) as Record<string, string>;
      setNome(meta.full_name ?? meta.name ?? "");
      setLogin(meta.username ?? (u.email?.split("@")[0] ?? ""));
    });
  }, []);

  async function salvarPerfil(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const updates: { email?: string; data?: Record<string, unknown> } = {
      data: { full_name: nome, username: login },
    };
    if (email && email !== originalEmail) updates.email = email;
    const { error } = await supabase.auth.updateUser(updates);
    setLoading(false);
    if (error) return toast.error(error.message);
    if (updates.email) {
      toast.success("Confira seu novo e-mail para confirmar a alteração.");
    } else {
      toast.success("Dados atualizados com sucesso!");
    }
  }

  async function alterarSenha(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 6) return toast.error("A senha deve ter pelo menos 6 caracteres.");
    if (senha !== confirmar) return toast.error("As senhas não conferem.");
    setSavingPass(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSavingPass(false);
    if (error) return toast.error(error.message);
    setSenha("");
    setConfirmar("");
    toast.success("Senha alterada com sucesso!");
  }

  async function enviarRecuperacao() {
    if (!originalEmail) return toast.error("E-mail não encontrado.");
    setSendingReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(originalEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSendingReset(false);
    if (error) return toast.error(error.message);
    toast.success("E-mail de recuperação enviado!");
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/20 border border-primary/30 grid place-items-center">
          <UserCog className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Minha Conta</h1>
          <p className="text-sm text-muted-foreground">Gerencie suas informações pessoais e acesso</p>
        </div>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <UserCog className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Dados pessoais</h2>
        </div>
        <form onSubmit={salvarPerfil} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome do usuário</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome completo" />
            </div>
            <div className="space-y-2">
              <Label>Usuário de acesso (login)</Label>
              <Input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="usuario" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>E-mail</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            {email !== originalEmail && (
              <p className="text-xs text-muted-foreground">
                Uma confirmação será enviada para o novo endereço.
              </p>
            )}
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? "Salvando..." : "Salvar alterações"}
          </Button>
        </form>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Alterar senha</h2>
        </div>
        <form onSubmit={alterarSenha} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nova senha</Label>
              <Input type="password" minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Confirmar senha</Label>
              <Input type="password" minLength={6} value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
            </div>
          </div>
          <Button type="submit" disabled={savingPass}>
            {savingPass ? "Salvando..." : "Alterar senha"}
          </Button>
        </form>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Recuperação de senha por e-mail</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Enviaremos um link para <strong>{originalEmail || "seu e-mail"}</strong> para redefinir sua senha.
        </p>
        <Button variant="secondary" onClick={enviarRecuperacao} disabled={sendingReset}>
          <Mail className="h-4 w-4 mr-2" />
          {sendingReset ? "Enviando..." : "Enviar e-mail de recuperação"}
        </Button>
      </Card>
    </div>
  );
}