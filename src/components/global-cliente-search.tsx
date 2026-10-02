import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { fetchClientes, fetchRevendedores, fetchAtivacoesApps } from "@/lib/queries";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Search,
  ArrowRight,
  User,
  Phone,
  Server,
  Calendar,
  DollarSign,
  History,
  MessageCircle,
  ClipboardCopy,
  MoreHorizontal,
  Copy,
  KeyRound,
  Download,
  Eye,
  Smartphone,
  Tv,
} from "lucide-react";
import { currencyBRL, diasParaVencer, formatDateBR, formatDateTimeBR, maskPhoneBR, statusMeta, whatsappLink } from "@/lib/iptv";
import { toast } from "sonner";
import {
  copyComprovanteVencimentoImageToClipboard,
  exportComprovanteVencimentoPNG,
  comprovanteVencimentoTextoFormatado,
  comprovanteVencimentoMultiContasTextoFormatado,
  encontrarContasVinculadas,
  getClientCredentials,
} from "@/lib/comprovante-vencimento-generator";

function normalizeText(s: any): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

async function searchGlobal(term: string) {
  const clean = term.trim().replace(/[,()]/g, " ");
  if (!clean || clean.length < 2) {
    return { clientes: [], revendedores: [], ativacoes: [] };
  }

  const tokens = clean.split(/\s+/).filter(Boolean);
  const searchToken = tokens[0] || clean;

  try {
    const [cliRes, revRes, ativRes] = await Promise.all([
      supabase
        .from("clientes")
        .select("id, nome, telefone, mac, device, aplicativo, data_vencimento, data_inicio, status, status_pagamento, valor_pago, observacao, servidor:servidores(id, nome)")
        .is("deleted_at", null)
        .or(`nome.ilike.%${searchToken}%,telefone.ilike.%${searchToken}%,mac.ilike.%${searchToken}%,device.ilike.%${searchToken}%,aplicativo.ilike.%${searchToken}%,observacao.ilike.%${searchToken}%`)
        .limit(20),
      supabase
        .from("revendedores")
        .select("id, nome, telefone, login, creditos, valor_venda, status, status_pagamento, observacao, servidor:servidores(id, nome)")
        .or(`nome.ilike.%${searchToken}%,telefone.ilike.%${searchToken}%,login.ilike.%${searchToken}%,observacao.ilike.%${searchToken}%`)
        .limit(10),
      supabase
        .from("ativacoes_apps")
        .select("id, cliente_nome, device, mac, aplicativo, valor, dias_validade, ativado_em, expira_em, observacao, servidor:servidores(id, nome)")
        .or(`cliente_nome.ilike.%${searchToken}%,device.ilike.%${searchToken}%,mac.ilike.%${searchToken}%,aplicativo.ilike.%${searchToken}%,observacao.ilike.%${searchToken}%`)
        .limit(10),
    ]);

    return {
      clientes: cliRes.data ?? [],
      revendedores: revRes.data ?? [],
      ativacoes: ativRes.data ?? [],
    };
  } catch (err) {
    console.warn("Erro na busca remota do Supabase:", err);
    return { clientes: [], revendedores: [], ativacoes: [] };
  }
}

