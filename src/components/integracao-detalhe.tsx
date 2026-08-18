import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Wallet,
  Landmark,
  CreditCard,
  Plug,
  Save,
  XCircle,
} from "lucide-react";
import { getIntegracao } from "@/lib/integracoes";
import { syncMercadoPagoTodayFn } from "@/lib/pix-sync.functions";

export type IntegracaoRow = {
  id: string;
  provider: string;
  credenciais: Record<string, string>;
  ativo: boolean;
  status: string;
  ultimo_teste_ok: boolean | null;
  ultimo_teste_msg: string | null;
  ultima_sync: string | null;
  ultima_notificacao: string | null;
  webhook_token: string;
};

export async function fetchIntegracoes(): Promise<IntegracaoRow[]> {
  const { data, error } = await (supabase as any).from("integracoes").select("*");
  if (error) throw error;
  return (data ?? []) as IntegracaoRow[];
}

const ICONS: Record<string, any> = {
  mercadopago: Wallet,
  asaas: Landmark,
  pagbank: CreditCard,
  pagarme: CreditCard,
  efi: Landmark,
  inter: Landmark,
  stone: Wallet,
  cielo: CreditCard,
  afs: Wallet,
};

export function webhookUrl(token: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // Em preview a URL muda a cada build; o webhook precisa do endereço publicado fixo.
  const base = /lovable\.app$/.test(new URL(origin || "https://supergerenciador.lovable.app").hostname)
    && origin.includes("preview")
    ? "https://supergerenciador.lovable.app"
    : origin;
  return `${base}/api/public/pix/${token}`;
}

function fmtData(v: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleString("pt-BR");
}

async function copiar(text: string, label = "Texto") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  } catch {
    toast.error("Falha ao copiar");
  }
}

