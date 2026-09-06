import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AplicativoSite,
  fetchAplicativosSites,
  upsertAplicativoSite,
  deleteAplicativoSite,
  CATEGORIAS_APLICATIVOS,
  descobrirTodosAplicativos,
  ensureAbsoluteUrl,
} from "@/lib/aplicativos";
import { fetchClientes, fetchAtivacoesApps } from "@/lib/queries";
import { fetchAplicativosCatalogo } from "@/lib/aplicativos";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatCard } from "@/components/stat-card";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Globe,
  ExternalLink,
  Layers,
  Sparkles,
  Tv,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FolderTree,
} from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirm";
import { cn } from "@/lib/utils";

export function AplicativosSitesTab() {
  const qc = useQueryClient();

  const { data: sites = [], isLoading } = useQuery({
    queryKey: ["aplicativos_sites"],
    queryFn: fetchAplicativosSites,
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: fetchClientes,
  });

  const { data: catalogoPrecos = [] } = useQuery({
    queryKey: ["aplicativos_catalogo"],
    queryFn: fetchAplicativosCatalogo,
  });

  const { data: ativacoes = [] } = useQuery({
    queryKey: ["ativacoes_apps"],
    queryFn: () => fetchAtivacoesApps(),
  });

  const [busca, setBusca] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("Todos");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<AplicativoSite | null>(null);

  // Form states
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("Player IPTV");
  const [siteUrl, setSiteUrl] = useState("");
  const [observacao, setObs] = useState("");
  const [saving, setSaving] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

  // Descobre todos os nomes de aplicativos usados em clientes, ativações e catálogo
  const todosAppsDoSistema = useMemo(() => {
    return descobrirTodosAplicativos(clientes as any[], catalogoPrecos as any[], ativacoes as any[]);
  }, [clientes, catalogoPrecos, ativacoes]);

  // Identifica aplicativos presentes no sistema mas que ainda não estão salvos na tabela de sites
  const appsNaoCadastrados = useMemo(() => {
    const existentes = new Set(sites.map((s) => s.nome.trim().toUpperCase()));
    return todosAppsDoSistema.filter((nome) => !existentes.has(nome.trim().toUpperCase()));
  }, [sites, todosAppsDoSistema]);

  // Lista filtrada por busca e categoria
  const lista = useMemo(() => {
    let res = sites;
    if (categoriaFiltro !== "Todos") {
      res = res.filter((a) => (a.categoria || "Outros") === categoriaFiltro);
    }
    const t = busca.trim().toLowerCase();
    if (t) {
      res = res.filter(
        (a) =>
          a.nome.toLowerCase().includes(t) ||
          (a.categoria && a.categoria.toLowerCase().includes(t)) ||
          (a.site_url && a.site_url.toLowerCase().includes(t)) ||
          (a.observacao && a.observacao.toLowerCase().includes(t)),
      );
    }
    return res;
  }, [sites, categoriaFiltro, busca]);

  // Agrupamento por categorias para visualização organizada
  const categoriasDisponiveis = useMemo(() => {
    const set = new Set<string>();
    sites.forEach((s) => {
      if (s.categoria) set.add(s.categoria);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [sites]);

  // Estatísticas
  const totalCadastrados = sites.length;
  const comSite = sites.filter((s) => s.site_url && s.site_url.trim().length > 0).length;
  const semSite = totalCadastrados - comSite;

  const abrirNovo = (nomeInicial = "") => {
    setEditingApp(null);
    setNome(nomeInicial);
    setCategoria("Player IPTV");
    setSiteUrl("");
    setObs("");
    setModalOpen(true);
  };

  const abrirEditar = (app: AplicativoSite) => {
    setEditingApp(app);
    setNome(app.nome);
    setCategoria(app.categoria || "Player IPTV");
    setSiteUrl(app.site_url || "");
    setObs(app.observacao || "");
    setModalOpen(true);
  };

  const salvar = async () => {
    if (!nome.trim()) return toast.error("Informe o nome do aplicativo");
    setSaving(true);
    try {
      await upsertAplicativoSite({
        id: editingApp?.id,
        nome: nome.trim().toUpperCase(),
        categoria: categoria.trim() || "Player IPTV",
        site_url: siteUrl.trim() ? ensureAbsoluteUrl(siteUrl) : null,
        observacao: observacao.trim() || null,
      });

      toast.success(editingApp ? "Aplicativo atualizado com sucesso" : "Aplicativo cadastrado com sucesso");
      qc.invalidateQueries({ queryKey: ["aplicativos_sites"] });
      setModalOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar aplicativo");
    } finally {
      setSaving(false);
    }
  };

  const excluir = async (app: AplicativoSite) => {
    const ok = await confirmDialog({
      title: "Excluir aplicativo?",
      description: `Tem certeza que deseja remover "${app.nome}" dos aplicativos e sites oficiais?`,
      confirmText: "Excluir",
      destructive: true,
    });
    if (!ok) return;

    try {
      await deleteAplicativoSite(app.id);
      toast.success("Aplicativo removido com sucesso");
      qc.invalidateQueries({ queryKey: ["aplicativos_sites"] });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao excluir aplicativo");
    }
  };

  // Importa automaticamente todos os aplicativos pendentes do sistema
  const sincronizarTodosDoSistema = async () => {
    if (appsNaoCadastrados.length === 0) {
      return toast.info("Todos os aplicativos do sistema já estão cadastrados!");
    }

    setSincronizando(true);
    try {
      let adicionados = 0;
      for (const appNome of appsNaoCadastrados) {
        await upsertAplicativoSite({
          nome: appNome,
          categoria: "Player IPTV",
          site_url: null,
          observacao: "Identificado automaticamente do cadastro do sistema.",
        });
        adicionados++;
      }
      toast.success(`${adicionados} aplicativo(s) importados com sucesso!`);
      qc.invalidateQueries({ queryKey: ["aplicativos_sites"] });
    } catch (err: any) {
      toast.error(err?.message || "Falha ao sincronizar aplicativos");
    } finally {
      setSincronizando(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Cabeçalho explicativo e botões de ação */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" /> Aplicativos & Sites Oficiais
          </h2>
          <p className="text-xs text-muted-foreground">
            Cadastre os links oficiais dos aplicativos para abertura direta na linha do cliente, organizado por categorias e independente de custos de ativação.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {appsNaoCadastrados.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={sincronizarTodosDoSistema}
              disabled={sincronizando}
              className="gap-1.5 text-xs text-primary border-primary/40 hover:bg-primary/10"
              title="Importa aplicativos que já aparecem nos clientes cadastrados mas ainda não têm site configurado"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", sincronizando && "animate-spin")} />
              Sincronizar Apps do Sistema ({appsNaoCadastrados.length})
            </Button>
          )}
          <Button onClick={() => abrirNovo()} className="gap-2 bg-primary">
            <Plus className="h-4 w-4" /> Novo aplicativo
          </Button>
        </div>
      </div>

      {/* Cards de Métricas */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <StatCard label="Total de Apps" value={String(totalCadastrados)} icon={Tv} tone="blue" />
        <StatCard label="Com Site Oficial" value={String(comSite)} icon={CheckCircle2} tone="green" />
        <StatCard label="Sem Site (Pendente)" value={String(semSite)} icon={AlertCircle} tone="orange" />
        <StatCard label="Categorias Ativas" value={String(categoriasDisponiveis.length)} icon={Layers} tone="purple" />
      </div>

      {/* Alerta de apps descobertos no sistema */}
      {appsNaoCadastrados.length > 0 && (
        <Card className="p-3 border-amber-500/30 bg-amber-500/5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-400 shrink-0" />
              <div className="text-xs">
                <span className="font-semibold text-foreground">
                  {appsNaoCadastrados.length} aplicativo(s)
                </span>{" "}
                encontrados no sistema aguardando cadastro de site oficial.
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {appsNaoCadastrados.slice(0, 5).map((appNome) => (
                <Button
                  key={appNome}
                  variant="outline"
                  size="sm"
                  onClick={() => abrirNovo(appNome)}
                  className="h-6 px-2 text-[10px] bg-background hover:bg-amber-500/10"
                >
                  + Cadastrar {appNome}
                </Button>
              ))}
              {appsNaoCadastrados.length > 5 && (
                <Badge variant="secondary" className="text-[10px]">
                  +{appsNaoCadastrados.length - 5} outros
                </Badge>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Barra de Filtros por Categoria e Busca */}
      <Card className="p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar aplicativo, site oficial ou observação..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Filtrar Categoria:</span>
            <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
              <SelectTrigger className="w-[180px] h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Todos">Todas as Categorias</SelectItem>
                {CATEGORIAS_APLICATIVOS.filter((c) => c !== "Todos").map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Pílulas de categorias rápidas */}
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/40">
          <Button
            variant={categoriaFiltro === "Todos" ? "default" : "outline"}
            size="sm"
            onClick={() => setCategoriaFiltro("Todos")}
            className="h-6 px-2.5 text-[11px] rounded-full"
          >
            Todos ({sites.length})
          </Button>
          {CATEGORIAS_APLICATIVOS.filter((c) => c !== "Todos").map((cat) => {
            const qtd = sites.filter((s) => (s.categoria || "Outros") === cat).length;
            if (qtd === 0 && categoriaFiltro !== cat) return null;
            return (
              <Button
                key={cat}
                variant={categoriaFiltro === cat ? "default" : "outline"}
                size="sm"
                onClick={() => setCategoriaFiltro(cat)}
                className="h-6 px-2.5 text-[11px] rounded-full"
              >
                {cat} ({qtd})
              </Button>
            );
          })}
        </div>
      </Card>

      {/* Grid de Cards separados por Categoria */}
      <div className="space-y-6">
        {lista.length === 0 && !isLoading && (
          <Card className="p-8 text-center text-muted-foreground">
            <Globe className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">Nenhum aplicativo encontrado para este filtro.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Cadastre um novo aplicativo ou clique em "Sincronizar Apps do Sistema".
            </p>
          </Card>
        )}

        {/* Agrupamento por Categoria */}
        {(() => {
          const grupos = new Map<string, AplicativoSite[]>();
          lista.forEach((item) => {
            const cat = item.categoria || "Outros";
            if (!grupos.has(cat)) grupos.set(cat, []);
            grupos.get(cat)!.push(item);
          });

          return Array.from(grupos.entries()).map(([catNome, appsDoGrupo]) => (
            <div key={catNome} className="space-y-2.5">
              <div className="flex items-center justify-between border-b pb-1.5">
                <div className="flex items-center gap-2">
                  <FolderTree className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-sm tracking-wide text-foreground">
                    {catNome}
                  </h3>
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    {appsDoGrupo.length}
                  </Badge>
                </div>
              </div>

              <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {appsDoGrupo.map((app) => (
                  <Card
                    key={app.id}
                    className="p-3.5 hover:border-primary/50 transition-colors flex flex-col justify-between space-y-3 bg-card/60"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-primary inline-block" />
                            {app.nome}
                          </h4>
                          <Badge variant="outline" className="text-[10px] mt-1 font-normal">
                            {app.categoria || "Player IPTV"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => abrirEditar(app)}
                            title="Editar aplicativo e site"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-red-400 hover:text-red-500"
                            onClick={() => excluir(app)}
                            title="Excluir"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Site URL */}
                      <div className="mt-2.5 pt-2 border-t border-border/40">
                        {app.site_url ? (
                          <div className="flex items-center justify-between gap-2">
                            <a
                              href={ensureAbsoluteUrl(app.site_url)!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium truncate max-w-[230px]"
                              title={`Abrir site: ${app.site_url}`}
                            >
                              <Globe className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{app.site_url.replace(/^https?:\/\//i, "").replace(/\/$/, "")}</span>
                            </a>
                            <a
                              href={ensureAbsoluteUrl(app.site_url)!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground shrink-0 border rounded px-1.5 py-0.5 bg-muted/40 hover:bg-muted"
                            >
                              <span>Acessar</span>
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between text-xs text-amber-400/80">
                            <span className="flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" /> Sem site cadastrado
                            </span>
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto p-0 text-xs text-primary underline"
                              onClick={() => abrirEditar(app)}
                            >
                              Adicionar link
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Observação / Tutorial */}
                      {app.observacao && (
                        <p className="text-[11px] text-muted-foreground mt-2 line-clamp-2 italic">
                          {app.observacao}
                        </p>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ));
        })()}
      </div>

      {/* Modal de Cadastro / Edição de Aplicativo & Site */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingApp ? "Editar Aplicativo & Site" : "Novo Aplicativo & Site Oficial"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm">
            <div className="space-y-1.5">
              <Label>Nome do Aplicativo</Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: IBO PLAYER, IPTV SMARTERS..."
                className="text-xs uppercase"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Categoria do Dispositivo / Plataforma</Label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS_APLICATIVOS.filter((c) => c !== "Todos").map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-primary" /> Link do Site Oficial (URL)
                </Label>
                {siteUrl.trim() && (
                  <a
                    href={ensureAbsoluteUrl(siteUrl)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 font-medium"
                  >
                    Testar link <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={siteUrl}
                  onChange={(e) => setSiteUrl(e.target.value)}
                  placeholder="https://iboplayer.com"
                  className="pl-9 text-xs"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Quando o cliente tiver este aplicativo na tabela, o app ficará clicável e abrirá este endereço.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Instruções / Observação / Ativação</Label>
              <Textarea
                rows={2}
                value={observacao}
                onChange={(e) => setObs(e.target.value)}
                placeholder="Ex: Portal de ativação no browser, compatível com Smart TV..."
                className="text-xs"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={salvar} disabled={saving} className="bg-primary">
              {saving ? "Salvando..." : editingApp ? "Salvar alterações" : "Cadastrar aplicativo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
