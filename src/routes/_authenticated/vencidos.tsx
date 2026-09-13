import { ServidorSelectItems, ServidorDropdownItems } from "@/lib/servidores-ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { custoCliente, creditosPorDias, registrarMovimentacaoCredito } from "@/lib/creditos";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchClientes, fetchClientesExcluidos, fetchServidores, fetchHistorico } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Search, Pencil, Trash2, Copy, RefreshCw, Eye, Download, ClipboardCopy, DollarSign as DollarIcon, Send, Archive, RotateCcw, MoreVertical, Smartphone, User, Users, Phone, MessageCircle, Image as ImageIcon, ExternalLink, Clock, History, AlertCircle, Undo2 } from "lucide-react";
import { fetchAplicativosCatalogo, fetchAplicativosSites, findAppSiteUrl } from "@/lib/aplicativos";
import { useEffect, useMemo, useRef, useState } from "react";
import { addDaysISO, currencyBRL, diasParaVencer, formatDateBR, formatDateTimeBR, maskPhoneBR, toISODate, whatsappLink } from "@/lib/iptv";
import { ClienteDialog } from "@/components/cliente-dialog";
import { AcrescentarDiasDialog } from "@/components/acrescentar-dias-dialog";
import { reverterUltimaRenovacao } from "@/lib/reverter-renovacao";
import { FichaClienteDialog } from "@/components/ficha-cliente-dialog";
import {
  copyComprovanteVencimentoImageToClipboard,
  exportComprovanteVencimentoPNG,
  comprovanteVencimentoTextoFormatado,
  encontrarContasVinculadas,
  comprovanteVencimentoMultiContasTextoFormatado,
  extrairNomeBaseCliente,
} from "@/lib/comprovante-vencimento-generator";
import { toast } from "sonner";
import { StatCard } from "@/components/stat-card";
import * as XLSX from "xlsx";
import { PaginationControls, INITIAL_LOAD, LOAD_STEP, type PageSize } from "@/components/pagination-controls";
import { DensityToggle, densityClass, type Density } from "@/components/density-toggle";
import { confirmDialog } from "@/lib/confirm";
import { AtivacaoClienteDialog } from "@/components/ativacao-cliente-dialog";
import { logAudit } from "@/lib/audit";
import { EnviosMassaDialog } from "@/components/envios-massa-dialog";

type SubTab = "vencidos" | "arquivados" | "excluidos";

export const Route = createFileRoute("/_authenticated/vencidos")({
  validateSearch: zodValidator(z.object({
    q: fallback(z.string(), "").default(""),
    clienteId: fallback(z.string(), "").default(""),
    tab: fallback(z.enum(["vencidos", "arquivados", "excluidos"]), "vencidos").default("vencidos"),
    atraso: fallback(z.enum(["todos", "1d", "2d", "mais2d"]), "todos").default("todos"),
  })),
  component: VencidosPage,
});

