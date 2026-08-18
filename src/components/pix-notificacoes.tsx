import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { QrCode, ArrowRight, RefreshCw, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { syncMercadoPagoTodayFn } from "@/lib/pix-sync.functions";
import { exibeBanco, exibePagador } from "@/lib/pix-format";

const KEY = "pix_ultimo_visto";
const VISTOS = "pix_ids_vistos";

const brl = (n: number) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ni = (v: unknown) => {
  const s = v == null ? "" : String(v).trim();
  return s ? s : "Não informado";
};

type PixRow = {
  id: string;
  provider?: string | null;
  valor: number;
  pagador_nome: string | null;
  pagador_documento: string | null;
  instituicao: string | null;
  conta_destino: string | null;
  end_to_end_id: string | null;
  transacao_id: string | null;
  status: string;
  pago_em: string;
};

async function fetchPix(): Promise<PixRow[]> {
  const { data, error } = await (supabase as any)
    .from("pix_pagamentos")
    .select("*")
    .order("pago_em", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as PixRow[];
}

/**
 * Botão fixo "Pagamento Pix" com indicador de novos recebimentos em tempo real.
 * Escuta inserts/updates da tabela de pagamentos via realtime e notifica na hora.
 */
export function PixButton() {
  const qc = useQueryClient();
  const syncMercadoPago = useServerFn(syncMercadoPagoTodayFn);
  const syncing = useRef(false);
  const knownIds = useRef<Set<string> | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [novos, setNovos] = useState(0);
  const [aberto, setAberto] = useState(false);
  const { data = [], isFetching, refetch } = useQuery({
    queryKey: ["pix_pagamentos"],
    queryFn: fetchPix,
    // Sempre ativo: garante o badge quase instantâneo mesmo se o realtime cair.
    refetchInterval: 4000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  // Reconcilia os pagamentos do dia ao abrir o sistema e periodicamente.
  // Assim, Pix recebidos com o painel fechado ou durante uma falha de webhook não se perdem.
  useEffect(() => {
    let active = true;
    const syncToday = async () => {
      if (syncing.current) return;
      syncing.current = true;
      try {
        const result = await syncMercadoPago();
        if (active && result.ok) {
          await qc.invalidateQueries({ queryKey: ["pix_pagamentos"] });
        }
      } catch {
        // A tela de configuração exibe o diagnóstico da credencial/conexão.
      } finally {
        syncing.current = false;
      }
    };
    void syncToday();
    const id = window.setInterval(syncToday, 20_000);
    const onFocus = () => void syncToday();
    const onVisible = () => { if (document.visibilityState === "visible") void syncToday(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [qc, syncMercadoPago]);

  // Marca como visto tudo que já está na lista (evita perder ou duplicar avisos).
  const marcarVisto = (ids: string[]) => {
    try {
      const atual = new Set<string>(JSON.parse(localStorage.getItem(VISTOS) || "[]"));
      ids.forEach((i) => atual.add(i));
      localStorage.setItem(VISTOS, JSON.stringify([...atual].slice(-500)));
      localStorage.setItem(KEY, new Date().toISOString());
    } catch { /* ignore */ }
  };

  // Recalcula pendentes sempre que a lista muda (realtime + polling).
  useEffect(() => {
    if (!data.length) return;
    let vistos: string[] = [];
    try { vistos = JSON.parse(localStorage.getItem(VISTOS) || "[]"); } catch { /* ignore */ }
    const pendentes = data.filter((r) => !vistos.includes(r.id));
    const previous = knownIds.current;
    if (previous) {
      const received = data.filter((r) => !previous.has(r.id));
      received.sort((a, b) => new Date(b.pago_em).getTime() - new Date(a.pago_em).getTime());
      if (received.length === 1) {
        const payment = received[0];
        toast.success(`Pix recebido: ${brl(payment.valor)}`, {
          description: `${exibePagador(payment) || "Pagador não informado"} • ${exibeBanco(payment) || "Instituição não informada"}`,
          duration: 8000,
        });
      } else if (received.length > 1) {
        toast.success(`${received.length} novos Pix recebidos`, {
          description: `Total ${brl(received.reduce((sum, payment) => sum + Number(payment.valor || 0), 0))}`,
          duration: 8000,
        });
      }
    }
    knownIds.current = new Set(data.map((r) => r.id));
    if (aberto || pathname === "/pix") {
      marcarVisto(data.map((r) => r.id));
      setNovos(0);
      return;
    }
    setNovos(pendentes.length);
  }, [data, aberto, pathname]);

  // Zera o contador ao entrar na tela de Pix.
  useEffect(() => {
    if (pathname === "/pix") {
      setNovos(0);
      marcarVisto(data.map((r) => r.id));
    }
  }, [pathname, data]);

  // Ao abrir a janela de notificações, marca como visto.
  useEffect(() => {
    if (aberto) {
      setNovos(0);
      marcarVisto(data.map((r) => r.id));
    }
  }, [aberto, data]);

  useEffect(() => {
    const channel = supabase
      .channel("pix-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pix_pagamentos" },
        (payload) => {
          const r: any = payload.new ?? {};
          qc.invalidateQueries({ queryKey: ["pix_pagamentos"] });
          if (knownIds.current?.has(String(r.id))) return;
          knownIds.current?.add(String(r.id));
          toast.success(`Pix recebido: ${brl(r.valor)}`, {
            description: `${exibePagador(r) || "Pagador não informado"} • ${exibeBanco(r) || "Instituição não informada"}`,
            duration: 8000,
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pix_pagamentos" },
        (payload) => {
          const current: any = payload.new ?? {};
          const previous: any = payload.old ?? {};
          qc.invalidateQueries({ queryKey: ["pix_pagamentos"] });
          const approved = ["approved", "accredited", "pago", "recebido"].includes(
            String(current.status ?? "").toLowerCase(),
          );
          const wasApproved = ["approved", "accredited", "pago", "recebido"].includes(
            String(previous.status ?? "").toLowerCase(),
          );
          if (approved && !wasApproved) {
            toast.success(`Pix confirmado: ${brl(current.valor)}`, {
              description: `${exibePagador(current) || "Pagador não informado"} • ${exibeBanco(current) || "Instituição não informada"}`,
              duration: 8000,
            });
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc, pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="relative flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-500"
      >
        <QrCode className="h-4 w-4" />
        <span className="hidden sm:inline">Pagamento Pix</span>
        {novos > 0 && (
          <span className="absolute -top-2 -right-2 min-w-[20px] h-[20px] px-1 rounded-full bg-orange-500 ring-2 ring-background text-[10px] leading-[20px] text-center font-bold text-white animate-pulse shadow-lg">
            {novos > 99 ? "99+" : novos}
          </span>
        )}
      </button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-emerald-500" /> Pagamentos Pix recebidos
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              {data.length} pagamento(s) • Total {brl(data.reduce((s, r) => s + Number(r.valor || 0), 0))}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={!data.length}
                onClick={() => {
                  marcarVisto(data.map((r) => r.id));
                  setNovos(0);
                  toast.success("Todos os pagamentos marcados como lidos");
                }}
              >
                <CheckCheck className="h-4 w-4 mr-2" /> Marcar todos como lidos
              </Button>
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
              </Button>
            </div>
          </div>

          <div className="max-h-[55vh] overflow-auto space-y-2 pr-1">
            {[...data]
              .sort((a, b) => new Date(b.pago_em).getTime() - new Date(a.pago_em).getTime())
              .map((r) => {
              const d = new Date(r.pago_em);
              return (
                <div key={r.id} className="rounded-md border border-border p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold text-sm">{ni(exibePagador(r))}</div>
                    <div className="font-bold text-emerald-500">{brl(Number(r.valor || 0))}</div>
                  </div>
                  <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2 text-[11px] text-muted-foreground">
                    <div>Data/Hora: {d.toLocaleDateString("pt-BR")} {d.toLocaleTimeString("pt-BR")}</div>
                    <div>CPF/CNPJ: {ni(r.pagador_documento)}</div>
                    <div>Banco de origem: {ni(exibeBanco(r))}</div>
                    <div>Conta destino: {ni(r.conta_destino)}</div>
                    <div className="font-mono sm:col-span-2">
                      Transação: {ni(r.end_to_end_id ?? r.transacao_id)}
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">{ni(r.status)}</Badge>
                </div>
              );
            })}
            {!data.length && (
              <div className="text-center text-sm text-muted-foreground py-10">
                {isFetching ? "Carregando..." : "Nenhum pagamento Pix recebido ainda."}
              </div>
            )}
          </div>

          <Link
            to="/pix"
            search={{ sec: "historico" as const }}
            onClick={() => setAberto(false)}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500"
          >
            Abrir central de Pagamento Pix <ArrowRight className="h-4 w-4" />
          </Link>
        </DialogContent>
      </Dialog>
    </>
  );
}
