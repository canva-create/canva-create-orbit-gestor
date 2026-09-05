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
import { Smartphone } from "lucide-react";
import { toast } from "sonner";
import { currencyBRL, maskMAC } from "@/lib/iptv";
import { ServidorSelectItems } from "@/lib/servidores-ui";
import { logAudit } from "@/lib/audit";
import { findAtivaAppServer, add365Days } from "@/lib/comprovante-ativacao-generator";
import { ComprovanteAtivacaoModal } from "@/components/comprovante-ativacao-modal";

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

  useEffect(() => {
    if (!open || !cliente) return;
    const ativaServer = (servidores as any[]).find((s) => s?.nome?.trim().toUpperCase() === "ATIVA APP") || findAtivaAppServer(servidores as any[]);
    const defaultServer = cliente.servidor_id || ativaServer?.id || (servidores[0]?.id ?? "");
    setServidorId(defaultServer);
    setClienteNome(cliente.nome ?? "");
    setMac(cliente.mac ?? "");
    setDevice(cliente.device ?? "");
    const appNome = (cliente.aplicativo ?? "").toUpperCase();
    setAplicativo(appNome);

    const match = catalogoApps.find((a) => a.nome.toUpperCase() === appNome.trim());
    if (cliente.valor_pago) {
      setValorPago(String(cliente.valor_pago));
    } else if (match) {
      setValorPago(String(match.valor_venda));
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
    const ativaServer = (servidores as any[]).find((s) => s?.nome?.trim().toUpperCase() === "ATIVA APP") || findAtivaAppServer(servidores as any[]);
    const defaultServer = cliente?.servidor_id || ativaServer?.id || (servidores[0]?.id ?? "");
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
  };

  const salvar = async () => {
    if (!servidorId) return toast.error("Selecione o servidor");
    if (!device.trim() && !mac.trim()) return toast.error("Informe o MAC ou o Device");
    const ativadoEm = new Date(ativadoEmStr);
    const expira = new Date(expiraEmStr);
    if (isNaN(expira.getTime())) return toast.error("Informe uma data de vencimento válida");
    if (expira <= ativadoEm) return toast.error("O vencimento deve ser após a ativação");
    if (!(fracaoNum > 0)) return toast.error("Informe a fração de crédito utilizada");
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
            <div className="space-y-1.5 sm:col-span-3">
              <Label>Servidor *</Label>
              <Select value={servidorId} onValueChange={setServidorId}>
                <SelectTrigger><SelectValue placeholder="Selecione o servidor" /></SelectTrigger>
                <SelectContent>
                  <ServidorSelectItems servidores={servidores as any[]} />
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cliente (opcional)</Label>
              <Input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} placeholder="Nome do cliente" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Aplicativo</Label>
                {catalogoApps.length > 0 && (
                  <Select
                    value=""
                    onValueChange={(val) => {
                      const found = catalogoApps.find((a) => a.nome === val);
                      if (found) selecionarAppCatalogo(found);
                    }}
                  >
                    <SelectTrigger className="h-6 text-[11px] px-2 py-0 border-dashed text-primary font-medium w-auto gap-1">
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
                  const found = catalogoApps.find((a) => a.nome.toUpperCase() === val.trim());
                  if (found) {
                    setValorPago(String(found.valor_venda));
                  }
                }}
                placeholder="Ex.: IBO PLAYER"
                className="uppercase"
              />
              <datalist id="catalogo-apps-cliente-modal">
                {catalogoApps.map((a) => (
                  <option key={a.id} value={a.nome}>
                    Venda: {currencyBRL(a.valor_venda)} (Custo: {currencyBRL(a.custo)})
                  </option>
                ))}
              </datalist>
              {appMatched && (
                <p className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                  ✓ Puxado do banco: Custo {currencyBRL(appMatched.custo)} • Venda padrão {currencyBRL(appMatched.valor_venda)}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>MAC</Label>
              <Input value={mac} onChange={(e) => setMac(maskMAC(e.target.value))} placeholder="00:1A:2B:3C:4D:5E" className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="h-5 flex items-center">Device</Label>
              <Input value={device} onChange={(e) => setDevice(e.target.value)} placeholder="123456" />
            </div>
            <div className="space-y-1.5">
              <Label className="h-5 flex items-center whitespace-nowrap">Data de ativação</Label>
              <Input
                type="datetime-local"
                value={ativadoEmStr}
                onChange={(e) => {
                  const val = e.target.value;
                  setAtivadoEmStr(val);
                  if (val) {
                    const d = new Date(val);
                    if (!isNaN(d.getTime())) {
                      setExpiraEmStr(toLocalInput(add365Days(d)));
                    }
                  }
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="h-5 flex items-center whitespace-nowrap">Vencimento (365 dias)</Label>
              <Input type="datetime-local" value={expiraEmStr} onChange={(e) => setExpiraEmStr(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Crédito utilizado (fracionado)</Label>
              <Input type="number" step="0.1" min="0" value={fracao} onChange={(e) => setFracao(e.target.value)} placeholder="1" />
            </div>
            <div className="space-y-1.5">
              <Label>
                Valor cobrado do cliente
                {appMatched && <span className="text-[11px] text-muted-foreground font-normal ml-1">(editável)</span>}
              </Label>
              <Input type="number" step="0.01" value={valorPago} onChange={(e) => setValorPago(e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label>
                {appMatched ? "Custo (banco de dados)" : "Custo proporcional"}
              </Label>
              <Input value={currencyBRL(custoProporcional)} readOnly className="bg-muted/50 font-medium text-muted-foreground" />
            </div>
            <div className="sm:col-span-3 space-y-1.5">
              <Label>Observação</Label>
              <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} placeholder="Observações adicionais..." />
            </div>
            <div className="sm:col-span-3 text-sm text-muted-foreground bg-muted/40 p-3 rounded-lg border border-border/50">
              Lucro estimado desta ativação:{" "}
              <span className="font-semibold text-emerald-400">{currencyBRL(lucroEstimado)}</span>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving}>{saving ? "Ativando..." : "Ativar"}</Button>
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
