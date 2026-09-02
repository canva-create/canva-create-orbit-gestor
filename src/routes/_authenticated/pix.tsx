import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QrCode, History, Webhook, RefreshCw, Copy, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { INTEGRACOES } from "@/lib/integracoes";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { exibeBanco, exibePagador } from "@/lib/pix-format";
import { DetalheIntegracao, fetchIntegracoes, webhookUrl } from "@/components/integracao-detalhe";
import { syncMercadoPagoTodayFn } from "@/lib/pix-sync.functions";

const searchSchema = z.object({
  sec: z.enum(["historico", "webhooks"]).catch("historico"),
  p: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/pix")({
  validateSearch: searchSchema,
  component: PixPage,
});

type PixRow = {
  id: string;
  provider: string;
  transacao_id: string | null;
  end_to_end_id: string | null;
  valor: number;
  pagador_nome: string | null;
  pagador_documento: string | null;
  instituicao: string | null;
  conta_destino: string | null;
  status: string;
  pago_em: string;
};

async function fetchPix(): Promise<PixRow[]> {
  const { data, error } = await (supabase as any)
    .from("pix_pagamentos")
    .select("id, provider, transacao_id, end_to_end_id, valor, pagador_nome, pagador_documento, instituicao, conta_destino, status, pago_em")
    .order("pago_em", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as PixRow[];
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ni = (v: unknown) => {
  const s = v == null ? "" : String(v).trim();
  return s ? s : "Não informado";
};

type Ordem = "recentes" | "antigos" | "nome_az" | "nome_za" | "valor_desc" | "valor_asc";

function PixPage() {
  const { sec, p } = Route.useSearch();
  const navigate = useNavigate({ from: "/pix" });
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <QrCode className="h-5 w-5 text-emerald-500" /> Pagamento Pix
        </h1>
        <p className="text-sm text-muted-foreground">
          Central de recebimentos Pix e configuração das notificações automáticas.
        </p>
      </div>
      <Tabs
        value={sec}
        onValueChange={(v) => navigate({ search: { sec: v as any }, replace: true })}
      >
        <TabsList>
          <TabsTrigger value="historico" className="gap-2">
            <History className="h-4 w-4" /> Histórico de Pagamentos
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="gap-2">
            <Webhook className="h-4 w-4" /> Configuração de Webhooks
          </TabsTrigger>
        </TabsList>
        <TabsContent value="historico" className="mt-4">
          <Historico />
        </TabsContent>
        <TabsContent value="webhooks" className="mt-4">
          <Webhooks selecionado={p} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Historico() {
  const qc = useQueryClient();
  const syncMercadoPago = useServerFn(syncMercadoPagoTodayFn);
  const { data = [], isFetching, refetch } = useQuery({
    queryKey: ["pix_pagamentos"],
    queryFn: fetchPix,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const [sincronizando, setSincronizando] = useState(false);
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("recentes");
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const base = !q
      ? [...data]
      : data.filter((r) =>
          [r.pagador_nome, r.pagador_documento, r.instituicao, r.transacao_id, r.end_to_end_id, r.conta_destino, r.status]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)),
        );
    const nome = (r: PixRow) => (exibePagador(r) ?? "zzz").toLocaleLowerCase("pt-BR");
    const ts = (r: PixRow) => new Date(r.pago_em).getTime();
    return base.sort((a, b) => {
      switch (ordem) {
        case "antigos": return ts(a) - ts(b);
        case "nome_az": return nome(a).localeCompare(nome(b), "pt-BR") || ts(b) - ts(a);
        case "nome_za": return nome(b).localeCompare(nome(a), "pt-BR") || ts(b) - ts(a);
        case "valor_desc": return Number(b.valor || 0) - Number(a.valor || 0);
        case "valor_asc": return Number(a.valor || 0) - Number(b.valor || 0);
        default: return ts(b) - ts(a);
      }
    });
  }, [data, busca, ordem]);

  const hoje = new Date().toDateString();
  const totalHoje = data
    .filter((r) => new Date(r.pago_em).toDateString() === hoje)
    .reduce((s, r) => s + Number(r.valor || 0), 0);
  const totalGeral = data.reduce((s, r) => s + Number(r.valor || 0), 0);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Recebido hoje</div>
          <div className="text-lg font-bold text-emerald-500">{brl(totalHoje)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total recebido</div>
          <div className="text-lg font-bold">{brl(totalGeral)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Pagamentos registrados</div>
          <div className="text-lg font-bold">{data.length}</div>
        </Card>
      </div>

      <div className="flex gap-2 items-center">
        <Input
          placeholder="Pesquisar por pagador, CPF/CNPJ, instituição ou transação..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-md"
        />
        <Select value={ordem} onValueChange={(v) => setOrdem(v as Ordem)}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Ordenar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recentes">Mais recentes primeiro</SelectItem>
            <SelectItem value="antigos">Mais antigos primeiro</SelectItem>
            <SelectItem value="nome_az">Pagador (A-Z)</SelectItem>
            <SelectItem value="nome_za">Pagador (Z-A)</SelectItem>
            <SelectItem value="valor_desc">Maior valor</SelectItem>
            <SelectItem value="valor_asc">Menor valor</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            setSincronizando(true);
            try {
              const result = await syncMercadoPago();
              await qc.invalidateQueries({ queryKey: ["pix_pagamentos"] });
              await refetch();
              result.ok ? toast.success(result.message) : toast.error(result.message);
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Falha ao sincronizar pagamentos");
            } finally {
              setSincronizando(false);
            }
          }}
          disabled={isFetching || sincronizando}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching || sincronizando ? "animate-spin" : ""}`} /> Sincronizar hoje
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="max-h-[520px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead>Pagador</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Hora</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Banco de origem</TableHead>
                <TableHead>CPF/CNPJ</TableHead>
                <TableHead>Conta destino</TableHead>
                <TableHead>Transação</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((r) => {
                const d = new Date(r.pago_em);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-bold">{ni(exibePagador(r))}</TableCell>
                    <TableCell className="font-semibold">{d.toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="font-semibold">{d.toLocaleTimeString("pt-BR")}</TableCell>
                    <TableCell className="font-bold text-emerald-500">{brl(Number(r.valor || 0))}</TableCell>
                    <TableCell className="font-semibold">{ni(exibeBanco(r))}</TableCell>
                    <TableCell className="text-muted-foreground">{ni(r.pagador_documento)}</TableCell>
                    <TableCell className="text-muted-foreground">{ni(r.conta_destino)}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{ni(r.end_to_end_id ?? r.transacao_id)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{ni(r.status)}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!filtrados.length && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                    Nenhum pagamento Pix registrado ainda. Configure um webhook na aba ao lado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function Webhooks({ selecionado }: { selecionado?: string }) {
  const navigate = useNavigate({ from: "/pix" });
  const { data = [] } = useQuery({ queryKey: ["integracoes"], queryFn: fetchIntegracoes });
  const provedores = INTEGRACOES.filter((i) => i.webhook);

  if (selecionado) {
    return (
      <div className="space-y-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ search: { sec: "webhooks" }, replace: true })}
        >
          Voltar para a lista de webhooks
        </Button>
        <DetalheIntegracao provider={selecionado} embutido />
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {provedores.map((def) => {
        const row = data.find((r) => r.provider === def.provider);
        const url = row?.webhook_token ? webhookUrl(row.webhook_token) : "";
        return (
          <Card key={def.provider} className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-sm">{def.nome}</div>
              <Badge variant={row?.ativo ? "default" : "secondary"}>
                {row?.ativo ? "Conectado" : "Desconectado"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{def.resumo}</p>
            <div className="text-[11px] text-muted-foreground">
              Última notificação: {row?.ultima_notificacao ? new Date(row.ultima_notificacao).toLocaleString("pt-BR") : "—"}
            </div>
            {url && (
              <div className="flex gap-2">
                <Input readOnly value={url} className="font-mono text-[11px] h-8" />
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  onClick={async () => {
                    await navigator.clipboard.writeText(url);
                    toast.success("URL do webhook copiada!");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            <Button
              size="sm"
              className="w-full"
              onClick={() => navigate({ search: { sec: "webhooks", p: def.provider } })}
            >
              Configurar <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Card>
        );
      })}
    </div>
  );
}