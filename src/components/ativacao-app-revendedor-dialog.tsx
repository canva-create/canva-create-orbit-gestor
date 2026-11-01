import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchServidores, fetchSaldosCreditos } from "@/lib/queries";
import { fetchAplicativosCatalogo, AplicativoCatalogo } from "@/lib/aplicativos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Smartphone,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Calendar,
  KeyRound,
  User,
  Users,
  Server,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { currencyBRL, maskMAC, toISODate } from "@/lib/iptv";
import { cn } from "@/lib/utils";
import { ServidorSelectItems } from "@/lib/servidores-ui";
import { logAudit } from "@/lib/audit";
import { findAtivaAppServer, add365Days, ComprovanteData } from "@/lib/comprovante-ativacao-generator";
import { ComprovanteAtivacaoModal } from "@/components/comprovante-ativacao-modal";
import { registrarMovimentacaoCredito } from "@/lib/creditos";

export interface AtivacaoAppRevendedorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  revendedorPreselecionado?: any | null;
  revendedores?: any[];
  servidores?: any[];
}

export function AtivacaoAppRevendedorDialog({
  open,
  onOpenChange,
  revendedorPreselecionado,
  revendedores = [],
  servidores: servidoresProp,
}: AtivacaoAppRevendedorDialogProps) {
  const qc = useQueryClient();
  const { data: servidoresQuery = [] } = useQuery({
    queryKey: ["servidores"],
    queryFn: fetchServidores,
    enabled: !servidoresProp || servidoresProp.length === 0,
  });
  const servidores = servidoresProp && servidoresProp.length > 0 ? servidoresProp : servidoresQuery;

  const { data: catalogoApps = [] } = useQuery<AplicativoCatalogo[]>({
    queryKey: ["aplicativos_catalogo"],
    queryFn: fetchAplicativosCatalogo,
  });

  const { data: saldos = {} } = useQuery({
    queryKey: ["creditos_saldos"],
    queryFn: fetchSaldosCreditos,
  });

  const [revendedorId, setRevendedorId] = useState("");
  const [servidorId, setServidorId] = useState("");
  const [clienteFinal, setClienteFinal] = useState("");
  const [aplicativo, setAplicativo] = useState("");
  const [mac, setMac] = useState("");
  const [device, setDevice] = useState("");
  const [valorVenda, setValorVenda] = useState("");
  const [custo, setCusto] = useState("");
  const [fracaoCreditos, setFracaoCreditos] = useState("1");
  const [dias, setDias] = useState("365");
  const [statusPagamento, setStatusPagamento] = useState<"pago" | "devendo">("pago");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  // Comprovante pós-ativação
  const [resultadoComprovante, setResultadoComprovante] = useState<ComprovanteData | null>(null);
  const [comprovanteModalOpen, setComprovanteModalOpen] = useState(false);

  // Identifica o revendedor selecionado
  const revendedorAtual = useMemo(() => {
    if (revendedorPreselecionado?.id) return revendedorPreselecionado;
    return revendedores.find((r) => r.id === revendedorId) || null;
  }, [revendedorPreselecionado, revendedorId, revendedores]);

  // Inicialização / Reset ao abrir modal
  useEffect(() => {
    if (!open) {
      setResultadoComprovante(null);
      setComprovanteModalOpen(false);
      return;
    }

    const r = revendedorPreselecionado;
    if (r?.id) {
      setRevendedorId(r.id);
      const sid = r.servidor_id || (servidores as any[])[0]?.id || "";
      setServidorId(sid);
    } else {
      setRevendedorId(revendedores[0]?.id || "");
      const sid = revendedores[0]?.servidor_id || (servidores as any[])[0]?.id || "";
      setServidorId(sid);
    }

    setClienteFinal("");
    setAplicativo("");
    setMac("");
    setDevice("");
    setValorVenda("25");
    setCusto("10");
    setFracaoCreditos("1");
    setDias("365");
    setStatusPagamento("pago");
    setObs("");
    setResultadoComprovante(null);
    setComprovanteModalOpen(false);
  }, [open, revendedorPreselecionado, revendedores, servidores]);

  // Atualiza servidor quando o revendedor muda (se usuário selecionar outro revendedor)
  function handleRevendedorChange(id: string) {
    setRevendedorId(id);
    const rev = revendedores.find((r) => r.id === id);
    if (rev?.servidor_id) {
      setServidorId(rev.servidor_id);
      const srv = (servidores as any[]).find((s) => s.id === rev.servidor_id);
      if (srv && (!custo || Number(custo) === 0)) {
        setCusto(String(srv.custo_mensal || 10));
      }
    }
  }

  // Preenche dados ao selecionar app do catálogo
  function handleSelectApp(nomeApp: string) {
    setAplicativo(nomeApp);
    const match = catalogoApps.find((a) => a.nome.trim().toUpperCase() === nomeApp.trim().toUpperCase());
    if (match) {
      if (match.valor_venda !== undefined && match.valor_venda !== null) {
        setValorVenda(String(match.valor_venda));
      }
      if (match.custo !== undefined && match.custo !== null) {
        setCusto(String(match.custo));
      }
      if (match.fracao_creditos !== undefined && match.fracao_creditos !== null) {
        setFracaoCreditos(String(match.fracao_creditos));
      }
    }
  }

  const nValor = Number(valorVenda) || 0;
  const nCusto = Number(custo) || 0;
  const nFracao = Number(fracaoCreditos) || 0;
  const lucroPrevisto = nValor - nCusto;
  const isPago = statusPagamento === "pago";

  const servidorAtual = (servidores as any[]).find((s) => s.id === servidorId);
  const saldoServidor = servidorId ? (saldos[servidorId] ?? 0) : 0;
  const saldoInsuficiente = servidorId && saldoServidor < nFracao;

  async function handleSalvar() {
    if (!revendedorAtual?.id) {
      return toast.error("Selecione um revendedor.");
    }
    if (!servidorId) {
      return toast.error("Selecione o servidor para debitar os créditos.");
    }
    if (!aplicativo.trim()) {
      return toast.error("Informe o nome do aplicativo.");
    }
    if (!mac.trim()) {
      return toast.error("Informe o endereço MAC.");
    }
    if (nFracao <= 0) {
      return toast.error("A quantidade de créditos a descontar deve ser maior que zero.");
    }

    setSaving(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Usuário não autenticado");

      const agora = new Date();
      const nDias = Math.max(1, parseInt(dias, 10) || 365);
      const expira = new Date(agora.getTime() + nDias * 86400000);
      const appNomeLimpo = aplicativo.trim().toUpperCase();
      const macLimpo = maskMAC(mac.trim());
      const deviceLimpo = device.trim();
      const clienteDesc = clienteFinal.trim();

      // 1. Desconta créditos do servidor no saldo real
      await registrarMovimentacaoCredito({
        servidor_id: servidorId,
        quantidade: -nFracao,
        tipo: "ativacao",
        motivo: `Ativação app ${appNomeLimpo} (${macLimpo}) p/ revendedor ${revendedorAtual.nome}${isPago ? "" : " (DEVENDO)"}`,
      });

      // 2. Registra a movimentação do revendedor (tipo: "venda" para manter compatibilidade com painéis financeiros)
      const motivoMov = `Ativação App: ${appNomeLimpo}${macLimpo ? ` (${macLimpo})` : ""}${clienteDesc ? ` [${clienteDesc}]` : ""} — ${nDias} dias${isPago ? "" : " (DEVENDO)"}`;
      const { data: movCriada, error: errMov } = await supabase
        .from("revendedores_movimentacoes")
        .insert({
          user_id: user.id,
          revendedor_id: revendedorAtual.id,
          servidor_id: servidorId,
          tipo: "venda",
          quantidade: nFracao,
          valor_pago: nValor,
          custo: nCusto,
          lucro: isPago ? lucroPrevisto : -nCusto,
          motivo: motivoMov,
          status_pagamento: isPago ? "pago" : "devendo",
          status_venda: "concluida",
        } as any)
        .select()
        .single();
      if (errMov) throw errMov;

      // 3. Se for DEVENDO, marca o revendedor como devendo
      if (!isPago) {
        await supabase
          .from("revendedores")
          .update({ status_pagamento: "devendo" } as any)
          .eq("id", revendedorAtual.id);
      }

      // 4. Registra na tabela global de ativações de apps
      const nomeIdentificacao = `Rev: ${revendedorAtual.nome}${clienteDesc ? ` (${clienteDesc})` : ""}`;
      const { data: ativCriada } = await supabase
        .from("ativacoes_apps")
        .insert({
          user_id: user.id,
          servidor_id: servidorId,
          cliente_nome: nomeIdentificacao,
          mac: macLimpo,
          device: deviceLimpo || null,
          aplicativo: appNomeLimpo,
          valor: isPago ? nValor : 0,
          custo: nCusto,
          dias_validade: nDias,
          ativado_em: agora.toISOString(),
          expira_em: expira.toISOString(),
          observacao: `Revendedor: ${revendedorAtual.nome}${obs ? ` | ${obs}` : ""}${isPago ? "" : " [DEVENDO]"}`,
        } as any)
        .select("*, servidor:servidores(id, nome, categoria, custo_mensal)")
        .single();

      // 5. Registra no histórico financeiro
      await supabase.from("historico_financeiro").insert({
        user_id: user.id,
        tipo: isPago ? "ativacao_app" : "revendedor_devendo",
        valor: isPago ? nValor : 0,
        custo: nCusto,
        lucro: isPago ? lucroPrevisto : -nCusto,
        descricao: isPago
          ? `Ativação app ${appNomeLimpo} p/ revendedor ${revendedorAtual.nome}`
          : `Ativação app ${appNomeLimpo} p/ revendedor ${revendedorAtual.nome} (DEVENDO — custo debitado)`,
      });

      // 6. Registra no log de auditoria
      await logAudit({
        categoria: "venda_credito",
        acao: "ativacao_app",
        descricao: `Ativação de app ${appNomeLimpo} p/ revendedor ${revendedorAtual.nome} (${isPago ? "PAGO" : "DEVENDO"})`,
        entidade: "revendedores",
        entidade_id: revendedorAtual.id,
        entidade_nome: revendedorAtual.nome,
        metadata: {
          aplicativo: appNomeLimpo,
          mac: macLimpo,
          device: deviceLimpo,
          creditos: nFracao,
          valor: nValor,
          custo: nCusto,
          pago: isPago,
        },
      });

      // 7. Prepara os dados para o comprovante
      const compData: ComprovanteData = {
        id: (ativCriada as any)?.id || (movCriada as any)?.id,
        cliente_nome: nomeIdentificacao,
        aplicativo: appNomeLimpo,
        mac: macLimpo,
        device: deviceLimpo || undefined,
        ativado_em: agora.toISOString(),
        expira_em: expira.toISOString(),
        servidor_nome: servidorAtual?.nome || "Servidor",
        observacao: obs || undefined,
      };

      setResultadoComprovante(compData);
      setComprovanteModalOpen(true);

      toast.success(
        isPago
          ? `Aplicativo ${appNomeLimpo} ativado com sucesso! ${currencyBRL(nValor)} lançado no faturamento.`
          : `Aplicativo ${appNomeLimpo} ativado como DEVENDO. Crédito debitado e listado em Vendas Pendentes.`
      );

      // Invalida todas as consultas para atualizar a tela em tempo real
      qc.invalidateQueries({ queryKey: ["revendedores"] });
      qc.invalidateQueries({ queryKey: ["revendedores_movs"] });
      qc.invalidateQueries({ queryKey: ["creditos_saldos"] });
      qc.invalidateQueries({ queryKey: ["creditos_movs"] });
      qc.invalidateQueries({ queryKey: ["ativacoes_apps"] });
      qc.invalidateQueries({ queryKey: ["faturamento_bruto_dia"] });
      qc.invalidateQueries({ queryKey: ["historico_financeiro"] });
      qc.invalidateQueries();
    } catch (err: any) {
      console.error("Erro ao registrar ativação de aplicativo:", err);
      toast.error(err?.message || "Falha ao registrar ativação");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-sky-400" />
              Ativar Aplicativo para Revendedor
            </DialogTitle>
            <DialogDescription>
              Ative um aplicativo debitando créditos do servidor e registre como <strong>Pago</strong> (somando ao faturamento de hoje) ou <strong>Devendo</strong> (fiado pendente).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-1">
            {/* 1. Revendedor & Servidor */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1">
                  <Users className="h-3.5 w-3.5 text-primary" />
                  Revendedor *
                </Label>
                {revendedorPreselecionado?.id ? (
                  <div className="h-9 px-3 rounded-md border bg-muted/40 flex items-center text-xs font-semibold">
                    {revendedorPreselecionado.nome}
                  </div>
                ) : (
                  <Select value={revendedorId} onValueChange={handleRevendedorChange}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Selecione o revendedor..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      {revendedores.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.nome} {r.servidor?.nome ? `(${r.servidor.nome})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs flex items-center gap-1">
                    <Server className="h-3.5 w-3.5 text-sky-400" />
                    Servidor (debitar crédito) *
                  </Label>
                  {servidorId && (
                    <span className={cn("text-[11px] font-semibold", saldoInsuficiente ? "text-red-400" : "text-emerald-400")}>
                      Saldo: {saldoServidor} créd
                    </span>
                  )}
                </div>
                <Select value={servidorId} onValueChange={setServidorId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecione o servidor..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    <ServidorSelectItems servidores={servidores as any[]} />
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 2. Seleção de Aplicativo (Catálogo + Custom) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1 font-semibold">
                  <Smartphone className="h-3.5 w-3.5 text-sky-400" />
                  Aplicativo *
                </Label>
                {catalogoApps.length > 0 && (
                  <span className="text-[11px] text-muted-foreground">
                    {catalogoApps.length} apps no catálogo
                  </span>
                )}
              </div>

              {catalogoApps.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pb-1 max-h-24 overflow-y-auto">
                  {catalogoApps.map((a) => {
                    const isSel = aplicativo.trim().toUpperCase() === a.nome.trim().toUpperCase();
                    return (
                      <button
                        type="button"
                        key={a.id}
                        onClick={() => handleSelectApp(a.nome)}
                        className={cn(
                          "px-2 py-0.5 rounded text-[11px] font-medium border transition-colors cursor-pointer",
                          isSel
                            ? "bg-sky-500 text-white border-sky-600 shadow-xs"
                            : "bg-muted/40 hover:bg-muted text-foreground border-border/60"
                        )}
                      >
                        {a.nome} · {currencyBRL(a.valor_venda)}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="relative">
                <Input
                  value={aplicativo}
                  onChange={(e) => handleSelectApp(e.target.value)}
                  placeholder="Nome do aplicativo (ex.: UNITV, IBO PLAYER, DUPLEX...)"
                  className="h-9 text-xs uppercase"
                  list="apps-catalogo-rev-list"
                />
                <datalist id="apps-catalogo-rev-list">
                  {catalogoApps.map((a) => (
                    <option key={a.id} value={a.nome}>
                      Venda: {currencyBRL(a.valor_venda)} | Custo: {currencyBRL(a.custo)}
                    </option>
                  ))}
                </datalist>
              </div>
            </div>

            {/* 3. Dados do Aparelho (MAC e Device/Chave) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-xs">Endereço MAC *</Label>
                <Input
                  value={mac}
                  onChange={(e) => setMac(maskMAC(e.target.value))}
                  placeholder="00:1A:79:XX:XX:XX"
                  className="h-9 text-xs font-mono uppercase"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Device Key / Chave / Login</Label>
                <Input
                  value={device}
                  onChange={(e) => setDevice(e.target.value)}
                  placeholder="Device Key ou login (opcional)"
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {/* 4. Cliente Final do Revendedor & Validade */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-xs">Cliente Final (opcional)</Label>
                <Input
                  value={clienteFinal}
                  onChange={(e) => setClienteFinal(e.target.value)}
                  placeholder="Nome do cliente do revendedor"
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Validade (dias)</Label>
                <Input
                  type="number"
                  min="1"
                  value={dias}
                  onChange={(e) => setDias(e.target.value)}
                  placeholder="365"
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {/* 5. Valores & Créditos */}
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              <div className="space-y-1">
                <Label className="text-xs">Créditos a descontar</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={fracaoCreditos}
                  onChange={(e) => setFracaoCreditos(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Valor cobrado (Venda)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={valorVenda}
                  onChange={(e) => setValorVenda(e.target.value)}
                  className="h-9 text-xs font-bold text-foreground"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Custo</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={custo}
                  onChange={(e) => setCusto(e.target.value)}
                  className="h-9 text-xs text-red-400"
                />
              </div>
            </div>

            {/* 6. Opção de Pagamento: PAGO vs DEVENDO (Fiado) */}
            <div className="space-y-2 pt-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Condição de Pagamento
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <Card
                  onClick={() => setStatusPagamento("pago")}
                  className={cn(
                    "p-3 cursor-pointer transition-all border flex flex-col gap-1",
                    isPago
                      ? "border-emerald-500/60 bg-emerald-500/10 ring-1 ring-emerald-500/40"
                      : "hover:border-border/80 bg-card/60"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      Pago (Recebido agora)
                    </span>
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/20 text-emerald-400 border-emerald-500/40">
                      Entra no Faturamento
                    </Badge>
                  </div>
                  <span className="text-[11px] text-muted-foreground leading-snug">
                    Soma <strong>{currencyBRL(nValor)}</strong> no faturamento e lucro do dia de hoje.
                  </span>
                </Card>

                <Card
                  onClick={() => setStatusPagamento("devendo")}
                  className={cn(
                    "p-3 cursor-pointer transition-all border flex flex-col gap-1",
                    !isPago
                      ? "border-red-500/60 bg-red-500/10 ring-1 ring-red-500/40"
                      : "hover:border-border/80 bg-card/60"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-red-400 flex items-center gap-1.5">
                      <DollarSign className="h-4 w-4 text-red-400" />
                      Devendo (Fiado / Pendente)
                    </span>
                    <Badge variant="outline" className="text-[10px] bg-red-500/20 text-red-400 border-red-500/40">
                      Não soma venda
                    </Badge>
                  </div>
                  <span className="text-[11px] text-muted-foreground leading-snug">
                    Desconta crédito e custo. <strong>NÃO</strong> soma a venda agora; entrará no faturamento após clicar em "Tornar Pago".
                  </span>
                </Card>
              </div>
            </div>

            {/* 7. Resumo da Operação */}
            <div className="rounded-lg bg-muted/40 border border-border/70 p-2.5 flex items-center justify-between text-xs">
              <div className="space-y-0.5">
                <span className="text-muted-foreground text-[11px]">Lucro Previsto:</span>
                <span className={cn("block font-bold text-sm", lucroPrevisto >= 0 ? "text-emerald-400" : "text-red-400")}>
                  {currencyBRL(lucroPrevisto)}
                </span>
              </div>
              <div className="text-right space-y-0.5">
                <span className="text-muted-foreground text-[11px]">Débito no Servidor:</span>
                <span className="block font-semibold text-sky-400">
                  -{nFracao} créd ({servidorAtual?.nome || "-"})
                </span>
              </div>
            </div>

            {/* 8. Observações */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Observação (opcional)</Label>
              <Input
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder="Anotações internas sobre esta ativação..."
                className="h-8 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2 border-t border-border/50">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSalvar}
              disabled={saving}
              className={cn(
                "gap-1.5",
                isPago ? "bg-emerald-600 hover:bg-emerald-500" : "bg-sky-600 hover:bg-sky-500"
              )}
            >
              <Smartphone className="h-4 w-4" />
              {saving ? "Registrando ativação..." : isPago ? "Confirmar e Ativar (Pago)" : "Registrar Ativação (Devendo)"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal com visualização e exportação do comprovante (PNG, PDF, Copiar) */}
      <ComprovanteAtivacaoModal
        open={comprovanteModalOpen}
        onOpenChange={setComprovanteModalOpen}
        data={resultadoComprovante}
        clienteTelefone={revendedorAtual?.telefone}
      />
    </>
  );
}
