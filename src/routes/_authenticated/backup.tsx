import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DatabaseBackup,
  Download,
  Upload,
  RefreshCw,
  Trash2,
  History,
  FileJson,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Cloud,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { sincronizarGoogle, statusGoogle, definirAutoGoogle } from "@/lib/google-backup.functions";
import { confirmDialog } from "@/lib/confirm";
import { logAudit } from "@/lib/audit";
import {
  type BackupRow,
  type ResultadoImport,
  criarBackup,
  exportarJSON,
  exportarXLSX,
  formatarTamanho,
  importarJSON,
  importarXLSX,
  restaurarBackup,
} from "@/lib/backup";

export const Route = createFileRoute("/_authenticated/backup")({
  head: () => ({
    meta: [
      { title: "Backup do Sistema | Orbit" },
      {
        name: "description",
        content:
          "Backups automáticos diários, exportação e importação em JSON e Excel, e restauração completa dos dados do Orbit.",
      },
      { property: "og:title", content: "Backup do Sistema | Orbit" },
      {
        property: "og:description",
        content: "Gerencie backups automáticos, exportações e restaurações completas do sistema.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BackupPage,
});

async function fetchBackups(): Promise<BackupRow[]> {
  const { data, error } = await (supabase as any)
    .from("backups")
    .select("id,nome,tipo,status,erro_msg,tamanho_bytes,registros,referencia_dia,exportado_em,created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as BackupRow[];
}

const dt = (v: string | null) => (v ? new Date(v).toLocaleString("pt-BR") : "—");
const somaRegistros = (r: Record<string, number> | null) =>
  Object.values(r ?? {}).reduce((a, b) => a + (Number(b) || 0), 0);

function BackupPage() {
  const qc = useQueryClient();
  const { data = [], isFetching, refetch } = useQuery({ queryKey: ["backups"], queryFn: fetchBackups });
  const [busy, setBusy] = useState<string | null>(null);
  const [relatorio, setRelatorio] = useState<ResultadoImport | null>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const xlsxRef = useRef<HTMLInputElement>(null);

  const enviarGoogle = useServerFn(sincronizarGoogle);
  const lerStatus = useServerFn(statusGoogle);
  const setAuto = useServerFn(definirAutoGoogle);
  const { data: google, refetch: refetchGoogle } = useQuery({
    queryKey: ["google-backup-status"],
    queryFn: () => lerStatus(),
  });

  async function onEnviarGoogle(b?: BackupRow) {
    setBusy(b?.id ?? "google");
    try {
      const alvo = b ?? (await criarBackup("manual"));
      const r = await enviarGoogle({ data: { backupId: alvo.id } });
      await logAudit({
        categoria: "backup",
        acao: "exportar",
        descricao: `Backup ${alvo.nome} enviado ao Google Drive/Sheets (${r.registros} registros)`,
        entidade: "backups",
        entidade_id: alvo.id,
        entidade_nome: alvo.nome,
      });
      toast.success(`Enviado ao Google — ${r.registros} registro(s) na planilha`);
      await refetchGoogle();
      await refetch();
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      // "Failed to fetch" = a resposta do envio demorou demais / conexão caiu.
      // O envio pode ter concluído no servidor: reconsulta o status antes de avisar.
      if (/failed to fetch|network|load failed/i.test(msg)) {
        await refetchGoogle();
        toast.message("Envio em andamento", {
          description: "A conexão com o Google demorou a responder. Confira a planilha/pasta em instantes.",
        });
      } else {
        toast.error(msg || "Falha ao enviar ao Google");
      }
    } finally {
      setBusy(null);
    }
  }

  async function onAlternarAuto() {
    try {
      await setAuto({ data: { ativo: !google?.ativo } });
      await refetchGoogle();
      toast.success(!google?.ativo ? "Envio automático ativado" : "Envio automático desativado");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao alterar");
    }
  }

  const invalidarTudo = async () => {
    await qc.invalidateQueries();
    await refetch();
  };

  async function onCriar() {
    setBusy("criar");
    try {
      const b = await criarBackup("manual");
      await logAudit({
        categoria: "backup",
        acao: "criar",
        descricao: `Backup manual criado: ${b.nome} (${somaRegistros(b.registros)} registros)`,
        entidade: "backups",
        entidade_id: b.id,
        entidade_nome: b.nome,
      });
      toast.success(`Backup criado: ${b.nome}`);
      await refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao criar backup");
      await refetch();
    } finally {
      setBusy(null);
    }
  }

  async function onExportar(b: BackupRow, formato: "json" | "xlsx") {
    setBusy(b.id);
    try {
      if (formato === "json") await exportarJSON(b);
      else await exportarXLSX(b);
      await logAudit({
        categoria: "backup",
        acao: "exportar",
        descricao: `Backup ${b.nome} exportado em ${formato.toUpperCase()}`,
        entidade: "backups",
        entidade_id: b.id,
        entidade_nome: b.nome,
      });
      toast.success(`Exportado em ${formato.toUpperCase()}`);
      await refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao exportar");
    } finally {
      setBusy(null);
    }
  }

  async function onExportarAtual(formato: "json" | "xlsx") {
    setBusy("exportar-atual");
    try {
      const b = await criarBackup("manual");
      if (formato === "json") await exportarJSON(b);
      else await exportarXLSX(b);
      toast.success(`Sistema exportado em ${formato.toUpperCase()}`);
      await refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao exportar");
    } finally {
      setBusy(null);
    }
  }

  async function onImportar(file: File, formato: "json" | "xlsx") {
    setBusy("importar");
    try {
      const res = formato === "json" ? await importarJSON(file) : await importarXLSX(file);
      setRelatorio(res);
      await logAudit({
        categoria: "backup",
        acao: "importar",
        descricao: `Importação ${formato.toUpperCase()} — ${res.inseridos} inseridos, ${res.atualizados} atualizados, ${res.erros.length} erro(s)`,
        entidade: "backups",
        metadata: res as any,
      });
      toast.success(`Importação concluída: ${res.inseridos + res.atualizados} registros`);
      await invalidarTudo();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha na importação");
    } finally {
      setBusy(null);
    }
  }

  async function onRestaurar(b: BackupRow) {
    const ok = await confirmDialog({
      title: "Restaurar backup",
      description: `Todos os dados do backup ${b.nome} serão gravados no sistema, atualizando registros existentes. Deseja continuar?`,
      confirmText: "Restaurar",
    });
    if (!ok) return;
    setBusy(b.id);
    try {
      const res = await restaurarBackup(b.id);
      setRelatorio(res);
      await logAudit({
        categoria: "backup",
        acao: "restaurar",
        descricao: `Backup ${b.nome} restaurado — ${res.inseridos} inseridos, ${res.atualizados} atualizados`,
        entidade: "backups",
        entidade_id: b.id,
        entidade_nome: b.nome,
      });
      toast.success("Backup restaurado");
      await invalidarTudo();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao restaurar");
    } finally {
      setBusy(null);
    }
  }

  async function onExcluir(b: BackupRow) {
    const ok = await confirmDialog({
      title: "Excluir backup",
      description: `O backup ${b.nome} será removido definitivamente.`,
      confirmText: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await (supabase as any).from("backups").delete().eq("id", b.id);
    if (error) return toast.error(error.message);
    await logAudit({
      categoria: "backup",
      acao: "excluir",
      descricao: `Backup ${b.nome} excluído`,
      entidade: "backups",
      entidade_id: b.id,
      entidade_nome: b.nome,
    });
    toast.success("Backup excluído");
    await refetch();
  }

  const ultimo = data.find((b) => b.status === "concluido");

  return (
    <div className="p-6 space-y-4">
      <input
        ref={jsonRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onImportar(f, "json");
        }}
      />
      <input
        ref={xlsxRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onImportar(f, "xlsx");
        }}
      />

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <DatabaseBackup className="h-5 w-5 text-primary" /> Backup
          </h1>
          <p className="text-sm text-muted-foreground">
            Backup completo automático todos os dias às 23:59. Se o sistema estiver fora do ar no horário,
            o backup pendente é gerado na próxima abertura.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button size="sm" onClick={onCriar} disabled={busy === "criar"}>
            {busy === "criar" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <DatabaseBackup className="h-4 w-4 mr-2" />
            )}
            Criar Backup Agora
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={busy === "exportar-atual"}>
                <Download className="h-4 w-4 mr-2" /> Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="gap-2" onClick={() => onExportarAtual("json")}>
                <FileJson className="h-4 w-4" /> Exportar JSON
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2" onClick={() => onExportarAtual("xlsx")}>
                <FileSpreadsheet className="h-4 w-4" /> Exportar Excel (.xlsx)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={busy === "importar"}>
                {busy === "importar" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Importar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="gap-2" onClick={() => jsonRef.current?.click()}>
                <FileJson className="h-4 w-4" /> Importar JSON
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2" onClick={() => xlsxRef.current?.click()}>
                <FileSpreadsheet className="h-4 w-4" /> Importar Excel (.xlsx)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={busy === "google"}>
                {busy === "google" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Cloud className="h-4 w-4 mr-2" />
                )}
                Google
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem className="gap-2" onClick={() => onEnviarGoogle()}>
                <Cloud className="h-4 w-4" /> Enviar backup agora
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2" onClick={onAlternarAuto}>
                <RefreshCw className="h-4 w-4" />
                {google?.ativo ? "Desativar envio automático" : "Ativar envio automático (23:59)"}
              </DropdownMenuItem>
              {google?.planilha && (
                <DropdownMenuItem className="gap-2" asChild>
                  <a href={google.planilha} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" /> Abrir planilha
                  </a>
                </DropdownMenuItem>
              )}
              {google?.pasta && (
                <DropdownMenuItem className="gap-2" asChild>
                  <a href={google.pasta} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" /> Abrir pasta do Drive
                  </a>
                </DropdownMenuItem>
              )}
              {google?.pasta_clientes && (
                <DropdownMenuItem className="gap-2" asChild>
                  <a href={google.pasta_clientes} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" /> Abrir pasta CLIENTES_ATUALIZADOS
                  </a>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Último backup</div>
          <div className="text-sm font-semibold mt-1">{ultimo?.nome ?? "—"}</div>
          <div className="text-xs text-muted-foreground mt-1">{dt(ultimo?.created_at ?? null)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Registros no último backup</div>
          <div className="text-lg font-bold mt-1">{somaRegistros(ultimo?.registros ?? null)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Backups armazenados</div>
          <div className="text-lg font-bold mt-1">{data.length}</div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Google: {google?.ativo ? "automático ativo" : "manual"}
            {google?.ultima_sync ? ` · último envio ${dt(google.ultima_sync)}` : ""}
          </div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="max-h-[520px] overflow-auto">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead>Arquivo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead>Exportado em</TableHead>
                <TableHead>Registros</TableHead>
                <TableHead>Tamanho</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono">{b.nome}</TableCell>
                  <TableCell>
                    <Badge variant={b.tipo === "automatico" ? "default" : "secondary"}>
                      {b.tipo === "automatico" ? "Automático" : "Manual"}
                    </Badge>
                  </TableCell>
                  <TableCell>{dt(b.created_at)}</TableCell>
                  <TableCell>{dt(b.exportado_em)}</TableCell>
                  <TableCell>{somaRegistros(b.registros)}</TableCell>
                  <TableCell>{formatarTamanho(b.tamanho_bytes)}</TableCell>
                  <TableCell>
                    {b.status === "concluido" ? (
                      <span className="inline-flex items-center gap-1 text-emerald-500">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Concluído
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 text-destructive"
                        title={b.erro_msg ?? ""}
                      >
                        <AlertTriangle className="h-3.5 w-3.5" /> Erro
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <div className="inline-flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Baixar JSON"
                        disabled={b.status !== "concluido" || busy === b.id}
                        onClick={() => onExportar(b, "json")}
                      >
                        <FileJson className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Baixar Excel"
                        disabled={b.status !== "concluido" || busy === b.id}
                        onClick={() => onExportar(b, "xlsx")}
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Enviar ao Google Drive/Sheets"
                        disabled={b.status !== "concluido" || busy === b.id}
                        onClick={() => onEnviarGoogle(b)}
                      >
                        <Cloud className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Restaurar backup"
                        disabled={b.status !== "concluido" || busy === b.id}
                        onClick={() => onRestaurar(b)}
                      >
                        <History className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        title="Excluir backup"
                        onClick={() => onExcluir(b)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!data.length && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Nenhum backup gerado ainda.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={!!relatorio} onOpenChange={(o) => !o && setRelatorio(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Relatório da operação</DialogTitle>
            <DialogDescription>
              {relatorio?.inseridos} inserido(s) · {relatorio?.atualizados} atualizado(s) ·{" "}
              {relatorio?.erros.length} erro(s)
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[320px] overflow-auto text-xs space-y-1">
            {relatorio?.detalhes.map((d) => (
              <div key={d.tabela} className="flex justify-between gap-2 border-b border-border/40 py-1">
                <span className="font-medium">{d.tabela}</span>
                <span className={d.erro ? "text-destructive" : "text-muted-foreground"}>
                  {d.erro ? d.erro : `${d.registros} registro(s)`}
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
