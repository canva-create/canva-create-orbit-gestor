import { useEffect, useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays } from "date-fns";
import { currencyBRL, diasParaVencer, formatDateBR, formatDateTimeBR, maskPhoneBR, whatsappLink } from "@/lib/iptv";
import { marcarClienteComoPago, marcarAtivacaoComoPaga, marcarRevendedorComoPago } from "@/lib/pagamento";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  MessageCircle,
  Search,
  Users,
  User,
  Smartphone,
  Handshake,
  Sparkles,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ComprovanteAtivacaoModal } from "@/components/comprovante-ativacao-modal";

const STORAGE_KEY = "gestor_now_devedores_notificacao_ultimo_aviso";
const INTERVALO_DIAS = 5;

export function deveDispararAlertaDevedores(ultimoAvisoIso: string | null): boolean {
  const agora = new Date();
  const hora = agora.getHours();

  if (hora < 10) {
    return false;
  }

  if (!ultimoAvisoIso) {
    return true;
  }

  const dataUltimoAviso = new Date(ultimoAvisoIso);
  if (isNaN(dataUltimoAviso.getTime())) {
    return true;
  }

  const diff = differenceInCalendarDays(agora, dataUltimoAviso);
  return diff >= INTERVALO_DIAS;
}

export type TipoDevedor = "todos" | "clientes" | "ativacoes" | "revendedores";

