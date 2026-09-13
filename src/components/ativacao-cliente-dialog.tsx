import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchServidores } from "@/lib/queries";
import { fetchAplicativosCatalogo, AplicativoCatalogo } from "@/lib/aplicativos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Smartphone, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { currencyBRL, maskMAC } from "@/lib/iptv";
import { cn } from "@/lib/utils";
import { ServidorSelectItems } from "@/lib/servidores-ui";
import { logAudit } from "@/lib/audit";
import { findAtivaAppServer, add365Days } from "@/lib/comprovante-ativacao-generator";
import { ComprovanteAtivacaoModal } from "@/components/comprovante-ativacao-modal";
import { registrarMovimentacaoCredito } from "@/lib/creditos";

function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Atalho de Ativação de Aplicativos a partir da linha de um cliente. */
export function AtivacaoClienteDialog({
  cliente,
  open,
  onOpenChange,
}: {
  cliente: any | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data: servidores = [] } = useQuery({ queryKey: ["servidores"], queryFn: fetchServidores });
  const { data: catalogoApps = [] } = useQuery<AplicativoCatalogo[]>({
    queryKey: ["aplicativos_catalogo"],
    queryFn: fetchAplicativosCatalogo,
  });

  const [servidorId, setServidorId] = useState("");
  const [clienteNome, setClienteNome] = useState("");
  const [mac, setMac] = useState("");
  const [device, setDevice] = useState("");
  const [aplicativo, setAplicativo] = useState("");
  const [valorPago, setValorPago] = useState("");
  const [fracao, setFracao] = useState("1");
  const [ativadoEmStr, setAtivadoEmStr] = useState("");
  const [expiraEmStr, setExpiraEmStr] = useState("");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);
  const [resultado, setResultado] = useState<any | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  const limparErro = (campo: string) => {
    if (erros[campo]) {
      setErros((prev) => {
        const next = { ...prev };
        delete next[campo];
        return next;
      });
    }
  };

  useEffect(() => {
    setErros({});
    if (!open || !cliente) return;
    const ativaServer = (servidores as any[]).find((s) => s?.nome?.trim().toUpperCase() === "ATIVA APP") || findAtivaAppServer(servidores as any[]);
    const defaultServer = ativaServer?.id || (servidores as any[])[0]?.id || "";
    setServidorId(defaultServer);
    setClienteNome(cliente.nome ?? "");
    setMac(cliente.mac ?? "");
    setDevice(cliente.device ?? "");
    const appNome = (cliente.aplicativo ?? "").toUpperCase();
    setAplicativo(appNome);

    const match = catalogoApps.find((a) => a.nome.toUpperCase() === appNome.trim());
    if (match) {
      setValorPago(String(match.valor_venda));
    } else if (cliente.valor_pago) {
      setValorPago(String(cliente.valor_pago));
    } else {
      setValorPago("25");
    }

    setFracao("1");
    const agora = new Date();
    setAtivadoEmStr(toLocalInput(agora));
    setExpiraEmStr(toLocalInput(add365Days(agora)));
    setObs(cliente.observacao ?? "");
    setResultado(null);
  }, [open, cliente, servidores, catalogoApps]);

  const appMatched = useMemo(() => {
    const norm = aplicativo.trim().toUpperCase();
    if (!norm) return null;
    return catalogoApps.find((a) => a.nome.trim().toUpperCase() === norm) || null;
  }, [aplicativo, catalogoApps]);

  const servidor = (servidores as any[]).find((s) => s.id === servidorId);
  const custoMensal = Number(servidor?.custo_mensal || 0);
  const fracaoNum = Number(String(fracao).replace(",", ".")) || 0;

  // Custo base vem do catálogo do app se existente; senão, do servidor
  const custoUnitario = appMatched && appMatched.custo !== undefined ? Number(appMatched.custo) : custoMensal;
  const custoProporcional = custoUnitario * fracaoNum;
  const lucroEstimado = (Number(valorPago) || 0) - custoProporcional;

  const reset = () => {
    setErros({});
    const ativaServer = (servidores as any[]).find((s) => s?.nome?.trim().toUpperCase() === "ATIVA APP") || findAtivaAppServer(servidores as any[]);
    const defaultServer = ativaServer?.id || (servidores as any[])[0]?.id || "";
    setServidorId(defaultServer);
    setClienteNome(cliente?.nome ?? "");
    setMac(cliente?.mac ?? "");
    setDevice(cliente?.device ?? "");
    setAplicativo((cliente?.aplicativo ?? "").toUpperCase());
    setValorPago(cliente?.valor_pago ? String(cliente.valor_pago) : "25");
    setFracao("1");
    const agora = new Date();
    setAtivadoEmStr(toLocalInput(agora));
    setExpiraEmStr(toLocalInput(add365Days(agora)));
    setObs(cliente?.observacao ?? "");
  };

  const selecionarAppCatalogo = (app: any) => {
    if (!app) return;
    setAplicativo(app.nome);
    setValorPago(String(app.valor_venda));
    limparErro("aplicativo");
    limparErro("valorPago");
    if (app.fracao_creditos !== undefined && app.fracao_creditos !== null) {
      setFracao(String(app.fracao_creditos));
      limparErro("fracao");
    }
  };

  const salvar = async () => {
    const novosErros: Record<string, string> = {};
    const pendentes: string[] = [];

    if (!servidorId) {
      novosErros.servidor = "Selecione o servidor";
      pendentes.push("Servidor");
    }
    if (!clienteNome.trim()) {
      novosErros.cliente = "Informe o nome do cliente";
      pendentes.push("Cliente");
    }
    if (!aplicativo.trim()) {
      novosErros.aplicativo = "Informe o nome do aplicativo";
      pendentes.push("Aplicativo");
    }
    if (!mac.trim()) {
      novosErros.mac = "Informe o endereço MAC";
      pendentes.push("MAC");
    }
    if (!ativadoEmStr.trim()) {
      novosErros.ativadoEm = "Informe a data de ativação";
      pendentes.push("Data de ativação");
    }
    if (!expiraEmStr.trim()) {
      novosErros.expiraEm = "Informe a data de vencimento";
      pendentes.push("Vencimento");
    } else {
      const ativadoEm = new Date(ativadoEmStr);
      const expira = new Date(expiraEmStr);
      if (isNaN(expira.getTime())) {
        novosErros.expiraEm = "Data de vencimento inválida";
        pendentes.push("Vencimento (data inválida)");
      } else if (!isNaN(ativadoEm.getTime()) && expira <= ativadoEm) {
        novosErros.expiraEm = "O vencimento deve ser após a ativação";
        pendentes.push("Vencimento (deve ser posterior à ativação)");
      }
    }
    if (!String(fracao).trim() || !(fracaoNum > 0)) {
      novosErros.fracao = "Informe a fração de créditos (maior que zero)";
      pendentes.push("Crédito (fração)");
    }
    if (!String(valorPago).trim() || isNaN(Number(valorPago)) || Number(valorPago) < 0) {
      novosErros.valorPago = "Informe o valor cobrado";
      pendentes.push("Valor cobrado");
    }

    if (pendentes.length > 0) {
      setErros(novosErros);
      if (pendentes.length === 1) {
        toast.error(`O campo "${pendentes[0]}" é obrigatório para concluir a ativação.`);
      } else {
        toast.error(`Preencha todos os campos obrigatórios. Faltando: ${pendentes.join(", ")}.`);
      }
      return;
    }

    setErros({});
    const ativadoEm = new Date(ativadoEmStr);
    const expira = new Date(expiraEmStr);
    setSaving(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Não autenticado");
      const dias = Math.max(1, Math.round((expira.getTime() - ativadoEm.getTime()) / 86400000));
      const payload = {
        user_id: user.id,
        servidor_id: servidorId,
        cliente_nome: clienteNome.trim() || null,
        mac: mac.trim() || null,
        device: device.trim() || null,
        aplicativo: aplicativo.trim() || null,
        valor: Number(valorPago) || 0,
        custo: Number(custoProporcional.toFixed(2)),
        dias_validade: dias,
        ativado_em: ativadoEm.toISOString(),
        expira_em: expira.toISOString(),
        observacao: obs.trim() || null,
      };
      const { data, error } = await supabase
        .from("ativacoes_apps")
        .insert(payload)
        .select("*, servidor:servidores(id, nome, categoria, custo_mensal)")
        .single();
      if (error) throw error;

      await supabase.from("historico_financeiro").insert({
        user_id: user.id,
        tipo: "ativacao_app",
        valor: payload.valor,
        custo: payload.custo,
        lucro: payload.valor - payload.custo,
        descricao: `Ativação de aplicativo ${payload.aplicativo ?? ""} (${payload.device ?? payload.mac}) — ${servidor?.nome ?? ""}`,
      });

      // Registra desconto proporcional/fracionado de créditos no servidor
      await registrarMovimentacaoCredito({
        servidor_id: servidorId,
        quantidade: -fracaoNum,
        tipo: "ativacao",
        motivo: `Ativação de app ${payload.aplicativo ?? ""} (${payload.device ?? payload.mac})`,
        cliente_id: cliente?.id ?? null,
      });

      toast.success("Ativação registrada");
      await logAudit({
        categoria: "outro",
        acao: "criar",
        descricao: `Ativação de aplicativo ${payload.aplicativo ?? ""} para o cliente ${payload.cliente_nome ?? "-"} no servidor ${servidor?.nome ?? "-"}`,
        entidade: "ativacoes_apps",
        entidade_id: (data as any)?.id,
        metadata: { valor: payload.valor, custo: payload.custo },
      });
      setResultado(data);
      qc.invalidateQueries({ queryKey: ["ativacoes_apps"] });
      qc.invalidateQueries({ queryKey: ["clientes"] });
      qc.invalidateQueries({ queryKey: ["historico_financeiro"] });
      qc.invalidateQueries({ queryKey: ["faturamento_bruto_dia"] });
      qc.invalidateQueries({ queryKey: ["financeiro_lancamentos"] });
      qc.invalidateQueries({ queryKey: ["creditos_movs"] });
      qc.invalidateQueries({ queryKey: ["creditos_saldos"] });
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao registrar ativação");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog
        open={open && !resultado}
        onOpenChange={(v) => {
          onOpenChange(v);
          if (!v) reset();
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              Ativar aplicativo — {clienteNome || cliente?.nome || "Cliente"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-3 pt-2">
            {Object.keys(erros).length > 0 && (
              <div className="sm:col-span-3 p-3 rounded-lg bg-destructive/10 border border-destructive/25 text-destructive text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-semibold">Não é possível ativar sem preencher todos os campos obrigatórios:</p>
                  <p className="text-destructive/90">{Object.values(erros).join(" • ")}</p>
                </div>
              </div>
            )}

            <div className="space-y-1 sm:col-span-3">
              <Label className="text-xs font-semibold flex items-center gap-1">
                Servidor <span className="text-destructive font-bold">*</span>
              </Label>
              <Select
                value={servidorId}
                onValueChange={(val) => {
                  setServidorId(val);
                  limparErro("servidor");
                }}
              >
                <SelectTrigger className={cn("h-9", erros.servidor && "border-destructive focus:ring-destructive")}>
                  <SelectValue placeholder="Selecione o servidor" />
                </SelectTrigger>
                <SelectContent>
                  <ServidorSelectItems servidores={servidores as any[]} />
                </SelectContent>
              </Select>
              {erros.servidor && <p className="text-[11px] text-destructive font-medium">{erros.servidor}</p>}
            </div>

            <div className="space-y-1">
              <div className="h-5 flex items-center">
                <Label className="text-xs font-medium flex items-center gap-1">
                  Cliente <span className="text-destructive font-bold">*</span>
                </Label>
              </div>
              <Input
                value={clienteNome}
                onChange={(e) => {
                  setClienteNome(e.target.value);
                  limparErro("cliente");
                }}
                placeholder="Nome do cliente"
                className={cn("h-9", erros.cliente && "border-destructive focus-visible:ring-destructive")}
              />
              {erros.cliente && <p className="text-[11px] text-destructive font-medium">{erros.cliente}</p>}
            </div>

            <div className="space-y-1">
              <div className="h-5 flex items-center justify-between">
                <Label className="text-xs font-medium flex items-center gap-1">
                  Aplicativo <span className="text-destructive font-bold">*</span>
                </Label>
                {catalogoApps.length > 0 && (
                  <Select
                    value=""
                    onValueChange={(val) => {
                      const found = catalogoApps.find((a) => a.nome === val);
                      if (found) {
                        selecionarAppCatalogo(found);
                        limparErro("aplicativo");
                      }
                    }}
                  >
                    <SelectTrigger className="h-5 text-[11px] px-1.5 py-0 border-dashed text-primary font-medium w-auto gap-0.5">
                      <SelectValue placeholder="Catálogo" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {catalogoApps.map((a) => (
                        <SelectItem key={a.id} value={a.nome}>
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <span className="font-semibold">{a.nome}</span>
                            <span className="text-muted-foreground">
                              Venda: {currencyBRL(a.valor_venda)} • Custo: {currencyBRL(a.custo)}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <Input
                list="catalogo-apps-cliente-modal"
                value={aplicativo}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase();
                  setAplicativo(val);
                  limparErro("aplicativo");
                  const found = catalogoApps.find((a) => a.nome.toUpperCase() === val.trim());
                  if (found) {
                    setValorPago(String(found.valor_venda));
                    limparErro("valorPago");
                    if (found.fracao_creditos !== undefined && found.fracao_creditos !== null) {
                      setFracao(String(found.fracao_creditos));
                      limparErro("fracao");
                    }
                  }
                }}
                placeholder="Ex.: IBO PLAYER"
                className={cn("h-9 uppercase", erros.aplicativo && "border-destructive focus-visible:ring-destructive")}
              />
              {erros.aplicativo && <p className="text-[11px] text-destructive font-medium">{erros.aplicativo}</p>}
              <datalist id="catalogo-apps-cliente-modal">
                {catalogoApps.map((a) => (
                  <option key={a.id} value={a.nome}>
                    Venda: {currencyBRL(a.valor_venda)} (Custo: {currencyBRL(a.custo)})
                  </option>
                ))}
              </datalist>
            </div>

            <div className="space-y-1">
              <div className="h-5 flex items-center">
                <Label className="text-xs font-medium flex items-center gap-1">
                  MAC <span className="text-destructive font-bold">*</span>
                </Label>
              </div>
              <Input
                value={mac}
                onChange={(e) => {
                  setMac(maskMAC(e.target.value));
                  limparErro("mac");
                }}
                placeholder="00:1A:2B:3C:4D:5E"
                className={cn("h-9 font-mono", erros.mac && "border-destructive focus-visible:ring-destructive")}
              />
              {erros.mac && <p className="text-[11px] text-destructive font-medium">{erros.mac}</p>}
            </div>

            <div className="space-y-1">
              <div className="h-5 flex items-center">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  Device <span className="text-[10px] font-normal text-muted-foreground">(opcional)</span>
                </Label>
              </div>
              <Input
                value={device}
                onChange={(e) => setDevice(e.target.value)}
                placeholder="123456 (opcional)"
                className="h-9"
              />
            </div>

            <div className="space-y-1">
              <div className="h-5 flex items-center">
                <Label className="text-xs font-medium whitespace-nowrap flex items-center gap-1">
                  Data de ativação <span className="text-destructive font-bold">*</span>
                </Label>
              </div>
              <Input
                type="datetime-local"
                value={ativadoEmStr}
                onChange={(e) => {
                  const val = e.target.value;
                  setAtivadoEmStr(val);
                  limparErro("ativadoEm");
                  if (val) {
                    const d = new Date(val);
                    if (!isNaN(d.getTime())) {
                      setExpiraEmStr(toLocalInput(add365Days(d)));
                      limparErro("expiraEm");
                    }
                  }
                }}
                className={cn("h-9 text-xs", erros.ativadoEm && "border-destructive focus-visible:ring-destructive")}
              />
              {erros.ativadoEm && <p className="text-[11px] text-destructive font-medium">{erros.ativadoEm}</p>}
            </div>

            <div className="space-y-1">
              <div className="h-5 flex items-center">
                <Label className="text-xs font-medium whitespace-nowrap flex items-center gap-1">
                  Vencimento (1 ano) <span className="text-destructive font-bold">*</span>
                </Label>
              </div>
              <Input
                type="datetime-local"
                value={expiraEmStr}
                onChange={(e) => {
                  setExpiraEmStr(e.target.value);
                  limparErro("expiraEm");
                }}
                className={cn("h-9 text-xs", erros.expiraEm && "border-destructive focus-visible:ring-destructive")}
              />
              {erros.expiraEm && <p className="text-[11px] text-destructive font-medium">{erros.expiraEm}</p>}
            </div>

            <div className="space-y-1">
              <div className="h-5 flex items-center">
                <Label className="text-xs font-medium whitespace-nowrap flex items-center gap-1">
                  Crédito (fração) <span className="text-destructive font-bold">*</span>
                </Label>
              </div>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={fracao}
                onChange={(e) => {
                  setFracao(e.target.value);
                  limparErro("fracao");
                }}
                placeholder="1"
                className={cn("h-9", erros.fracao && "border-destructive focus-visible:ring-destructive")}
              />
              {erros.fracao && <p className="text-[11px] text-destructive font-medium">{erros.fracao}</p>}
            </div>

            <div className="space-y-1">
              <div className="h-5 flex items-center">
                <Label className="text-xs font-medium whitespace-nowrap flex items-center gap-1">
                  Valor cobrado (R$) <span className="text-destructive font-bold">*</span>
                </Label>
              </div>
              <Input
                type="number"
                step="0.01"
                value={valorPago}
                onChange={(e) => {
                  setValorPago(e.target.value);
                  limparErro("valorPago");
                }}
                placeholder="0,00"
                className={cn("h-9", erros.valorPago && "border-destructive focus-visible:ring-destructive")}
              />
              {erros.valorPago && <p className="text-[11px] text-destructive font-medium">{erros.valorPago}</p>}
            </div>

            <div className="space-y-1">
              <div className="h-5 flex items-center">
                <Label className="text-xs font-medium whitespace-nowrap text-muted-foreground">Custo (R$)</Label>
              </div>
              <Input
                value={currencyBRL(custoProporcional)}
                readOnly
                className="h-9 bg-muted/50 font-medium text-muted-foreground"
              />
            </div>

            <div className="sm:col-span-3 space-y-1">
              <div className="h-5 flex items-center">
                <Label className="text-xs font-medium text-muted-foreground">Observação (opcional)</Label>
              </div>
              <Textarea
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                rows={2}
                placeholder="Observações adicionais..."
                className="resize-none"
              />
            </div>

            <div className="sm:col-span-3 text-xs bg-muted/40 p-3 rounded-lg border border-border/50 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {appMatched ? (
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
                    <span>Catálogo: Custo <strong>{currencyBRL(appMatched.custo)}</strong> • Venda sugerida <strong>{currencyBRL(appMatched.valor_venda)}</strong></span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    Servidor: <strong>{servidor?.nome || "ATIVA APP"}</strong>
                  </span>
                )}
              </div>
              <div className="text-right">
                <span className="text-muted-foreground mr-1">Lucro estimado:</span>
                <span className="font-semibold text-emerald-400 text-sm">{currencyBRL(lucroEstimado)}</span>
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-row items-center justify-end gap-2 pt-3 border-t border-border/50">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="h-9 px-4 text-xs font-medium">
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={saving} className="h-9 px-5 text-xs font-medium gap-1.5">
              <Smartphone className="h-3.5 w-3.5" />
              {saving ? "Ativando..." : "Ativar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ComprovanteAtivacaoModal
        open={open && !!resultado}
        onOpenChange={(v) => {
          if (!v) {
            setResultado(null);
            onOpenChange(false);
          }
        }}
        data={resultado}
        clienteTelefone={cliente?.telefone}
      />
    </>
  );
}
