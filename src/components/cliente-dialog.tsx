import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAplicativosCatalogo, fetchAplicativosSites } from "@/lib/aplicativos";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { addDaysISO, currencyBRL, diasParaVencer, formatDateBR, getFaixaPrecoEsperada, maskMAC, maskPhoneBR, parseDateOnly, toISODate } from "@/lib/iptv";
import { registrarMovimentacaoCredito } from "@/lib/creditos";
import { logAudit, diffObjects } from "@/lib/audit";
import { cn } from "@/lib/utils";
import { ServidorSelectItems } from "@/lib/servidores-ui";
type Servidor = { id: string; nome: string; custo_mensal: number; categoria: string | null };

export function ClienteDialog({
  open,
  onOpenChange,
  editing,
  servidores,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: any | null;
  servidores: Servidor[];
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const { data: catalogoApps = [] } = useQuery({
    queryKey: ["aplicativos_catalogo"],
    queryFn: fetchAplicativosCatalogo,
  });
  const { data: sitesApps = [] } = useQuery({
    queryKey: ["aplicativos_sites"],
    queryFn: fetchAplicativosSites,
  });

  const opcoesApps = (() => {
    const map = new Map<string, { nome: string; categoria?: string | null; site_url?: string | null }>();
    for (const s of sitesApps) {
      if (s.nome?.trim()) {
        map.set(s.nome.trim().toLowerCase(), {
          nome: s.nome.trim(),
          categoria: s.categoria,
          site_url: s.site_url,
        });
      }
    }
    for (const c of catalogoApps) {
      const key = c.nome?.trim().toLowerCase();
      if (key && !map.has(key)) {
        map.set(key, {
          nome: c.nome.trim(),
          categoria: c.categoria,
          site_url: null,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  })();

  const [form, setForm] = useState<any>(defaults());
  const [loginTipo, setLoginTipo] = useState<"mac" | "login">("mac");
  const [deviceLabel, setDeviceLabel] = useState<"Device" | "Senha">("Device");

  useEffect(() => {
    if (editing) {
      setForm({
        nome: editing.nome ?? "",
        telefone: editing.telefone ?? "",
        servidor_id: editing.servidor_id ?? editing.servidor?.id ?? null,
        custo_snapshot: Number(editing.custo_snapshot ?? 0),
        data_inicio: editing.data_inicio ?? new Date().toISOString(),
        data_vencimento: editing.data_vencimento ? String(editing.data_vencimento).slice(0, 10) : toISODate(new Date()),
        status: editing.status ?? "ativo",
        status_pagamento: editing.status_pagamento ?? "devendo",
        valor_pago: Number(editing.valor_pago ?? 0),
        mac: editing.mac ?? "",
        device: editing.device ?? "",
        aplicativo: editing.aplicativo ?? "",
        observacao: editing.observacao ?? "",
        lembrete_no_dia: !!editing.lembrete_no_dia,
        lembrete_1_dia_antes: !!editing.lembrete_1_dia_antes,
        lembrete_vencimento: !!editing.lembrete_vencimento,
        lembrete_apos: !!editing.lembrete_apos,
      });
      // Heurística: se o valor contém ":" tratamos como MAC
      setLoginTipo(editing.mac && String(editing.mac).includes(":") ? "mac" : editing.mac ? "login" : "mac");
      setDeviceLabel("Device");
    } else {
      setForm(defaults());
      setLoginTipo("mac");
      setDeviceLabel("Device");
    }
  }, [editing, open]);

  const custo = Number(
    servidores.find((s) => s.id === form.servidor_id)?.custo_mensal ?? form.custo_snapshot ?? 0,
  );
  const lucro = Number(form.valor_pago || 0) - custo;

  function addDias(n: number) {
    setForm((f: any) => {
      const hojeISO = toISODate(new Date());
      const baseVenc = f.data_vencimento && f.data_vencimento >= hojeISO ? f.data_vencimento : hojeISO;
      const novoVenc = addDaysISO(baseVenc, n);
      const faixa = getFaixaPrecoEsperada(n, Number(f.valor_pago || 0));
      const targetStatus = (f.status === "vencido" || f.status === "cancelado" || f.status === "suspenso") ? "ativo" : f.status;
      return {
        ...f,
        data_vencimento: novoVenc,
        status: targetStatus,
        valor_pago: n > 1 ? faixa.sugestao : f.valor_pago,
      };
    });
  }

  async function save() {
    if (!form.nome || !form.nome.trim()) {
      return toast.error("Informe o nome do cliente");
    }

    setSaving(true);
    try {
      // 1. Obter usuário autenticado com múltiplos fallbacks
      let userId: string | null = null;
      try {
        const { data: userData } = await supabase.auth.getUser();
        userId = userData?.user?.id || null;
      } catch {}
      if (!userId) {
        try {
          const { data: sessData } = await supabase.auth.getSession();
          userId = sessData?.session?.user?.id || null;
        } catch {}
      }
      if (!userId && editing?.user_id) {
        userId = editing.user_id;
      }

      // 2. Normalizar e sanitizar dados do formulário
      const sanitizedServidorId =
        form.servidor_id && form.servidor_id !== "" && form.servidor_id !== "none"
          ? form.servidor_id
          : null;
      const sanitizedVencimento =
        form.data_vencimento && String(form.data_vencimento).trim() !== ""
          ? String(form.data_vencimento).trim().slice(0, 10)
          : null;
      const sanitizedInicio = form.data_inicio
        ? new Date(form.data_inicio).toISOString()
        : new Date().toISOString();
      const sanitizedValorPago =
        typeof form.valor_pago === "number"
          ? (isNaN(form.valor_pago) ? 0 : form.valor_pago)
          : (Number(String(form.valor_pago || 0).replace(",", ".")) || 0);
      const sanitizedCusto = Number(custo) || 0;

      let statusNormalizado = form.status || "ativo";
      const dParaVencer = sanitizedVencimento ? diasParaVencer(sanitizedVencimento) : null;
      if (statusNormalizado === "vencido" && (dParaVencer === null || dParaVencer >= 0)) {
        statusNormalizado = "ativo";
      } else if (statusNormalizado === "ativo" && dParaVencer !== null && dParaVencer < 0) {
        statusNormalizado = "vencido";
      }

      const payload = {
        nome: form.nome.trim(),
        telefone: form.telefone?.trim() || null,
        servidor_id: sanitizedServidorId,
        custo_snapshot: sanitizedCusto,
        data_inicio: sanitizedInicio,
        data_vencimento: sanitizedVencimento,
        status: statusNormalizado,
        status_pagamento: form.status_pagamento || "devendo",
        valor_pago: sanitizedValorPago,
        mac: form.mac?.trim() || null,
        device: form.device?.trim() || null,
        aplicativo: form.aplicativo?.trim() || null,
        observacao: form.observacao?.trim() || null,
        lembrete_no_dia: !!form.lembrete_no_dia,
        lembrete_1_dia_antes: !!form.lembrete_1_dia_antes,
        lembrete_vencimento: !!form.lembrete_vencimento,
        lembrete_apos: !!form.lembrete_apos,
      };

      if (editing) {
        // --- EDIÇÃO DE CLIENTE EXISTENTE ---
        const { error: updateErr } = await supabase
          .from("clientes")
          .update(payload)
          .eq("id", editing.id);

        if (updateErr) {
          console.error("Erro ao atualizar cliente no Supabase:", updateErr);
          toast.error(`Falha ao salvar cliente: ${updateErr.message}`);
          return;
        }

        // Operações secundárias em try/catch para nunca abortar ou quebrar o salvamento
        try {
          const { antes, depois } = diffObjects(editing, payload);
          await logAudit({
            categoria: "cliente",
            acao: "editar",
            descricao: `Cliente "${form.nome.trim()}" atualizado`,
            entidade: "clientes",
            entidade_id: editing.id,
            entidade_nome: form.nome.trim(),
            dados_anteriores: antes,
            dados_novos: depois,
          });
        } catch (e) {
          console.warn("Falha no logAudit:", e);
        }

        // Se mudou de Devendo para Pago, registrar no histórico de renovações para contabilizar faturamento
        if (editing.status_pagamento === "devendo" && form.status_pagamento === "pago") {
          try {
            const { data: pend } = await supabase
              .from("historico_renovacoes")
              .select("id, created_at, custo")
              .eq("cliente_id", editing.id)
              .eq("status_pagamento", "devendo" as any)
              .neq("status", "cancelada")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            const isSameDay = pend && toISODate(new Date(pend.created_at)) === toISODate(new Date());

            if (pend && isSameDay) {
              // Cadastrado hoje como devendo e pago hoje: atualiza o mesmo registro
              await supabase.from("historico_renovacoes").update({
                status_pagamento: "pago" as any,
                valor_recebido: sanitizedValorPago,
                valor_pendente: 0,
                lucro: sanitizedValorPago - Number(pend.custo || 0),
                pago_em: new Date().toISOString(),
              } as any).eq("id", pend.id);
            } else {
              // Cadastrado em dia anterior: o custo já foi abatido no passado.
              // Encerra a pendência antiga e lança o recebimento no dia de hoje.
              if (pend) {
                await supabase.from("historico_renovacoes").update({
                  valor_pendente: 0,
                  pago_em: new Date().toISOString(),
                } as any).eq("id", pend.id);
              }
              if (userId) {
                await supabase.from("historico_renovacoes").insert({
                  user_id: userId,
                  cliente_id: editing.id,
                  dias_adicionados: 0,
                  valor_recebido: sanitizedValorPago,
                  valor_pendente: 0,
                  custo: 0,
                  lucro: sanitizedValorPago,
                  vencimento_anterior: editing.data_vencimento,
                  vencimento_novo: sanitizedVencimento,
                  status_pagamento: "pago",
                  pago_em: new Date().toISOString(),
                });
              }
            }
          } catch (e) {
            console.warn("Falha no historico_renovacoes:", e);
          }
        }

        // Transferência de servidor: debita 1 crédito do novo servidor
        if (editing.servidor_id && sanitizedServidorId && editing.servidor_id !== sanitizedServidorId) {
          try {
            await registrarMovimentacaoCredito({
              servidor_id: sanitizedServidorId,
              quantidade: -1,
              tipo: "transferencia",
              motivo: `Transferência do cliente ${form.nome.trim()}`,
              cliente_id: editing.id,
            });
            await logAudit({
              categoria: "cliente",
              acao: "transferir",
              descricao: `Cliente "${form.nome.trim()}" transferido de servidor`,
              entidade: "clientes",
              entidade_id: editing.id,
              entidade_nome: form.nome.trim(),
              dados_anteriores: { servidor_id: editing.servidor_id },
              dados_novos: { servidor_id: sanitizedServidorId },
            });
          } catch (e) {
            console.warn("Falha ao registrar transferência de crédito:", e);
          }
        }

        toast.success("Alterações salvas com sucesso!");
      } else {
        // --- CADASTRO DE NOVO CLIENTE ---
        if (!userId) {
          toast.error("Erro de autenticação: usuário não identificado.");
          return;
        }

        const { data: inserted, error: insertErr } = await supabase
          .from("clientes")
          .insert({ ...payload, user_id: userId })
          .select("id")
          .single();

        if (insertErr) {
          console.error("Erro ao cadastrar cliente no Supabase:", insertErr);
          toast.error(`Falha ao cadastrar cliente: ${insertErr.message}`);
          return;
        }

        const isPago = form.status_pagamento === "pago";
        try {
          await supabase.from("historico_renovacoes").insert({
            user_id: userId,
            cliente_id: inserted?.id,
            dias_adicionados: 30,
            valor_recebido: isPago ? sanitizedValorPago : 0,
            valor_pendente: !isPago ? sanitizedValorPago : 0,
            custo: sanitizedCusto,
            lucro: isPago ? (sanitizedValorPago - sanitizedCusto) : -sanitizedCusto,
            vencimento_anterior: toISODate(new Date()),
            vencimento_novo: sanitizedVencimento,
            status_pagamento: form.status_pagamento,
            pago_em: isPago ? new Date().toISOString() : null,
          });
        } catch (e) {
          console.warn("Falha ao registrar histórico inicial:", e);
        }

        try {
          await logAudit({
            categoria: "cliente",
            acao: "criar",
            descricao: `Novo cliente "${form.nome.trim()}" cadastrado`,
            entidade: "clientes",
            entidade_id: inserted?.id ?? null,
            entidade_nome: form.nome.trim(),
            dados_novos: payload,
          });
        } catch (e) {
          console.warn("Falha no logAudit:", e);
        }

        // Nova ativação: debita 1 crédito do servidor selecionado
        if (sanitizedServidorId && inserted?.id) {
          try {
            await registrarMovimentacaoCredito({
              servidor_id: sanitizedServidorId,
              quantidade: -1,
              tipo: "ativacao",
              motivo: `Ativação do cliente ${form.nome.trim()}`,
              cliente_id: inserted.id,
            });
          } catch (e) {
            console.warn("Falha ao debitar crédito de ativação:", e);
          }
        }

        toast.success("Cliente cadastrado com sucesso!");
      }

      // Atualiza e refaz queries instantaneamente
      try {
        await qc.invalidateQueries({ queryKey: ["clientes"] });
        await qc.invalidateQueries({ queryKey: ["historico"] });
        await qc.invalidateQueries({ queryKey: ["clientes-excluidos"] });
        await qc.invalidateQueries({ queryKey: ["creditos_saldos"] });
        await qc.invalidateQueries({ queryKey: ["creditos_movs"] });
        await qc.refetchQueries({ queryKey: ["clientes"] });
      } catch (e) {
        console.warn("Query invalidation warning:", e);
      }

      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Erro inesperado ao salvar cliente:", err);
      toast.error(err?.message || "Erro inesperado ao salvar cliente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-4 sm:p-5 pb-3 border-b shrink-0">
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            {editing ? "Editar cliente" : "Novo cliente"}
          </DialogTitle>
        </DialogHeader>

        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-2.5 text-sm">
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs text-muted-foreground">Nome completo</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Telefone</Label>
              <Input className="h-8 text-xs" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: maskPhoneBR(e.target.value) })} placeholder="(11) 99999-9999" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Servidor</Label>
              <Select value={form.servidor_id ?? "none"} onValueChange={(v) => setForm({ ...form, servidor_id: v === "none" ? null : v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione o servidor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum servidor</SelectItem>
                  <ServidorSelectItems
                    servidores={servidores as any[]}
                    label={(s: any) => `${s.nome} — ${currencyBRL(s.custo_mensal)}`}
                  />
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Data início</Label>
              <Input
                className="h-8 text-xs"
                type="datetime-local"
                value={form.data_inicio ? toLocalDT(form.data_inicio) : ""}
                onChange={(e) => {
                  if (e.target.value) {
                    const d = new Date(e.target.value);
                    if (!isNaN(d.getTime())) setForm({ ...form, data_inicio: d.toISOString() });
                  }
                }}
              />
            </div>

            {/* Data de vencimento */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Data de vencimento</Label>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Input
                    className="h-8 text-xs font-medium flex-1"
                    type="date"
                    value={form.data_vencimento ?? ""}
                    onChange={(e) => {
                      const iso = e.target.value;
                      const diasRest = diasParaVencer(iso);
                      setForm((prev: any) => ({
                        ...prev,
                        data_vencimento: iso,
                        status: (diasRest === null || diasRest >= 0) && (prev.status === "vencido" || prev.status === "cancelado" || prev.status === "suspenso") ? "ativo" : prev.status,
                      }));
                    }}
                  />
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs shrink-0" title="Abrir calendário">
                        <CalendarIcon className="h-4 w-4 text-primary"/>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <Calendar
                        mode="single"
                        selected={form.data_vencimento ? parseDateOnly(form.data_vencimento) : undefined}
                        onSelect={(d) => {
                          if (d) {
                            const iso = toISODate(d);
                            const diasRest = diasParaVencer(iso);
                            setForm((prev: any) => ({
                              ...prev,
                              data_vencimento: iso,
                              status: (diasRest === null || diasRest >= 0) && (prev.status === "vencido" || prev.status === "cancelado" || prev.status === "suspenso") ? "ativo" : prev.status,
                            }));
                            setCalendarOpen(false);
                          }
                        }}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[11px] text-muted-foreground mr-1">Adicionar:</span>
                  <Button size="sm" variant="secondary" type="button" className="h-6 px-1.5 text-[11px]" onClick={() => addDias(1)}>+1d</Button>
                  <Button size="sm" variant="secondary" type="button" className="h-6 px-1.5 text-[11px]" onClick={() => addDias(30)}>+30d</Button>
                  <Button size="sm" variant="secondary" type="button" className="h-6 px-1.5 text-[11px]" onClick={() => addDias(60)}>+60d</Button>
                  <Button size="sm" variant="secondary" type="button" className="h-6 px-1.5 text-[11px]" onClick={() => addDias(90)}>+90d</Button>
                  <Button size="sm" variant="secondary" type="button" className="h-6 px-1.5 text-[11px]" onClick={() => addDias(180)}>+180d</Button>
                  <Button size="sm" variant="secondary" type="button" className="h-6 px-1.5 text-[11px]" onClick={() => addDias(365)}>+365d</Button>
                </div>
              </div>
            </div>

            {/* Status do cliente */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Status do cliente</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="teste">Teste</SelectItem>
                  <SelectItem value="vencido">Vencido</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                  <SelectItem value="suspenso">Suspenso</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Status do pagamento */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Status do pagamento</Label>
              <Select value={form.status_pagamento} onValueChange={(v) => setForm({ ...form, status_pagamento: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pago">Pago</SelectItem>
                  <SelectItem value="devendo">Devendo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Valor pago */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Valor pago pelo cliente (R$)</Label>
              <Input
                className="h-8 text-xs font-medium"
                type="number"
                step="any"
                placeholder="0,00"
                value={form.valor_pago ?? 0}
                onChange={(e) => setForm({ ...form, valor_pago: e.target.value === "" ? 0 : Number(e.target.value) })}
              />
            </div>

            {/* Custo / Lucro */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Custo do Crédito / Lucro</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="h-8 px-2 rounded-md border bg-muted/40 flex items-center text-xs text-muted-foreground">
                  <span className="truncate">Custo: {currencyBRL(custo)}</span>
                </div>
                <div className={cn("h-8 px-2 rounded-md border flex items-center text-xs font-semibold", lucro >= 0 ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border-red-500/30 text-red-400")}>
                  <span className="truncate">Lucro: {currencyBRL(lucro)}</span>
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs text-muted-foreground">{loginTipo === "mac" ? "MAC" : "Login/Usuário"}</Label>
                <ToggleGroup
                  type="single"
                  size="sm"
                  value={loginTipo}
                  onValueChange={(v) => {
                    if (!v) return;
                    const next = v as "mac" | "login";
                    setLoginTipo(next);
                    setForm((f: any) => ({
                      ...f,
                      mac: next === "mac" ? maskMAC(f.mac ?? "") : String(f.mac ?? "").replace(/:/g, ""),
                    }));
                  }}
                >
                  <ToggleGroupItem value="mac" className="h-6 px-2 text-xs">MAC</ToggleGroupItem>
                  <ToggleGroupItem value="login" className="h-6 px-2 text-xs">Login</ToggleGroupItem>
                </ToggleGroup>
              </div>
              <Input
                className="h-8 text-xs"
                value={form.mac}
                onChange={(e) =>
                  setForm({
                    ...form,
                    mac: loginTipo === "mac" ? maskMAC(e.target.value) : e.target.value,
                  })
                }
                placeholder={loginTipo === "mac" ? "XX:XX:XX:XX:XX:XX" : "usuário ou login"}
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs text-muted-foreground">{deviceLabel}</Label>
                <ToggleGroup
                  type="single"
                  size="sm"
                  value={deviceLabel}
                  onValueChange={(v) => v && setDeviceLabel(v as "Device" | "Senha")}
                >
                  <ToggleGroupItem value="Device" className="h-6 px-2 text-xs">Device</ToggleGroupItem>
                  <ToggleGroupItem value="Senha" className="h-6 px-2 text-xs">Senha</ToggleGroupItem>
                </ToggleGroup>
              </div>
              <Input className="h-8 text-xs" value={form.device} onChange={(e) => setForm({ ...form, device: e.target.value })} placeholder="A1B2C3D4E5" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs text-muted-foreground">Aplicativo</Label>
              <Input
                className="h-8 text-xs"
                list="catalogo-apps-cliente-datalist"
                value={form.aplicativo}
                onChange={(e) => setForm({ ...form, aplicativo: e.target.value })}
                placeholder="XCIPTV, IPTV Smarters, IBO Player..."
              />
              <datalist id="catalogo-apps-cliente-datalist">
                {opcoesApps.map((app) => (
                  <option key={app.nome} value={app.nome}>
                    {app.categoria ? `${app.categoria} · ` : ""}{app.site_url ? `(${app.site_url})` : ""}
                  </option>
                ))}
              </datalist>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs text-muted-foreground">Observação</Label>
              <Textarea rows={1} className="min-h-[34px] text-xs resize-y" value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
            </div>
            <div className="md:col-span-2 space-y-1">
              <Label className="text-xs text-muted-foreground">Lembretes</Label>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                <Chk label="No dia" v={form.lembrete_no_dia} on={(v) => setForm({ ...form, lembrete_no_dia: v })} />
                <Chk label="1 dia antes" v={form.lembrete_1_dia_antes} on={(v) => setForm({ ...form, lembrete_1_dia_antes: v })} />
                <Chk label="No vencimento" v={form.lembrete_vencimento} on={(v) => setForm({ ...form, lembrete_vencimento: v })} />
                <Chk label="Após vencimento" v={form.lembrete_apos} on={(v) => setForm({ ...form, lembrete_apos: v })} />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="p-4 border-t bg-muted/20 shrink-0 flex items-center justify-between sm:justify-between gap-2">
          <Button variant="outline" size="sm" type="button" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button size="sm" type="button" disabled={saving} onClick={save} className="gap-2 font-semibold">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? "Salvar alterações" : "Cadastrar cliente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Chk({ label, v, on }: { label: string; v: boolean; on: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <Checkbox checked={v} onCheckedChange={(c) => on(!!c)} />
      <span>{label}</span>
    </label>
  );
}

function toLocalDT(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaults() {
  return {
    nome: "",
    telefone: "",
    servidor_id: null,
    custo_snapshot: 0,
    data_inicio: new Date().toISOString(),
    data_vencimento: toISODate(new Date()),
    status: "ativo",
    status_pagamento: "devendo",
    valor_pago: 0,
    mac: "",
    device: "",
    aplicativo: "",
    observacao: "",
    lembrete_no_dia: false,
    lembrete_1_dia_antes: false,
    lembrete_vencimento: false,
    lembrete_apos: false,
  };
}