import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { addDaysISO, currencyBRL, formatDateBR, maskMAC, maskPhoneBR, parseDateOnly, toISODate } from "@/lib/iptv";
import { registrarMovimentacaoCredito } from "@/lib/creditos";
import { logAudit, diffObjects } from "@/lib/audit";
import { cn } from "@/lib/utils";
import { ServidorSelectItems } from "@/lib/servidores-ui";

const DIAS_RAPIDOS = [1, 30, 31];
const VALORES_RAPIDOS = [25, 30, 35];

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
        data_vencimento: editing.data_vencimento ?? toISODate(new Date()),
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
    setForm((f: any) => ({ ...f, data_vencimento: addDaysISO(f.data_vencimento, n) }));
  }

  async function save() {
    if (!form.nome.trim()) return toast.error("Informe o nome");
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;
    const payload = {
      nome: form.nome,
      telefone: form.telefone,
      servidor_id: form.servidor_id,
      custo_snapshot: custo,
      data_inicio: form.data_inicio,
      data_vencimento: form.data_vencimento,
      status: form.status,
      status_pagamento: form.status_pagamento,
      valor_pago: form.valor_pago,
      mac: form.mac,
      device: form.device,
      aplicativo: form.aplicativo,
      observacao: form.observacao,
      lembrete_no_dia: form.lembrete_no_dia,
      lembrete_1_dia_antes: form.lembrete_1_dia_antes,
      lembrete_vencimento: form.lembrete_vencimento,
      lembrete_apos: form.lembrete_apos,
    };
    if (editing) {
      const { error } = await supabase.from("clientes").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      
      const { antes, depois } = diffObjects(editing, payload);
      await logAudit({
        categoria: "cliente",
        acao: "editar",
        descricao: `Cliente "${form.nome}" atualizado`,
        entidade: "clientes",
        entidade_id: editing.id,
        entidade_nome: form.nome,
        dados_anteriores: antes,
        dados_novos: depois,
      });

      // Se mudou de Devendo para Pago, registrar no histórico de renovações para contabilizar faturamento
      if (editing.status_pagamento === "devendo" && form.status_pagamento === "pago") {
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
            valor_recebido: form.valor_pago,
            valor_pendente: 0,
            lucro: form.valor_pago - Number(pend.custo || 0),
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
          await supabase.from("historico_renovacoes").insert({
            user_id: user.id,
            cliente_id: editing.id,
            dias_adicionados: 0,
            valor_recebido: form.valor_pago,
            valor_pendente: 0,
            custo: 0, // Custo já foi registrado na criação/renovação como devendo
            lucro: form.valor_pago, // Entra 100% como lucro de hoje
            vencimento_anterior: editing.data_vencimento,
            vencimento_novo: form.data_vencimento,
            status_pagamento: "pago",
            pago_em: new Date().toISOString(),
          });
        }
      }

      // Transferência de servidor: debita 1 crédito do novo servidor
      if (editing.servidor_id && form.servidor_id && editing.servidor_id !== form.servidor_id) {
        await registrarMovimentacaoCredito({
          servidor_id: form.servidor_id,
          quantidade: -1,
          tipo: "transferencia",
          motivo: `Transferência do cliente ${form.nome}`,
          cliente_id: editing.id,
        });
        await logAudit({
          categoria: "cliente",
          acao: "transferir",
          descricao: `Cliente "${form.nome}" transferido de servidor`,
          entidade: "clientes",
          entidade_id: editing.id,
          entidade_nome: form.nome,
          dados_anteriores: { servidor_id: editing.servidor_id },
          dados_novos: { servidor_id: form.servidor_id },
        });
      }
    } else {
      const { data: inserted, error } = await supabase
        .from("clientes")
        .insert({ ...payload, user_id: user.id })
        .select("id")
        .single();
      if (error) return toast.error(error.message);

      // Registrar histórico de renovação inicial
      // Se for 'pago', entra valor e custo (lucro = valor - custo)
      // Se for 'devendo', custo é debitado de imediato (lucro = -custo) e valor recebido = 0.
      const isPago = form.status_pagamento === "pago";
      await supabase.from("historico_renovacoes").insert({
        user_id: user.id,
        cliente_id: inserted?.id,
        dias_adicionados: 30, // Padrão inicial
        valor_recebido: isPago ? form.valor_pago : 0,
        valor_pendente: !isPago ? form.valor_pago : 0,
        custo: custo,
        lucro: isPago ? (form.valor_pago - custo) : -custo,
        vencimento_anterior: toISODate(new Date()),
        vencimento_novo: form.data_vencimento,
        status_pagamento: form.status_pagamento,
        pago_em: isPago ? new Date().toISOString() : null,
      });

      await logAudit({
        categoria: "cliente",
        acao: "criar",
        descricao: `Novo cliente "${form.nome}" cadastrado`,
        entidade: "clientes",
        entidade_id: inserted?.id ?? null,
        entidade_nome: form.nome,
        dados_novos: payload,
      });

      // Nova ativação: debita 1 crédito do servidor selecionado
      if (form.servidor_id && inserted?.id) {
        await registrarMovimentacaoCredito({
          servidor_id: form.servidor_id,
          quantidade: -1,
          tipo: "ativacao",
          motivo: `Ativação do cliente ${form.nome}`,
          cliente_id: inserted.id,
        });
      }
    }
    toast.success("Cliente salvo!");
    qc.invalidateQueries({ queryKey: ["clientes"] });
    qc.invalidateQueries({ queryKey: ["historico"] });
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto p-4 sm:p-5">
        <DialogHeader className="pb-1"><DialogTitle className="text-base">{editing ? "Editar" : "Novo"} cliente</DialogTitle></DialogHeader>
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
            <Select value={form.servidor_id ?? ""} onValueChange={(v) => setForm({ ...form, servidor_id: v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione o servidor" /></SelectTrigger>
              <SelectContent>
                <ServidorSelectItems
                  servidores={servidores as any[]}
                  label={(s: any) => `${s.nome} — ${currencyBRL(s.custo_mensal)}`}
                />
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Data início</Label>
            <Input className="h-8 text-xs" type="datetime-local" value={toLocalDT(form.data_inicio)} onChange={(e) => setForm({ ...form, data_inicio: new Date(e.target.value).toISOString() })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Data de vencimento</Label>
            <div className="flex gap-1.5 items-center">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("h-8 flex-1 justify-start text-xs px-2", !form.data_vencimento && "text-muted-foreground")}>
                    <CalendarIcon className="h-3.5 w-3.5 mr-1.5"/>
                    {form.data_vencimento ? formatDateBR(form.data_vencimento) : "Selecionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={form.data_vencimento ? parseDateOnly(form.data_vencimento) : undefined} onSelect={(d) => d && setForm({ ...form, data_vencimento: toISODate(d) })} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              {DIAS_RAPIDOS.map((d) => (
                <Button key={d} size="sm" variant="secondary" type="button" className="h-8 px-2 text-xs" onClick={() => addDias(d)}>+{d}d</Button>
              ))}
            </div>
          </div>
          <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Status</Label>
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
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Pagamento</Label>
            <Select value={form.status_pagamento} onValueChange={(v) => setForm({ ...form, status_pagamento: v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="devendo">Devendo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Valor pago (R$)</Label>
            <div className="flex gap-1">
              <Input className="h-8 text-xs w-16" type="number" step="0.01" value={form.valor_pago} onChange={(e) => setForm({ ...form, valor_pago: Number(e.target.value) })} />
              {VALORES_RAPIDOS.map((v) => (
                <Button key={v} size="sm" variant="secondary" type="button" className="h-8 px-1.5 text-xs" onClick={() => setForm({ ...form, valor_pago: v })}>{v}</Button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Custo / Lucro</Label>
            <div className="flex gap-1">
              <Input className="h-8 text-xs" value={currencyBRL(custo)} disabled />
              <Input className={cn("h-8 text-xs", lucro >= 0 ? "text-emerald-400" : "text-red-400")} value={currencyBRL(lucro)} disabled />
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
            <Input className="h-8 text-xs" value={form.aplicativo} onChange={(e) => setForm({ ...form, aplicativo: e.target.value })} placeholder="XCIPTV, IPTV Smarters..." />
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
        <DialogFooter className="mt-3 gap-2 sm:gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button size="sm" onClick={save}>Salvar cliente</Button>
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