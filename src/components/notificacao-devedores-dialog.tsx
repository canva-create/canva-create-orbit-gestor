import { useEffect, useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays } from "date-fns";
import { currencyBRL, diasParaVencer, formatDateBR, maskPhoneBR, whatsappLink } from "@/lib/iptv";
import { marcarClienteComoPago } from "@/lib/pagamento";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  MessageCircle,
  Search,
  Users,
  XCircle,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "gestor_now_devedores_notificacao_ultimo_aviso";
const INTERVALO_DIAS = 5;

/**
 * Regra de negócio:
 * 1. Deve surgir às 10 horas da manhã ou depois das 10 horas da manhã (hora >= 10).
 * 2. Deve aparecer de 5 em 5 dias até que o status de todos mude para pago.
 */
export function deveDispararAlertaDevedores(ultimoAvisoIso: string | null): boolean {
  const agora = new Date();
  const hora = agora.getHours();

  // Antes das 10h da manhã não deve disparar automaticamente
  if (hora < 10) {
    return false;
  }

  // Se nunca foi disparado antes e já é 10h+, dispara
  if (!ultimoAvisoIso) {
    return true;
  }

  const dataUltimoAviso = new Date(ultimoAvisoIso);
  if (isNaN(dataUltimoAviso.getTime())) {
    return true;
  }

  // Verifica se já se passaram 5 dias ou mais
  const diff = differenceInCalendarDays(agora, dataUltimoAviso);
  return diff >= INTERVALO_DIAS;
}

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
  const [processandoId, setProcessandoId] = useState<string | null>(null);

  // Busca clientes com status_pagamento = 'devendo'
  const { data: devedores = [], isLoading } = useQuery({
    queryKey: ["clientes-devedores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("*, servidor:servidores(id, nome)")
        .eq("status_pagamento", "devendo")
        .is("deleted_at", null)
        .neq("status", "cancelado")
        .order("data_vencimento", { ascending: true });

      if (error) {
        console.error("Erro ao carregar clientes devedores:", error);
        return [];
      }
      return data ?? [];
    },
    refetchInterval: 60_000, // Atualiza a cada minuto em background
  });

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

  // Verificação periódica para disparar automaticamente às 10h+ de 5 em 5 dias
  useEffect(() => {
    function checarDisparo() {
      // Se não houver clientes devedores, não dispara
      if (devedores.length === 0) return;

      let ultimoAviso: string | null = null;
      try {
        ultimoAviso = localStorage.getItem(STORAGE_KEY);
      } catch {}

      if (deveDispararAlertaDevedores(ultimoAviso)) {
        setAutoOpen(true);
        // Marca timestamp atual para evitar disparos repetidos na mesma sessão
        try {
          localStorage.setItem(STORAGE_KEY, new Date().toISOString());
        } catch {}
      }
    }

    checarDisparo();
    const interval = setInterval(checarDisparo, 60_000); // Checa a cada minuto
    return () => clearInterval(interval);
  }, [devedores.length]);

  // Total devido
  const totalDevido = useMemo(() => {
    return devedores.reduce((acc, c: any) => acc + Number(c.valor_pago || 0), 0);
  }, [devedores]);

  // Lista filtrada por busca
  const listaFiltrada = useMemo(() => {
    if (!search.trim()) return devedores;
    const s = search.toLowerCase().trim();
    return devedores.filter(
      (c: any) =>
        c.nome?.toLowerCase().includes(s) ||
        c.telefone?.includes(s) ||
        c.aplicativo?.toLowerCase().includes(s)
    );
  }, [devedores, search]);

  async function handleMarcarPago(cliente: any) {
    setProcessandoId(cliente.id);
    try {
      await marcarClienteComoPago(cliente, qc);
    } finally {
      setProcessandoId(null);
    }
  }

  function handleEnviarCobranca(cliente: any) {
    if (!cliente.telefone) {
      toast.error("Cliente não possui telefone cadastrado!");
      return;
    }
    const nome = cliente.nome || "Cliente";
    const app = cliente.aplicativo ? ` (${cliente.aplicativo})` : "";
    const venc = formatDateBR(cliente.data_vencimento);
    const valor = Number(cliente.valor_pago || 0) > 0 ? ` no valor de ${currencyBRL(cliente.valor_pago)}` : "";

    const msg = `Olá, *${nome}*! Tudo bem?\n\nPassando para lembrar que a sua assinatura de TV${app}${valor} consta com pagamento pendente (vencimento: *${venc}*).\n\nCaso já tenha realizado o pagamento, favor desconsiderar ou nos enviar o comprovante por aqui. Obrigado! 🙏\n\n📺 *RODOLFO TV*`;

    const link = `${whatsappLink(cliente.telefone)}?text=${encodeURIComponent(msg)}`;
    window.open(link, "_blank");
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-4 sm:p-6 bg-card border-border/80">
        <DialogHeader className="space-y-1.5 pb-2 border-b border-border/50">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl text-amber-500 font-bold">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 animate-bounce" />
              Notificação de Clientes Devedores
            </DialogTitle>
            <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs py-0.5">
              Alerta Periódico (10:00h / 5 dias)
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Esta janela surge a partir das 10h da manhã, de 5 em 5 dias, até que os clientes devedores tenham o status alterado para <strong className="text-emerald-400">PAGO</strong>.
          </p>
        </DialogHeader>

        {/* Resumo Financeiro */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 py-2">
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5">
            <span className="text-[11px] text-amber-300/80 font-medium block">Total Devedores</span>
            <span className="text-base sm:text-lg font-bold text-amber-400 flex items-center gap-1.5 mt-0.5">
              <Users className="h-4 w-4" />
              {devedores.length} {devedores.length === 1 ? "cliente" : "clientes"}
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

        {/* Campo de Busca Rápida */}
        {devedores.length > 3 && (
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, telefone ou aplicativo..."
              className="h-8 pl-8 text-xs bg-background/60"
            />
          </div>
        )}

        {/* Lista de Devedores */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-1 -mr-1">
          {isLoading ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Carregando clientes devedores...
            </div>
          ) : devedores.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <div className="inline-flex p-3 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <Sparkles className="h-8 w-8" />
              </div>
              <h4 className="text-sm font-semibold text-emerald-400">Parabéns! Nenhum cliente devedor no momento.</h4>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Todos os clientes estão com o perfil marcado como pago no sistema.
              </p>
            </div>
          ) : listaFiltrada.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Nenhum cliente devedor encontrado para o filtro "{search}".
            </div>
          ) : (
            listaFiltrada.map((c: any) => {
              const dias = diasParaVencer(c.data_vencimento);
              const isOverdue = dias !== null && dias < 0;
              const isProcessando = processandoId === c.id;

              return (
                <div
                  key={c.id}
                  className="rounded-lg border border-border/70 bg-card/60 hover:bg-muted/30 p-3 transition-colors space-y-2"
                >
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-sm text-foreground">{c.nome}</span>
                        <button
                          type="button"
                          className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="Copiar nome do cliente"
                          onClick={() => {
                            navigator.clipboard.writeText(c.nome || "");
                            toast.success("👤 Nome copiado!");
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                        <Badge
                          variant="outline"
                          className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px] font-semibold py-0"
                        >
                          DEVENDO
                        </Badge>
                        {c.aplicativo && (
                          <Badge variant="outline" className="text-[10px] py-0 text-muted-foreground">
                            {c.aplicativo}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        {c.telefone && <span>📱 {maskPhoneBR(c.telefone)}</span>}
                        {c.servidor?.nome && <span>🖥️ {c.servidor.nome}</span>}
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
                          🗓️ Vencimento: {formatDateBR(c.data_vencimento)}{" "}
                          {dias === null
                            ? ""
                            : dias < 0
                            ? `(Vencido há ${Math.abs(dias)}d)`
                            : dias === 0
                            ? `(Vence hoje)`
                            : `(em ${dias}d)`}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-muted-foreground block">Valor Pendente</span>
                      <span className="text-sm font-bold text-red-400">
                        {currencyBRL(c.valor_pago || 0)}
                      </span>
                    </div>
                  </div>

                  {/* Ações por Cliente */}
                  <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-border/40 flex-wrap">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px] gap-1 text-primary border-primary/30 hover:bg-primary/10"
                      onClick={() => {
                        handleOpenChange(false);
                        window.location.href = `/clientes?clienteId=${c.id}&q=${encodeURIComponent(c.nome || "")}&filtro=devendo`;
                      }}
                    >
                      <ExternalLink className="h-3 w-3" />
                      Ver na Lista
                    </Button>

                    {c.telefone && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] gap-1 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                        onClick={() => handleEnviarCobranca(c)}
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
                      onClick={() => handleMarcarPago(c)}
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
  );
}
