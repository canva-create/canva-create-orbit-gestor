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
import { addDaysISO, currencyBRL, diasParaVencer, formatDateBR, getFaixaPrecoEsperada, toISODate } from "@/lib/iptv";
import { creditosPorDias, registrarMovimentacaoCredito } from "@/lib/creditos";
import { logAudit } from "@/lib/audit";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, CheckCircle2, AlertTriangle, Sparkles } from "lucide-react";
import { confirmDialog } from "@/lib/confirm";
import { cn } from "@/lib/utils";

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
      const baseDias = 30;
      setDias(baseDias);
      setDiasCustom("");
      const f = getFaixaPrecoEsperada(baseDias, Number(cliente?.valor_pago || 0));
      setValorStr(String(f.sugestao));
      setStatusPag("pago");
      setServidorId(cliente?.servidor_id ?? "");
    }
  }, [open, cliente]);

  const servidorSel = (servidores as any[]).find((s) => s.id === servidorId) ?? null;
  const custoMensal = Number(
    servidorSel?.custo_mensal ?? cliente?.servidor?.custo_mensal ?? cliente?.custo_snapshot ?? 0,
  );
  const diasEfetivos = Math.max(0, Math.floor(Number(diasCustom) > 0 ? Number(diasCustom) : dias));
  const faixa = useMemo(() => getFaixaPrecoEsperada(diasEfetivos, Number(cliente?.valor_pago || 0)), [diasEfetivos, cliente?.valor_pago]);
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

  function handleSelectDias(diasSel: number) {
    setDias(diasSel);
    setDiasCustom("");
    const f = getFaixaPrecoEsperada(diasSel, Number(cliente?.valor_pago || 0));
    setValorStr(String(f.sugestao));
  }

  function handleCustomDias(val: string) {
    setDiasCustom(val);
    const n = Number(val);
    if (n > 0) {
      const f = getFaixaPrecoEsperada(n, Number(cliente?.valor_pago || 0));
      if (!valorStr || Number(valorStr) === 0 || faixa.isDiscrepante(valor)) {
        setValorStr(String(f.sugestao));
      }
    }
  }

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

    if (faixa.isDiscrepante(valor)) {
      const okDiscrepancia = await confirmDialog({
        title: "⚠️ Atenção: Discrepância no valor do plano!",
        description: `Cliente: ${cliente.nome}\nPeríodo: ${diasEfetivos} dias (${faixa.labelPeriodo})\nValor digitado: ${currencyBRL(valor)}\nFaixa esperada: ${currencyBRL(faixa.min)} a ${currencyBRL(faixa.max)} (Sugestão média: ${currencyBRL(faixa.sugestao)})\n\nO valor informado está FORA da faixa média recomendada para ${faixa.labelPeriodo}.\n\nDeseja confirmar este valor com discrepância ou prefere voltar e corrigir?`,
        confirmText: "Confirmar mesmo com discrepância",
        cancelText: "Voltar e Corrigir",
      });
      if (!okDiscrepancia) return;
    } else {
      const ok = await confirmDialog({
        title: "Confirmar valor da renovação",
        description: `Cliente: ${cliente.nome}\nPeríodo: ${diasEfetivos} dias (${faixa.labelPeriodo})\nValor ${statusPag === "pago" ? "recebido" : "pendente"}: ${currencyBRL(valor)}\nCusto: ${currencyBRL(custo)}\nLucro: ${currencyBRL(lucroSePago)}\n\nConfirma este valor para o lançamento financeiro?`,
        confirmText: "Confirmar valor",
      });
      if (!ok) return;
    }

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
      qc.invalidateQueries();
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
                onClick={() => handleSelectDias(o.dias)}
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
              onChange={(e) => handleCustomDias(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between flex-wrap gap-1">
            <Label className="text-[13px] text-muted-foreground">Valor recebido do cliente (R$)</Label>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-muted-foreground mr-0.5">Sugestões:</span>
              {faixa.valoresRapidos.map((v) => (
                <Button
                  key={v}
                  type="button"
                  size="sm"
                  variant={valor === v ? "default" : "secondary"}
                  onClick={() => setValorStr(String(v))}
                  className={cn("h-6 px-1.5 text-[11px] font-semibold", valor === v && "bg-primary text-primary-foreground")}
                >
                  {currencyBRL(v)}
                </Button>
              ))}
            </div>
          </div>
          <Input
            type="number"
            step="0.01"
            inputMode="decimal"
            placeholder="0,00"
            className={cn(
              "h-9 text-sm font-medium",
              faixa.isDiscrepante(valor) && "border-amber-500/80 bg-amber-500/10 text-amber-200 focus-visible:ring-amber-500",
            )}
            value={valorStr}
            onChange={(e) => setValorStr(e.target.value)}
          />
        </div>

        {/* Alerta de Discrepância com Botão de Auto-Correção */}
        {faixa.isDiscrepante(valor) && (
          <div className="rounded-lg border border-amber-500/60 bg-amber-500/15 p-2.5 text-xs text-amber-200 space-y-1.5 animate-in fade-in-50">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                Discrepância de valor detectada!
              </span>
              <Button
                type="button"
                size="sm"
                className="h-6 px-2 text-[11px] bg-amber-400 hover:bg-amber-300 text-black font-bold shadow-sm"
                onClick={() => setValorStr(String(faixa.sugestao))}
              >
                <Sparkles className="h-3 w-3 mr-1" />
                Corrigir para {currencyBRL(faixa.sugestao)}
              </Button>
            </div>
            <p className="text-[11px] text-amber-100/90 leading-relaxed">
              {faixa.mensagemDiscrepancia?.(valor)}
            </p>
          </div>
        )}

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
          <Row label="Dias adicionados" value={`${diasEfetivos} dias (${faixa.labelPeriodo})`} tone="text-foreground" />
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