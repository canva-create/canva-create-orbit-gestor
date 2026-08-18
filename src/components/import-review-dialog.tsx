import { ServidorSelectItems } from "@/lib/servidores-ui";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle2, Sparkles, Trash2, Wand2, ArrowRight, ChevronDown, ChevronRight } from "lucide-react";
import type { NormalizedRow, ColumnMapping } from "@/lib/import-clientes.functions";
import { maskPhoneBR } from "@/lib/iptv";

const STATUSES = ["ativo", "teste", "vencido", "cancelado", "suspenso"] as const;
const PAGAMENTOS = ["pago", "devendo"] as const;

export type EditableRow = NormalizedRow & { _selected: boolean };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rows: NormalizedRow[];
  mapping?: ColumnMapping[];
  unmapped?: string[];
  servidores: { id: string; nome: string }[];
  loading?: boolean;
  importing?: boolean;
  progress?: { total: number; done: number; ok: number; fail: number } | null;
  onConfirm: (rows: NormalizedRow[]) => Promise<void> | void;
};

function revalidate(r: NormalizedRow, servidores: { id: string; nome: string }[]): NormalizedRow {
  const errors: string[] = [];
  if (!r.nome.trim()) errors.push("Nome obrigatório");
  if (r.servidor_nome_original && !r.servidor_id) {
    const found = servidores.find((s) => s.nome.toLowerCase() === r.servidor_nome_original!.toLowerCase());
    if (!found) errors.push(`Servidor "${r.servidor_nome_original}" não encontrado`);
  }
  return { ...r, errors };
}

const FIELD_LABELS: Record<string, string> = {
  nome: "Cliente",
  telefone: "Telefone",
  servidor: "Servidor",
  data_inicio: "Data Início",
  data_vencimento: "Vencimento",
  status: "Status",
  status_pagamento: "Pagamento",
  valor_pago: "Valor Pago",
  mac: "MAC",
  device: "Device",
  aplicativo: "Aplicativo",
  observacao: "Observação",
};

