import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ServidorSelectItems } from "@/lib/servidores-ui";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { currencyBRL } from "@/lib/iptv";
import { registrarMovimentacaoCredito } from "@/lib/creditos";
import { logAudit } from "@/lib/audit";

interface EditarVendaFiadaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mov: any | null;
  servidores: any[];
  revendedores: any[];
}

export function EditarVendaFiadaDialog({
  open,
  onOpenChange,
  mov,
  servidores,
  revendedores,
}: EditarVendaFiadaDialogProps) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const [quantidade, setQuantidade] = useState<string>("");
  const [servidorId, setServidorId] = useState<string>("");
  const [valorPago, setValorPago] = useState<string>("");
  const [custoUnitario, setCustoUnitario] = useState<string>("");
  const [motivo, setMotivo] = useState<string>("");

  useEffect(() => {
    if (mov && open) {
      const qtd = Number(mov.quantidade || 0);
      setQuantidade(String(qtd));
      setServidorId(mov.servidor_id || "");
      setValorPago(String(mov.valor_pago ?? ""));
      const custoTot = Number(mov.custo || 0);
      const unit = qtd > 0 ? custoTot / qtd : 0;
      setCustoUnitario(unit > 0 ? unit.toFixed(2) : "");
      setMotivo(mov.motivo || "");
    }
  }, [mov, open]);

  // When server changes, if custoUnitario is empty, populate from server custo_mensal
  function handleServidorChange(sid: string) {
    setServidorId(sid);
    const srv = servidores.find((s) => s.id === sid);
    if (srv && (!custoUnitario || Number(custoUnitario) === 0)) {
      const c = Number(srv.custo_mensal || 0);
      if (c > 0) setCustoUnitario(c.toFixed(2));
    }
  }

  const nQtd = Math.max(0, parseInt(quantidade) || 0);
  const nValor = Math.max(0, parseFloat(valorPago) || 0);
  const nCustoUnit = Math.max(0, parseFloat(custoUnitario) || 0);
  const custoTotal = Math.round(nQtd * nCustoUnit * 100) / 100;
  const lucroPrevisto = Math.round((nValor - custoTotal) * 100) / 100;

  const revNome = mov?.revendedor?.nome ?? revendedores.find((r) => r.id === mov?.revendedor_id)?.nome ?? "Revendedor";

  async function salvar() {
    if (!mov) return;
    if (nQtd < 0) return toast.error("Quantidade inválida");
    if (!servidorId) return toast.error("Selecione um servidor");

    setSaving(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Usuário não autenticado");

      const oldQtd = Number(mov.quantidade || 0);
      const oldServidorId = mov.servidor_id;
      const diffQtd = nQtd - oldQtd;

      // 1. Atualizar saldo de créditos do revendedor se a quantidade mudou
      if (diffQtd !== 0 && mov.revendedor_id) {
        const rev = revendedores.find((r) => r.id === mov.revendedor_id);
        const creditosAtuais = Number(rev?.creditos || 0);
        const novoCreditosRev = Math.max(0, creditosAtuais + diffQtd);
        await supabase
          .from("revendedores")
          .update({
            creditos: novoCreditosRev,
            valor_venda: nValor,
            custo: custoTotal,
            lucro: lucroPrevisto,
          })
          .eq("id", mov.revendedor_id);
      }

      // 2. Ajustar créditos nos servidores
      if (oldServidorId === servidorId) {
        // Mesmo servidor: desconta a diferença
        if (diffQtd !== 0) {
          await registrarMovimentacaoCredito({
            servidor_id: servidorId,
            quantidade: -diffQtd,
            tipo: diffQtd > 0 ? "venda_revendedor" : "ajuste_add",
            motivo: `Correção venda fiada ${revNome} (${diffQtd > 0 ? "+" : ""}${diffQtd} créditos)`,
          });
        }
      } else {
        // Servidor alterado: devolve ao antigo e retira do novo
        if (oldServidorId && oldQtd > 0) {
          await registrarMovimentacaoCredito({
            servidor_id: oldServidorId,
            quantidade: oldQtd,
            tipo: "ajuste_add",
            motivo: `Estorno correção servidor venda fiada ${revNome}`,
          });
        }
        if (servidorId && nQtd > 0) {
          await registrarMovimentacaoCredito({
            servidor_id: servidorId,
            quantidade: -nQtd,
            tipo: "venda_revendedor",
            motivo: `Venda p/ revendedor ${revNome} (servidor corrigido)`,
          });
        }
      }

      // 3. Atualizar o registro da movimentação de venda pendente
      const { error: errUpdate } = await supabase
        .from("revendedores_movimentacoes")
        .update({
          quantidade: nQtd,
          servidor_id: servidorId,
          valor_pago: nValor,
          custo: custoTotal,
          lucro: lucroPrevisto,
          motivo: motivo || `Venda ${nQtd} créditos (DEVENDO)`,
        } as any)
        .eq("id", mov.id);

      if (errUpdate) throw errUpdate;

      // 4. Log de auditoria detalhado
      await logAudit({
        categoria: "venda_credito",
        acao: "editar",
        descricao: `Venda fiada de ${revNome} corrigida: ${oldQtd} → ${nQtd} créd, a receber ${currencyBRL(nValor)}`,
        entidade: "revendedores_movimentacoes",
        entidade_id: mov.id,
        entidade_nome: revNome,
        dados_anteriores: mov,
        dados_novos: {
          quantidade: nQtd,
          servidor_id: servidorId,
          valor_pago: nValor,
          custo: custoTotal,
          lucro: lucroPrevisto,
          motivo,
        },
      });

      toast.success("Venda fiada corrigida com sucesso!");
      qc.invalidateQueries({ queryKey: ["revendedores_movs"] });
      qc.invalidateQueries({ queryKey: ["revendedores"] });
      qc.invalidateQueries({ queryKey: ["creditos_saldos"] });
      qc.invalidateQueries({ queryKey: ["creditos_movs"] });
      qc.invalidateQueries({ queryKey: ["creditos_compras"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar correção da venda fiada");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Venda Pendente (Fiado)</DialogTitle>
        </DialogHeader>

        <div className="space-y-3.5 text-sm">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            <span className="font-semibold text-amber-400">Revendedor: {revNome}</span>
            <p className="mt-1 text-muted-foreground text-[11px]">
              Altere a quantidade de créditos, servidor ou valores combinados caso tenha ocorrido algum erro no lançamento fiado. O estoque do servidor e saldo do revendedor serão ajustados automaticamente.
            </p>
          </div>

          <div>
            <Label className="text-xs">Servidor</Label>
            <Select value={servidorId} onValueChange={handleServidorChange}>
              <SelectTrigger className="h-9 mt-1">
                <SelectValue placeholder="Selecione o servidor..." />
              </SelectTrigger>
              <SelectContent>
                <ServidorSelectItems servidores={servidores as any[]} />
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Quantidade de Créditos</Label>
              <Input
                type="number"
                min="0"
                className="h-9 mt-1"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Custo Unitário (R$)</Label>
              <Input
                type="number"
                step="0.01"
                className="h-9 mt-1"
                placeholder="Ex: 5.00"
                value={custoUnitario}
                onChange={(e) => setCustoUnitario(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Valor a Receber (Venda R$)</Label>
              <Input
                type="number"
                step="0.01"
                className="h-9 mt-1"
                placeholder="Ex: 50.00"
                value={valorPago}
                onChange={(e) => setValorPago(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Custo Total Debitado</Label>
              <div className="h-9 mt-1 px-3 flex items-center rounded-md border border-input bg-muted/40 font-mono text-xs text-red-400">
                {currencyBRL(custoTotal)}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-card/60 p-3 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">Lucro Previsto ao Quitar:</div>
            <div className={`font-semibold text-sm ${lucroPrevisto >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {currencyBRL(lucroPrevisto)}
            </div>
          </div>

          <div>
            <Label className="text-xs">Observação / Motivo</Label>
            <Input
              className="h-9 mt-1 text-xs"
              placeholder="Ex: Correção de quantidade acordada no WhatsApp"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={saving} className="bg-primary text-primary-foreground">
            {saving ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
