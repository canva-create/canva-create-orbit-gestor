import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AplicativoCatalogo,
  fetchAplicativosCatalogo,
  upsertAplicativoCatalogo,
  deleteAplicativoCatalogo,
} from "@/lib/aplicativos";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatCard } from "@/components/stat-card";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Tv,
  DollarSign,
  TrendingUp,
  Percent,
  Layers,
} from "lucide-react";
import { currencyBRL } from "@/lib/iptv";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirm";
import { COMPACT_TABLE_CLASS } from "@/components/density-toggle";

export function CatalogoAplicativosTab() {
  const qc = useQueryClient();
  const { data: aplicativos = [], isLoading } = useQuery({
    queryKey: ["aplicativos_catalogo"],
    queryFn: fetchAplicativosCatalogo,
  });

  const [busca, setBusca] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<AplicativoCatalogo | null>(null);

  // Form states
  const [nome, setNome] = useState("");
  const [custo, setCusto] = useState("11.00");
  const [valorVenda, setValorVenda] = useState("25.00");
  const [categoria, setCategoria] = useState("Player IPTV");
  const [observacao, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return aplicativos;
    return aplicativos.filter(
      (a) =>
        a.nome.toLowerCase().includes(t) ||
        (a.categoria && a.categoria.toLowerCase().includes(t)) ||
        (a.observacao && a.observacao.toLowerCase().includes(t)),
    );
  }, [aplicativos, busca]);

  // Estatísticas do Catálogo
  const totalApps = aplicativos.length;
  const custoMedio = totalApps > 0 ? aplicativos.reduce((s, a) => s + Number(a.custo || 0), 0) / totalApps : 0;
  const vendaMedia = totalApps > 0 ? aplicativos.reduce((s, a) => s + Number(a.valor_venda || 0), 0) / totalApps : 0;
  const lucroMedio = vendaMedia - custoMedio;

  const abrirModalNovo = () => {
    setEditingApp(null);
    setNome("");
    setCusto("11.00");
    setValorVenda("25.00");
    setCategoria("Player IPTV");
    setObs("");
    setModalOpen(true);
  };

  const abrirModalEditar = (app: AplicativoCatalogo) => {
    setEditingApp(app);
    setNome(app.nome);
    setCusto(String(app.custo ?? "11.00"));
    setValorVenda(String(app.valor_venda ?? "25.00"));
    setCategoria(app.categoria || "Player IPTV");
    setObs(app.observacao || "");
    setModalOpen(true);
  };

  const salvar = async () => {
    if (!nome.trim()) return toast.error("Informe o nome do aplicativo");
    const cNum = Number(String(custo).replace(",", "."));
    const vNum = Number(String(valorVenda).replace(",", "."));
    if (isNaN(cNum) || cNum < 0) return toast.error("Informe um custo válido");
    if (isNaN(vNum) || vNum < 0) return toast.error("Informe um valor de venda válido");

    setSaving(true);
    try {
      await upsertAplicativoCatalogo({
        id: editingApp?.id,
        nome: nome.trim().toUpperCase(),
        custo: cNum,
        valor_venda: vNum,
        categoria: categoria.trim() || "Player IPTV",
        observacao: observacao.trim() || null,
        ativo: true,
      });

      toast.success(editingApp ? "Aplicativo atualizado com sucesso" : "Aplicativo cadastrado com sucesso");
      qc.invalidateQueries({ queryKey: ["aplicativos_catalogo"] });
      setModalOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar aplicativo");
    } finally {
      setSaving(false);
    }
  };

  const excluir = async (app: AplicativoCatalogo) => {
    const ok = await confirmDialog({
      title: "Excluir aplicativo?",
      description: `Tem certeza que deseja excluir "${app.nome}" da tabela de preços?`,
      confirmText: "Excluir",
      destructive: true,
    });
    if (!ok) return;

    try {
      await deleteAplicativoCatalogo(app.id);
      toast.success("Aplicativo removido do catálogo");
      qc.invalidateQueries({ queryKey: ["aplicativos_catalogo"] });
    } catch (e: any) {
      toast.error(e?.message || "Erro ao excluir aplicativo");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" /> Catálogo & Tabela de Preços
          </h2>
          <p className="text-sm text-muted-foreground">
            Defina o custo de ativação e o preço de venda padrão de cada aplicativo para preenchimento automático.
          </p>
        </div>
        <Button onClick={abrirModalNovo} className="gap-2 bg-primary">
          <Plus className="h-4 w-4" /> Novo aplicativo
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Aplicativos cadastrados" value={String(totalApps)} icon={Tv} />
        <StatCard label="Custo médio" value={currencyBRL(custoMedio)} icon={DollarSign} />
        <StatCard label="Preço médio de venda" value={currencyBRL(vendaMedia)} icon={TrendingUp} />
        <StatCard label="Lucro médio estimado" value={currencyBRL(lucroMedio)} icon={Percent} />
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar por aplicativo ou categoria..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9"
            />
          </div>
          <Badge variant="secondary" className="text-xs font-normal">
            {lista.length} {lista.length === 1 ? "aplicativo" : "aplicativos"}
          </Badge>
        </div>

        <div className="rounded-md border overflow-x-auto max-h-[560px] overflow-y-auto">
          <Table className={COMPACT_TABLE_CLASS}>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead>Aplicativo</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Custo de ativação</TableHead>
                <TableHead className="text-right">Preço de venda padrão</TableHead>
                <TableHead className="text-right">Lucro líquido</TableHead>
                <TableHead className="text-right">Margem %</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right pr-4">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.length === 0 && !isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Nenhum aplicativo encontrado no catálogo.
                  </TableCell>
                </TableRow>
              )}
              {lista.map((app) => {
                const c = Number(app.custo || 0);
                const v = Number(app.valor_venda || 0);
                const lucro = v - c;
                const margem = v > 0 ? ((lucro / v) * 100).toFixed(0) : "0";

                return (
                  <TableRow key={app.id} className="hover:bg-muted/40 transition-colors">
                    <TableCell className="font-bold text-foreground">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-primary inline-block" />
                        {app.nome}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[11px] font-normal">
                        {app.categoria || "IPTV"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {currencyBRL(c)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-primary">
                      {currencyBRL(v)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-bold text-emerald-500">
                      {currencyBRL(lucro)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-muted-foreground">
                      {margem}%
                    </TableCell>
                    <TableCell>
                      <Badge variant={app.ativo !== false ? "secondary" : "destructive"} className="text-[11px]">
                        {app.ativo !== false ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap pr-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => abrirModalEditar(app)}
                          title="Editar preços e dados"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => excluir(app)}
                          title="Excluir aplicativo"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Diálogo de Cadastro / Edição de Aplicativo */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tv className="h-5 w-5 text-primary" />
              {editingApp ? "Editar Aplicativo" : "Novo Aplicativo no Catálogo"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label>Nome do Aplicativo *</Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value.toUpperCase())}
                placeholder="Ex.: IBO PLAYER, BOB PLAYER..."
                className="uppercase font-bold tracking-wide"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Input
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                placeholder="Ex.: Player IPTV, Smart TV, Android..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Custo de ativação (R$) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={custo}
                  onChange={(e) => setCusto(e.target.value)}
                  placeholder="11.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Preço de venda (R$) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={valorVenda}
                  onChange={(e) => setValorVenda(e.target.value)}
                  placeholder="25.00"
                />
              </div>
            </div>

            <div className="p-3 bg-muted/40 rounded-lg border border-border/50 text-sm space-y-1">
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Lucro estimado por ativação:</span>
                <span className="font-bold text-emerald-500">
                  {currencyBRL(Math.max(0, (Number(valorVenda) || 0) - (Number(custo) || 0)))}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Observação (opcional)</Label>
              <Textarea
                value={observacao}
                onChange={(e) => setObs(e.target.value)}
                rows={2}
                placeholder="Ex.: Compatibilidade com Samsung/LG, licença anual..."
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={saving}>
              {saving ? "Salvando..." : editingApp ? "Salvar Alterações" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