export function NotificacaoDevedoresDialog({
  manualOpen,
  onManualOpenChange,
}: {
  manualOpen?: boolean;
  onManualOpenChange?: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [autoOpen, setAutoOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [tabFiltro, setTabFiltro] = useState<TipoDevedor>("todos");
  const [processandoId, setProcessandoId] = useState<string | null>(null);
  const [detalheAtivacao, setDetalheAtivacao] = useState<any | null>(null);

  // 1. Busca clientes com status_pagamento = 'devendo' que estejam ATIVOS
  const { data: clientesDevedores = [], isLoading: isLoadingClientes } = useQuery({
    queryKey: ["clientes-devedores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("*, servidor:servidores(id, nome)")
        .eq("status_pagamento", "devendo")
        .is("deleted_at", null)
        .neq("status", "cancelado")
        .neq("status", "suspenso")
        .neq("status", "vencido")
        .order("data_vencimento", { ascending: true });

      if (error) {
        console.error("Erro ao carregar clientes devedores:", error);
        return [];
      }

      const ativos = (data ?? []).filter((c: any) => {
        const d = diasParaVencer(c.data_vencimento);
        return d === null || d >= 0;
      });

      return ativos;
    },
    refetchInterval: 60_000,
  });

  // 2. Busca ativações de aplicativos devendo
  const { data: ativacoesDevedores = [], isLoading: isLoadingAtivacoes } = useQuery({
    queryKey: ["ativacoes-devedores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ativacoes_apps")
        .select("*, servidor:servidores(id, nome, custo_mensal)")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Erro ao carregar ativações devendo:", error);
        return [];
      }

      const devendo = (data ?? []).filter((a: any) =>
        a.status_pagamento === "devendo" || (a.observacao && a.observacao.includes("[DEVENDO]"))
      );
      return devendo;
    },
    refetchInterval: 60_000,
  });

  // 3. Busca revendedores com status_pagamento = 'devendo'
  const { data: revendedoresDevedores = [], isLoading: isLoadingRevs } = useQuery({
    queryKey: ["revendedores-devedores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("revendedores")
        .select("*, servidor:servidores(id, nome)")
        .eq("status_pagamento", "devendo")
        .order("nome", { ascending: true });

      if (error) {
        console.error("Erro ao carregar revendedores devendo:", error);
        return [];
      }
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  const isLoading = isLoadingClientes || isLoadingAtivacoes || isLoadingRevs;
  const totalCount = clientesDevedores.length + ativacoesDevedores.length + revendedoresDevedores.length;

  const isOpen = Boolean(manualOpen || autoOpen);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setAutoOpen(false);
      onManualOpenChange?.(false);
      try {
        localStorage.setItem(STORAGE_KEY, new Date().toISOString());
      } catch (e) {
        console.warn("Não foi possível salvar no localStorage:", e);
      }
    } else {
      if (onManualOpenChange) {
        onManualOpenChange(true);
      } else {
        setAutoOpen(true);
      }
    }
  };

  useEffect(() => {
    function checarDisparo() {
      if (totalCount === 0) return;

      let ultimoAviso: string | null = null;
      try {
        ultimoAviso = localStorage.getItem(STORAGE_KEY);
      } catch {}

      if (deveDispararAlertaDevedores(ultimoAviso)) {
        setAutoOpen(true);
        try {
          localStorage.setItem(STORAGE_KEY, new Date().toISOString());
        } catch {}
      }
    }

    checarDisparo();
    const interval = setInterval(checarDisparo, 60_000);
    return () => clearInterval(interval);
  }, [totalCount]);

  // Lista unificada de devedores
  const listaUnificada = useMemo(() => {
    const arr: any[] = [];

    // Clientes
    for (const c of clientesDevedores) {
      arr.push({
        tipo: "cliente",
        id: `cli-${c.id}`,
        originalId: c.id,
        raw: c,
        nome: c.nome,
        subtitulo: c.servidor?.nome ? `Servidor: ${c.servidor.nome}` : undefined,
        detalhes: c.aplicativo ? `App: ${c.aplicativo}` : undefined,
        telefone: c.telefone,
        valor: Number(c.valor_pago || 0),
        vencimento: c.data_vencimento,
        created_at: c.created_at,
      });
    }

    // Ativações de Apps
    for (const a of ativacoesDevedores) {
      const v = Number(a.valor_devendo || a.valor || 0);
      arr.push({
        tipo: "ativacao",
        id: `ativ-${a.id}`,
        originalId: a.id,
        raw: a,
        nome: a.cliente_nome || "Ativação de App",
        subtitulo: a.aplicativo ? `Aplicativo: ${a.aplicativo}` : undefined,
        detalhes: a.mac ? `MAC: ${a.mac}${a.device ? ` • Dev: ${a.device}` : ""}` : (a.device ? `Device: ${a.device}` : undefined),
        telefone: null,
        valor: v,
        vencimento: a.expira_em,
        created_at: a.ativado_em || a.created_at,
      });
    }

    // Revendedores
    for (const r of revendedoresDevedores) {
      arr.push({
        tipo: "revendedor",
        id: `rev-${r.id}`,
        originalId: r.id,
        raw: r,
        nome: r.nome,
        subtitulo: r.servidor?.nome ? `Servidor: ${r.servidor.nome}` : undefined,
        detalhes: r.creditos ? `Créditos: ${r.creditos}` : undefined,
        telefone: r.telefone,
        valor: Number(r.valor_venda || 0),
        vencimento: null,
        created_at: r.created_at,
      });
    }

    return arr;
  }, [clientesDevedores, ativacoesDevedores, revendedoresDevedores]);

  // Total devido somado
  const totalDevido = useMemo(() => {
    return listaUnificada.reduce((acc, item) => acc + item.valor, 0);
  }, [listaUnificada]);

  // Lista filtrada por aba e termo de busca
  const listaFiltrada = useMemo(() => {
    let res = listaUnificada;
    if (tabFiltro !== "todos") {
      res = res.filter((item) => {
        if (tabFiltro === "clientes") return item.tipo === "cliente";
        if (tabFiltro === "ativacoes") return item.tipo === "ativacao";
        if (tabFiltro === "revendedores") return item.tipo === "revendedor";
        return true;
      });
    }

    if (!search.trim()) return res;
    const s = search.toLowerCase().trim();
    return res.filter(
      (item) =>
        item.nome?.toLowerCase().includes(s) ||
        item.telefone?.includes(s) ||
        item.subtitulo?.toLowerCase().includes(s) ||
        item.detalhes?.toLowerCase().includes(s)
    );
  }, [listaUnificada, tabFiltro, search]);

  async function handleMarcarPago(item: any) {
    setProcessandoId(item.id);
    try {
      if (item.tipo === "cliente") {
        await marcarClienteComoPago(item.raw, qc);
      } else if (item.tipo === "ativacao") {
        await marcarAtivacaoComoPaga(item.raw, qc);
      } else if (item.tipo === "revendedor") {
        await marcarRevendedorComoPago(item.raw, qc);
      }
    } finally {
      setProcessandoId(null);
    }
  }

  function handleEnviarCobranca(item: any) {
    if (!item.telefone) {
      toast.error("Contato não possui telefone cadastrado!");
      return;
    }
    const nome = item.nome || "Cliente";
    const valor = item.valor > 0 ? ` no valor de ${currencyBRL(item.valor)}` : "";

    let msg = "";
    if (item.tipo === "ativacao") {
      const app = item.raw.aplicativo ? ` do aplicativo *${item.raw.aplicativo}*` : "";
      const mac = item.raw.mac ? ` (MAC: *${item.raw.mac}*)` : "";
      msg = `Olá, *${nome}*! Tudo bem?\n\nPassando para lembrar que a ativação${app}${mac}${valor} consta com pagamento pendente.\n\nCaso já tenha realizado o pagamento, favor nos enviar o comprovante por aqui. Obrigado! 🙏\n\n📺 *RODOLFO TV*`;
    } else if (item.tipo === "revendedor") {
      msg = `Olá, *${nome}*! Tudo bem?\n\nPassando para verificar a sua pendência de créditos/revenda${valor}.\n\nCaso já tenha efetuado o pagamento, favor nos enviar o comprovante. Obrigado! 🙏\n\n📺 *RODOLFO TV*`;
    } else {
      const app = item.raw.aplicativo ? ` (${item.raw.aplicativo})` : "";
      const venc = item.vencimento ? formatDateBR(item.vencimento) : "";
      const vencStr = venc ? ` (vencimento: *${venc}*)` : "";
      msg = `Olá, *${nome}*! Tudo bem?\n\nPassando para lembrar que a sua assinatura de TV${app}${valor} consta com pagamento pendente${vencStr}.\n\nCaso já tenha realizado o pagamento, favor desconsiderar ou nos enviar o comprovante por aqui. Obrigado! 🙏\n\n📺 *RODOLFO TV*`;
    }

    const link = `${whatsappLink(item.telefone)}?text=${encodeURIComponent(msg)}`;
    window.open(link, "_blank");
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-4 sm:p-6 bg-card border-border/80">
          <DialogHeader className="space-y-1.5 pb-2 border-b border-border/50">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl text-amber-500 font-bold">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 animate-bounce" />
                Notificação: Gestão de Devedores
              </DialogTitle>
              <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs py-0.5">
                Alerta Periódico (10:00h / 5 dias)
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Exibindo clientes ativos, revendas e ativações de aplicativos com pagamento pendente, até que o status seja alterado para <strong className="text-emerald-400">PAGO</strong>.
            </p>
          </DialogHeader>

          {/* Resumo Financeiro */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 py-2">
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5">
              <span className="text-[11px] text-amber-300/80 font-medium block">Total Pendentes</span>
              <span className="text-base sm:text-lg font-bold text-amber-400 flex items-center gap-1.5 mt-0.5">
                <Users className="h-4 w-4" />
                {totalCount} {totalCount === 1 ? "devedor" : "devedores"}
              </span>
            </div>

            <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-2.5">
              <span className="text-[11px] text-red-300/80 font-medium block">Valor Total Pendente</span>
              <span className="text-base sm:text-lg font-bold text-red-400 block mt-0.5">
                {currencyBRL(totalDevido)}
              </span>
            </div>

            <div className="rounded-lg bg-muted/40 border border-border/60 p-2.5 col-span-2 sm:col-span-1 flex flex-col justify-center">
              <span className="text-[11px] text-muted-foreground font-medium block">Próximo Alerta Automático</span>
              <span className="text-xs font-semibold text-foreground mt-0.5 flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-primary" />
                Em 5 dias às 10:00h
              </span>
            </div>
          </div>

          {/* Abas / Categorias de Devedores */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 border-b border-border/40 text-xs">
            <button
              type="button"
              onClick={() => setTabFiltro("todos")}
              className={cn(
                "px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap",
                tabFiltro === "todos"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              Todos ({totalCount})
            </button>
            <button
              type="button"
              onClick={() => setTabFiltro("clientes")}
              className={cn(
                "px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap flex items-center gap-1",
                tabFiltro === "clientes"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              <User className="h-3 w-3" /> Clientes ({clientesDevedores.length})
            </button>
            <button
              type="button"
              onClick={() => setTabFiltro("ativacoes")}
              className={cn(
                "px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap flex items-center gap-1",
                tabFiltro === "ativacoes"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              <Smartphone className="h-3 w-3 text-sky-400" /> Ativações ({ativacoesDevedores.length})
            </button>
            <button
              type="button"
              onClick={() => setTabFiltro("revendedores")}
              className={cn(
                "px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap flex items-center gap-1",
                tabFiltro === "revendedores"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              <Handshake className="h-3 w-3 text-purple-400" /> Revendedores ({revendedoresDevedores.length})
            </button>
          </div>

          {/* Campo de Busca Rápida */}
          <div className="relative pt-1">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, telefone, aplicativo ou MAC..."
              className="h-8 pl-8 text-xs bg-background/60"
            />
          </div>

          {/* Lista de Devedores */}
          <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-1 -mr-1 pt-1">
            {isLoading ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Carregando devedores...
              </div>
            ) : totalCount === 0 ? (
              <div className="py-10 text-center space-y-3">
                <div className="inline-flex p-3 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  <Sparkles className="h-8 w-8" />
                </div>
                <h4 className="text-sm font-semibold text-emerald-400">Parabéns! Nenhum devedor no momento.</h4>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Todos os clientes, revendas e ativações de aplicativos estão com pagamento em dia.
                </p>
              </div>
            ) : listaFiltrada.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Nenhum devedor encontrado para o filtro "{search}".
              </div>
            ) : (
              listaFiltrada.map((item) => {
                const isProcessando = processandoId === item.id;
                const dias = item.vencimento ? diasParaVencer(item.vencimento) : null;
                const isOverdue = dias !== null && dias < 0;

                return (
                  <div
                    key={item.id}
                    className="rounded-lg border border-border/70 bg-card/60 hover:bg-muted/30 p-3 transition-colors space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-sm text-foreground">{item.nome}</span>
                          <button
                            type="button"
                            className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Copiar nome"
                            onClick={() => {
                              navigator.clipboard.writeText(item.nome || "");
                              toast.success("👤 Nome copiado!");
                            }}
                          >
                            <Copy className="h-3 w-3" />
                          </button>

                          {item.tipo === "cliente" && (
                            <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-[10px] font-semibold py-0">
                              CLIENTE
                            </Badge>
                          )}
                          {item.tipo === "ativacao" && (
                            <Badge variant="outline" className="bg-sky-500/10 text-sky-400 border-sky-500/30 text-[10px] font-semibold py-0">
                              ATIVAÇÃO APP
                            </Badge>
                          )}
                          {item.tipo === "revendedor" && (
                            <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-[10px] font-semibold py-0">
                              REVENDA
                            </Badge>
                          )}

                          <Badge
                            variant="outline"
                            className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px] font-semibold py-0"
                          >
                            DEVENDO
                          </Badge>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          {item.subtitulo && <span>🖥️ {item.subtitulo}</span>}
                          {item.detalhes && <span className="font-mono text-xs">{item.detalhes}</span>}
                          {item.telefone && <span>📱 {maskPhoneBR(item.telefone)}</span>}
                          {item.vencimento && (
                            <span
                              className={cn(
                                "font-medium",
                                isOverdue
                                  ? "text-red-400"
                                  : dias === 0
                                  ? "text-orange-400"
                                  : "text-emerald-400"
                              )}
                            >
                              🗓️ Vencimento: {formatDateBR(item.vencimento)}{" "}
                              {dias === null
                                ? ""
                                : dias === 0
                                ? `(Vence hoje)`
                                : `(em ${dias}d)`}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-muted-foreground block">Valor Pendente</span>
                        <span className="text-sm font-bold text-red-400">
                          {currencyBRL(item.valor)}
                        </span>
                      </div>
                    </div>

                    {/* Ações por Devedor */}
                    <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-border/40 flex-wrap">
                      {item.tipo === "cliente" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px] gap-1 text-primary border-primary/30 hover:bg-primary/10"
                          onClick={() => {
                            handleOpenChange(false);
                            window.location.href = `/clientes?clienteId=${item.originalId}&q=${encodeURIComponent(item.nome || "")}&filtro=devendo`;
                          }}
                        >
                          <ExternalLink className="h-3 w-3" />
                          Ver na Lista
                        </Button>
                      )}

                      {item.tipo === "ativacao" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px] gap-1 text-primary border-primary/30 hover:bg-primary/10"
                          onClick={() => setDetalheAtivacao(item.raw)}
                        >
                          <Eye className="h-3 w-3" />
                          Comprovante
                        </Button>
                      )}

                      {item.tipo === "revendedor" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px] gap-1 text-primary border-primary/30 hover:bg-primary/10"
                          onClick={() => {
                            handleOpenChange(false);
                            window.location.href = `/revendedores?q=${encodeURIComponent(item.nome || "")}`;
                          }}
                        >
                          <ExternalLink className="h-3 w-3" />
                          Ver Revendedor
                        </Button>
                      )}

                      {item.telefone && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px] gap-1 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                          onClick={() => handleEnviarCobranca(item)}
                        >
                          <MessageCircle className="h-3 w-3" />
                          Cobrar WhatsApp
                        </Button>
                      )}

                      <Button
                        type="button"
                        size="sm"
                        disabled={isProcessando}
                        className="h-7 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                        onClick={() => handleMarcarPago(item)}
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        {isProcessando ? "Salvando..." : "Marcar como Pago"}
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <DialogFooter className="pt-2 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground order-2 sm:order-1 text-center sm:text-left">
              Ao fechar, o próximo aviso automático surgirá após 5 dias às 10:00h.
            </span>
            <Button
              type="button"
              variant="default"
              className="w-full sm:w-auto h-8 text-xs font-semibold order-1 sm:order-2"
              onClick={() => handleOpenChange(false)}
            >
              Entendido / Fechar Janela
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ComprovanteAtivacaoModal
        open={!!detalheAtivacao}
        onOpenChange={(v) => !v && setDetalheAtivacao(null)}
        data={detalheAtivacao}
      />
    </>
  );
}