function VencidosPage() {
  const qc = useQueryClient();
  const searchParams = Route.useSearch();
  const { data: clientes = [] } = useQuery({ queryKey: ["clientes"], queryFn: fetchClientes });
  const { data: excluidos = [] } = useQuery({ queryKey: ["clientes-excluidos"], queryFn: fetchClientesExcluidos });
  const { data: servidores = [] } = useQuery({ queryKey: ["servidores"], queryFn: fetchServidores });
  const { data: historico = [] } = useQuery({ queryKey: ["historico"], queryFn: () => fetchHistorico() });
  const { data: catalogoApps = [] } = useQuery({ queryKey: ["aplicativos_catalogo"], queryFn: fetchAplicativosCatalogo });
  const { data: sitesApps = [] } = useQuery({ queryKey: ["aplicativos_sites"], queryFn: fetchAplicativosSites });
  const [q, setQ] = useState(searchParams.q ?? "");
  const [pagamentoFiltro, setPagamentoFiltro] = useState<string>("todos");
  const [atrasoFiltro, setAtrasoFiltro] = useState<"todos" | "1d" | "2d" | "mais2d">(searchParams.atraso ?? "todos");
  const [servidorFiltro, setServidorFiltro] = useState<string>("todos");
  const [tab, setTab] = useState<SubTab>(searchParams.tab ?? "vencidos");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [renovOpen, setRenovOpen] = useState(false);
  const [renovCliente, setRenovCliente] = useState<any | null>(null);
  const [ativOpen, setAtivOpen] = useState(false);
  const [ativCliente, setAtivCliente] = useState<any | null>(null);
  const [fichaOpen, setFichaOpen] = useState(false);
  const [fichaCliente, setFichaCliente] = useState<any | null>(null);
  const [loadedCount, setLoadedCount] = useState<number>(INITIAL_LOAD);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [page, setPage] = useState<number>(1);
  const [density, setDensity] = useState<Density>("compact");
  const openedFromSearchRef = useRef<string | null>(null);

  useEffect(() => {
    if (!searchParams.q) return;
    setQ(searchParams.q);
  }, [searchParams.q]);

  useEffect(() => {
    if (searchParams.atraso) {
      setAtrasoFiltro(searchParams.atraso);
    }
  }, [searchParams.atraso]);

  useEffect(() => {
    if (!searchParams.clienteId || openedFromSearchRef.current === searchParams.clienteId) return;
    const cliente = (clientes as any[]).find((c) => c.id === searchParams.clienteId) ||
                    (excluidos as any[]).find((c) => c.id === searchParams.clienteId);
    if (!cliente) return;
    openedFromSearchRef.current = searchParams.clienteId;
    setQ(cliente.nome ?? searchParams.q ?? "");
    setPagamentoFiltro("todos");
    setServidorFiltro("todos");
    setAtrasoFiltro("todos");
    const d = diasParaVencer(cliente.data_vencimento);
    if (cliente.deleted_at) {
      setTab("excluidos");
    } else {
      setTab("vencidos");
    }
    setPage(1);
  }, [clientes, excluidos, searchParams.clienteId, searchParams.q]);

  const applyFilters = (list: any[]) => list
    .filter((c: any) => pagamentoFiltro === "todos" || (c.status_pagamento ?? "devendo") === pagamentoFiltro)
    .filter((c: any) => servidorFiltro === "todos" || c.servidor_id === servidorFiltro)
    .filter((c: any) => !q || [c.nome, c.telefone, c.mac, c.device, c.aplicativo, c.servidor?.nome]
      .some((x) => String(x ?? "").toLowerCase().includes(q.toLowerCase())));

  const sortByVenc = (a: any, b: any) => {
    const diff = (diasParaVencer(b.data_vencimento) ?? 0) - (diasParaVencer(a.data_vencimento) ?? 0);
    if (diff !== 0) return diff;
    return String(a.nome ?? "").localeCompare(String(b.nome ?? ""), "pt-BR", { sensitivity: "base" });
  };

  const vencidos = useMemo(() => {
    return applyFilters(
      (clientes as any[]).filter((c) => {
        if (c.status === "cancelado" || c.status === "suspenso") return false;
        const d = diasParaVencer(c.data_vencimento);
        const matchVenc = (d !== null && d < 0) || (c.status === "vencido" && (d === null || d < 0));
        if (!matchVenc) return false;
        if (atrasoFiltro === "1d") return d === -1;
        if (atrasoFiltro === "2d") return d === -2;
        if (atrasoFiltro === "mais2d") return d !== null && d < -2;
        return true;
      }),
    ).sort(sortByVenc);
  }, [clientes, q, pagamentoFiltro, servidorFiltro, atrasoFiltro]);

  const statsVencidos = useMemo(() => {
    const list = (clientes as any[]).filter((c) => {
      if (c.status === "cancelado" || c.status === "suspenso") return false;
      const d = diasParaVencer(c.data_vencimento);
      return (d !== null && d < 0) || (c.status === "vencido" && (d === null || d < 0));
    });
    const total = list.length;
    const v1 = list.filter((c) => diasParaVencer(c.data_vencimento) === -1).length;
    const v2 = list.filter((c) => diasParaVencer(c.data_vencimento) === -2).length;
    const vMais = list.filter((c) => {
      const d = diasParaVencer(c.data_vencimento);
      return d !== null && d < -2;
    }).length;
    return { total, v1, v2, vMais };
  }, [clientes]);

  const totalAtivos = useMemo(() => {
    return (clientes as any[]).filter((c) => {
      const d = diasParaVencer(c.data_vencimento);
      return (d === null || d >= 0) && c.status !== "cancelado" && c.status !== "suspenso" && c.status !== "vencido";
    }).length;
  }, [clientes]);

  const arquivados = useMemo(() => {
    return applyFilters(
      (clientes as any[]).filter((c) => {
        if (c.status === "cancelado" || c.status === "suspenso") return false;
        const d = diasParaVencer(c.data_vencimento);
        return d !== null && d < -365;
      }),
    ).sort((a: any, b: any) => (diasParaVencer(a.data_vencimento) ?? 0) - (diasParaVencer(b.data_vencimento) ?? 0));
  }, [clientes, q, pagamentoFiltro, servidorFiltro]);

  const excluidosLista = useMemo(() => applyFilters(excluidos as any[]), [excluidos, q, pagamentoFiltro, servidorFiltro]);

  const lista = tab === "vencidos" ? vencidos : tab === "arquivados" ? arquivados : excluidosLista;
  const total = lista.length;
  const loaded = Math.min(loadedCount, total);
  const totalPages = Math.max(1, Math.ceil(loaded / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const paginated = useMemo(
    () => lista.slice(0, loaded).slice(pageStart, pageStart + pageSize),
    [lista, loaded, pageStart, pageSize],
  );

  async function remove(id: string) {
    const ok = await confirmDialog({
      title: "Mover para a lixeira?",
      description: "O cliente poderá ser restaurado em Vencidos › Excluídos.",
      confirmText: "Mover para lixeira",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("clientes").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Cliente movido para a lixeira");
    qc.invalidateQueries();
  }

  async function restaurar(id: string) {
    const { error } = await supabase.from("clientes").update({ deleted_at: null }).eq("id", id);
    if (error) return toast.error(error.message);
    await logAudit({ categoria: "backup", acao: "restaurar", descricao: "Cliente restaurado da lixeira", entidade: "clientes", entidade_id: id });
    toast.success("Cliente restaurado");
    qc.invalidateQueries();
  }

  async function excluirDefinitivo(id: string) {
    const ok = await confirmDialog({
      title: "Excluir definitivamente?",
      description: "Esta ação NÃO pode ser desfeita. O cliente e seu histórico serão apagados.",
      confirmText: "Excluir para sempre",
      destructive: true,
    });
    if (!ok) return;
    const target = (lista as any[]).find((c: any) => c.id === id);
    const { error } = await supabase.from("clientes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    const nome = target?.nome ?? "";
    await logAudit({
      categoria: "cliente",
      acao: "excluir_definitivo",
      descricao: nome ? `Cliente "${nome}" excluído definitivamente` : "Cliente excluído definitivamente",
      entidade: "clientes",
      entidade_id: id,
      entidade_nome: nome || null,
      dados_anteriores: target ?? null,
    });
    toast.success("Cliente excluído definitivamente");
    qc.invalidateQueries();
  }

  async function changeServidor(clienteId: string, servidorId: string) {
    const { error } = await supabase.from("clientes").update({ servidor_id: servidorId }).eq("id", clienteId);
    if (error) return toast.error(error.message);
    toast.success("Servidor atualizado!");
    qc.invalidateQueries();
  }

  async function duplicate(c: any) {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;
    const { id, created_at, updated_at, deleted_at, servidor, ...rest } = c;
    const { error } = await supabase.from("clientes").insert({ ...rest, user_id: user.id, nome: `${c.nome} (cópia)` });
    if (error) return toast.error(error.message);
    toast.success("Duplicado!");
    qc.invalidateQueries();
  }

  async function addDias(c: any, dias: number) {
    const diasRestantes = diasParaVencer(c.data_vencimento) ?? 0;
    const baseVenc = c.data_vencimento && diasRestantes >= 0 ? c.data_vencimento : toISODate(new Date());
    const novo = addDaysISO(baseVenc, dias);
    const custo = custoCliente(c, historico);
    const creditos = creditosPorDias(dias);

    const ok = await confirmDialog({
      title: `Confirmar acréscimo de ${dias} dias`,
      description: `Cliente: ${c.nome}\nVencimento: ${formatDateBR(c.data_vencimento)} → ${formatDateBR(novo)}\nCréditos a descontar: ${creditos}\nCusto: ${currencyBRL(custo)}\n\nConfirma o acréscimo de dias?`,
      confirmText: "Confirmar acréscimo",
    });
    if (!ok) return;

    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;
    const dParaVencer = diasParaVencer(novo);
    const targetStatus = dParaVencer === null || dParaVencer >= 0 ? "ativo" : "vencido";
    const { error } = await supabase.from("clientes").update({ data_vencimento: novo, status: targetStatus }).eq("id", c.id);
    if (error) return toast.error(error.message);
    await supabase.from("historico_renovacoes").insert({
      user_id: user.id, cliente_id: c.id, dias_adicionados: dias, valor_recebido: 0,
      custo, lucro: -custo, vencimento_anterior: c.data_vencimento, vencimento_novo: novo,
    });
    if (c.servidor_id && creditos > 0) {
      await registrarMovimentacaoCredito({
        servidor_id: c.servidor_id,
        quantidade: -creditos,
        tipo: "renovacao",
        motivo: `Acréscimo ${dias}d — ${c.nome}`,
        cliente_id: c.id,
      });
    }
    toast.success(`+${dias} dias`);
    qc.invalidateQueries({ queryKey: ["clientes"] });
    qc.invalidateQueries({ queryKey: ["historico"] });
    qc.invalidateQueries();
  }

  async function renovar(c: any) {
    const diasStr = prompt("Quantos dias renovar?", "30");
    if (!diasStr) return;
    const dias = Number(diasStr);
    if (!dias || dias <= 0) return toast.error("Informe uma quantidade válida de dias");
    const valorStr = prompt("Valor cobrado/recebido (R$)?", String(c.valor_pago || 30));
    if (valorStr === null) return;
    const valor = Number(valorStr);
    const diasRestantes = diasParaVencer(c.data_vencimento) ?? 0;
    const baseVenc = c.data_vencimento && diasRestantes >= 0 ? c.data_vencimento : toISODate(new Date());
    const novo = addDaysISO(baseVenc, dias);
    const custo = custoCliente(c, historico);
    const creditos = creditosPorDias(dias);

    const ok = await confirmDialog({
      title: "Confirmar valor da renovação",
      description: `Cliente: ${c.nome}\nDias adicionados: +${dias} dias\nVencimento: ${formatDateBR(c.data_vencimento)} → ${formatDateBR(novo)}\nValor cobrado/recebido: ${currencyBRL(valor)}\nCusto: ${currencyBRL(custo)}\nLucro: ${currencyBRL(valor - custo)}\nCréditos a debitar: ${creditos}\n\nConfirma o valor e a autorização desta renovação?`,
      confirmText: "Autorizar renovação",
    });
    if (!ok) return;

    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;
    const { error } = await supabase.from("clientes").update({
      data_vencimento: novo, valor_pago: valor, status_pagamento: "pago", status: "ativo",
    }).eq("id", c.id);
    if (error) return toast.error(error.message);
    await supabase.from("historico_renovacoes").insert({
      user_id: user.id, cliente_id: c.id, dias_adicionados: dias, valor_recebido: valor,
      custo, lucro: valor - custo, vencimento_anterior: c.data_vencimento, vencimento_novo: novo,
      status_pagamento: "pago",
    });

    if (c.servidor_id && creditos > 0) {
      await registrarMovimentacaoCredito({
        servidor_id: c.servidor_id,
        quantidade: -creditos,
        tipo: "renovacao",
        motivo: `Renovação ${dias}d (Pago) — ${c.nome}`,
        cliente_id: c.id,
      });
    }

    toast.success("Renovado!");
    await logAudit({ categoria: "renovacao", acao: "renovar", descricao: `Renovação rápida de "${c.nome}" (+${dias} dias / ${currencyBRL(valor)})`, entidade: "clientes", entidade_id: c.id, entidade_nome: c.nome, dados_anteriores: { data_vencimento: c.data_vencimento }, dados_novos: { data_vencimento: novo, valor_recebido: valor } });
    qc.invalidateQueries();
  }

  function ficha(c: any) {
    setFichaCliente(c);
    setFichaOpen(true);
  }

  async function reverterRenovacao(c: any) {
    const ok = await reverterUltimaRenovacao(c);
    if (ok) {
      qc.invalidateQueries({ queryKey: ["clientes"] });
      qc.invalidateQueries({ queryKey: ["historico"] });
      qc.invalidateQueries({ queryKey: ["creditos_saldos"] });
      qc.invalidateQueries({ queryKey: ["creditos_movs"] });
      qc.invalidateQueries({ queryKey: ["faturamento_bruto_dia"] });
      qc.invalidateQueries();
    }
  }

  async function copiarComprovante(c: any, forceSingle = false) {
    const contas = forceSingle ? [c] : encontrarContasVinculadas(c, clientes);
    const ids = contas.map((item) => item.id);
    const { data: ultimas } = await supabase
      .from("historico_renovacoes")
      .select("created_at, vencimento_novo, dias_adicionados")
      .in("cliente_id", ids)
      .order("created_at", { ascending: false })
      .limit(1);

    const ultima = ultimas && ultimas.length > 0 ? ultimas[0] : null;
    const msg = contas.length > 1
      ? comprovanteVencimentoMultiContasTextoFormatado(contas, ultima)
      : comprovanteVencimentoTextoFormatado(c, ultima);

    navigator.clipboard.writeText(msg);
    if (contas.length > 1) {
      toast.success(`Comprovante Unificado copiado (${contas.length} telas)!`);
    } else {
      toast.success("Comprovante copiado!");
    }
  }

  async function enviarComprovanteWhatsApp(c: any, forceSingle = false) {
    const contas = forceSingle ? [c] : encontrarContasVinculadas(c, clientes);
    const ids = contas.map((item) => item.id);
    const { data: ultimas } = await supabase
      .from("historico_renovacoes")
      .select("created_at, vencimento_novo, dias_adicionados")
      .in("cliente_id", ids)
      .order("created_at", { ascending: false })
      .limit(1);

    const ultima = ultimas && ultimas.length > 0 ? ultimas[0] : null;
    const msg = contas.length > 1
      ? comprovanteVencimentoMultiContasTextoFormatado(contas, ultima)
      : comprovanteVencimentoTextoFormatado(c, ultima);

    navigator.clipboard.writeText(msg);
    const tel = contas.find((item) => item.telefone)?.telefone || c.telefone;
    if (tel) {
      window.open(`${whatsappLink(tel)}?text=${encodeURIComponent(msg)}`, "_blank");
      toast.success(contas.length > 1 ? `Abrindo WhatsApp com comprovante unificado (${contas.length} telas)...` : "Abrindo WhatsApp com comprovante...");
    } else {
      toast.success("Comprovante copiado! (Telefone não informado)");
    }
  }

  async function handleCopiarImagemVencimento(c: any, forceSingle = false) {
    const contas = forceSingle ? [c] : encontrarContasVinculadas(c, clientes);
    const toastId = toast.loading(contas.length > 1 ? `Gerando comprovante PNG (${contas.length} telas)...` : "Gerando comprovante PNG...");
    try {
      const ok = await copyComprovanteVencimentoImageToClipboard(c, contas.length > 1 ? contas : undefined);
      if (ok) {
        toast.success(contas.length > 1 ? `Comprovante PNG Unificado copiado (${contas.length} telas)! Cole no WhatsApp.` : "Comprovante PNG copiado! Cole no WhatsApp com Ctrl + V.", { id: toastId });
      } else {
        toast.error("Seu navegador não suporta cópia direta de imagem. Use 'Gerar o PNG'.", { id: toastId });
      }
    } catch (err: any) {
      toast.error(err?.message || "Falha ao copiar imagem do comprovante", { id: toastId });
    }
  }

  async function handleGerarImagemVencimento(c: any, forceSingle = false) {
    const contas = forceSingle ? [c] : encontrarContasVinculadas(c, clientes);
    const toastId = toast.loading(contas.length > 1 ? `Gerando comprovante PNG (${contas.length} telas)...` : "Gerando comprovante PNG...");
    try {
      await exportComprovanteVencimentoPNG(c, contas.length > 1 ? contas : undefined);
      toast.success(contas.length > 1 ? `Comprovante PNG Unificado baixado (${contas.length} telas)!` : "Comprovante PNG baixado com sucesso!", { id: toastId });
    } catch (err: any) {
      toast.error(err?.message || "Falha ao gerar comprovante PNG", { id: toastId });
    }
  }

  function montarTextoCredenciais(c: any) {
    const conta = String(c.mac ?? "").trim();
    const senha = String(c.device ?? "").trim();
    const linhas = [
      `Segue os dados de acesso:`,
      ``,
      `*CONTA:* ${conta}`,
      `*SENHA:* ${senha}`,
    ];
    return linhas.join("\n");
  }

  function enviarCredenciais(c: any) {
    const msg = montarTextoCredenciais(c);
    navigator.clipboard.writeText(msg);
    toast.success("Credenciais copiadas!");
  }

  function enviarCredenciaisWhatsApp(c: any) {
    const msg = montarTextoCredenciais(c);
    navigator.clipboard.writeText(msg);
    if (c.telefone) {
      window.open(`${whatsappLink(c.telefone)}?text=${encodeURIComponent(msg)}`, "_blank");
      toast.success("Abrindo WhatsApp com as credenciais...");
    } else {
      toast.success("Credenciais copiadas! (Telefone não informado)");
    }
  }

  async function togglePagamento(c: any) {
    const novo = c.status_pagamento === "pago" ? "devendo" : "pago";
    const { error } = await supabase.from("clientes").update({ status_pagamento: novo }).eq("id", c.id);
    if (error) return toast.error(error.message);

    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (user) {
        if (novo === "pago") {
          const { data: pend } = await supabase
            .from("historico_renovacoes")
            .select("id, valor_pendente, custo, created_at")
            .eq("cliente_id", c.id)
            .eq("status_pagamento", "devendo" as any)
            .neq("status", "cancelada")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const valor = Number((pend as any)?.valor_pendente || c.valor_pago || 0);
          const custoH = Number((pend as any)?.custo || 0);
          const isSameDay = pend && toISODate(new Date((pend as any).created_at)) === toISODate(new Date());

          if (pend && isSameDay) {
            await supabase.from("historico_renovacoes").update({
              status_pagamento: "pago" as any,
              valor_recebido: valor,
              valor_pendente: 0,
              lucro: valor - custoH,
              pago_em: new Date().toISOString(),
            } as any).eq("id", (pend as any).id);
          } else {
            if (pend) {
              await supabase.from("historico_renovacoes").update({
                valor_pendente: 0,
                pago_em: new Date().toISOString(),
              } as any).eq("id", (pend as any).id);
            }
            await supabase.from("historico_renovacoes").insert({
              user_id: user.id,
              cliente_id: c.id,
              dias_adicionados: 0,
              valor_recebido: valor,
              valor_pendente: 0,
              custo: 0,
              lucro: valor,
              vencimento_anterior: c.data_vencimento,
              vencimento_novo: c.data_vencimento,
              status_pagamento: "pago" as any,
              pago_em: new Date().toISOString(),
            } as any);
          }
        } else {
          const { data: recHoje } = await supabase
            .from("historico_renovacoes")
            .select("id")
            .eq("cliente_id", c.id)
            .eq("dias_adicionados", 0)
            .eq("status_pagamento", "pago" as any)
            .neq("status", "cancelada")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (recHoje) {
            await supabase.from("historico_renovacoes").update({
              status: "cancelada" as any,
              cancelado_em: new Date().toISOString(),
            } as any).eq("id", (recHoje as any).id);
          }

          const { data: ult } = await supabase
            .from("historico_renovacoes")
            .select("id, custo")
            .eq("cliente_id", c.id)
            .neq("status", "cancelada")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (ult) {
            await supabase.from("historico_renovacoes").update({
              status_pagamento: "devendo" as any,
              valor_pendente: Number(c.valor_pago || 0),
              valor_recebido: 0,
              lucro: -Number((ult as any).custo || 0),
              pago_em: null,
            } as any).eq("id", (ult as any).id);
          }
        }
      }
    } catch {
      // não bloqueia
    }

    toast.success(novo === "pago" ? "Marcado como PAGO — faturamento atualizado" : "Marcado como DEVENDO");
    qc.invalidateQueries();
  }

  function exportar() {
    const data = lista.map((c: any) => ({
      Cliente: c.nome, Telefone: c.telefone ? maskPhoneBR(c.telefone) : "", Servidor: c.servidor?.nome,
      "Data Início": formatDateTimeBR(c.data_inicio),
      Vencimento: formatDateBR(c.data_vencimento),
      Status: c.status, Pagamento: c.status_pagamento,
      Custo: custoCliente(c, historico),
      "Valor Pago": Number(c.valor_pago),
      MAC: c.mac, Device: c.device, Aplicativo: c.aplicativo, Observação: c.observacao,
      ...(tab === "excluidos" ? { "Excluído em": c.deleted_at ? formatDateTimeBR(c.deleted_at) : "" } : {}),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    const sheetName = tab === "vencidos" ? "Vencidos" : tab === "arquivados" ? "Arquivados" : "Excluidos";
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${tab}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function excluirTodosDaAba() {
    if (tab === "excluidos") {
      if (excluidosLista.length === 0) return toast.info("A lixeira já está vazia.");
      const ok1 = await confirmDialog({
        title: `Esvaziar a lixeira? (${excluidosLista.length} cliente(s))`,
        description: "Todos os clientes da lixeira serão APAGADOS PERMANENTEMENTE, junto com seus históricos.\n\nEsta ação NÃO pode ser desfeita.",
        confirmText: "Continuar",
        destructive: true,
      });
      if (!ok1) return;
      const ok2 = await confirmDialog({
        title: "Tem certeza absoluta?",
        description: "Última confirmação. Após isso, não há como recuperar.",
        confirmText: "Excluir tudo para sempre",
        destructive: true,
      });
      if (!ok2) return;
      const ids = excluidosLista.map((c: any) => c.id as string);
      const BATCH = 100;
      let removed = 0;
      for (let i = 0; i < ids.length; i += BATCH) {
        const chunk = ids.slice(i, i + BATCH);
        const { error } = await supabase.from("clientes").delete().in("id", chunk);
        if (error) { toast.error(error.message); break; }
        removed += chunk.length;
      }
      toast.success(`${removed} cliente(s) excluído(s) definitivamente`);
      await logAudit({ categoria: "backup", acao: "excluir_definitivo", descricao: `Lixeira esvaziada — ${removed} cliente(s) excluído(s) definitivamente`, entidade: "clientes", metadata: { quantidade: removed } });
      qc.invalidateQueries();
      return;
    }
    const alvo = tab === "vencidos" ? vencidos : arquivados;
    if (alvo.length === 0) return;
    const ok = await confirmDialog({
      title: `Mover ${alvo.length} clientes para a lixeira?`,
      description: "Todos os clientes filtrados serão movidos para Excluídos e poderão ser restaurados.",
      confirmText: "Mover para lixeira",
      destructive: true,
    });
    if (!ok) return;
    const ids = alvo.map((c: any) => c.id);
    const { error } = await supabase.from("clientes").update({ deleted_at: new Date().toISOString() }).in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`${ids.length} clientes movidos para a lixeira`);
    qc.invalidateQueries();
  }

  const tabConfig: Record<SubTab, { title: string; sub: string; icon: any; tone: string; badgeClass: string; badgeText: string; headerBg: string }> = {
    vencidos: { title: "Vencidos", sub: "Todos os clientes com pagamentos vencidos", icon: AlertTriangle, tone: "text-red-400", badgeClass: "bg-red-500/20 text-red-400 border border-red-500/40", badgeText: "VENCIDO", headerBg: "bg-red-500/10" },
    arquivados: { title: "Arquivados (+365d)", sub: "Clientes vencidos há mais de 365 dias — consulta histórica", icon: Archive, tone: "text-zinc-300", badgeClass: "bg-zinc-500/20 text-zinc-300 border border-zinc-500/40", badgeText: "ARQUIVADO", headerBg: "bg-zinc-500/10" },
    excluidos: { title: "Excluídos", sub: "Clientes removidos manualmente — lixeira de segurança", icon: Trash2, tone: "text-orange-400", badgeClass: "bg-orange-500/20 text-orange-400 border border-orange-500/40", badgeText: "EXCLUÍDO", headerBg: "bg-orange-500/10" },
  };
  const cfg = tabConfig[tab];
  const HeaderIcon = cfg.icon;

  return (
    <div className="p-6 space-y-4">
      {/* Abas de Navegação entre Clientes Ativos e Clientes Vencidos */}
      <div className="flex items-center gap-2 border-b border-border/60 pb-3">
        <Button variant="outline" size="sm" className="h-9 px-4 font-semibold text-muted-foreground hover:text-foreground" asChild>
          <Link to="/clientes">
            <Users className="h-4 w-4 mr-2 text-emerald-400" /> Clientes Ativos ({totalAtivos})
          </Link>
        </Button>
        <Button variant="default" size="sm" className="h-9 px-4 font-semibold shadow-sm" asChild>
          <Link to="/vencidos">
            <AlertTriangle className="h-4 w-4 mr-2 text-primary-foreground" /> Clientes Vencidos ({statsVencidos.total})
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <HeaderIcon className={`h-6 w-6 ${cfg.tone}`} /> {cfg.title}
          </h1>
          <p className="text-sm text-muted-foreground">{cfg.sub}</p>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <EnviosMassaDialog clientes={clientes} />
          <Button variant="outline" size="sm" className="h-9 min-w-[120px]" onClick={exportar}>
            <Download className="h-4 w-4 mr-1"/> Exportar
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="h-9 min-w-[120px]"
            disabled={lista.length === 0}
            onClick={excluirTodosDaAba}
          >
            <Trash2 className="h-4 w-4 mr-1"/>
            {tab === "excluidos" ? "Excluir definitivamente" : "Excluir todos"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total Vencidos" value={statsVencidos.total} icon={AlertTriangle} tone="red" />
        <StatCard label="Vencidos há 1 dia" value={statsVencidos.v1} icon={AlertTriangle} tone="orange" />
        <StatCard label="Vencidos há 2 dias" value={statsVencidos.v2} icon={AlertTriangle} tone="orange" />
        <StatCard label="Mais de 2 dias" value={statsVencidos.vMais} icon={AlertTriangle} tone="red" />
        <StatCard label="Arquivados (+365 dias)" value={arquivados.length} icon={Archive} tone="blue" />
      </div>

      <Tabs value={tab} onValueChange={(v) => { setTab(v as SubTab); setPage(1); setLoadedCount(INITIAL_LOAD); }}>
        <TabsList>
          <TabsTrigger value="vencidos"><AlertTriangle className="h-4 w-4 mr-1"/> Vencidos ({statsVencidos.total})</TabsTrigger>
          <TabsTrigger value="arquivados"><Archive className="h-4 w-4 mr-1"/> Arquivados ({arquivados.length})</TabsTrigger>
          <TabsTrigger value="excluidos"><Trash2 className="h-4 w-4 mr-1"/> Excluídos ({excluidosLista.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="p-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, telefone, MAC, device, app..." className="pl-9" />
          </div>
          {tab === "vencidos" && (
            <Select value={atrasoFiltro} onValueChange={(v: any) => { setAtrasoFiltro(v); setPage(1); }}>
              <SelectTrigger className="md:w-48"><SelectValue placeholder="Atraso" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos atrasos ({statsVencidos.total})</SelectItem>
                <SelectItem value="1d">Vencidos há 1 dia ({statsVencidos.v1})</SelectItem>
                <SelectItem value="2d">Vencidos há 2 dias ({statsVencidos.v2})</SelectItem>
                <SelectItem value="mais2d">Mais de 2 dias ({statsVencidos.vMais})</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Select value={pagamentoFiltro} onValueChange={setPagamentoFiltro}>
            <SelectTrigger className="md:w-48"><SelectValue placeholder="Pagamento" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os pagamentos</SelectItem>
              <SelectItem value="pago">Pagos</SelectItem>
              <SelectItem value="devendo">Pendentes</SelectItem>
            </SelectContent>
          </Select>
          <Select value={servidorFiltro} onValueChange={setServidorFiltro}>
            <SelectTrigger className="md:w-56">
              <SelectValue placeholder="Servidor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os servidores</SelectItem>
              <ServidorSelectItems servidores={servidores as any[]} />
            </SelectContent>
          </Select>
          <DensityToggle value={density} onChange={setDensity} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className={`overflow-x-auto ${densityClass(density)}`}>
          <Table>
            <TableHeader className={cfg.headerBg}>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="whitespace-nowrap">Celular</TableHead>
                <TableHead>Servidor</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>{tab === "excluidos" ? "Excluído em" : "Dias"}</TableHead>
                <TableHead>Pgto</TableHead>
                <TableHead>Custo</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Lucro</TableHead>
                <TableHead>MAC</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>App</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((c: any) => {
                const dias = diasParaVencer(c.data_vencimento) ?? 0;
                const custo = custoCliente(c, historico);
                const lucro = Number(c.valor_pago) - custo;
                const isExcluido = tab === "excluidos";
                const contasVinculadas = encontrarContasVinculadas(c, clientes);
                const isMulti = contasVinculadas.length > 1;
                return (
                  <TableRow key={c.id} className="text-xs">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <CopyableCell value={c.nome} />
                        {isMulti && (
                          <Badge
                            className="text-[10px] px-1.5 py-0 bg-purple-500/15 border border-purple-500/30 text-purple-400 font-semibold cursor-help"
                            title={`Cliente com ${contasVinculadas.length} telas/contas vinculadas com mesmo vencimento (${contasVinculadas.map((a: any) => a.nome).join(', ')})`}
                          >
                            {contasVinculadas.length} Telas
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {c.telefone ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger className="text-blue-400 hover:underline whitespace-nowrap">{maskPhoneBR(c.telefone)}</DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => window.open(whatsappLink(c.telefone), "_blank")}>Abrir WhatsApp</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(c.telefone); toast.success("Copiado"); }}>Copiar</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : "-"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="text-blue-400 hover:underline">
                          {c.servidor?.nome ?? "Selecionar"}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="max-h-64 overflow-auto">
                          <ServidorDropdownItems servidores={servidores as any[]} onSelect={(s) => changeServidor(c.id, s.id)} />
                          {(servidores as any[]).length === 0 && (
                            <DropdownMenuItem disabled>Nenhum servidor cadastrado</DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateBR(c.data_inicio)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateBR(c.data_vencimento)}</TableCell>
                    <TableCell>
                      <Badge className={cfg.badgeClass}>{cfg.badgeText}</Badge>
                    </TableCell>
                    <TableCell className="text-red-400 font-bold whitespace-nowrap">
                      {isExcluido ? (c.deleted_at ? formatDateTimeBR(c.deleted_at) : "-") : `${Math.abs(dias)}d`}
                    </TableCell>
                    <TableCell>
                      <Badge className={c.status_pagamento === "pago" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" : "bg-red-500/20 text-red-400 border border-red-500/40"}>
                        {c.status_pagamento === "pago" ? "PAGO" : "DEVENDO"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-red-400">{currencyBRL(custo)}</TableCell>
                    <TableCell className="text-emerald-400">{currencyBRL(c.valor_pago)}</TableCell>
                    <TableCell className={lucro >= 0 ? "text-blue-400 font-semibold" : "text-red-400 font-semibold"}>{currencyBRL(lucro)}</TableCell>
                    <TableCell className="font-mono"><CopyableCell value={c.mac} /></TableCell>
                    <TableCell className="font-mono"><CopyableCell value={c.device} /></TableCell>
                    <TableCell>
                      {c.aplicativo ? (() => {
                        const siteUrl = findAppSiteUrl(c.aplicativo, sitesApps.length > 0 ? sitesApps : catalogoApps);
                        if (siteUrl) {
                          return (
                            <a
                              href={siteUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Abrir site oficial do ${c.aplicativo}`}
                              className="inline-flex items-center gap-1 text-primary hover:text-primary/80 hover:underline font-medium group transition-colors"
                            >
                              <span>{c.aplicativo}</span>
                              <ExternalLink className="h-3 w-3 opacity-60 group-hover:opacity-100 transition-opacity shrink-0" />
                            </a>
                          );
                        }
                        return <span>{c.aplicativo}</span>;
                      })() : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-1 justify-end">
                        {/* Removed duplicate IconBtn Visualizar/Editar here as requested */}
                        {isExcluido ? (
                          <>
                            <IconBtn title="Restaurar" onClick={() => restaurar(c.id)}><RotateCcw className="h-3.5 w-3.5 text-emerald-400"/></IconBtn>
                            <IconBtn title="Excluir definitivamente" onClick={() => excluirDefinitivo(c.id)}><Trash2 className="h-3.5 w-3.5 text-red-400"/></IconBtn>
                          </>
                        ) : (
                          <>
                        <IconBtn title="Editar" onClick={() => { setEditing(c); setOpen(true); }}><Pencil className="h-3.5 w-3.5"/></IconBtn>
                        <IconBtn title="Renovar / Adicionar Dias" onClick={() => { setRenovCliente(c); setRenovOpen(true); }}>
                          <RefreshCw className="h-3.5 w-3.5"/>
                        </IconBtn>
                        <IconBtn
                          title="Copiar comprovante"
                          onClick={() => copiarComprovante(c, true)}
                        >
                          <ClipboardCopy className="h-3.5 w-3.5 text-emerald-400"/>
                        </IconBtn>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              title="Gerar comprovante"
                              className="h-7 w-7 rounded-md grid place-items-center hover:bg-accent text-cyan-400 transition-colors"
                            >
                              <ImageIcon className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            {isMulti ? (
                              <>
                                <DropdownMenuItem onClick={() => copiarComprovante(c, false)} className="cursor-pointer font-medium text-emerald-400">
                                  <ClipboardCopy className="h-4 w-4 mr-2 text-emerald-400" />
                                  Copiar Texto Unificado ({contasVinculadas.length} telas)
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleGerarImagemVencimento(c, false)} className="cursor-pointer font-medium text-cyan-400">
                                  <Download className="h-4 w-4 mr-2 text-cyan-400" />
                                  Gerar PNG Unificado ({contasVinculadas.length} telas)
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleCopiarImagemVencimento(c, false)} className="cursor-pointer font-medium text-cyan-400">
                                  <Copy className="h-4 w-4 mr-2 text-cyan-400" />
                                  Copiar PNG Unificado ({contasVinculadas.length} telas)
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => copiarComprovante(c, true)} className="cursor-pointer text-muted-foreground text-xs">
                                  <ClipboardCopy className="h-3.5 w-3.5 mr-2" />
                                  Copiar Texto (Apenas esta conta)
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleGerarImagemVencimento(c, true)} className="cursor-pointer text-muted-foreground text-xs">
                                  <Download className="h-3.5 w-3.5 mr-2" />
                                  Gerar PNG (Apenas esta conta)
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleCopiarImagemVencimento(c, true)} className="cursor-pointer text-muted-foreground text-xs">
                                  <Copy className="h-3.5 w-3.5 mr-2" />
                                  Copiar PNG (Apenas esta conta)
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <>
                                <DropdownMenuItem onClick={() => copiarComprovante(c, true)} className="cursor-pointer">
                                  <ClipboardCopy className="h-4 w-4 mr-2 text-emerald-400" />
                                  Copiar Texto do Comprovante
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleGerarImagemVencimento(c)} className="cursor-pointer">
                                  <Download className="h-4 w-4 mr-2 text-emerald-400" />
                                  Gerar o PNG
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleCopiarImagemVencimento(c)} className="cursor-pointer">
                                  <Copy className="h-4 w-4 mr-2 text-cyan-400" />
                                  Copiar o PNG
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <IconBtn title="Reverter renovação" onClick={() => reverterRenovacao(c)}><Undo2 className="h-3.5 w-3.5 text-amber-400"/></IconBtn>
                        <IconBtn
                          title={c.status_pagamento === "pago" ? "Marcar como DEVENDO" : "Marcar como PAGO"}
                          onClick={() => togglePagamento(c)}
                        >
                          <DollarIcon className={`h-3.5 w-3.5 ${c.status_pagamento === "pago" ? "text-emerald-400" : "text-red-400"}`}/>
                        </IconBtn>
                        {!isExcluido && <IconBtn title="Mover para a lixeira" onClick={() => remove(c.id)}><Trash2 className="h-3.5 w-3.5 text-red-400"/></IconBtn>}
                          </>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" title="Mais ações" className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted">
                              <MoreVertical className="h-4 w-4"/>
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-60">
                            <DropdownMenuLabel className="truncate">{c.nome}</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => ficha(c)}><Eye className="h-4 w-4 mr-2"/>Visualizar</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setAtivCliente(c); setAtivOpen(true); }}><Smartphone className="h-4 w-4 mr-2"/>Ativar aplicativo</DropdownMenuItem>
                            {!isExcluido && (
                              <>
                                <DropdownMenuItem onClick={() => { setEditing(c); setOpen(true); }}><Pencil className="h-4 w-4 mr-2"/>Editar</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => duplicate(c)}><Copy className="h-4 w-4 mr-2"/>Duplicar cliente</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setRenovCliente(c); setRenovOpen(true); }}><RefreshCw className="h-4 w-4 mr-2"/>Renovar</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => reverterRenovacao(c)}><Undo2 className="h-4 w-4 mr-2 text-amber-400"/>Reverter renovação</DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuSeparator />
                            {isMulti ? (
                              <>
                                <DropdownMenuItem onClick={() => copiarComprovante(c)} className="font-semibold text-emerald-400">
                                  <ClipboardCopy className="h-4 w-4 mr-2 text-emerald-400"/>
                                  Copiar Comprovante Unificado ({contasVinculadas.length} telas)
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled={!c.telefone} onClick={() => enviarComprovanteWhatsApp(c)} className="font-semibold text-emerald-400">
                                  <MessageCircle className="h-4 w-4 mr-2 text-emerald-400"/>
                                  Enviar Comprovante (WhatsApp)
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleGerarImagemVencimento(c)}>
                                  <Download className="h-4 w-4 mr-2 text-cyan-400"/>
                                  Gerar PNG Unificado ({contasVinculadas.length} telas)
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleCopiarImagemVencimento(c)}>
                                  <Copy className="h-4 w-4 mr-2 text-cyan-400"/>
                                  Copiar PNG Unificado ({contasVinculadas.length} telas)
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => copiarComprovante(c, true)} className="text-xs text-muted-foreground">
                                  <FileText className="h-4 w-4 mr-2"/>
                                  Copiar comprovante individual
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <>
                                <DropdownMenuItem onClick={() => copiarComprovante(c)}><ClipboardCopy className="h-4 w-4 mr-2"/>Copiar comprovante (Texto)</DropdownMenuItem>
                                <DropdownMenuItem disabled={!c.telefone} onClick={() => enviarComprovanteWhatsApp(c)}><MessageCircle className="h-4 w-4 mr-2 text-emerald-400"/>Enviar comprovante (WhatsApp)</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleGerarImagemVencimento(c)}><Download className="h-4 w-4 mr-2 text-emerald-400"/>Gerar o PNG</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleCopiarImagemVencimento(c)}><Copy className="h-4 w-4 mr-2 text-cyan-400"/>Copiar o PNG</DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => enviarCredenciais(c)}><Send className="h-4 w-4 mr-2"/>Copiar credenciais</DropdownMenuItem>
                            <DropdownMenuItem disabled={!c.telefone} onClick={() => enviarCredenciaisWhatsApp(c)}><MessageCircle className="h-4 w-4 mr-2 text-emerald-400"/>Enviar credenciais (WhatsApp)</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(c.nome ?? ""); toast.success("Nome copiado"); }}><User className="h-4 w-4 mr-2"/>Copiar nome</DropdownMenuItem>
                            <DropdownMenuItem disabled={!c.telefone} onClick={() => { navigator.clipboard.writeText(c.telefone ?? ""); toast.success("Telefone copiado"); }}><Phone className="h-4 w-4 mr-2"/>Copiar telefone</DropdownMenuItem>
                            <DropdownMenuItem disabled={!c.mac} onClick={() => { navigator.clipboard.writeText(c.mac ?? ""); toast.success("Conta copiada"); }}><Copy className="h-4 w-4 mr-2"/>Copiar Conta</DropdownMenuItem>
                            <DropdownMenuItem disabled={!c.device} onClick={() => { navigator.clipboard.writeText(c.device ?? ""); toast.success("Senha copiada"); }}><Copy className="h-4 w-4 mr-2"/>Copiar Senha</DropdownMenuItem>
                            <DropdownMenuItem disabled={!c.telefone} onClick={() => window.open(whatsappLink(c.telefone), "_blank")}><MessageCircle className="h-4 w-4 mr-2"/>Abrir WhatsApp</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {isExcluido ? (
                              <>
                                <DropdownMenuItem onClick={() => restaurar(c.id)}><RotateCcw className="h-4 w-4 mr-2"/>Restaurar</DropdownMenuItem>
                                <DropdownMenuItem className="text-red-400 focus:text-red-400" onClick={() => excluirDefinitivo(c.id)}><Trash2 className="h-4 w-4 mr-2"/>Excluir definitivamente</DropdownMenuItem>
                              </>
                            ) : (
                              <>
                                <DropdownMenuItem onClick={() => remove(c.id)}><Archive className="h-4 w-4 mr-2"/>Arquivar</DropdownMenuItem>
                                <DropdownMenuItem className="text-red-400 focus:text-red-400" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4 mr-2"/>Excluir</DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {paginated.length === 0 && (
                <TableRow><TableCell colSpan={15} className="text-center text-muted-foreground py-10">
                  {tab === "vencidos" ? "Nenhum cliente vencido. 🎉" : tab === "arquivados" ? "Nenhum cliente arquivado." : "Nenhum cliente na lixeira."}
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <PaginationControls
          total={total}
          loaded={loaded}
          pageSize={pageSize}
          page={safePage}
          onPageSizeChange={(v) => { setPageSize(v); setPage(1); }}
          onPageChange={setPage}
          onLoadMore={() => setLoadedCount((n) => Math.min(n + LOAD_STEP, total))}
          label={tab === "vencidos" ? "clientes vencidos" : tab === "arquivados" ? "clientes arquivados" : "clientes excluídos"}
        />
      </Card>

      <ClienteDialog open={open} onOpenChange={setOpen} editing={editing} servidores={servidores as any} onSaved={() => qc.invalidateQueries({ queryKey: ["clientes"] })} />
      <AcrescentarDiasDialog open={renovOpen} onOpenChange={setRenovOpen} cliente={renovCliente} />
      <AtivacaoClienteDialog open={ativOpen} onOpenChange={setAtivOpen} cliente={ativCliente} />
      <FichaClienteDialog open={fichaOpen} onOpenChange={setFichaOpen} cliente={fichaCliente} historico={historico as any[]} />
    </div>
  );
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button title={title} onClick={onClick} className="h-7 w-7 rounded-md grid place-items-center hover:bg-accent">{children}</button>
  );
}

function CopyableCell({ value }: { value?: string | null }) {
  if (!value) return <>-</>;
  return (
    <div className="inline-flex items-center gap-1">
      <span>{value}</span>
      <button
        title="Copiar"
        onClick={() => { navigator.clipboard.writeText(value); toast.success("Copiado"); }}
        className="h-6 w-6 rounded-md grid place-items-center hover:bg-accent"
      >
        <Copy className="h-3 w-3" />
      </button>
    </div>
  );
}