import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchServidores } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClipboardCopy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { currencyBRL, maskMAC, whatsappLink } from "@/lib/iptv";
import { comprovanteAtivacao } from "@/lib/ativacao";
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

  const [servidorId, setServidorId] = useState("");
  const [clienteNome, setClienteNome] = useState("");
  const [mac, setMac] = useState("");
  const [device, setDevice] = useState("");
  const [aplicativo, setAplicativo] = useState("");
  const [valorPago, setValorPago] = useState("");
  const [fracao, setFracao] = useState("1");
  const [expiraEmStr, setExpiraEmStr] = useState(() => toLocalInput(new Date(Date.now() + 30 * 86400000)));
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
    setAplicativo(cliente.aplicativo ?? "");
    setValorPago(cliente.valor_pago ? String(cliente.valor_pago) : "25");
    setFracao("1");
    setExpiraEmStr(toLocalInput(add365Days(new Date())));
    setObs(cliente.observacao ?? "");
    setResultado(null);
  }, [open, cliente, servidores]);

  const servidor = (servidores as any[]).find((s) => s.id === servidorId);
  const custoMensal = Number(servidor?.custo_mensal || 0);
  const fracaoNum = Number(String(fracao).replace(",", ".")) || 0;
  const custoProporcional = custoMensal * fracaoNum;
  const lucroEstimado = (Number(valorPago) || 0) - custoProporcional;

  const copiar = async (a: any) => {
    await navigator.clipboard.writeText(comprovanteAtivacao(a));
    toast.success("Informações da ativação copiadas");
  };

  const salvar = async () => {
    if (!servidorId) return toast.error("Selecione o servidor");
    if (!device.trim() && !mac.trim()) return toast.error("Informe o MAC ou o Device");
    const ativadoEm = new Date();
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
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao registrar ativação");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open && !resultado} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ativar aplicativo — {cliente?.nome ?? ""}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Servidor</Label>
              <Select value={servidorId} onValueChange={setServidorId}>
                <SelectTrigger><SelectValue placeholder="Selecione o servidor" /></SelectTrigger>
                <SelectContent>
                  <ServidorSelectItems servidores={servidores as any[]} />
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Cliente</Label>
              <Input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Aplicativo</Label>
              <Input
                value={aplicativo}
                onChange={(e) => setAplicativo(e.target.value.toUpperCase())}
                placeholder="Ex.: IBO PLAYER"
                className="uppercase"
              />
            </div>
            <div className="space-y-1">
              <Label>MAC</Label>
              <Input value={mac} onChange={(e) => setMac(maskMAC(e.target.value))} placeholder="00:1A:2B:3C:4D:5E" className="font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="h-5 flex items-center">Device</Label>
              <Input value={device} onChange={(e) => setDevice(e.target.value)} placeholder="123456" />
            </div>
            <div className="space-y-1">
              <Label className="h-5 flex items-center whitespace-nowrap">Vencimento (365 dias)</Label>
              <Input type="datetime-local" value={expiraEmStr} onChange={(e) => setExpiraEmStr(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Crédito utilizado (fracionado)</Label>
              <Input type="number" step="0.1" min="0" value={fracao} onChange={(e) => setFracao(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Valor pago pelo cliente</Label>
              <Input type="number" step="0.01" value={valorPago} onChange={(e) => setValorPago(e.target.value)} placeholder="25,00" />
            </div>
            <div className="space-y-1">
              <Label>Custo proporcional</Label>
              <Input value={currencyBRL(custoProporcional)} readOnly className="bg-muted/50" />
            </div>
            <div className="sm:col-span-3 space-y-1">
              <Label>Observação</Label>
              <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
            </div>
            <div className="sm:col-span-3 text-sm text-muted-foreground">
              Lucro estimado: <span className="font-semibold text-foreground">{currencyBRL(lucroEstimado)}</span>
            </div>
          </div>
          <DialogFooter>
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