export function ImportReviewDialog({ open, onOpenChange, rows, mapping = [], unmapped = [], servidores, loading, importing, progress, onConfirm }: Props) {
  const [items, setItems] = useState<EditableRow[]>([]);
  const [showMapping, setShowMapping] = useState(true);

  useEffect(() => {
    setItems(rows.map((r) => ({ ...r, _selected: true })));
  }, [rows]);

  const validCount = items.filter((i) => i.errors.length === 0).length;
  const errorCount = items.length - validCount;
  const selectedCount = items.filter((i) => i._selected).length;

  function updateRow(idx: number, patch: Partial<NormalizedRow>) {
    setItems((prev) => prev.map((r, i) => {
      if (i !== idx) return r;
      const merged = { ...r, ...patch };
      const val = revalidate(merged, servidores);
      return { ...merged, ...val, _selected: r._selected };
    }));
  }

  function toggleAll(v: boolean) {
    setItems((prev) => prev.map((r) => ({ ...r, _selected: v })));
  }

  function removeRow(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function confirm() {
    const toImport = items.filter((i) => i._selected);
    await onConfirm(toImport);
  }

  const pctRaw = progress && progress.total > 0 ? (progress.done / progress.total) * 100 : 0;
  // Conta em passos de 5% para uma progressão visual mais suave/estável
  const pct = progress && progress.done >= progress.total && progress.total > 0
    ? 100
    : Math.floor(pctRaw / 5) * 5;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Revisão da importação (IA)
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground flex flex-col items-center gap-3">
            <Wand2 className="h-6 w-6 animate-pulse text-primary" />
            A IA está mapeando as colunas e normalizando os dados...
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                <CheckCircle2 className="h-3 w-3 mr-1" /> {validCount} válidos
              </Badge>
              <Badge className="bg-red-500/20 text-red-400 border border-red-500/40">
                <AlertTriangle className="h-3 w-3 mr-1" /> {errorCount} com erro
              </Badge>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" onClick={() => toggleAll(true)}>Selecionar todos</Button>
                <Button size="sm" variant="outline" onClick={() => toggleAll(false)}>Nenhum</Button>
              </div>
            </div>

            {(importing || progress) && (
              <div className="border rounded-md p-3 space-y-2 bg-muted/20">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">
                    {importing ? "Importando..." : "Concluído"}
                  </span>
                  <span className="text-muted-foreground">{pct}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge className="bg-muted/60 border border-border">
                    Total: {progress?.total ?? 0}
                  </Badge>
                  <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/40">
                    Processadas: {progress?.done ?? 0}
                  </Badge>
                  <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Inseridas: {progress?.ok ?? 0}
                  </Badge>
                  <Badge className="bg-red-500/20 text-red-400 border border-red-500/40">
                    <AlertTriangle className="h-3 w-3 mr-1" /> Erros: {progress?.fail ?? 0}
                  </Badge>
                </div>
              </div>
            )}

            {mapping.length > 0 && (
              <div className="border rounded-md">
                <button
                  type="button"
                  onClick={() => setShowMapping((v) => !v)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-accent/50"
                >
                  {showMapping ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  Mapeamento de colunas e amostra
                  <span className="ml-auto text-xs text-muted-foreground">
                    {mapping.filter((m) => m.column).length}/{mapping.length} campos reconhecidos
                    {unmapped.length > 0 && ` · ${unmapped.length} coluna(s) ignorada(s)`}
                  </span>
                </button>
                {showMapping && (
                  <div className="p-3 border-t space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                      {mapping.map((m) => (
                        <div key={m.field} className="flex items-center gap-2 p-2 rounded border bg-muted/20">
                          <span className="font-medium">{FIELD_LABELS[m.field] ?? m.field}</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          {m.column ? (
                            <span className="font-mono text-emerald-400 truncate">{m.column}</span>
                          ) : (
                            <span className="italic text-muted-foreground">não encontrado</span>
                          )}
                        </div>
                      ))}
                    </div>
                    {unmapped.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium">Colunas ignoradas: </span>
                        {unmapped.map((c) => (
                          <span key={c} className="inline-block font-mono bg-muted/40 px-1.5 py-0.5 rounded mr-1">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-auto border rounded-md">
              <Table>
                <TableHeader className="bg-muted/40 sticky top-0">
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Servidor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Pgto</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>MAC</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>App</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r, i) => {
                    const hasErr = r.errors.length > 0;
                    return (
                      <TableRow key={i} className={hasErr ? "bg-red-500/5" : ""}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={r._selected}
                            onChange={(e) => setItems((prev) => prev.map((x, j) => j === i ? { ...x, _selected: e.target.checked } : x))}
                          />
                        </TableCell>
                        <TableCell>
                          {hasErr ? (
                            <Badge className="bg-red-500/20 text-red-400 border border-red-500/40" title={r.errors.join("; ")}>
                              <AlertTriangle className="h-3 w-3 mr-1" /> ERRO
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> OK
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input value={r.nome} onChange={(e) => updateRow(i, { nome: e.target.value })} className="h-8 w-40" />
                        </TableCell>
                        <TableCell>
                          <Input value={r.telefone} onChange={(e) => updateRow(i, { telefone: maskPhoneBR(e.target.value) })} className="h-8 w-36" />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={r.servidor_id ?? "none"}
                            onValueChange={(v) => {
                              const sid = v === "none" ? null : v;
                              const snome = sid ? servidores.find((s) => s.id === sid)?.nome ?? null : null;
                              updateRow(i, { servidor_id: sid, servidor_nome_original: snome });
                            }}
                          >
                            <SelectTrigger className="h-8 w-36"><SelectValue placeholder="—"/></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">— sem —</SelectItem>
                              <ServidorSelectItems servidores={servidores as any[]} />
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input type="date" value={r.data_vencimento ?? ""} onChange={(e) => updateRow(i, { data_vencimento: e.target.value || null })} className="h-8 w-36" />
                        </TableCell>
                        <TableCell>
                          <Select value={r.status_pagamento} onValueChange={(v) => updateRow(i, { status_pagamento: v })}>
                            <SelectTrigger className="h-8 w-28"><SelectValue/></SelectTrigger>
                            <SelectContent>
                              {PAGAMENTOS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input type="number" value={r.valor_pago} onChange={(e) => updateRow(i, { valor_pago: Number(e.target.value) })} className="h-8 w-20" />
                        </TableCell>
                        <TableCell>
                          <Input value={r.mac} onChange={(e) => updateRow(i, { mac: e.target.value })} className="h-8 w-36 font-mono" />
                        </TableCell>
                        <TableCell>
                          <Input value={r.device} onChange={(e) => updateRow(i, { device: e.target.value })} className="h-8 w-32" />
                        </TableCell>
                        <TableCell>
                          <Input value={r.aplicativo} onChange={(e) => updateRow(i, { aplicativo: e.target.value })} className="h-8 w-28" />
                        </TableCell>
                        <TableCell>
                          <button title="Remover" onClick={() => removeRow(i)} className="h-7 w-7 rounded-md grid place-items-center hover:bg-accent">
                            <Trash2 className="h-3.5 w-3.5 text-red-400" />
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {items.length === 0 && (
                    <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">Nenhuma linha para importar.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
                {importing ? "Fechar depois" : "Cancelar"}
              </Button>
              <Button onClick={confirm} disabled={selectedCount === 0 || importing}>
                {importing
                  ? `Importando ${progress?.done ?? 0}/${progress?.total ?? selectedCount}...`
                  : `Importar ${selectedCount} cliente${selectedCount === 1 ? "" : "s"}`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}