export function GlobalClienteSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<any | null>(null);

  // Carrega ou reutiliza dados já em cache no aplicativo
  const { data: allClientes = [] } = useQuery({ queryKey: ["clientes"], queryFn: fetchClientes });
  const { data: allRevendedores = [] } = useQuery({ queryKey: ["revendedores"], queryFn: fetchRevendedores });
  const { data: allAtivacoes = [] } = useQuery({ queryKey: ["ativacoes_apps"], queryFn: () => fetchAtivacoesApps() });

  const term = q.trim().toLowerCase();
  const { data: searchData } = useQuery({
    queryKey: ["busca_global_server", term],
    queryFn: () => searchGlobal(term),
    enabled: term.length >= 2,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const tokens = useMemo(() => {
    return normalizeText(q).split(/\s+/).filter(Boolean);
  }, [q]);

  // Busca em memória com remoção de acentos e multi-token
  const inMemoryClientes = useMemo(() => {
    if (tokens.length === 0) return [];
    return (allClientes as any[]).filter((c) => {
      const haystack = normalizeText(
        [c.nome, c.telefone, c.mac, c.device, c.aplicativo, c.observacao, c.servidor?.nome]
          .filter(Boolean)
          .join(" "),
      );
      return tokens.every((t) => haystack.includes(t));
    }).slice(0, 15);
  }, [allClientes, tokens]);

  const inMemoryRevendedores = useMemo(() => {
    if (tokens.length === 0) return [];
    return (allRevendedores as any[]).filter((r) => {
      const haystack = normalizeText(
        [r.nome, r.telefone, r.login, r.observacao, r.servidor?.nome]
          .filter(Boolean)
          .join(" "),
      );
      return tokens.every((t) => haystack.includes(t));
    }).slice(0, 8);
  }, [allRevendedores, tokens]);

  const inMemoryAtivacoes = useMemo(() => {
    if (tokens.length === 0) return [];
    return (allAtivacoes as any[]).filter((a) => {
      const haystack = normalizeText(
        [a.cliente_nome, a.device, a.mac, a.aplicativo, a.observacao, a.servidor?.nome]
          .filter(Boolean)
          .join(" "),
      );
      return tokens.every((t) => haystack.includes(t));
    }).slice(0, 8);
  }, [allAtivacoes, tokens]);

  // Combina resultados locais (instantâneos) com eventuais retornos do servidor
  const results = useMemo(() => {
    const map = new Map<string, any>();
    inMemoryClientes.forEach((c) => map.set(c.id, c));
    (searchData?.clientes ?? []).forEach((c: any) => {
      if (!map.has(c.id)) {
        const haystack = normalizeText(
          [c.nome, c.telefone, c.mac, c.device, c.aplicativo, c.observacao, c.servidor?.nome]
            .filter(Boolean)
            .join(" "),
        );
        if (tokens.length === 0 || tokens.every((t) => haystack.includes(t))) {
          map.set(c.id, c);
        }
      }
    });
    return Array.from(map.values());
  }, [inMemoryClientes, searchData?.clientes, tokens]);

  const revResults = useMemo(() => {
    const map = new Map<string, any>();
    inMemoryRevendedores.forEach((r) => map.set(r.id, r));
    (searchData?.revendedores ?? []).forEach((r: any) => {
      if (!map.has(r.id)) {
        const haystack = normalizeText(
          [r.nome, r.telefone, r.login, r.observacao, r.servidor?.nome]
            .filter(Boolean)
            .join(" "),
        );
        if (tokens.length === 0 || tokens.every((t) => haystack.includes(t))) {
          map.set(r.id, r);
        }
      }
    });
    return Array.from(map.values());
  }, [inMemoryRevendedores, searchData?.revendedores, tokens]);

  const ativResults = useMemo(() => {
    const map = new Map<string, any>();
    inMemoryAtivacoes.forEach((a) => map.set(a.id, a));
    (searchData?.ativacoes ?? []).forEach((a: any) => {
      if (!map.has(a.id)) {
        const haystack = normalizeText(
          [a.cliente_nome, a.device, a.mac, a.aplicativo, a.observacao, a.servidor?.nome]
            .filter(Boolean)
            .join(" "),
        );
        if (tokens.length === 0 || tokens.every((t) => haystack.includes(t))) {
          map.set(a.id, a);
        }
      }
    });
    return Array.from(map.values());
  }, [inMemoryAtivacoes, searchData?.ativacoes, tokens]);

  const { data: hist = [] } = useQuery({
    queryKey: ["historico_cliente_dialog", selected?.id],
    queryFn: async () => {
      if (!selected?.id) return [];
      const { data, error } = await supabase
        .from("historico_renovacoes")
        .select("*, cliente:clientes(id, nome)")
        .eq("cliente_id", selected.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) return [];
      return data ?? [];
    },
    enabled: !!selected?.id,
    staleTime: 60_000,
  });

  function copiarTexto(v: any, msg: string) {
    const t = String(v ?? "").trim();
    if (!t) return toast.error("Sem informação para copiar");
    navigator.clipboard.writeText(t);
    toast.success(msg);
  }

  async function copiarComprovante(c: any, forceSingle = false) {
    const contas = forceSingle ? [c] : encontrarContasVinculadas(c, allClientes);
    const ids = contas.map((item) => item.id);
    let ultima: any = null;
    try {
      const { data } = await supabase
        .from("historico_renovacoes")
        .select("created_at, vencimento_novo, dias_adicionados")
        .in("cliente_id", ids)
        .order("created_at", { ascending: false })
        .limit(1);
      ultima = data && data.length > 0 ? data[0] : null;
    } catch {}

    const msg = contas.length > 1
      ? comprovanteVencimentoMultiContasTextoFormatado(contas, ultima)
      : comprovanteVencimentoTextoFormatado(c, ultima);

    navigator.clipboard.writeText(msg);
    if (contas.length > 1) {
      toast.success(`Comprovante Coletivo copiado (${contas.length} contas)!`);
    } else {
      toast.success("Comprovante copiado!");
    }
  }

  function copiarCredenciais(c: any) {
    const creds = getClientCredentials(c);
    const app = c.aplicativo && c.aplicativo !== "-" ? c.aplicativo : null;
    const linhas = [
      `📺 *RODOLFO TV*`,
      ``,
      `🔑 *DADOS DE ACESSO*`,
      ``,
      `👤 Cliente: ${c.nome || "-"}`,
    ];
    if (app) linhas.push(`📺 Aplicativo: ${app}`);
    if (creds.usuario) linhas.push(`👤 Usuário: ${creds.usuario}`);
    if (creds.senha) linhas.push(`🔑 Senha: ${creds.senha}`);
    if (creds.mac) linhas.push(`🌐 MAC: ${creds.mac}`);
    if (creds.device) linhas.push(`📱 Device: ${creds.device}`);
    linhas.push(``, `🙏 Obrigado pela preferência e confiança!`);

    navigator.clipboard.writeText(linhas.join("\n"));
    toast.success("Credenciais copiadas!");
  }

  async function handleCopiarImagemVencimento(c: any) {
    const contas = encontrarContasVinculadas(c, allClientes);
    const toastId = toast.loading(contas.length > 1 ? `Gerando comprovante PNG (${contas.length} contas)...` : "Gerando comprovante PNG...");
    try {
      const ok = await copyComprovanteVencimentoImageToClipboard(c, contas.length > 1 ? contas : undefined);
      if (ok) {
        toast.success(contas.length > 1 ? `Comprovante PNG Unificado copiado (${contas.length} contas)! Cole no WhatsApp com Ctrl + V.` : "Comprovante PNG copiado! Cole no WhatsApp com Ctrl + V.", { id: toastId });
      } else {
        toast.error("Seu navegador não suporta cópia direta de imagem. Use 'Gerar o PNG'.", { id: toastId });
      }
    } catch (err: any) {
      toast.error(err?.message || "Falha ao copiar imagem do comprovante", { id: toastId });
    }
  }

  async function handleGerarImagemVencimento(c: any) {
    const contas = encontrarContasVinculadas(c, allClientes);
    const toastId = toast.loading(contas.length > 1 ? `Gerando comprovante PNG (${contas.length} contas)...` : "Gerando comprovante PNG...");
    try {
      await exportComprovanteVencimentoPNG(c, contas.length > 1 ? contas : undefined);
      toast.success(contas.length > 1 ? `Comprovante PNG Unificado baixado (${contas.length} contas)!` : "Comprovante PNG baixado com sucesso!", { id: toastId });
    } catch (err: any) {
      toast.error(err?.message || "Falha ao gerar comprovante PNG", { id: toastId });
    }
  }

  /**
   * Status efetivo do cliente
   */
  function statusEfetivo(c: any) {
    const dias = diasParaVencer(c.data_vencimento);
    if (c.status === "cancelado" || c.status === "suspenso" || c.status === "teste") return c.status;
    if (c.status === "vencido" || (dias !== null && dias < 0)) return "vencido";
    if (dias === null || dias >= 0) return "ativo";
    return c.status;
  }

  function localizacao(c: any) {
    const dias = diasParaVencer(c.data_vencimento);
    const st = statusEfetivo(c);
    if (st === "cancelado") return { label: "Cancelados", to: "/clientes" as const };
    if (dias === 0 && st !== "vencido") return { label: "Vencendo Hoje", to: "/clientes" as const };
    if (dias === 1 && st !== "vencido") return { label: "Vence Amanhã", to: "/clientes" as const };
    if (dias === 2 && st !== "vencido") return { label: "Vence em 2 dias", to: "/clientes" as const };
    if (dias === -1) return { label: "Vencido há 1 dia", to: "/vencidos" as const };
    if (dias === -2) return { label: "Vencido há 2 dias", to: "/vencidos" as const };
    if ((dias !== null && dias < 0) || st === "vencido") return { label: "Vencidos", to: "/vencidos" as const };
    return { label: "Clientes Ativos", to: "/clientes" as const };
  }

  function irParaCliente(c: any) {
    const loc = localizacao(c);
    navigate({
      to: loc.to,
      search: { q: c.nome, clienteId: c.id } as any,
    });
    setQ("");
    setSelected(null);
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
        {q && (results.length > 0 || revResults.length > 0 || ativResults.length > 0) && (
          <div className="absolute z-50 left-0 right-0 mt-2 rounded-lg border bg-popover shadow-xl max-h-[28rem] overflow-auto divide-y divide-border/60">
            {results.length > 0 && (
              <div className="px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/60 sticky top-0 z-10 backdrop-blur-sm">
                Clientes ({results.length})
              </div>
            )}
            {results.map((c) => {
              const st = statusMeta(statusEfetivo(c));
              const loc = localizacao(c);
              const dias = diasParaVencer(c.data_vencimento);
              const creds = getClientCredentials(c);
              const contasVinculadas = encontrarContasVinculadas(c, allClientes);
              const isMulti = contasVinculadas.length > 1;

              return (
                <div
                  key={c.id}
                  onClick={() => irParaCliente(c)}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-accent/80 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors truncate">
                        {c.nome}
                      </span>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${st.color}`}>
                        {st.label}
                      </Badge>
                      {isMulti && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-purple-500/15 border border-purple-500/30 text-purple-400 font-semibold">
                          {contasVinculadas.length} Contas
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {loc.label}
                      </Badge>
                    </div>

                    {/* Informações detalhadas do cliente */}
                    <div className="text-xs text-muted-foreground flex items-center flex-wrap gap-x-2 gap-y-0.5 leading-relaxed">
                      {c.telefone && (
                        <span className="text-emerald-400 font-medium">
                          📞 {maskPhoneBR(c.telefone)}
                        </span>
                      )}
                      {c.aplicativo && (
                        <span className="text-cyan-400 font-medium">
                          📺 {c.aplicativo}
                        </span>
                      )}
                      {c.servidor?.nome && (
                        <span className="text-slate-300">
                          🖥️ {c.servidor.nome}
                        </span>
                      )}
                      {c.data_vencimento && (
                        <span className={dias !== null && dias < 0 ? "text-red-400 font-medium" : dias === 0 ? "text-amber-400 font-medium" : "text-foreground"}>
                          📅 Vence {formatDateBR(c.data_vencimento)}
                          {dias !== null && ` (${dias >= 0 ? `+${dias}` : dias}d)`}
                        </span>
                      )}
                      {creds.mac && (
                        <span className="text-muted-foreground font-mono text-[11px]">
                          🌐 {creds.mac}
                        </span>
                      )}
                      {creds.device && (
                        <span className="text-muted-foreground font-mono text-[11px]">
                          📱 {creds.device}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Botões de Ações Rápidas na linha */}
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      title="Copiar comprovante individual"
                      onClick={() => copiarComprovante(c, true)}
                      className="h-8 w-8 p-0 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/15 rounded-md"
                    >
                      <ClipboardCopy className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      title="Copiar nome do cliente"
                      onClick={() => copiarTexto(c.nome, "Nome copiado!")}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md"
                    >
                      <User className="h-4 w-4" />
                    </Button>
                    {c.telefone && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        title="Copiar telefone"
                        onClick={() => copiarTexto(String(c.telefone).replace(/\D/g, ""), "Telefone copiado!")}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md"
                      >
                        <Phone className="h-4 w-4" />
                      </Button>
                    )}
                    {c.telefone && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        title="Abrir WhatsApp"
                        onClick={() => window.open(whatsappLink(c.telefone), "_blank")}
                        className="h-8 w-8 p-0 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/15 rounded-md"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      title="Ver detalhes completos"
                      onClick={() => { setSelected(c); setQ(""); }}
                      className="h-8 w-8 p-0 text-blue-400 hover:text-blue-300 hover:bg-blue-500/15 rounded-md"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      title="Ir para o cadastro do cliente"
                      onClick={() => irParaCliente(c)}
                      className="h-8 w-8 p-0 text-primary hover:text-primary hover:bg-primary/15 rounded-md"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}

            {revResults.length > 0 && (
              <div className="px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/60 sticky top-0 z-10 backdrop-blur-sm">
                Revendedores ({revResults.length})
              </div>
            )}
            {revResults.map((r) => (
              <Link
                key={r.id}
                to="/revendedores"
                search={{ q: r.nome } as any}
                onClick={() => setQ("")}
                className="w-full text-left px-3.5 py-2.5 hover:bg-accent/80 transition-colors flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm truncate">{r.nome}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Revendedor</Badge>
                    {r.status && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{String(r.status).toUpperCase()}</Badge>}
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
              <div className="px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/60 sticky top-0 z-10 backdrop-blur-sm">
                Ativações ({ativResults.length})
              </div>
            )}
            {ativResults.map((a) => (
              <Link
                key={a.id}
                to="/ativacoes"
                search={{ q: a.cliente_nome || a.mac || a.device } as any}
                onClick={() => setQ("")}
                className="w-full text-left px-3.5 py-2.5 hover:bg-accent/80 transition-colors flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm truncate">{a.cliente_nome || a.device || a.mac}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Ativação</Badge>
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
        <DialogContent className="max-w-xl max-h-[85vh] overflow-auto">
          {selected && (() => {
            const st = statusMeta(statusEfetivo(selected));
            const loc = localizacao(selected);
            const dias = diasParaVencer(selected.data_vencimento);
            const contasVinculadas = encontrarContasVinculadas(selected, allClientes);
            const isMulti = contasVinculadas.length > 1;

            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" /> {selected.nome}
                  </DialogTitle>
                  <DialogDescription className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={st.color}>{st.label}</Badge>
                    {isMulti && (
                      <Badge className="bg-purple-500/15 border border-purple-500/30 text-purple-400 font-semibold">
                        {contasVinculadas.length} Contas Vinculadas
                      </Badge>
                    )}
                    <Badge variant="secondary">Localizado em: {loc.label}</Badge>
                  </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Info icon={Phone} label="Telefone" value={selected.telefone ? maskPhoneBR(selected.telefone) : "-"} />
                  <Info icon={Server} label="Servidor" value={selected.servidor?.nome || "-"} />
                  <Info icon={Tv} label="Aplicativo" value={selected.aplicativo || "-"} />
                  <Info icon={Calendar} label="Data de início" value={formatDateBR(selected.data_inicio)} />
                  <Info icon={Calendar} label="Vencimento" value={`${formatDateBR(selected.data_vencimento)}${dias !== null ? ` (${dias >= 0 ? `+${dias}` : dias}d)` : ""}`} />
                  <Info icon={DollarSign} label="Valor pago" value={currencyBRL(selected.valor_pago)} />
                  <Info icon={DollarSign} label="Custo" value={currencyBRL(selected.servidor?.custo_mensal ?? selected.custo_snapshot ?? 0)} />
                  <Info label="Pagamento" value={selected.status_pagamento === "pago" ? "Pago" : "Devendo"} />
                  <Info label="MAC" value={selected.mac || "-"} />
                  <Info label="Device" value={selected.device || "-"} />
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

                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <Button size="sm" className="flex-1 bg-primary min-w-[120px]" onClick={() => irParaCliente(selected)}>
                    <ArrowRight className="h-4 w-4 mr-1" /> Ir para cliente
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 min-w-[130px]" onClick={() => copiarComprovante(selected, true)}>
                    <ClipboardCopy className="h-4 w-4 mr-1 text-emerald-400" />
                    {isMulti ? "Copiar Individual" : "Copiar Comprovante"}
                  </Button>
                  {isMulti && (
                    <Button size="sm" variant="outline" className="flex-1 min-w-[140px] border-purple-500/40 text-purple-400 hover:bg-purple-500/10" onClick={() => copiarComprovante(selected, false)}>
                      <ClipboardCopy className="h-4 w-4 mr-1 text-purple-400" />
                      Copiar Coletivo ({contasVinculadas.length})
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline" className="px-3">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60">
                      <DropdownMenuLabel>Ações do cliente</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {selected.telefone && (
                        <DropdownMenuItem onClick={() => window.open(whatsappLink(selected.telefone), "_blank")}>
                          <MessageCircle className="h-4 w-4 mr-2 text-emerald-400" /> Abrir WhatsApp
                        </DropdownMenuItem>
                      )}
                      {isMulti ? (
                        <>
                          <DropdownMenuItem onClick={() => copiarComprovante(selected, false)} className="font-semibold text-purple-400">
                            <ClipboardCopy className="h-4 w-4 mr-2 text-purple-400" />
                            Copiar Coletivo ({contasVinculadas.length} contas)
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => copiarComprovante(selected, true)}>
                            <ClipboardCopy className="h-4 w-4 mr-2 text-emerald-400" />
                            Copiar Individual
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleGerarImagemVencimento(selected)}>
                            <Download className="h-4 w-4 mr-2 text-cyan-400" />
                            Gerar PNG Coletivo ({contasVinculadas.length} contas)
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleCopiarImagemVencimento(selected)}>
                            <Copy className="h-4 w-4 mr-2 text-cyan-400" />
                            Copiar PNG Coletivo ({contasVinculadas.length} contas)
                          </DropdownMenuItem>
                        </>
                      ) : (
                        <>
                          <DropdownMenuItem onClick={() => copiarComprovante(selected, true)}>
                            <ClipboardCopy className="h-4 w-4 mr-2 text-emerald-400" />
                            Copiar Comprovante (Texto)
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleGerarImagemVencimento(selected)}>
                            <Download className="h-4 w-4 mr-2 text-cyan-400" />
                            Gerar o PNG
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleCopiarImagemVencimento(selected)}>
                            <Copy className="h-4 w-4 mr-2 text-cyan-400" />
                            Copiar o PNG
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => copiarTexto(selected.nome, "Nome copiado!")}>
                        <User className="h-4 w-4 mr-2" /> Copiar nome
                      </DropdownMenuItem>
                      {selected.telefone && (
                        <DropdownMenuItem onClick={() => copiarTexto(String(selected.telefone).replace(/\D/g, ""), "Telefone copiado!")}>
                          <Phone className="h-4 w-4 mr-2" /> Copiar telefone
                        </DropdownMenuItem>
                      )}
                      {selected.mac && (
                        <DropdownMenuItem onClick={() => copiarTexto(selected.mac, "MAC copiado!")}>
                          <Copy className="h-4 w-4 mr-2" /> Copiar MAC
                        </DropdownMenuItem>
                      )}
                      {selected.device && (
                        <DropdownMenuItem onClick={() => copiarTexto(selected.device, "Device copiado!")}>
                          <Copy className="h-4 w-4 mr-2" /> Copiar Device
                        </DropdownMenuItem>
                      )}
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