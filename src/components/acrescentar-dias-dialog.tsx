import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ServidorSelectItems } from "@/lib/servidores-ui";
import { useQuery } from "@tanstack/react-query";
import { addDaysISO, currencyBRL, diasParaVencer, formatDateBR, toISODate } from "@/lib/iptv";
import { creditosPorDias, registrarMovimentacaoCredito } from "@/lib/creditos";
import { logAudit } from "@/lib/audit";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { confirmDialog } from "@/lib/confirm";

const OPCOES = [
  { dias: 30, label: "30 dias" },
  { dias: 31, label: "31 dias" },
  { dias: 60, label: "60 dias" },
  { dias: 62, label: "62 dias" },
  { dias: 90, label: "90 dias" },
  { dias: 93, label: "93 dias" },
  { dias: 180, label: "180 dias" },
  { dias: 186, label: "186 dias" },
  { dias: 365, label: "365 dias" },
];

export function AcrescentarDiasDialog({
  cliente,
  open,
  onOpenChange,
}: {
  cliente: any | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [dias, setDias] = useState(30);
  const [diasCustom, setDiasCustom] = useState("");
  const [valorStr, setValorStr] = useState("");
  const [statusPag, setStatusPag] = useState<"pago" | "devendo">("pago");
  const [saving, setSaving] = useState(false);
  const [servidorId, setServidorId] = useState<string>("");

  const { data: servidores = [] } = useQuery({
    queryKey: ["servidores-renovacao"],
    queryFn: async () => {
      const { data, error } = await supabase.from("servidores").select("*").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (open) {
      setDias(30);
      setDiasCustom("");
      setValorStr(cliente?.valor_pago ? String(cliente.valor_pago) : "");
      setStatusPag("pago");
      setServidorId(cliente?.servidor_id ?? "");
    }
  }, [open, cliente]);

  const servidorSel = (servidores as any[]).find((s) => s.id === servidorId) ?? null;
  const custoMensal = Number(
    servidorSel?.custo_mensal ?? cliente?.servidor?.custo_mensal ?? cliente?.custo_snapshot ?? 0,
  );
  const diasEfetivos = Math.max(0, Math.floor(Number(diasCustom) > 0 ? Number(diasCustom) : dias));
  const creditos = useMemo(() => creditosPorDias(diasEfetivos), [diasEfetivos]);
  const custo = useMemo(() => custoMensal * creditos, [custoMensal, creditos]);
  const valor = Number(valorStr.replace(",", ".")) || 0;
  const lucroSePago = valor - custo;
  const lucroEfetivo = statusPag === "pago" ? lucroSePago : -custo;
  const hojeISO = toISODate(new Date());
  const diasRestantes = cliente?.data_vencimento ? diasParaVencer(cliente.data_vencimento) ?? 0 : 0;
  const baseVenc = cliente?.data_vencimento && diasRestantes >= 0 ? cliente.data_vencimento : hojeISO;
  const novoVenc = cliente ? addDaysISO(baseVenc, diasEfetivos) : null;
  const totalDiasApos = novoVenc ? diasParaVencer(novoVenc) ?? diasEfetivos : diasEfetivos;

  async function confirmar() {
    if (!cliente) return;
    if (diasEfetivos <= 0) {
      toast.error("Informe uma quantidade de dias válida.");
      return;
    }
    if (valor <= 0) {
      toast.error("Informe o valor pago pelo cliente.");
      return;
    }
    const ok = await confirmDialog({
      title: "Confirmar valor da renovação",
      description: `Cliente: ${cliente.nome}\nDias: ${diasEfetivos}\nValor ${statusPag === "pago" ? "recebido" : "pendente"}: ${currencyBRL(valor)}\nCusto: ${currencyBRL(custo)}\nLucro: ${currencyBRL(lucroSePago)}\n\nConfirma este valor para o lançamento financeiro?`,
      confirmText: "Confirmar valor",
    });
    if (!ok) return;
    setSaving(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;
      const baseFinal = cliente.data_vencimento && diasRestantes >= 0 ? cliente.data_vencimento : toISODate(new Date());
      const novo = addDaysISO(baseFinal, diasEfetivos);
      const { error } = await supabase.from("clientes").update({
        data_vencimento: novo,
        valor_pago: valor,
        status_pagamento: statusPag,
        status: "ativo",
        ...(servidorId ? { servidor_id: servidorId } : {}),
      }).eq("id", cliente.id);
      if (error) return toast.error(error.message);
      await supabase.from("historico_renovacoes").insert({
        user_id: user.id,
        cliente_id: cliente.id,
        dias_adicionados: diasEfetivos,
        valor_recebido: statusPag === "pago" ? valor : 0,
        valor_pendente: statusPag === "devendo" ? valor : 0,
        custo,
        lucro: lucroEfetivo,
        vencimento_anterior: cliente.data_vencimento,
        vencimento_novo: novo,
        status_pagamento: statusPag,
        pago_em: statusPag === "pago" ? new Date().toISOString() : null,
      } as any);
      const servidorUsado = servidorId || cliente.servidor_id;
      if (servidorUsado) {
        await registrarMovimentacaoCredito({
          servidor_id: servidorUsado,
          quantidade: -creditos,
          tipo: "renovacao",
          motivo: `Renovação ${diasEfetivos}d — ${cliente.nome}`,
          cliente_id: cliente.id,
        });
      }
      await logAudit({
        categoria: "renovacao",
        acao: "renovar",
        descricao: `Renovação de "${cliente.nome}" (+${diasEfetivos} dias, ${creditos} crédito(s)) — ${statusPag === "pago" ? "PAGO" : "DEVENDO"}`,
        entidade: "clientes",
        entidade_id: cliente.id,
        entidade_nome: cliente.nome,
        dados_anteriores: { data_vencimento: cliente.data_vencimento },
        dados_novos: { data_vencimento: novo, valor_recebido: statusPag === "pago" ? valor : 0, valor_pendente: statusPag === "devendo" ? valor : 0, custo, lucro: lucroEfetivo, status_pagamento: statusPag, creditos_consumidos: creditos },
      });
      toast.success(statusPag === "pago"
        ? `+${diasEfetivos} dias · Lucro ${currencyBRL(lucroSePago)}`
        : `+${diasEfetivos} dias · Pendente ${currencyBRL(valor)}`);
      qc.invalidateQueries({ queryKey: ["clientes"] });
      qc.invalidateQueries({ queryKey: ["historico"] });
      qc.invalidateQueries({ queryKey: ["creditos_saldos"] });
      qc.invalidateQueries({ queryKey: ["creditos_movs"] });
      qc.invalidateQueries({ queryKey: ["audit_logs"] });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto p-4 space-y-3">
        <DialogHeader className="pb-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <RefreshCw className="h-5 w-5 text-primary" /> Renovar / Adicionar Dias
          </DialogTitle>
        </DialogHeader>

        {cliente && (
          <div className="rounded-lg border border-border/60 p-2.5 space-y-0.5 text-[13px]">
            <Row label="Cliente" value={cliente.nome} tone="text-foreground font-medium" />
            <Row label="Servidor" value={servidorSel?.nome ?? cliente.servidor?.nome ?? "-"} tone="text-foreground" />
            <Row label="Vencimento atual" value={formatDateBR(cliente.data_vencimento)} tone="text-foreground" />
            <Row
              label="Dias restantes"
              value={diasRestantes >= 0 ? `${diasRestantes} dias` : `Vencido há ${Math.abs(diasRestantes)} dias`}
              tone={diasRestantes < 0 ? "text-red-400" : diasRestantes <= 2 ? "text-orange-400" : "text-emerald-400"}
            />
            <Row label="Valor do crédito" value={currencyBRL(custoMensal)} tone="text-foreground" />
          </div>
        )}

        <div className="space-y-1">
          <Label className="text-[13px] text-muted-foreground">Servidor (base de cálculo do custo)</Label>
          <Select value={servidorId} onValueChange={setServidorId}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione o servidor" /></SelectTrigger>
            <SelectContent className="max-h-72">
              <ServidorSelectItems
                servidores={servidores as any[]}
                label={(s: any) => `${s.nome} — ${currencyBRL(Number(s.custo_mensal || 0))}`}
              />
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-[13px] text-muted-foreground">Período a adicionar</Label>
          <div className="grid grid-cols-5 gap-1.5">
            {OPCOES.map((o) => (
              <Button
                key={o.dias}
                type="button"
                variant={!diasCustom && dias === o.dias ? "default" : "secondary"}
                onClick={() => { setDias(o.dias); setDiasCustom(""); }}
                className="h-9 min-w-0 px-1 text-[13px] font-semibold"
              >
                {o.label}
              </Button>
            ))}
            <Input
              type="number"
              min="1"
              inputMode="numeric"
              placeholder="Dias person."
              className="h-9 px-2 text-[13px] text-center font-semibold"
              value={diasCustom}
              onChange={(e) => setDiasCustom(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-[13px] text-muted-foreground">Valor recebido do cliente (R$)</Label>
          <Input
            type="number"
            step="0.01"
            inputMode="decimal"
            placeholder="0,00"
            className="h-9 text-sm"
            value={valorStr}
            onChange={(e) => setValorStr(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-[13px] text-muted-foreground">Status do pagamento</Label>
          <div className="grid grid-cols-2 gap-1.5">
            <Button
              type="button"
              variant={statusPag === "pago" ? "default" : "secondary"}
              onClick={() => setStatusPag("pago")}
              className={`h-9 gap-1.5 text-sm ${statusPag === "pago" ? "bg-emerald-600 hover:bg-emerald-500 text-white" : ""}`}
            >
              <CheckCircle2 className="h-4 w-4" /> Pago
            </Button>
            <Button
              type="button"
              variant={statusPag === "devendo" ? "default" : "secondary"}
              onClick={() => setStatusPag("devendo")}
              className={`h-9 gap-1.5 text-sm ${statusPag === "devendo" ? "bg-amber-600 hover:bg-amber-500 text-white" : ""}`}
            >
              <AlertTriangle className="h-4 w-4" /> Devendo
            </Button>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {statusPag === "pago"
              ? "O valor será somado ao faturamento e o lucro contabilizado imediatamente."
              : "Créditos serão consumidos e o custo lançado como despesa. O faturamento e o lucro só entram após marcar como PAGO."}
          </p>
        </div>

        <div className="rounded-lg border border-border/60 p-2.5 space-y-0.5 text-[13px]">
          <Row label="Dias adicionados" value={`${diasEfetivos} dias`} tone="text-foreground" />
          <Row label="Créditos consumidos" value={`${creditos} crédito${creditos === 1 ? "" : "s"}`} tone="text-foreground" />
          <Row label={`Custo (${creditos} × ${currencyBRL(custoMensal)})`} value={currencyBRL(custo)} tone="text-red-400" />
          <Row
            label={statusPag === "pago" ? "Valor recebido" : "Valor pendente"}
            value={currencyBRL(valor)}
            tone={statusPag === "pago" ? "text-emerald-400" : "text-amber-400"}
          />
          <div className="h-px bg-border/60 my-1" />
          <Row
            label={statusPag === "pago" ? "Lucro" : "Lucro (após recebimento)"}
            value={currencyBRL(statusPag === "pago" ? lucroSePago : lucroSePago)}
            tone={lucroSePago >= 0 ? "text-blue-400 font-semibold" : "text-red-400 font-semibold"}
          />
          {statusPag === "devendo" && (
            <Row label="Impacto imediato no lucro" value={currencyBRL(-custo)} tone="text-red-400" />
          )}
          {novoVenc && (
            <Row label="Novo vencimento" value={formatDateBR(novoVenc)} tone="text-foreground font-medium" />
          )}
          <Row label="Saldo de dias após renovação" value={`${totalDiasApos} dias`} tone="text-primary font-semibold" />
        </div>

        <div className="rounded-lg border border-primary/40 bg-primary/10 p-1.5 text-[11px] text-center">
          Cliente ficará com <span className="font-bold text-primary">{totalDiasApos} dias</span> de acesso após esta renovação.
        </div>

        <DialogFooter className="mt-0.5 gap-2 sm:gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button size="sm" onClick={confirmar} disabled={saving}>Confirmar renovação</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={tone}>{value}</span>
    </div>
  );
}