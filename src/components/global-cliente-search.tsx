import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { fetchClientes, fetchHistorico, fetchRevendedores, fetchAtivacoesApps } from "@/lib/queries";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Search, ArrowRight, User, Phone, Server, Calendar, DollarSign, History, MessageCircle, ClipboardCopy, MoreHorizontal, Copy, KeyRound } from "lucide-react";
import { currencyBRL, diasParaVencer, formatDateBR, formatDateTimeBR, maskPhoneBR, statusMeta, whatsappLink } from "@/lib/iptv";
import { toast } from "sonner";

export function GlobalClienteSearch() {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const { data: clientes = [] } = useQuery({ queryKey: ["clientes"], queryFn: fetchClientes });
  const { data: historico = [] } = useQuery({ queryKey: ["historico"], queryFn: fetchHistorico });
  const { data: revendedores = [] } = useQuery({ queryKey: ["revendedores"], queryFn: fetchRevendedores });
  const { data: ativacoes = [] } = useQuery({ queryKey: ["ativacoes_apps"], queryFn: fetchAtivacoesApps });

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return (clientes as any[])
      .filter((c) =>
        [c.nome, c.telefone, c.mac, c.device, c.aplicativo, c.servidor?.nome, c.observacao]
          .some((x) => String(x ?? "").toLowerCase().includes(term)),
      )
      .slice(0, 12);
  }, [q, clientes]);

  const revResults = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return (revendedores as any[])
      .filter((r) =>
        [r.nome, r.telefone, r.login, r.servidor?.nome, r.observacao]
          .some((x) => String(x ?? "").toLowerCase().includes(term)),
      )
      .slice(0, 8);
  }, [q, revendedores]);

  const ativResults = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return (ativacoes as any[])
      .filter((a) =>
        [a.cliente_nome, a.device, a.mac, a.aplicativo, a.servidor?.nome, a.observacao]
          .some((x) => String(x ?? "").toLowerCase().includes(term)),
      )
      .slice(0, 8);
  }, [q, ativacoes]);

  const hist = useMemo(
    () => (historico as any[]).filter((h) => h.cliente?.id === selected?.id),
    [historico, selected],
  );

  function copiarComprovante(c: any) {
    void 0;
    return copiarComprovanteImpl(c);
  }

  function copiarTexto(v: any, msg: string) {
    const t = String(v ?? "").trim();
    if (!t) return toast.error("Sem informação para copiar");
    navigator.clipboard.writeText(t);
    toast.success(msg);
  }

  function copiarCredenciais(c: any) {
    const linhas = [
      `Cliente: ${c.nome || "-"}`,
      `Servidor: ${c.servidor?.nome || "-"}`,
      `Aplicativo: ${c.aplicativo || "-"}`,
      `MAC: ${c.mac || "-"}`,
      `Device: ${c.device || "-"}`,
    ].join("\n");
    navigator.clipboard.writeText(linhas);
    toast.success("Credenciais copiadas!");
  }

  function copiarComprovanteImpl(c: any) {
    const ultima = (historico as any[])
      .filter((h) => h.cliente?.id === c.id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    const dataRenovDate = ultima?.created_at ? new Date(ultima.created_at) : new Date();
    const hh = String(dataRenovDate.getHours()).padStart(2, "0");
    const mm = String(dataRenovDate.getMinutes()).padStart(2, "0");
    const ss = String(dataRenovDate.getSeconds()).padStart(2, "0");
    const dataRenov = `${formatDateBR(dataRenovDate)} às ${hh}:${mm}:${ss}`;
    const vencISO = ultima?.vencimento_novo ?? c.data_vencimento;
    const dataVenc = vencISO ? `${formatDateBR(vencISO)} às ${hh}:${mm}:${ss}` : "-";
    const d = diasParaVencer(vencISO);
    const msg = `📺 *RODOLFO TV*\n\n✅ *Renovação Realizada com Sucesso!*\n\n👤 *Cliente:* *${c.nome || "-"}*\n📱 *APP:* *${c.aplicativo || "-"}*\n📞 *Contato:* *${String(c.telefone ?? "").replace(/\D/g, "") || "-"}*\n\n🗓️ *Renovação:* *${dataRenov}*\n📅 *Vencimento:* *${dataVenc}*\n\n⏳ *Dias para Vencer:* *${d == null ? "-" : `${d} dias`}*`;
    navigator.clipboard.writeText(msg);
    toast.success("Comprovante copiado!");
  }

  /**
   * Status efetivo do cliente usando exatamente as mesmas regras da aba
   * Clientes Ativos: dentro do prazo de vencimento (dias >= 0) e não
   * cancelado/suspenso => ativo, independentemente de um status desatualizado
   * gravado no cadastro.
   */
  function statusEfetivo(c: any) {
    const dias = diasParaVencer(c.data_vencimento);
    if (c.status === "cancelado" || c.status === "suspenso" || c.status === "teste") return c.status;
    if (dias !== null && dias >= 0) return "ativo";
    if (dias !== null && dias < 0) return "vencido";
    return c.status;
  }

  function localizacao(c: any) {
    const dias = diasParaVencer(c.data_vencimento);
    const st = statusEfetivo(c);
    if (st === "cancelado") return { label: "Cancelados", to: "/clientes" as const };
    if (st === "ativo" && dias === 0) return { label: "Vencendo Hoje", to: "/clientes" as const };
    if (st === "ativo" && dias === 1) return { label: "Vence Amanhã", to: "/clientes" as const };
    if (st === "ativo") return { label: "Clientes Ativos", to: "/clientes" as const };
    if (dias !== null && dias < 0) return { label: "Vencidos", to: "/vencidos" as const };
    return { label: "Clientes Ativos", to: "/clientes" as const };
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Search className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Pesquisar cliente em todas as abas</h3>
      </div>
      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Nome, telefone, MAC, device, aplicativo ou servidor…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
        />
        {q && (results.length > 0 || revResults.length > 0) && (
          <div className="absolute z-50 left-0 right-0 mt-2 rounded-lg border bg-popover shadow-lg max-h-96 overflow-auto">
            {results.length > 0 && (
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/40">Clientes</div>
            )}
            {results.map((c) => {
              const st = statusMeta(statusEfetivo(c));
              const loc = localizacao(c);
              const dias = diasParaVencer(c.data_vencimento);
              return (
                <button
                  key={c.id}
                  onClick={() => { setSelected(c); setQ(""); }}
                  className="w-full text-left px-4 py-2.5 hover:bg-accent border-b last:border-0 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{c.nome}</span>
                      <Badge variant="outline" className={st.color}>{st.label}</Badge>
                      <Badge variant="secondary" className="text-xs">{loc.label}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {c.telefone ? `📞 ${maskPhoneBR(c.telefone)} · ` : ""}
                      {c.servidor?.nome ? `🖥️ ${c.servidor.nome} · ` : ""}
                      Vence {formatDateBR(c.data_vencimento)}
                      {dias !== null && ` (${dias >= 0 ? `+${dias}` : dias} dias)`}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              );
            })}
            {revResults.length > 0 && (
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/40 border-t">Revendedores</div>
            )}
            {revResults.map((r) => (
              <Link
                key={r.id}
                to="/revendedores"
                search={{ q: r.nome } as any}
                onClick={() => setQ("")}
                className="w-full text-left px-4 py-2.5 hover:bg-accent border-b last:border-0 flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{r.nome}</span>
                    <Badge variant="secondary" className="text-xs">Revendedor</Badge>
                    {r.status && <Badge variant="outline" className="text-xs">{String(r.status).toUpperCase()}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {r.telefone ? `📞 ${maskPhoneBR(r.telefone)} · ` : ""}
                    {r.servidor?.nome ? `🖥️ ${r.servidor.nome} · ` : ""}
                    {r.login ? `👤 ${r.login}` : ""}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            ))}
            {ativResults.length > 0 && (
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/40 border-t">Ativações</div>
            )}
            {ativResults.map((a) => (
              <Link
                key={a.id}
                to="/ativacoes"
                search={{ q: a.cliente_nome || a.mac || a.device } as any}
                onClick={() => setQ("")}
                className="w-full text-left px-4 py-2.5 hover:bg-accent border-b last:border-0 flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{a.cliente_nome || a.device || a.mac}</span>
                    <Badge variant="secondary" className="text-xs">Ativação</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {a.aplicativo ? `📱 ${a.aplicativo} · ` : ""}
                    {a.servidor?.nome ? `🖥️ ${a.servidor.nome} · ` : ""}
                    Validade {a.dias_validade}d
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </div>
        )}
        {q && results.length === 0 && revResults.length === 0 && ativResults.length === 0 && (
          <div className="absolute z-50 left-0 right-0 mt-2 rounded-lg border bg-popover shadow-lg px-4 py-3 text-sm text-muted-foreground">
            Nenhum cliente ou revendedor encontrado.
          </div>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-xl max-h-[82vh] overflow-auto">
          {selected && (() => {
            const st = statusMeta(statusEfetivo(selected));
            const loc = localizacao(selected);
            const dias = diasParaVencer(selected.data_vencimento);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" /> {selected.nome}
                  </DialogTitle>
                  <DialogDescription className="flex items-center gap-2">
                    <Badge variant="outline" className={st.color}>{st.label}</Badge>
                    <Badge variant="secondary">Localizado em: {loc.label}</Badge>
                  </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Info icon={Phone} label="Telefone" value={selected.telefone ? maskPhoneBR(selected.telefone) : "-"} />
                  <Info icon={Server} label="Servidor" value={selected.servidor?.nome || "-"} />
                  <Info icon={Calendar} label="Data de início" value={formatDateBR(selected.data_inicio)} />
                  <Info icon={Calendar} label="Vencimento" value={`${formatDateBR(selected.data_vencimento)}${dias !== null ? ` (${dias >= 0 ? `+${dias}` : dias}d)` : ""}`} />
                  <Info icon={DollarSign} label="Valor pago" value={currencyBRL(selected.valor_pago)} />
                  <Info icon={DollarSign} label="Custo" value={currencyBRL(selected.servidor?.custo_mensal ?? selected.custo_snapshot ?? 0)} />
                  <Info label="Pagamento" value={selected.status_pagamento === "pago" ? "Pago" : "Devendo"} />
                  <Info label="Device" value={selected.device || "-"} />
                  <Info label="Aplicativo" value={selected.aplicativo || "-"} />
                  <Info label="MAC" value={selected.mac || "-"} />
                </div>
                {selected.observacao && (
                  <div className="text-sm">
                    <div className="text-xs text-muted-foreground mb-1">Observação</div>
                    <div className="rounded-md border p-2 whitespace-pre-wrap">{selected.observacao}</div>
                  </div>
                )}

                <div className="mt-2">
                  <div className="flex items-center gap-2 mb-2">
                    <History className="h-4 w-4 text-primary" />
                    <h4 className="font-semibold text-sm">Histórico de renovações ({hist.length})</h4>
                  </div>
                  {hist.length === 0 ? (
                    <div className="text-sm text-muted-foreground">Sem renovações registradas.</div>
                  ) : (
                    <div className="rounded-md border divide-y max-h-56 overflow-auto">
                      {hist.map((h: any) => (
                        <div key={h.id} className="px-3 py-2 text-xs flex items-center justify-between gap-2">
                          <div>
                            <div className="font-medium">{formatDateTimeBR(h.created_at)} · +{h.dias_adicionados} dias</div>
                            <div className="text-muted-foreground">
                              {formatDateBR(h.vencimento_anterior)} → {formatDateBR(h.vencimento_novo)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-emerald-400">{currencyBRL(h.valor_recebido)}</div>
                            <div className="text-muted-foreground">Lucro {currencyBRL(h.lucro)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2">
                  <Button size="sm" className="w-full" asChild>
                    <Link to={loc.to} search={{ q: selected.nome, clienteId: selected.id } as any} onClick={() => setSelected(null)}>
                      <ArrowRight className="h-4 w-4 mr-1" /> Ir para o cliente
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" className="w-full" onClick={() => copiarComprovante(selected)}>
                    <ClipboardCopy className="h-4 w-4 mr-1 text-emerald-400" /> Copiar comprovante
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline" className="w-full">
                        <MoreHorizontal className="h-4 w-4 mr-1" /> Ações
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Ações do cliente</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {selected.telefone && (
                        <DropdownMenuItem asChild>
                          <a href={whatsappLink(selected.telefone)} target="_blank" rel="noreferrer">
                            <MessageCircle className="h-4 w-4 mr-2" /> Abrir WhatsApp
                          </a>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => copiarComprovante(selected)}>
                        <ClipboardCopy className="h-4 w-4 mr-2" /> Copiar comprovante
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => copiarTexto(selected.nome, "Nome copiado!")}>
                        <Copy className="h-4 w-4 mr-2" /> Copiar nome
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => copiarTexto(String(selected.telefone ?? "").replace(/\D/g, ""), "Telefone copiado!")}>
                        <Phone className="h-4 w-4 mr-2" /> Copiar telefone
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => copiarTexto(selected.mac, "MAC copiado!")}>
                        <Copy className="h-4 w-4 mr-2" /> Copiar MAC
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => copiarTexto(selected.device, "Device copiado!")}>
                        <Copy className="h-4 w-4 mr-2" /> Copiar Device
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => copiarCredenciais(selected)}>
                        <KeyRound className="h-4 w-4 mr-2" /> Copiar credenciais
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Info({ icon: Icon, label, value }: { icon?: any; label: string; value: string }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />} {label}
      </div>
      <div className="text-sm font-medium mt-0.5 break-words">{value}</div>
    </div>
  );
}