import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FileText, FileImage, Copy, Users, ShieldCheck, CheckCircle2, Clock, ExternalLink } from "lucide-react";
import { fetchAplicativosCatalogo, fetchAplicativosSites, findAppSiteUrl } from "@/lib/aplicativos";
import { currencyBRL, diasParaVencer, formatDateBR, formatDateTimeBR, maskPhoneBR } from "@/lib/iptv";
import { custoCliente } from "@/lib/creditos";
import { toast } from "sonner";
import {
  exportFichaClientePDF,
  exportFichaClientePNG,
  copyFichaClienteImageToClipboard,
  type FichaModo,
} from "@/lib/ficha-cliente-generator";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cliente: any | null;
  historico: any[];
};

export function FichaClienteDialog({ open, onOpenChange, cliente, historico }: Props) {
  const { data: renovs = [] } = useQuery({
    enabled: !!cliente?.id && open,
    queryKey: ["cliente-renovacoes", cliente?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("historico_renovacoes")
        .select("*")
        .eq("cliente_id", cliente!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: catalogoApps = [] } = useQuery({
    queryKey: ["aplicativos_catalogo"],
    queryFn: fetchAplicativosCatalogo,
  });

  const { data: sitesApps = [] } = useQuery({
    queryKey: ["aplicativos_sites"],
    queryFn: fetchAplicativosSites,
  });

  const custo = cliente ? custoCliente(cliente, historico) : 0;
  const valorPago = Number(cliente?.valor_pago || 0);
  const lucro = cliente ? valorPago - custo : 0;
  const margemPct = valorPago > 0 ? ((lucro / valorPago) * 100).toFixed(1) + "%" : "0%";
  const dias = cliente ? diasParaVencer(cliente.data_vencimento) : null;
  const isDevendo = cliente?.status_pagamento === "devendo";

  const appSiteUrl = useMemo(() => {
    return findAppSiteUrl(cliente?.aplicativo, sitesApps.length > 0 ? sitesApps : catalogoApps);
  }, [cliente?.aplicativo, sitesApps, catalogoApps]);

  const geralClienteRows: [string, string][] = cliente
    ? [
        ["Servidor", cliente.servidor?.nome || "-"],
        ["Início", formatDateBR(cliente.data_inicio)],
        ["Vencimento", formatDateBR(cliente.data_vencimento)],
        ["Situação", dias !== null ? (dias < 0 ? `Vencido há ${Math.abs(dias)}d` : dias === 0 ? "Vence hoje" : `${dias} dias restantes`) : "-"],
      ]
    : [];

  const geralCompletoRows: [string, string][] = cliente
    ? [
        ["Servidor", cliente.servidor?.nome || "-"],
        ["Início", formatDateBR(cliente.data_inicio)],
        ["Vencimento", formatDateBR(cliente.data_vencimento)],
        ["Situação Acesso", dias !== null ? (dias < 0 ? `Vencido há ${Math.abs(dias)}d` : dias === 0 ? "Vence hoje" : `${dias} dias restantes`) : "-"],
        ["Pagamento", isDevendo ? "Devendo" : "Pago"],
        ["Valor Cobrado", currencyBRL(valorPago)],
        ["Custo Unitário", currencyBRL(custo)],
        ["Lucro Líquido", currencyBRL(lucro)],
        ["Margem", margemPct],
      ]
    : [];

  const clienteRows: [string, React.ReactNode][] = cliente
    ? [
        ["Nome", String(cliente.nome ?? "-")],
        ["Telefone", cliente.telefone ? maskPhoneBR(cliente.telefone) : "-"],
        ["MAC", cliente.mac || "-"],
        ["Device", cliente.device || "-"],
        [
          "Aplicativo",
          cliente.aplicativo ? (
            appSiteUrl ? (
              <a
                href={appSiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={`Abrir site oficial do ${cliente.aplicativo}`}
                className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium group"
              >
                <span>{cliente.aplicativo}</span>
                <ExternalLink className="h-3 w-3 opacity-70 group-hover:opacity-100 transition-opacity" />
              </a>
            ) : (
              <span>{cliente.aplicativo}</span>
            )
          ) : (
            "-"
          ),
        ],
        ["Observação", cliente.observacao || "-"],
      ]
    : [];

  const eventos = useMemo(() => {
    if (!cliente) return [] as { data: string; tipo: string; descricao: string; descCliente: string }[];
    const list: { data: string; tipo: string; descricao: string; descCliente: string }[] = [];
    list.push({
      data: cliente.created_at,
      tipo: "Cadastro",
      descricao: `Cliente cadastrado no sistema`,
      descCliente: `Assinatura iniciada`,
    });
    if (cliente.updated_at && cliente.updated_at !== cliente.created_at) {
      list.push({
        data: cliente.updated_at,
        tipo: "Atualização",
        descricao: "Cadastro do cliente atualizado",
        descCliente: "Dados cadastrais atualizados",
      });
    }
    (renovs as any[]).forEach((r) => {
      list.push({
        data: r.created_at,
        tipo: "Renovação",
        descricao: `+${r.dias_adicionados} dias • Recebido ${currencyBRL(r.valor_recebido)} • Custo ${currencyBRL(r.custo)} • Lucro ${currencyBRL(r.lucro)} (${formatDateBR(r.vencimento_anterior)} → ${formatDateBR(r.vencimento_novo)})`,
        descCliente: `Renovação de assinatura (+${r.dias_adicionados} dias de acesso)`,
      });
    });
    return list.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  }, [cliente, renovs]);

  if (!cliente) return null;

  async function handleExportPNG(modo: FichaModo) {
    try {
      await exportFichaClientePNG(cliente, historico, renovs, modo);
      toast.success(`PNG da ${modo === "cliente" ? "Ficha do Cliente" : "Ficha Completa"} baixado!`);
    } catch (err: any) {
      toast.error(err?.message || "Falha ao gerar PNG");
    }
  }

  async function handleExportPDF(modo: FichaModo) {
    try {
      await exportFichaClientePDF(cliente, historico, renovs, modo);
      toast.success(`PDF da ${modo === "cliente" ? "Ficha do Cliente" : "Ficha Completa"} baixado!`);
    } catch (err: any) {
      toast.error(err?.message || "Falha ao gerar PDF");
    }
  }

  async function handleCopyImage(modo: FichaModo) {
    try {
      const ok = await copyFichaClienteImageToClipboard(cliente, historico, renovs, modo);
      if (ok) {
        toast.success(`Imagem da ${modo === "cliente" ? "Ficha do Cliente" : "Ficha Completa"} copiada! Cole no WhatsApp com Ctrl + V.`);
      } else {
        toast.error("Seu navegador não suporta cópia direta de imagem. Use o botão 'PNG'.");
      }
    } catch {
      toast.error("Erro ao copiar imagem.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ficha do Cliente</DialogTitle>
          <DialogDescription>Gere comprovantes visuais para o cliente ou para gestão interna</DialogDescription>
        </DialogHeader>

        {/* Duas colunas de ações: Ficha do Cliente (Para Envio) e Ficha Completa (Controle Interno) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-lg border bg-muted/40">
          {/* Coluna 1: Ficha para o Cliente (Para Envio / WhatsApp) */}
          <div className="flex flex-col justify-between space-y-2 p-3 rounded-md border bg-card/60">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Users className="h-4 w-4 text-sky-500" />
                <span>Ficha do Cliente (Para Envio / WhatsApp)</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-tight">
                Versão resumida e limpa, <strong>sem custos de crédito e sem lucros</strong>.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleExportPDF("cliente")}
                className="h-8 px-2.5 text-xs font-medium text-sky-500 hover:bg-sky-500/10 hover:text-sky-400"
              >
                <FileText className="h-3.5 w-3.5 mr-1 text-sky-500" /> PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleExportPNG("cliente")}
                className="h-8 px-2.5 text-xs font-medium text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"
              >
                <FileImage className="h-3.5 w-3.5 mr-1 text-emerald-500" /> PNG
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleCopyImage("cliente")}
                title="Copiar imagem resumida da ficha para colar no WhatsApp com Ctrl + V"
                className="h-8 px-2.5 text-xs font-medium text-cyan-500 hover:bg-cyan-500/10 hover:text-cyan-400"
              >
                <Copy className="h-3.5 w-3.5 mr-1 text-cyan-500" /> Copiar Imagem
              </Button>
            </div>
          </div>

          {/* Coluna 2: Ficha Completa (Controle Interno / Gestão) */}
          <div className="flex flex-col justify-between space-y-2 p-3 rounded-md border bg-card/60">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <span>Ficha Completa (Controle Interno)</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-tight">
                Completa com <strong>servidor, custos, valor pago, lucro, credenciais e histórico</strong>.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleExportPDF("completo")}
                className="h-8 px-2.5 text-xs font-medium text-primary hover:bg-primary/10"
              >
                <FileText className="h-3.5 w-3.5 mr-1 text-primary" /> PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleExportPNG("completo")}
                className="h-8 px-2.5 text-xs font-medium text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"
              >
                <FileImage className="h-3.5 w-3.5 mr-1 text-emerald-500" /> PNG
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleCopyImage("completo")}
                title="Copiar imagem completa da ficha para colar no WhatsApp com Ctrl + V"
                className="h-8 px-2.5 text-xs font-medium text-indigo-500 hover:bg-indigo-500/10 hover:text-indigo-400"
              >
                <Copy className="h-3.5 w-3.5 mr-1 text-indigo-500" /> Copiar Imagem
              </Button>
            </div>
          </div>
        </div>

        {/* Abas de prévia dos dados na tela */}
        <Tabs defaultValue="cliente" className="w-full">
          <TabsList className="grid grid-cols-2 w-full h-9">
            <TabsTrigger value="cliente" className="gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5 text-sky-500" />
              <span>Ficha do Cliente (Para Envio)</span>
            </TabsTrigger>
            <TabsTrigger value="completo" className="gap-1.5 text-xs">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              <span>Ficha Completa (Controle Interno)</span>
            </TabsTrigger>
          </TabsList>

          {/* Conteúdo Aba 1: Ficha para o Cliente */}
          <TabsContent value="cliente" className="space-y-3 mt-3">
            <Card className="p-4 border-sky-500/30">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-lg font-bold">{cliente.nome}</h3>
                  <p className="text-xs text-muted-foreground">Ficha de Assinatura Rodolfo TV</p>
                </div>
                <Badge variant="outline" className="text-emerald-500 border-emerald-500/40">
                  {cliente.status?.toUpperCase() || "ATIVO"}
                </Badge>
              </div>
              <h4 className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Dados do Plano</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {geralClienteRows.map(([k, v]) => <Info key={k} label={k} value={v} />)}
              </div>
            </Card>

            <Card className="p-4">
              <h4 className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Dados de Acesso & Contato</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {clienteRows.filter(([k]) => k !== "Observação").map(([k, v]) => <Info key={k} label={k} value={v} />)}
              </div>
              {cliente.observacao && (
                <div className="mt-3 text-sm pt-2 border-t">
                  <div className="text-muted-foreground text-xs">Observação</div>
                  <div>{cliente.observacao}</div>
                </div>
              )}
            </Card>

            <Card className="p-4">
              <h4 className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Histórico de Assinatura</h4>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Evento</TableHead>
                      <TableHead>Descrição</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eventos.map((e, i) => (
                      <TableRow key={i} className="text-xs">
                        <TableCell className="whitespace-nowrap">{formatDateTimeBR(e.data)}</TableCell>
                        <TableCell><Badge variant="outline">{e.tipo}</Badge></TableCell>
                        <TableCell>{e.descCliente}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          {/* Conteúdo Aba 2: Ficha Completa (Interno) */}
          <TabsContent value="completo" className="space-y-3 mt-3">
            <Card className="p-4 border-primary/30">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-lg font-bold">{cliente.nome}</h3>
                  <p className="text-xs text-muted-foreground">Ficha Cadastral Completa • Gestão Interna</p>
                </div>
                <Badge variant="outline">{cliente.status}</Badge>
              </div>

              {/* Bloco de Métricas Financeiras */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 p-2.5 rounded-lg bg-muted/40 border">
                <div className="p-2 rounded bg-card/60">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor Pago</div>
                  <div className="text-sm font-bold text-emerald-500">{currencyBRL(valorPago)}</div>
                </div>
                <div className="p-2 rounded bg-card/60">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Custo Crédito</div>
                  <div className="text-sm font-bold text-amber-500">{currencyBRL(custo)}</div>
                </div>
                <div className="p-2 rounded bg-card/60">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Lucro Líquido</div>
                  <div className={`text-sm font-bold ${lucro >= 0 ? "text-blue-500" : "text-red-500"}`}>{currencyBRL(lucro)}</div>
                </div>
                <div className="p-2 rounded bg-card/60">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Margem</div>
                  <div className="text-sm font-bold text-purple-500">{margemPct}</div>
                </div>
              </div>

              <h4 className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Dados Operacionais</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {geralCompletoRows.map(([k, v]) => <Info key={k} label={k} value={v} />)}
              </div>
            </Card>

            <Card className="p-4">
              <h4 className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Dados Cadastrais & Credenciais</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {clienteRows.filter(([k]) => k !== "Observação").map(([k, v]) => <Info key={k} label={k} value={v} />)}
              </div>
              {cliente.observacao && (
                <div className="mt-3 text-sm pt-2 border-t">
                  <div className="text-muted-foreground text-xs">Observação Interna</div>
                  <div>{cliente.observacao}</div>
                </div>
              )}
            </Card>

            <Card className="p-4">
              <h4 className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Histórico Detalhado (Auditoria)</h4>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Detalhamento Financeiro</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eventos.map((e, i) => (
                      <TableRow key={i} className="text-xs">
                        <TableCell className="whitespace-nowrap">{formatDateTimeBR(e.data)}</TableCell>
                        <TableCell><Badge variant="outline">{e.tipo}</Badge></TableCell>
                        <TableCell>{e.descricao}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}