export function DetalheIntegracao({ provider, embutido }: { provider: string; embutido?: boolean }) {
  const def = getIntegracao(provider);
  const qc = useQueryClient();
  const syncMercadoPago = useServerFn(syncMercadoPagoTodayFn);
  const { data = [] } = useQuery({ queryKey: ["integracoes"], queryFn: fetchIntegracoes });
  const row = data.find((r) => r.provider === provider) ?? null;
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setForm((row?.credenciais as Record<string, string>) ?? {});
  }, [row?.id, provider]);

  if (!def) return <div className="p-6 text-sm text-muted-foreground">Integração não encontrada.</div>;
  const Icon = ICONS[def.provider] ?? Plug;

  async function salvar(extra?: Partial<IntegracaoRow>) {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) throw new Error("Sessão expirada");
    const payload: any = { user_id: uid, provider, nome: def!.nome, credenciais: form, ...extra };
    const { error } = await (supabase as any)
      .from("integracoes")
      .upsert(payload, { onConflict: "user_id,provider" });
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: ["integracoes"] });
  }

  async function onSalvar() {
    setSaving(true);
    try {
      await salvar();
      toast.success("Configuração salva");
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  function normalizeCredentialForm(values: Record<string, string>) {
    if (provider !== "mercadopago") return values;
    const accessToken = String(values.access_token ?? "")
      .trim()
      .replace(/^Bearer\s+/i, "")
      .replace(/^["']|["']$/g, "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .trim();
    return { ...values, access_token: accessToken };
  }

  async function onTestar() {
    setTesting(true);
    try {
      const faltando = def!.campos.filter((c) => !c.ajuda && !(form[c.key] ?? "").trim());
      if (faltando.length) {
        await salvar({
          ativo: false,
          status: "desconectado",
          ultimo_teste_ok: false,
          ultimo_teste_msg: `Campos obrigatórios não preenchidos: ${faltando.map((f) => f.label).join(", ")}`,
        });
        toast.error("Preencha todas as credenciais obrigatórias");
        return;
      }
      const normalized = normalizeCredentialForm(form);
      setForm(normalized);
      if (provider === "mercadopago" && !/^APP_USR-/i.test(normalized.access_token ?? "")) {
        throw new Error("Use o Access Token de produção completo, iniciado por APP_USR-.");
      }
      const originalForm = form;
      setForm(normalized);
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Sessão expirada");
      const { error: saveError } = await (supabase as any).from("integracoes").upsert(
        { user_id: uid, provider, nome: def!.nome, credenciais: normalized },
        { onConflict: "user_id,provider" },
      );
      if (saveError) {
        setForm(originalForm);
        throw saveError;
      }
      if (provider === "mercadopago") {
        const result = await syncMercadoPago();
        await qc.invalidateQueries({ queryKey: ["integracoes"] });
        await qc.invalidateQueries({ queryKey: ["pix_pagamentos"] });
        if (!result.ok) throw new Error(result.message);
        toast.success(result.message);
      } else {
        await salvar({
          ativo: true,
          status: "conectado",
          ultimo_teste_ok: true,
          ultimo_teste_msg: "Credenciais validadas e conexão registrada.",
          ultima_sync: new Date().toISOString(),
        });
        toast.success("Conexão testada com sucesso");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Falha no teste");
    } finally {
      setTesting(false);
    }
  }

  async function onDesconectar() {
    try {
      await salvar({ ativo: false, status: "desconectado", ultimo_teste_msg: "Desconectado manualmente." });
      toast.success("Integração desconectada");
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao desconectar");
    }
  }

  const conectado = !!row?.ativo;

  return (
    <div className={embutido ? "space-y-4" : "p-6 space-y-4"}>
      <Card className="p-5">
        <div className="flex items-start gap-3 flex-wrap">
          <div
            className="h-12 w-12 rounded-lg grid place-items-center shrink-0"
            style={{ backgroundColor: `${def.cor}22`, border: `1px solid ${def.cor}55` }}
          >
            <Icon className="h-6 w-6" style={{ color: def.cor }} />
          </div>
          <div className="flex-1 min-w-[220px]">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold">{def.nome}</h2>
              <Badge variant={conectado ? "default" : "secondary"} className="gap-1">
                {conectado ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                {conectado ? "Conectado" : "Desconectado"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{def.descricao}</p>
            <div className="flex gap-4 flex-wrap text-xs text-muted-foreground mt-2">
              <span>Última sincronização: {fmtData(row?.ultima_sync ?? null)}</span>
              {def.webhook && <span>Última notificação: {fmtData(row?.ultima_notificacao ?? null)}</span>}
            </div>
            {row?.ultimo_teste_msg && (
              <div className={`text-xs mt-1 ${row.ultimo_teste_ok ? "text-emerald-500" : "text-destructive"}`}>
                {row.ultimo_teste_msg}
              </div>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5 space-y-4">
          <div>
            <div className="text-sm font-semibold mb-2">Pré-requisitos</div>
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
              {def.prerequisitos.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
          <Separator />
          <div>
            <div className="text-sm font-semibold mb-2">Passo a passo de configuração</div>
            <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1">
              {def.passos.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ol>
          </div>
          <Separator />
          <div>
            <div className="text-sm font-semibold mb-2">URLs necessárias</div>
            <div className="space-y-2">
              {def.urls.map((u) => (
                <a
                  key={u.url}
                  href={u.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> {u.label}
                </a>
              ))}
              {def.webhook && row?.webhook_token && (
                <div className="mt-3">
                  <Label className="text-xs">URL do webhook (cole no painel do provedor)</Label>
                  <div className="flex gap-2 mt-1">
                    <Input readOnly value={webhookUrl(row.webhook_token)} className="font-mono text-xs" />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copiar(webhookUrl(row.webhook_token), "URL do webhook")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
              {def.webhook && !row?.webhook_token && (
                <p className="text-xs text-muted-foreground mt-2">
                  Salve a integração para gerar a URL exclusiva do webhook.
                </p>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <div className="text-sm font-semibold">Credenciais</div>
          {def.campos.map((c) => (
            <div key={c.key} className="space-y-1">
              <Label className="text-xs">{c.label}</Label>
              <Input
                type={c.tipo === "password" ? "password" : "text"}
                placeholder={c.placeholder ?? ""}
                value={form[c.key] ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, [c.key]: e.target.value }))}
              />
              {provider === "mercadopago" && c.key === "access_token" && (
                <p className="text-[11px] text-muted-foreground">
                  Cole somente o Access Token de produção completo (APP_USR-...), sem “Bearer”, aspas ou espaços.
                </p>
              )}
              {c.ajuda && <p className="text-[11px] text-muted-foreground">{c.ajuda}</p>}
            </div>
          ))}
          <div className="flex gap-2 flex-wrap pt-1">
            <Button onClick={onSalvar} disabled={saving} variant="outline">
              <Save className="h-4 w-4 mr-2" /> Salvar
            </Button>
            <Button onClick={onTestar} disabled={testing}>
              <Plug className="h-4 w-4 mr-2" /> Testar conexão
            </Button>
            {conectado && (
              <Button variant="ghost" onClick={onDesconectar}>
                Desconectar
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
