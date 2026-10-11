import { ServidorSelectItems, agruparServidores } from "@/lib/servidores-ui";
import { createFileRoute } from "@tanstack/react-router";
import { COMPACT_TABLE_CLASS } from "@/components/density-toggle";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  fetchServidores,
  fetchComprasCreditos,
  fetchMovimentacoesCreditos,
  fetchSaldosCreditos,
} from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatCard } from "@/components/stat-card";
import {
  CreditCard,
  Plus,
  Minus,
  Pencil,
  Trash2,
  ShoppingCart,
  Wallet,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Upload,
  Download,
  ClipboardCopy,
  Undo2,
  FileDown,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  ChevronsDownUp,
  FileSpreadsheet,
  FileText,
  FileImage,
  FileType,
  SlidersHorizontal,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import { currencyBRL, formatDateBR, formatDateTimeBR, toISODate } from "@/lib/iptv";
import { registrarMovimentacaoCredito, type CreditoMovTipo } from "@/lib/creditos";
import { logAudit } from "@/lib/audit";
import { exportConsolidado, type ExportFormat, type ExportSection } from "@/lib/central-export";
import * as XLSX from "xlsx";

export function getCompraUnitario(c: any, servidoresList: any[] = []): number {
  const vu = Number(c?.valor_unitario);
  if (!isNaN(vu) && vu > 0) return vu;
  const srv = c?.servidor ?? servidoresList.find((s: any) => s.id === c?.servidor_id);
  const srvCusto = Number(srv?.custo_mensal);
  if (!isNaN(srvCusto) && srvCusto > 0) return srvCusto;
  return 0;
}

export function getCompraTotal(c: any, servidoresList: any[] = []): number {
  const vt = Number(c?.valor_total);
  if (!isNaN(vt) && vt > 0) return vt;
  const qtd = Number(c?.quantidade || 0);
  const vu = getCompraUnitario(c, servidoresList);
  return qtd * vu;
}

const LOW_THRESHOLD = 5;

function labelTipo(t: CreditoMovTipo | string) {
  const map: Record<string, string> = {
    compra: "Compra",
    ativacao: "Ativação",
    renovacao: "Renovação",
    ajuste_add: "Ajuste (+)",
    ajuste_rem: "Ajuste (-)",
    transferencia: "Transferência",
    venda_revendedor: "Venda Revenda",
  };
  return map[t] ?? String(t ?? "");
}

export function gerarSecoesExportacaoFiltro({
  servidores,
  compras,
  movs,
  saldos,
  categoria,
  servidorId,
  incluirSaldos = true,
  incluirCompras = true,
  incluirMovs = true,
}: {
  servidores: any[];
  compras: any[];
  movs: any[];
  saldos: Record<string, number>;
  categoria?: string | null;
  servidorId?: string | null;
  incluirSaldos?: boolean;
  incluirCompras?: boolean;
  incluirMovs?: boolean;
}): ExportSection[] {
  const sections: ExportSection[] = [];

  const srvsFiltrados = (servidores || []).filter((s: any) => {
    if (categoria && s.categoria !== categoria) return false;
    if (servidorId && s.id !== servidorId) return false;
    return true;
  });

  const comprasFiltradas = (compras || []).filter((c: any) => {
    const srv = c.servidor ?? servidores.find((s: any) => s.id === c.servidor_id);
    if (categoria && srv?.categoria !== categoria) return false;
    if (servidorId && c.servidor_id !== servidorId) return false;
    return true;
  });

  const movsFiltradas = (movs || []).filter((m: any) => {
    const srv = m.servidor ?? servidores.find((s: any) => s.id === m.servidor_id);
    if (categoria && srv?.categoria !== categoria) return false;
    if (servidorId && m.servidor_id !== servidorId) return false;
    return true;
  });

  const ultimaCompraPorSrv = new Map<string, any>();
  (compras || []).forEach((c: any) => {
    if (!ultimaCompraPorSrv.has(c.servidor_id)) ultimaCompraPorSrv.set(c.servidor_id, c);
  });

  if (incluirSaldos) {
    sections.push({
      title: "Saldos por Servidor",
      description: `Posição atual do estoque de créditos e custos ${categoria ? `(Categoria: ${categoria})` : ""} ${servidorId ? `(Servidor Selecionado)` : ""}`.trim(),
      columns: ["Categoria", "Servidor", "Saldo Atual", "Status", "Custo Mensal", "Última Compra", "Qtd Últ. Compra", "Total Últ. Compra"],
      rows: srvsFiltrados.map((s: any) => {
        const saldo = saldos[s.id] ?? 0;
        const uc = ultimaCompraPorSrv.get(s.id);
        return [
          s.categoria ?? "-",
          s.nome ?? "-",
          saldo,
          saldo <= LOW_THRESHOLD ? "Reposição Necessária" : "Normal",
          currencyBRL(Number(s.custo_mensal || 0)),
          uc ? formatDateBR(uc.data_compra) : "-",
          uc ? Number(uc.quantidade || 0) : "-",
          uc ? currencyBRL(getCompraTotal(uc, servidores)) : "-",
        ];
      }),
    });
  }

  if (incluirCompras) {
    sections.push({
      title: "Compras de Créditos",
      description: `Histórico das aquisições de créditos registradas ${categoria ? `(Categoria: ${categoria})` : ""} ${servidorId ? `(Servidor Selecionado)` : ""}`.trim(),
      columns: ["Data", "Servidor", "Categoria", "Quantidade", "Valor Unitário", "Valor Total", "Observação"],
      rows: comprasFiltradas.map((c: any) => [
        c.data_compra ? formatDateBR(c.data_compra) : "-",
        c.servidor?.nome ?? servidores.find((s: any) => s.id === c.servidor_id)?.nome ?? "-",
        c.servidor?.categoria ?? servidores.find((s: any) => s.id === c.servidor_id)?.categoria ?? "-",
        Number(c.quantidade || 0),
        currencyBRL(getCompraUnitario(c, servidores)),
        currencyBRL(getCompraTotal(c, servidores)),
        c.observacao ?? "",
      ]),
    });
  }

  if (incluirMovs) {
    sections.push({
      title: "Extrato de Movimentações",
      description: `Registro cronológico das movimentações de créditos ${categoria ? `(Categoria: ${categoria})` : ""} ${servidorId ? `(Servidor Selecionado)` : ""}`.trim(),
      columns: ["Data/Hora", "Servidor", "Cliente", "Tipo", "Quantidade", "Motivo"],
      rows: movsFiltradas.map((m: any) => [
        m.created_at ? formatDateTimeBR(m.created_at) : "-",
        m.servidor?.nome ?? "-",
        m.cliente?.nome ?? "-",
        labelTipo(m.tipo),
        `${Number(m.quantidade) > 0 ? "+" : ""}${m.quantidade}`,
        m.motivo ?? "-",
      ]),
    });
  }

  return sections;
}

export const Route = createFileRoute("/_authenticated/creditos")({
  head: () => ({
    meta: [
      { title: "Gestão de Créditos — ORBIT" },
      { name: "description", content: "Controle de estoque, compras e movimentações de créditos por servidor." },
    ],
  }),
  component: CreditosPage,
});

function CreditosPage() {
  const qc = useQueryClient();
  const { data: servidores = [] } = useQuery({ queryKey: ["servidores"], queryFn: fetchServidores });
  const { data: compras = [] } = useQuery({ queryKey: ["creditos_compras"], queryFn: fetchComprasCreditos });
  const { data: movs = [] } = useQuery({ queryKey: ["creditos_movs"], queryFn: fetchMovimentacoesCreditos });
  const { data: saldos = {} } = useQuery({ queryKey: ["creditos_saldos"], queryFn: fetchSaldosCreditos });

  const [compraOpen, setCompraOpen] = useState(false);
  const [compraEditing, setCompraEditing] = useState<any | null>(null);
  const [compraLock, setCompraLock] = useState(false);
  const [ajusteOpen, setAjusteOpen] = useState(false);
  const [ajusteServidorId, setAjusteServidorId] = useState<string | null>(null);
  const [pedidoOpen, setPedidoOpen] = useState(false);
  const [desfazendo, setDesfazendo] = useState(false);
  const [exportFiltroOpen, setExportFiltroOpen] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ total: number; done: number; ok: number; fail: number } | null>(null);

  const hojeISO = toISODate(new Date());
  const gastoHoje = useMemo(
    () => (compras as any[])
      .filter((c: any) => (c.data_compra ?? "").slice(0, 10) === hojeISO)
      .reduce((s: number, c: any) => s + getCompraTotal(c, servidores as any[]), 0),
    [compras, hojeISO, servidores],
  );
  const creditosHoje = useMemo(
    () => (compras as any[])
      .filter((c: any) => (c.data_compra ?? "").slice(0, 10) === hojeISO)
      .reduce((s: number, c: any) => s + Number(c.quantidade || 0), 0),
    [compras, hojeISO],
  );
  const totalInvestido = useMemo(
    () => (compras as any[]).reduce((s: number, c: any) => s + getCompraTotal(c, servidores as any[]), 0),
    [compras, servidores],
  );

  const ultimaCompraPorServidor = useMemo(() => {
    const map = new Map<string, any>();
    (compras as any[]).forEach((c: any) => {
      if (!map.has(c.servidor_id)) map.set(c.servidor_id, c);
    });
    return map;
  }, [compras]);

  const servidoresAgrupados = useMemo(() => agruparServidores(servidores as any[]), [servidores]);
  const baixos = (servidores as any[]).filter((s: any) => (saldos[s.id] ?? 0) <= LOW_THRESHOLD);

  const allCategoriesCollapsed =
    servidoresAgrupados.length > 0 &&
    servidoresAgrupados.every((g) => !!collapsedCategories[g.categoria]);

  const toggleCategoria = (cat: string) => {
    setCollapsedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const toggleCollapseAll = () => {
    const nextState = !allCategoriesCollapsed;
    const updated: Record<string, boolean> = {};
    servidoresAgrupados.forEach((g) => {
      updated[g.categoria] = nextState;
    });
    setCollapsedCategories(updated);
  };

  const COLUNAS_COMPRAS_MODELO = [
    "Servidor",
    "Quantidade",
    "Valor Unitario",
    "Data Compra",
    "Observacao",
  ];

  function baixarModeloCreditos() {
    const exemplo = [{
      Servidor: (servidores as any[])[0]?.nome ?? "UNITV 01",
      Quantidade: 50,
      "Valor Unitario": 4.5,
      "Data Compra": formatDateBR(new Date()),
      Observacao: "Exemplo de compra de créditos — remova ou altere",
    }];
    const ws = XLSX.utils.json_to_sheet(exemplo, { header: COLUNAS_COMPRAS_MODELO });
    ws["!cols"] = COLUNAS_COMPRAS_MODELO.map(() => ({ wch: 20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Compras_Creditos");
    XLSX.writeFile(wb, "modelo-compras-creditos.xlsx");
    toast.success("Modelo de compras baixado!");
  }

  async function exportarGeral(formato: ExportFormat) {
    if (compras.length === 0 && servidores.length === 0) return toast.error("Nada para exportar");
    try {
      const sections = gerarSecoesExportacaoFiltro({
        servidores: servidores as any[],
        compras: compras as any[],
        movs: movs as any[],
        saldos,
        incluirSaldos: true,
        incluirCompras: true,
        incluirMovs: true,
      });
      await exportConsolidado(formato, "Gestão de Créditos", sections);
      toast.success(`Relatório de créditos exportado em ${formato.toUpperCase()}!`);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao exportar");
    }
  }

  async function exportarComprasDireto(formato: ExportFormat) {
    if ((compras as any[]).length === 0) return toast.error("Nenhuma compra registrada para exportar.");
    try {
      const rows = (compras as any[]).map((c: any) => [
        c.data_compra ? formatDateBR(c.data_compra) : "-",
        c.servidor?.nome ?? (servidores as any[]).find((s: any) => s.id === c.servidor_id)?.nome ?? "-",
        c.servidor?.categoria ?? (servidores as any[]).find((s: any) => s.id === c.servidor_id)?.categoria ?? "-",
        Number(c.quantidade || 0),
        currencyBRL(getCompraUnitario(c, servidores as any[])),
        currencyBRL(getCompraTotal(c, servidores as any[])),
        c.observacao ?? "",
      ]);
      const sections: ExportSection[] = [
        {
          title: "Últimas Compras de Créditos",
          description: `Relatório de compras de créditos registradas (Total de registros: ${compras.length}, Investimento total: ${currencyBRL(totalInvestido)}).`,
          columns: ["Data", "Servidor", "Categoria", "Quantidade", "Valor Unitário", "Valor Total", "Observação"],
          rows,
        },
      ];
      await exportConsolidado(formato, "Compras de Créditos", sections);
      toast.success(`Compras de créditos exportadas em ${formato.toUpperCase()}!`);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao exportar compras");
    }
  }

  async function importarCompras(file: File) {
    setImporting(true);
    try {
      const name = file.name.toLowerCase();
      let rows: any[] = [];

      if (name.endsWith(".json")) {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) throw new Error("Arquivo JSON inválido (deve ser uma lista de compras)");
        rows = parsed;
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
        rows = raw.map((r) => ({
          servidor: r.Servidor ?? r.servidor ?? r.NomeServidor ?? r["Nome do Servidor"],
          servidor_id: r.servidor_id ?? r["ID Servidor"],
          quantidade: r.Quantidade ?? r.quantidade ?? r.Qtd ?? r.Creditos ?? r["Créditos"],
          valor_unitario: r["Valor Unitario"] ?? r["Valor Unitário"] ?? r.valor_unitario ?? r.ValorUnitario,
          valor_total: r["Valor Total"] ?? r.valor_total,
          data_compra: (() => {
            const v = r["Data Compra"] ?? r["Data"] ?? r.data_compra;
            if (!v) return null;
            if (typeof v === "number") {
              const date = new Date(Math.round((v - 25569) * 86400 * 1000));
              return toISODate(date);
            }
            const s = String(v).trim();
            const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
            if (m) {
              let [, d, mo, y] = m;
              if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
              return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
            }
            return s.slice(0, 10);
          })(),
          observacao: r.Observacao ?? r.Observação ?? r.observacao ?? r.Obs ?? "",
        }));
      }

      const user = (await supabase.auth.getUser()).data.user;
      if (!user) {
        toast.error("Sessão expirada");
        return;
      }

      const validRows = rows.filter((r) => r && (r.servidor || r.servidor_id) && Number(r.quantidade || 0) > 0);
      if (validRows.length === 0) {
        toast.error("Nenhum registro de compra válido encontrado no arquivo.");
        return;
      }

      setImportProgress({ total: validRows.length, done: 0, ok: 0, fail: 0 });
      let ok = 0;
      let fail = 0;

      for (let i = 0; i < validRows.length; i++) {
        const r = validRows[i];
        try {
          let sid = r.servidor_id as string | undefined;
          if (!sid && r.servidor) {
            const sNome = String(r.servidor).trim().toLowerCase();
            const found = (servidores as any[]).find((s) => s.nome?.trim().toLowerCase() === sNome);
            sid = found?.id;
          }

          if (!sid) {
            fail++;
            setImportProgress({ total: validRows.length, done: i + 1, ok, fail });
            continue;
          }

          const qtd = Number(r.quantidade) || 0;
          const vu = Number(r.valor_unitario) || 0;
          const vt = r.valor_total ? Number(r.valor_total) : qtd * vu;

          const { data: c, error } = await supabase.from("creditos_compras").insert({
            user_id: user.id,
            servidor_id: sid,
            quantidade: qtd,
            valor_unitario: vu,
            valor_total: vt,
            data_compra: r.data_compra || hojeISO,
            observacao: r.observacao ? String(r.observacao) : null,
          } as any).select("id").single();

          if (error || !c) {
            fail++;
          } else {
            await registrarMovimentacaoCredito({
              servidor_id: sid,
              quantidade: qtd,
              tipo: "compra",
              motivo: `Importação: ${qtd} créditos (${r.observacao || "planilha"})`,
              compra_id: c.id,
            });
            ok++;
          }
        } catch {
          fail++;
        }
        setImportProgress({ total: validRows.length, done: i + 1, ok, fail });
      }

      if (ok > 0) {
        toast.success(`${ok} compra(s) de créditos importada(s) com sucesso!`);
        await logAudit({
          categoria: "compra_credito",
          acao: "importar",
          descricao: `Importação de compras de créditos: ${ok} sucesso, ${fail} falhas`,
          entidade: "creditos_compras",
          metadata: { total: validRows.length, ok, fail },
        });
        qc.invalidateQueries();
      }
      if (fail > 0) {
        toast.error(`${fail} compra(s) não foram importadas (verifique se os servidores existem).`);
      }
    } catch (e: any) {
      toast.error(e?.message || "Erro ao processar arquivo");
    } finally {
      setImporting(false);
    }
  }

  async function excluirCompra(c: any) {
    const { confirmDialog } = await import("@/lib/confirm");
    const ok = await confirmDialog({
      title: `Excluir compra de ${c.quantidade} créditos?`,
      description: "Também serão removidas as movimentações vinculadas e o saldo será recalculado.",
      confirmText: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    await supabase.from("creditos_movimentacoes").delete().eq("compra_id", c.id);
    const { error } = await supabase.from("creditos_compras").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    await logAudit({
      categoria: "compra_credito",
      acao: "excluir",
      descricao: `Compra de ${c.quantidade} créditos excluída`,
      entidade: "creditos_compras",
      entidade_id: c.id,
      dados_anteriores: c,
    });
    toast.success("Compra excluída");
    qc.invalidateQueries();
  }

  async function limparUltimasCompras() {
    if ((compras as any[]).length === 0) return toast.error("Nenhuma compra registrada para limpar.");
    const { confirmDialog } = await import("@/lib/confirm");
    const ok = await confirmDialog({
      title: "Limpar histórico de últimas compras?",
      description: `Esta ação excluirá todos os ${(compras as any[]).length} registro(s) de compras e suas movimentações vinculadas, recalculando os saldos e deixando o ambiente limpo para novas adições.`,
      confirmText: "Limpar histórico de compras",
      destructive: true,
    });
    if (!ok) return;

    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return toast.error("Sessão expirada");

      const { error: errMov } = await supabase
        .from("creditos_movimentacoes")
        .delete()
        .eq("user_id", user.id)
        .not("compra_id", "is", null);
      if (errMov) throw errMov;

      const { error: errComp } = await supabase
        .from("creditos_compras")
        .delete()
        .eq("user_id", user.id);
      if (errComp) throw errComp;

      await logAudit({
        categoria: "compra_credito",
        acao: "excluir",
        descricao: `Histórico de ${(compras as any[]).length} compras de créditos limpo`,
        entidade: "creditos_compras",
        metadata: { total_removido: (compras as any[]).length },
      });

      toast.success("Histórico de compras limpo com sucesso!");
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao limpar histórico de compras");
    }
  }

  async function desfazerUltimaMovimentacao() {
    const ultima: any = (movs as any[])[0];
    if (!ultima) return toast.error("Nenhuma movimentação para desfazer");
    const { confirmDialog } = await import("@/lib/confirm");
    const sinal = Number(ultima.quantidade) > 0 ? "+" : "";
    const ok = await confirmDialog({
      title: "Desfazer última movimentação?",
      description:
        `${labelTipo(ultima.tipo)} de ${sinal}${ultima.quantidade} crédito(s) em "${ultima.servidor?.nome ?? "-"}" será revertida e o saldo restaurado.` +
        (ultima.compra_id ? " A compra vinculada também será removida." : ""),
      confirmText: "Desfazer",
      destructive: true,
    });
    if (!ok) return;
    setDesfazendo(true);
    try {
      if (ultima.compra_id) {
        const { error: e1 } = await supabase.from("creditos_movimentacoes").delete().eq("compra_id", ultima.compra_id);
        if (e1) throw e1;
        const { error: e2 } = await supabase.from("creditos_compras").delete().eq("id", ultima.compra_id);
        if (e2) throw e2;
      } else {
        const { error } = await supabase.from("creditos_movimentacoes").delete().eq("id", ultima.id);
        if (error) throw error;
      }
      await logAudit({
        categoria: "credito",
        acao: "cancelar",
        descricao: `Movimentação de créditos desfeita (${labelTipo(ultima.tipo)}, ${sinal}${ultima.quantidade})`,
        entidade: "creditos_movimentacoes",
        entidade_id: ultima.id,
        entidade_nome: ultima.servidor?.nome ?? null,
        dados_anteriores: ultima,
      });
      toast.success("Movimentação desfeita e saldo restaurado");
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao desfazer movimentação");
    } finally {
      setDesfazendo(false);
    }
  }

  const pedidoDoDia = useMemo(() => {
    const hojeCompras = (compras as any[]).filter((c: any) => (c.data_compra ?? "").slice(0, 10) === hojeISO);
    const map = new Map<string, { servidor: string; login: string; quantidade: number }>();
    hojeCompras.forEach((c: any) => {
      const srv = (servidores as any[]).find((s: any) => s.id === c.servidor_id);
      const key = c.servidor_id;
      const prev = map.get(key);
      const login = (srv?.login || (srv?.observacao ?? "").toString().split("\n")[0] || "").trim();
      if (prev) prev.quantidade += Number(c.quantidade || 0);
      else map.set(key, { servidor: srv?.nome ?? "-", login, quantidade: Number(c.quantidade || 0) });
    });
    return Array.from(map.values());
  }, [compras, servidores, hojeISO]);

  function pedidoTexto() {
    if (pedidoDoDia.length === 0) return "";
    const dataStr = formatDateBR(hojeISO);
    const blocos = pedidoDoDia.map((p) => {
      const loginFormatado = p.login && p.login !== "-" ? ` *[${p.login}]*` : "";
      return `🔹 *Servidor:* ${p.servidor}${loginFormatado}\n🔹 *Quantidade:* ${p.quantidade} créditos`;
    });
    const total = pedidoDoDia.reduce((s, p) => s + p.quantidade, 0);
    const lines = [
      `🔹 *SOLICITAÇÃO DE COMPRA DE CRÉDITOS*`,
      `🔹 *Data:* ${dataStr}`,
      ``,
      blocos.join("\n\n"),
    ];
    if (pedidoDoDia.length > 1) {
      lines.push(``, `🔹 *Total:* ${total} créditos`);
    }
    return lines.join("\n");
  }

  async function copiarPedido() {
    const txt = pedidoTexto();
    if (!txt) return toast.error("Nenhuma compra registrada hoje");
    try {
      await navigator.clipboard.writeText(txt);
      toast.success("Pedido copiado para a área de transferência!");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 w-full">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Gestão de Créditos</h1>
          <p className="text-sm text-muted-foreground">Controle de saldo, compras e consumo de créditos por servidor</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Button variant="outline" onClick={baixarModeloCreditos} disabled={importing}>
            <FileDown className="h-4 w-4 mr-1" /> Modelo
          </Button>

          {/* Botão Exportar Unificado (Excel, PDF, PNG, DOCX e Específico) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={importing}>
                <Download className="h-4 w-4 mr-1.5 text-primary" />
                Exportar
                <ChevronDown className="h-3.5 w-3.5 opacity-60 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs font-semibold">Exportação Completa</DropdownMenuLabel>
              <DropdownMenuItem className="text-xs gap-2 cursor-pointer" onClick={() => exportarGeral("xlsx")}>
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                <span>Excel (.xlsx)</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs gap-2 cursor-pointer" onClick={() => exportarGeral("pdf")}>
                <FileDown className="h-3.5 w-3.5 text-red-400" />
                <span>Documento PDF</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs gap-2 cursor-pointer" onClick={() => exportarGeral("png")}>
                <FileImage className="h-3.5 w-3.5 text-purple-400" />
                <span>Imagem (PNG)</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs gap-2 cursor-pointer" onClick={() => exportarGeral("docx")}>
                <FileType className="h-3.5 w-3.5 text-blue-400" />
                <span>Documento Word (.docx)</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-semibold">Filtros & Personalizado</DropdownMenuLabel>
              <DropdownMenuItem className="text-xs gap-2 cursor-pointer font-medium text-primary" onClick={() => setExportFiltroOpen(true)}>
                <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
                <span>Exportar Específico...</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <label className="inline-flex">
            <input
              type="file"
              accept=".xlsx,.xls,application/json,.json"
              className="hidden"
              disabled={importing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importarCompras(f);
                e.target.value = "";
              }}
            />
            <Button asChild variant="outline" disabled={importing}>
              <span><Upload className="h-4 w-4 mr-1" /> {importing ? "Importando..." : "Importar"}</span>
            </Button>
          </label>

          <Button onClick={() => { setCompraEditing(null); setCompraLock(false); setCompraOpen(true); }} disabled={importing}>
            <ShoppingCart className="h-4 w-4 mr-1" /> Nova compra
          </Button>
        </div>
      </div>

      {importProgress && (
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {importing ? "Importando compras de créditos..." : "Importação de créditos concluída"}
            </span>
            <span className="text-muted-foreground">
              {importProgress.done}/{importProgress.total}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${importProgress.total > 0 ? (importProgress.done / importProgress.total) * 100 : 0}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40">
              OK: {importProgress.ok}
            </Badge>
            {importProgress.fail > 0 && (
              <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/40">
                Falhas: {importProgress.fail}
              </Badge>
            )}
            {!importing && (
              <Button size="sm" variant="ghost" className="ml-auto text-xs" onClick={() => setImportProgress(null)}>
                Fechar
              </Button>
            )}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Gasto Hoje" value={currencyBRL(gastoHoje)} icon={Wallet} tone="orange" />
        <StatCard label="Créditos Comprados Hoje" value={creditosHoje} icon={CreditCard} tone="blue" />
        <StatCard label="Investido Total" value={currencyBRL(totalInvestido)} icon={ShoppingCart} tone="purple" />
        <StatCard label="Servidores c/ saldo baixo" value={baixos.length} icon={AlertTriangle} tone={baixos.length ? "red" : "green"} />
      </div>

      {baixos.length > 0 && (
        <Card className="p-4 border-red-500/40 bg-red-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-red-400">Reposição necessária</div>
              <div className="text-sm text-muted-foreground">
                Servidores com saldo ≤ {LOW_THRESHOLD} créditos:&nbsp;
                {baixos.map((s: any) => `${s.nome} (${saldos[s.id] ?? 0})`).join(" · ")}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Seção Saldo por Servidor com botões de colapso por categoria e botão Limpar Compras */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2 pb-1 border-b border-border/40">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-base">Saldo por servidor</h3>
            <span className="text-xs text-muted-foreground">({servidores.length} cadastrados)</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={toggleCollapseAll}
              title={allCategoriesCollapsed ? "Expandir todas as abas" : "Encolher todas as abas"}
            >
              {allCategoriesCollapsed ? (
                <>
                  <ChevronsUpDown className="h-3.5 w-3.5 text-primary" />
                  Expandir todos
                </>
              ) : (
                <>
                  <ChevronsDownUp className="h-3.5 w-3.5 text-primary" />
                  Encolher todos
                </>
              )}
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-destructive hover:border-destructive/40"
              onClick={limparUltimasCompras}
              disabled={(compras as any[]).length === 0}
              title="Limpar histórico de compras e deixar a visualização zerada para novas compras"
            >
              <Trash2 className="h-3.5 w-3.5 text-red-400" />
              Limpar Últimas Compras
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {servidoresAgrupados.map((grupo) => {
            const isCollapsed = !!collapsedCategories[grupo.categoria];
            const totalSaldoGrupo = grupo.itens.reduce((acc: number, s: any) => acc + (saldos[s.id] ?? 0), 0);
            const totalBaixosGrupo = grupo.itens.filter((s: any) => (saldos[s.id] ?? 0) <= LOW_THRESHOLD).length;
            const nomeCategoria =
              grupo.categoria === "TOP"
                ? "Top Servidores"
                : grupo.categoria === "Premium"
                ? "Premium Servidores"
                : grupo.categoria;

            return (
              <div key={grupo.categoria} className="space-y-2 rounded-lg border border-border/50 bg-card/60 p-2.5 transition-all">
                <div
                  className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-muted/40 hover:bg-muted/70 transition-colors cursor-pointer select-none"
                  onClick={() => toggleCategoria(grupo.categoria)}
                >
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 p-0 hover:bg-transparent"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCategoria(grupo.categoria);
                      }}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-primary" />
                      )}
                    </Button>
                    <Badge
                      variant="outline"
                      className="bg-primary/10 text-primary border-primary/30 font-bold uppercase tracking-wider px-3 py-1 text-xs"
                    >
                      {nomeCategoria}
                    </Badge>
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      ({grupo.itens.length} {grupo.itens.length === 1 ? "servidor" : "servidores"})
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {totalBaixosGrupo > 0 && (
                      <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30 text-[10px]">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        {totalBaixosGrupo} baixo{totalBaixosGrupo > 1 ? "s" : ""}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-xs font-semibold">
                      Saldo Total: <span className="text-emerald-400 font-bold ml-1">{totalSaldoGrupo}</span>
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCategoria(grupo.categoria);
                      }}
                    >
                      {isCollapsed ? "Expandir" : "Encolher"}
                    </Button>
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="overflow-x-auto rounded-md border border-border/40 mt-2">
                    <Table className={COMPACT_TABLE_CLASS}>
                      <TableHeader className="bg-muted/30">
                        <TableRow>
                          <TableHead className="w-[200px]">Servidor</TableHead>
                          <TableHead className="text-right w-[100px]">Saldo</TableHead>
                          <TableHead>Última compra</TableHead>
                          <TableHead className="text-right">Qtd</TableHead>
                          <TableHead className="text-right">Valor unit.</TableHead>
                          <TableHead className="text-right">Valor total</TableHead>
                          <TableHead className="text-right w-[180px]">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {grupo.itens.map((s: any) => {
                          const saldo = saldos[s.id] ?? 0;
                          const uc = ultimaCompraPorServidor.get(s.id);
                          const baixo = saldo <= LOW_THRESHOLD;
                          return (
                            <TableRow key={s.id}>
                              <TableCell className="font-medium">{s.nome}</TableCell>
                              <TableCell className={`text-right font-bold ${baixo ? "text-red-400" : "text-emerald-400"}`}>
                                {saldo}
                                {baixo && <AlertTriangle className="h-3.5 w-3.5 inline ml-1" />}
                              </TableCell>
                              <TableCell>{uc ? formatDateBR(uc.data_compra) : "-"}</TableCell>
                              <TableCell className="text-right">{uc?.quantidade ?? "-"}</TableCell>
                              <TableCell className="text-right">{uc ? currencyBRL(getCompraUnitario(uc, servidores as any[])) : "-"}</TableCell>
                              <TableCell className="text-right">{uc ? currencyBRL(getCompraTotal(uc, servidores as any[])) : "-"}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center gap-1 justify-end">
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => { setCompraEditing({ servidor_id: s.id }); setCompraLock(true); setCompraOpen(true); }}
                                  >
                                    <ShoppingCart className="h-3.5 w-3.5 mr-1" /> Comprar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0"
                                    title="Ajuste manual de saldo"
                                    onClick={() => { setAjusteServidorId(s.id); setAjusteOpen(true); }}
                                  >
                                    <div className="flex flex-col items-center -space-y-1">
                                      <Plus className="h-3 w-3" />
                                      <Minus className="h-3 w-3" />
                                    </div>
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            );
          })}

          {(servidores as any[]).length === 0 && (
            <div className="text-center text-muted-foreground py-12 border-2 border-dashed rounded-lg bg-muted/20">
              <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p>Cadastre servidores para visualizar os saldos.</p>
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Seção Últimas compras com botão unificado de Opções & Exportar */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <ShoppingCart className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Últimas compras</h3>
            <div className="ml-auto flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 px-3 py-1.5 shadow-sm">
              <Wallet className="h-4 w-4 text-emerald-400" />
              <div className="flex flex-col leading-tight">
                <span className="text-[10px] uppercase tracking-wider text-emerald-300/80 font-medium">Gasto hoje</span>
                <span className="text-base font-bold text-emerald-300">{currencyBRL(gastoHoje)}</span>
              </div>
            </div>

            {/* Menu Dropdown Unificado: Copiar Pedido, Exportar (Excel, PDF, PNG) e Limpar */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 font-medium shadow-sm">
                  <Share2 className="h-3.5 w-3.5 text-primary" />
                  <span>Opções & Exportar</span>
                  <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs font-semibold flex items-center gap-1.5">
                  <ShoppingCart className="h-3.5 w-3.5 text-primary" />
                  Gerenciar Compras
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-xs gap-2 cursor-pointer font-medium"
                  onClick={copiarPedido}
                >
                  <ClipboardCopy className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Copiar Pedido (WhatsApp)</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-xs gap-2 cursor-pointer"
                  onClick={() => setPedidoOpen(true)}
                >
                  <FileText className="h-3.5 w-3.5 text-blue-400" />
                  <span>Visualizar Texto do Pedido</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Exportar Compras
                </DropdownMenuLabel>
                <DropdownMenuItem
                  className="text-xs gap-2 cursor-pointer"
                  onClick={() => exportarComprasDireto("xlsx")}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Exportar Excel (.xlsx)</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-xs gap-2 cursor-pointer"
                  onClick={() => exportarComprasDireto("pdf")}
                >
                  <FileDown className="h-3.5 w-3.5 text-red-400" />
                  <span>Exportar PDF</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-xs gap-2 cursor-pointer"
                  onClick={() => exportarComprasDireto("png")}
                >
                  <FileImage className="h-3.5 w-3.5 text-purple-400" />
                  <span>Exportar Imagem (PNG)</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-xs gap-2 text-red-400 focus:text-red-400 cursor-pointer"
                  onClick={limparUltimasCompras}
                  disabled={(compras as any[]).length === 0}
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  <span>Limpar Últimas Compras</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <Table className={COMPACT_TABLE_CLASS}>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Servidor</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Unit.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(compras as any[]).map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell>{formatDateBR(c.data_compra)}</TableCell>
                    <TableCell>{c.servidor?.nome ?? "-"}</TableCell>
                    <TableCell className="text-right">{c.quantidade}</TableCell>
                    <TableCell className="text-right">{currencyBRL(getCompraUnitario(c, servidores as any[]))}</TableCell>
                    <TableCell className="text-right font-semibold">{currencyBRL(getCompraTotal(c, servidores as any[]))}</TableCell>
                    <TableCell className="text-right">
                      <button
                        title="Editar"
                        className="h-7 w-7 rounded-md grid place-items-center hover:bg-accent inline-flex"
                        onClick={() => { setCompraEditing(c); setCompraLock(false); setCompraOpen(true); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title="Excluir"
                        className="h-7 w-7 rounded-md grid place-items-center hover:bg-accent inline-flex"
                        onClick={() => excluirCompra(c)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
                {(compras as any[]).length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma compra registrada.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Seção Movimentações */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <CreditCard className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Movimentações</h3>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              disabled={(movs as any[]).length === 0 || desfazendo}
              onClick={desfazerUltimaMovimentacao}
            >
              <Undo2 className="h-4 w-4 mr-1" /> Desfazer última
            </Button>
          </div>
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <Table className={COMPACT_TABLE_CLASS}>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Servidor</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(movs as any[]).map((m: any) => {
                  const positivo = Number(m.quantidade) > 0;
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs">{formatDateTimeBR(m.created_at)}</TableCell>
                      <TableCell>{m.servidor?.nome ?? "-"}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{labelTipo(m.tipo)}</Badge></TableCell>
                      <TableCell className={`text-right font-semibold ${positivo ? "text-emerald-400" : "text-red-400"}`}>
                        {positivo ? <ArrowUpRight className="h-3 w-3 inline" /> : <ArrowDownRight className="h-3 w-3 inline" />}
                        {" "}{positivo ? "+" : ""}{m.quantidade}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{m.motivo ?? "-"}</TableCell>
                    </TableRow>
                  );
                })}
                {(movs as any[]).length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Sem movimentações.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      <CompraDialog
        open={compraOpen}
        onOpenChange={setCompraOpen}
        editing={compraEditing}
        servidores={servidores as any[]}
        saldos={saldos}
        compras={compras as any[]}
        movs={movs as any[]}
        lockServidor={compraLock}
      />

      <AjusteDialog
        open={ajusteOpen}
        onOpenChange={setAjusteOpen}
        servidorId={ajusteServidorId}
        servidores={servidores as any[]}
        saldos={saldos}
        compras={compras as any[]}
        movs={movs as any[]}
      />

      <PedidoDialog
        open={pedidoOpen}
        onOpenChange={setPedidoOpen}
        texto={pedidoTexto()}
        onCopiar={copiarPedido}
      />

      <ExportarEspecificoDialog
        open={exportFiltroOpen}
        onOpenChange={setExportFiltroOpen}
        servidores={servidores as any[]}
        compras={compras as any[]}
        movs={movs as any[]}
        saldos={saldos}
      />
    </div>
  );
}

function ExportarEspecificoDialog({
  open,
  onOpenChange,
  servidores,
  compras,
  movs,
  saldos,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  servidores: any[];
  compras: any[];
  movs: any[];
  saldos: Record<string, number>;
}) {
  const [categoria, setCategoria] = useState<string>("todas");
  const [servidorId, setServidorId] = useState<string>("todos");
  const [incluirSaldos, setIncluirSaldos] = useState(true);
  const [incluirCompras, setIncluirCompras] = useState(true);
  const [incluirMovs, setIncluirMovs] = useState(true);
  const [exporting, setExporting] = useState(false);

  const categoriasDisponiveis = useMemo(() => {
    const cats = new Set<string>();
    servidores.forEach((s) => {
      if (s.categoria) cats.add(s.categoria);
    });
    return Array.from(cats);
  }, [servidores]);

  const servidoresFiltrados = useMemo(() => {
    if (categoria === "todas") return servidores;
    return servidores.filter((s) => s.categoria === categoria);
  }, [servidores, categoria]);

  const handleExport = async (formato: ExportFormat) => {
    if (!incluirSaldos && !incluirCompras && !incluirMovs) {
      return toast.error("Selecione ao menos uma seção para exportar.");
    }
    setExporting(true);
    try {
      const sections = gerarSecoesExportacaoFiltro({
        servidores,
        compras,
        movs,
        saldos,
        categoria: categoria !== "todas" ? categoria : null,
        servidorId: servidorId !== "todos" ? servidorId : null,
        incluirSaldos,
        incluirCompras,
        incluirMovs,
      });

      const srvNome = servidorId !== "todos" ? servidores.find((s) => s.id === servidorId)?.nome : null;
      let nomeRelatorio = "Gestão de Créditos";
      if (srvNome) {
        nomeRelatorio = `Créditos — ${srvNome}`;
      } else if (categoria !== "todas") {
        const catNome = categoria === "TOP" ? "Top Servidores" : categoria === "Premium" ? "Premium Servidores" : categoria;
        nomeRelatorio = `Créditos — ${catNome}`;
      }

      await exportConsolidado(formato, nomeRelatorio, sections);
      toast.success(`${nomeRelatorio} exportado em ${formato.toUpperCase()}`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Falha na exportação");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <SlidersHorizontal className="h-5 w-5 text-primary" />
            Exportação Personalizada de Créditos
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-xs text-muted-foreground">
            Filtre por servidor específico, categoria ou escolha exatamente quais seções deseja incluir no documento exportado.
          </p>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Categoria de Servidores</Label>
              <Select
                value={categoria}
                onValueChange={(v) => {
                  setCategoria(v);
                  setServidorId("todos");
                }}
              >
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Todas as categorias" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas" className="text-xs">Todas as Categorias (TOP, Premium, P2P, IPTV...)</SelectItem>
                  {categoriasDisponiveis.map((c) => (
                    <SelectItem key={c} value={c} className="text-xs">
                      {c === "TOP" ? "Top Servidores" : c === "Premium" ? "Premium Servidores" : c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Servidor Específico</Label>
              <Select value={servidorId} onValueChange={setServidorId}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Todos os servidores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos" className="text-xs">Todos os servidores da seleção</SelectItem>
                  {servidoresFiltrados.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-xs">
                      {s.nome} ({s.categoria ?? "Geral"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 pt-2 border-t border-border/40">
              <Label className="text-xs font-semibold">Seções a Incluir</Label>
              <div className="grid grid-cols-1 gap-2">
                <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                  <Checkbox
                    checked={incluirSaldos}
                    onCheckedChange={(c) => setIncluirSaldos(!!c)}
                  />
                  <span>Saldo por Servidor (Estoque atual e custos)</span>
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                  <Checkbox
                    checked={incluirCompras}
                    onCheckedChange={(c) => setIncluirCompras(!!c)}
                  />
                  <span>Histórico de Compras de Créditos</span>
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                  <Checkbox
                    checked={incluirMovs}
                    onCheckedChange={(c) => setIncluirMovs(!!c)}
                  />
                  <span>Extrato de Movimentações (Entradas/Saídas)</span>
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-border/40">
            <Label className="text-xs font-semibold text-muted-foreground">Escolha o formato de download:</Label>
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 text-xs flex flex-col items-center justify-center gap-1 border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-400"
                onClick={() => handleExport("xlsx")}
                disabled={exporting}
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                Excel (.xlsx)
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 text-xs flex flex-col items-center justify-center gap-1 border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
                onClick={() => handleExport("pdf")}
                disabled={exporting}
              >
                <FileDown className="h-4 w-4 text-red-400" />
                PDF
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 text-xs flex flex-col items-center justify-center gap-1 border-purple-500/30 hover:bg-purple-500/10 hover:text-purple-400"
                onClick={() => handleExport("png")}
                disabled={exporting}
              >
                <FileImage className="h-4 w-4 text-purple-400" />
                PNG (Imagem)
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PedidoDialog({
  open, onOpenChange, texto, onCopiar,
}: { open: boolean; onOpenChange: (o: boolean) => void; texto: string; onCopiar: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Pedido de compra do dia</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Resumo consolidado das compras de hoje agrupadas por servidor.
          </p>
          <Textarea rows={10} readOnly value={texto || "Nenhuma compra registrada hoje."} className="font-mono text-xs" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={onCopiar} disabled={!texto}>
            <ClipboardCopy className="h-4 w-4 mr-1" /> Copiar Pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResumoServidor({
  servidor, saldoAtual, saldoFinal, compras, movs, extras,
}: {
  servidor: any; saldoAtual: number; saldoFinal: number;
  compras: any[]; movs: any[]; extras?: Array<[string, React.ReactNode]>;
}) {
  if (!servidor) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 p-3 text-sm text-muted-foreground">
        Selecione um servidor para ver os detalhes do saldo.
      </div>
    );
  }
  const doServidor = compras.filter((c: any) => c.servidor_id === servidor.id);
  const ultimaCompra = doServidor[0];
  const ultimaMov = movs.find((m: any) => m.servidor_id === servidor.id);
  const investido = doServidor.reduce((s: number, c: any) => s + getCompraTotal(c, [servidor]), 0);
  const delta = saldoFinal - saldoAtual;
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-sm">{servidor.nome}</div>
        <Badge variant="outline">{servidor.categoria}</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md bg-background/60 py-2">
          <div className="text-[10px] uppercase text-muted-foreground">Saldo atual</div>
          <div className="text-lg font-bold">{saldoAtual}</div>
        </div>
        <div className="rounded-md bg-background/60 py-2">
          <div className="text-[10px] uppercase text-muted-foreground">Movimento</div>
          <div className={`text-lg font-bold ${delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : ""}`}>
            {delta > 0 ? "+" : ""}{delta}
          </div>
        </div>
        <div className="rounded-md bg-background/60 py-2">
          <div className="text-[10px] uppercase text-muted-foreground">Saldo final</div>
          <div className={`text-lg font-bold ${saldoFinal < 0 ? "text-red-400" : "text-emerald-400"}`}>{saldoFinal}</div>
        </div>
      </div>
      {saldoFinal < 0 && (
        <div className="text-[11px] text-red-400 flex items-center gap-1">
          <AlertTriangle className="h-3.5 w-3.5" /> O saldo final ficará negativo.
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <div>Valor do crédito: <span className="text-foreground font-medium">{currencyBRL(Number(servidor.custo_mensal ?? 0))}</span></div>
        <div>Investido no servidor: <span className="text-foreground font-medium">{currencyBRL(investido)}</span></div>
        <div>
          Última compra:{" "}
          <span className="text-foreground font-medium">
            {ultimaCompra ? `${formatDateBR(ultimaCompra.data_compra)} · ${ultimaCompra.quantidade} créd. · ${currencyBRL(getCompraTotal(ultimaCompra, [servidor]))}` : "—"}
          </span>
        </div>
        <div>
          Última movimentação:{" "}
          <span className="text-foreground font-medium">
            {ultimaMov ? `${formatDateTimeBR(ultimaMov.created_at)} · ${labelTipo(ultimaMov.tipo)} ${Number(ultimaMov.quantidade) > 0 ? "+" : ""}${ultimaMov.quantidade}` : "—"}
          </span>
        </div>
        <div>Compras registradas: <span className="text-foreground font-medium">{doServidor.length}</span></div>
        {extras?.map(([k, v]) => (
          <div key={k}>{k}: <span className="text-foreground font-medium">{v}</span></div>
        ))}
      </div>
    </div>
  );
}

function CompraDialog({
  open, onOpenChange, editing, servidores, saldos, compras, movs, lockServidor,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; editing: any | null; servidores: any[];
  saldos: Record<string, number>; compras: any[]; movs: any[]; lockServidor?: boolean;
}) {
  const qc = useQueryClient();
  const [servidorId, setServidorId] = useState<string>("");
  const [quantidade, setQuantidade] = useState<string>("");
  const [valorUnitario, setValorUnitario] = useState<string>("");
  const [dataCompra, setDataCompra] = useState<string>(toISODate(new Date()));
  const [observacao, setObservacao] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const isEdit = !!editing?.id;

  useEffect(() => {
    if (open) {
      const sid = editing?.servidor_id ?? "";
      setServidorId(sid);
      setQuantidade(editing?.quantidade ? String(editing.quantidade) : "");
      setDataCompra(editing?.data_compra ?? toISODate(new Date()));
      setObservacao(editing?.observacao ?? "");
      const srv = (servidores as any[]).find((s) => s.id === sid);
      const initialVu = editing?.valor_unitario != null
        ? String(editing.valor_unitario)
        : srv?.custo_mensal != null && Number(srv.custo_mensal) > 0
        ? String(srv.custo_mensal)
        : "";
      setValorUnitario(initialVu);
    }
  }, [open, editing, servidores]);

  function handleServidorChange(sid: string) {
    setServidorId(sid);
    const srv = (servidores as any[]).find((s) => s.id === sid);
    if (srv?.custo_mensal != null && (!valorUnitario || valorUnitario === "0")) {
      setValorUnitario(String(srv.custo_mensal));
    }
  }

  const qtd = Number(quantidade) || 0;
  const servidorSel = servidores.find((s: any) => s.id === servidorId);
  const vu = valorUnitario !== "" ? (Number(valorUnitario) || 0) : (Number(servidorSel?.custo_mensal ?? 0) || 0);
  const total = qtd * vu;
  const saldoAtual = servidorId ? (saldos[servidorId] ?? 0) : 0;
  const saldoBase = isEdit && editing?.servidor_id === servidorId ? saldoAtual - Number(editing?.quantidade || 0) : saldoAtual;
  const saldoFinal = saldoBase + qtd;

  async function salvar() {
    if (!servidorId) return toast.error("Selecione o servidor");
    if (qtd <= 0) return toast.error("Quantidade inválida");
    setSaving(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;
      if (isEdit) {
        const { error } = await supabase.from("creditos_compras")
          .update({
            servidor_id: servidorId,
            quantidade: qtd,
            valor_unitario: vu,
            valor_total: total,
            data_compra: dataCompra,
            observacao,
          })
          .eq("id", editing.id);
        if (error) return toast.error(error.message);
        await supabase.from("creditos_movimentacoes")
          .update({ servidor_id: servidorId, quantidade: qtd, motivo: `Compra de ${qtd} créditos` })
          .eq("compra_id", editing.id);
        toast.success("Compra atualizada");
        await logAudit({ categoria: "compra_credito", acao: "editar", descricao: `Compra de créditos editada`, entidade: "creditos_compras", entidade_id: editing.id, dados_anteriores: editing, dados_novos: { servidor_id: servidorId, quantidade: qtd, valor_unitario: vu, valor_total: total, data_compra: dataCompra, observacao } });
      } else {
        const { data: c, error } = await supabase.from("creditos_compras").insert({
          user_id: user.id,
          servidor_id: servidorId,
          quantidade: qtd,
          valor_unitario: vu,
          valor_total: total,
          data_compra: dataCompra,
          observacao,
        } as any).select("id").single();
        if (error) return toast.error(error.message);
        await registrarMovimentacaoCredito({
          servidor_id: servidorId, quantidade: qtd, tipo: "compra",
          motivo: `Compra de ${qtd} créditos`, compra_id: c!.id,
        });
        toast.success("Compra registrada");
        await logAudit({ categoria: "compra_credito", acao: "comprar", descricao: `Compra de ${qtd} créditos registrada`, entidade: "creditos_compras", entidade_id: c!.id, dados_novos: { servidor_id: servidorId, quantidade: qtd, valor_unitario: vu, total, data_compra: dataCompra } });
      }
      qc.invalidateQueries();
      onOpenChange(false);
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{isEdit ? "Editar compra" : "Nova compra de créditos"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!lockServidor && (
            <div className="space-y-1.5">
              <Label>Servidor</Label>
              <Select value={servidorId} onValueChange={handleServidorChange}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <ServidorSelectItems servidores={servidores as any[]} />
                </SelectContent>
              </Select>
            </div>
          )}
          <ResumoServidor
            servidor={servidorSel}
            saldoAtual={saldoBase}
            saldoFinal={saldoFinal}
            compras={compras}
            movs={movs}
            extras={[["Créditos a adicionar", qtd || 0], ["Valor total", currencyBRL(total)]]}
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Quantidade</Label>
              <Input type="number" min={1} value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor unitário (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={valorUnitario}
                onChange={(e) => setValorUnitario(e.target.value)}
                placeholder={servidorSel?.custo_mensal ? String(servidorSel.custo_mensal) : "0.00"}
              />
              <p className="text-[11px] text-muted-foreground">
                Valor do cadastro: {currencyBRL(Number(servidorSel?.custo_mensal ?? 0))}
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Data da compra</Label>
            <Input type="date" value={dataCompra} onChange={(e) => setDataCompra(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Observação</Label>
            <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>
          <div className="rounded-lg border border-border/60 p-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Valor total</span>
            <span className="text-lg font-bold text-emerald-400">{currencyBRL(total)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>{isEdit ? "Salvar" : "Registrar compra"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AjusteDialog({
  open, onOpenChange, servidorId, servidores, saldos, compras, movs,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; servidorId: string | null; servidores: any[];
  saldos: Record<string, number>; compras: any[]; movs: any[];
}) {
  const qc = useQueryClient();
  const [sid, setSid] = useState<string>("");
  const [quantidade, setQuantidade] = useState<string>("");
  const [modo, setModo] = useState<"add" | "rem">("add");
  const [motivo, setMotivo] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useMemo(() => {
    if (open) {
      setSid(servidorId ?? "");
      setQuantidade(""); setModo("add"); setMotivo("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, servidorId]);

  const q = Number(quantidade) || 0;
  const servidorSel = servidores.find((s: any) => s.id === sid);
  const saldoAtual = sid ? (saldos[sid] ?? 0) : 0;
  const saldoFinal = saldoAtual + (modo === "add" ? q : -q);

  async function salvar() {
    if (!sid) return toast.error("Selecione o servidor");
    if (q <= 0) return toast.error("Quantidade inválida");
    setSaving(true);
    try {
      await registrarMovimentacaoCredito({
        servidor_id: sid,
        quantidade: modo === "add" ? q : -q,
        tipo: modo === "add" ? "ajuste_add" : "ajuste_rem",
        motivo: motivo || (modo === "add" ? "Ajuste manual (+)" : "Ajuste manual (-)"),
      });
      toast.success("Ajuste registrado");
      await logAudit({ categoria: "credito", acao: "ajustar", descricao: `Ajuste manual de créditos ${modo === "add" ? "+" : "-"}${q}`, entidade: "creditos_movimentacoes", metadata: { servidor_id: sid, quantidade: q, modo, motivo } });
      qc.invalidateQueries();
      onOpenChange(false);
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Ajuste manual de créditos</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!servidorId && (
            <div className="space-y-1.5">
              <Label>Servidor</Label>
              <Select value={sid} onValueChange={setSid}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <ServidorSelectItems servidores={servidores as any[]} />
                </SelectContent>
              </Select>
            </div>
          )}
          <ResumoServidor
            servidor={servidorSel}
            saldoAtual={saldoAtual}
            saldoFinal={saldoFinal}
            compras={compras}
            movs={movs}
            extras={[["Operação", modo === "add" ? `Acréscimo de ${q} crédito(s)` : `Redução de ${q} crédito(s)`]]}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={modo === "add" ? "default" : "secondary"} onClick={() => setModo("add")}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
            <Button type="button" variant={modo === "rem" ? "default" : "secondary"} onClick={() => setModo("rem")}>
              <Minus className="h-4 w-4 mr-1" /> Remover
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label>Quantidade</Label>
            <Input type="number" min={1} value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Motivo</Label>
            <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex: correção de saldo, bônus do provedor..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>Salvar ajuste</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
