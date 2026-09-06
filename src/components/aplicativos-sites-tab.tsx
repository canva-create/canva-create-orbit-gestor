import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AplicativoSite,
  fetchAplicativosSites,
  upsertAplicativoSite,
  deleteAplicativoSite,
  CATEGORIAS_APLICATIVOS,
  descobrirTodosAplicativos,
  ensureAbsoluteUrl,
  getCategoriasApp,
  formatCategoriasApp,
  getCategoriasDisponiveis,
  getStoredCategorias,
  setStoredCategorias,
  renomearCategoriaSites,
  excluirCategoriaSites,
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
  Tags,
  Check,
  X,
  FolderEdit,
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
  const [categorias, setCategorias] = useState<string[]>(["Player IPTV"]);
  const [siteUrl, setSiteUrl] = useState("");
  const [observacao, setObs] = useState("");
  const [saving, setSaving] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

  // Inline nova categoria dentro do modal
  const [showNovaCatInline, setShowNovaCatInline] = useState(false);
  const [novaCatInlineNome, setNovaCatInlineNome] = useState("");

  // Gerenciamento de categorias
  const [gerenciarCatsOpen, setGerenciarCatsOpen] = useState(false);
  const [categoriaParaEditar, setCategoriaParaEditar] = useState<string | null>(null);

  // Descobre todos os nomes de aplicativos usados em clientes, ativações e catálogo
  const todosAppsDoSistema = useMemo(() => {
    return descobrirTodosAplicativos(clientes as any[], catalogoPrecos as any[], ativacoes as any[]);
  }, [clientes, catalogoPrecos, ativacoes]);

  // Identifica aplicativos presentes no sistema mas que ainda não estão salvos na tabela de sites
  const appsNaoCadastrados = useMemo(() => {
    const existentes = new Set(sites.map((s) => s.nome.trim().toUpperCase()));
    return todosAppsDoSistema.filter((nome) => !existentes.has(nome.trim().toUpperCase()));
  }, [sites, todosAppsDoSistema]);

  // Lista dinâmica e unificada de todas as categorias cadastradas
  const categoriasDisponiveis = useMemo(() => {
    return getCategoriasDisponiveis(sites);
  }, [sites]);

  // Lista filtrada por busca e categoria
  const lista = useMemo(() => {
    let res = sites;
    if (categoriaFiltro !== "Todos") {
      res = res.filter((a) => getCategoriasApp(a.categoria).includes(categoriaFiltro));
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

  // Estatísticas
  const totalCadastrados = sites.length;
  const comSite = sites.filter((s) => s.site_url && s.site_url.trim().length > 0).length;
  const semSite = totalCadastrados - comSite;

  const abrirNovo = (nomeInicial = "", categoriaInicial?: string) => {
    setEditingApp(null);
    setNome(nomeInicial);
    setCategorias(categoriaInicial ? [categoriaInicial] : ["Player IPTV"]);
    setSiteUrl("");
    setObs("");
    setShowNovaCatInline(false);
    setNovaCatInlineNome("");
    setModalOpen(true);
  };

  const abrirEditar = (app: AplicativoSite) => {
    setEditingApp(app);
    setNome(app.nome);
    setCategorias(getCategoriasApp(app.categoria));
    setSiteUrl(app.site_url || "");
    setObs(app.observacao || "");
    setShowNovaCatInline(false);
    setNovaCatInlineNome("");
    setModalOpen(true);
  };

  const alternarCategoria = (cat: string) => {
    if (categorias.includes(cat)) {
      if (categorias.length === 1) {
        toast.info("O aplicativo deve ter ao menos 1 categoria.");
        return;
      }
      setCategorias(categorias.filter((c) => c !== cat));
    } else {
      setCategorias([...categorias, cat]);
    }
  };

  const removerCategoria = (cat: string) => {
    if (categorias.length === 1) {
      toast.info("O aplicativo deve ter ao menos 1 categoria.");
      return;
    }
    setCategorias(categorias.filter((c) => c !== cat));
  };

  const handleAdicionarNovaCatInline = () => {
    const trimmed = novaCatInlineNome.trim();
    if (!trimmed) return toast.error("Informe o nome da categoria");
    const current = getStoredCategorias();
    if (!current.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      setStoredCategorias([...current, trimmed]);
    }
    if (!categorias.includes(trimmed)) {
      setCategorias([...categorias, trimmed]);
    }
    setNovaCatInlineNome("");
    setShowNovaCatInline(false);
    toast.success(`Categoria "${trimmed}" adicionada e vinculada ao aplicativo!`);
    qc.invalidateQueries({ queryKey: ["aplicativos_sites"] });
  };

  const salvar = async () => {
    if (!nome.trim()) return toast.error("Informe o nome do aplicativo");
    if (categorias.length === 0) return toast.error("Selecione ao menos 1 categoria");
    setSaving(true);
    try {
      const formatted = formatCategoriasApp(categorias);
      await upsertAplicativoSite({
        id: editingApp?.id,
        nome: nome.trim().toUpperCase(),
        categoria: formatted,
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

  const abrirEdicaoRapidaCategoria = (catNome: string) => {
    setCategoriaParaEditar(catNome);
    setGerenciarCatsOpen(true);
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
            Cadastre os links oficiais dos aplicativos com suporte a múltiplas categorias, links diretos e gerenciamento de categorias.
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCategoriaParaEditar(null);
              setGerenciarCatsOpen(true);
            }}
            className="gap-1.5 text-xs border-border/80 hover:bg-muted"
            title="Adicionar, editar e renomear categorias de aplicativos"
          >
            <Tags className="h-3.5 w-3.5 text-primary" />
            Gerenciar Categorias
          </Button>
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
              placeholder="Pesquisar aplicativo, categoria, site oficial ou observação..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Filtrar Categoria:</span>
            <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
              <SelectTrigger className="w-[200px] h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Todos">Todas as Categorias</SelectItem>
                {categoriasDisponiveis.map((cat) => (
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
          {categoriasDisponiveis.map((cat) => {
            const qtd = sites.filter((s) => getCategoriasApp(s.categoria).includes(cat)).length;
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

      {/* Grid de Cards agrupados por Categoria (um aplicativo com múltiplas categorias constará em cada uma) */}
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

        {/* Agrupamento por Categoria com suporte a múltiplas categorias por app */}
        {(() => {
          const grupos = new Map<string, AplicativoSite[]>();
          lista.forEach((item) => {
            const itemCats = getCategoriasApp(item.categoria);
            itemCats.forEach((cat) => {
              if (categoriaFiltro !== "Todos" && cat !== categoriaFiltro) return;
              if (!grupos.has(cat)) grupos.set(cat, []);
              grupos.get(cat)!.push(item);
            });
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => abrirEdicaoRapidaCategoria(catNome)}
                  className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1"
                  title={`Editar ou renomear a categoria "${catNome}"`}
                >
                  <Pencil className="h-3 w-3" /> Editar categoria
                </Button>
              </div>

              <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {appsDoGrupo.map((app) => {
                  const appCats = getCategoriasApp(app.categoria);
                  return (
                    <Card
                      key={`${catNome}-${app.id}`}
                      className="p-3.5 hover:border-primary/50 transition-colors flex flex-col justify-between space-y-3 bg-card/60"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <h4 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-primary inline-block" />
                              {app.nome}
                            </h4>
                            {/* Badges de todas as categorias do aplicativo */}
                            <div className="flex flex-wrap gap-1">
                              {appCats.map((c) => (
                                <Badge
                                  key={c}
                                  variant={c === catNome ? "default" : "outline"}
                                  className={cn(
                                    "text-[10px] font-normal px-1.5 py-0",
                                    c === catNome && "bg-primary/20 text-primary border-primary/30"
                                  )}
                                >
                                  {c}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => abrirEditar(app)}
                              title="Editar aplicativo, categorias e site"
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
                  );
                })}
              </div>
            </div>
          ));
        })()}
      </div>

      {/* Modal de Cadastro / Edição de Aplicativo & Site */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tv className="h-5 w-5 text-primary" />
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
                className="text-xs uppercase font-bold tracking-wide"
              />
            </div>

            {/* Seletor de Múltiplas Categorias, Adicionar Nova e Editar Categorias */}
            <div className="space-y-2 rounded-lg border border-border/70 p-3 bg-muted/20">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Tags className="h-3.5 w-3.5 text-primary" />
                  Categorias do Aplicativo (pode constar em mais de uma)
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCategoriaParaEditar(null);
                    setGerenciarCatsOpen(true);
                  }}
                  className="h-6 text-[11px] px-1.5 text-primary hover:bg-primary/10 gap-1"
                  title="Gerenciar e editar lista de categorias"
                >
                  <FolderEdit className="h-3 w-3" /> Editar Categorias
                </Button>
              </div>

              {/* Categorias Selecionadas Atualmente */}
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Categorias selecionadas ({categorias.length}):</span>
                <div className="flex flex-wrap gap-1.5 min-h-[34px] p-2 bg-background rounded-md border">
                  {categorias.map((cat) => (
                    <Badge
                      key={cat}
                      variant="secondary"
                      className="gap-1.5 text-xs py-1 px-2.5 bg-primary/15 text-primary border border-primary/30"
                    >
                      <span className="font-medium">{cat}</span>
                      <button
                        type="button"
                        onClick={() => removerCategoria(cat)}
                        className="hover:text-destructive text-primary/80 transition-colors"
                        title={`Remover categoria ${cat}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  {categorias.length === 0 && (
                    <span className="text-xs text-muted-foreground italic flex items-center">
                      Nenhuma categoria selecionada. Clique nas opções abaixo.
                    </span>
                  )}
                </div>
              </div>

              {/* Chips das Categorias Disponíveis para Alternar */}
              <div className="space-y-1 pt-1">
                <span className="text-[11px] text-muted-foreground">Opções disponíveis (clique para marcar/desmarcar):</span>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1.5 border rounded-md bg-background">
                  {categoriasDisponiveis.map((cat) => {
                    const isSelected = categorias.includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => alternarCategoria(cat)}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all border",
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "bg-muted/40 text-muted-foreground border-border/60 hover:bg-muted hover:text-foreground"
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3 shrink-0" />}
                        <span>{cat}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Botão e Campo Inline para Adicionar Nova Categoria */}
              <div className="pt-1 border-t border-border/50">
                {showNovaCatInline ? (
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-medium text-foreground">Nova Categoria:</span>
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={novaCatInlineNome}
                        onChange={(e) => setNovaCatInlineNome(e.target.value)}
                        placeholder="Ex: Streaming Box, Vida Inteligente..."
                        className="h-8 text-xs flex-1"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAdicionarNovaCatInline();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleAdicionarNovaCatInline}
                        className="h-8 text-xs bg-primary px-3"
                      >
                        Adicionar
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowNovaCatInline(false);
                          setNovaCatInlineNome("");
                        }}
                        className="h-8 text-xs px-2"
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowNovaCatInline(true)}
                    className="h-7 text-xs gap-1.5 border-dashed text-primary border-primary/40 hover:bg-primary/10"
                  >
                    <Plus className="h-3 w-3" /> Adicionar nova categoria
                  </Button>
                )}
              </div>
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

      {/* Diálogo de Gerenciamento e Edição de Categorias */}
      <GerenciarCategoriasDialog
        open={gerenciarCatsOpen}
        onOpenChange={setGerenciarCatsOpen}
        apps={sites}
        categoriasDisponiveis={categoriasDisponiveis}
        categoriaInicialParaEditar={categoriaParaEditar}
        onSalvarCategoriaCriada={(novaCat) => {
          if (!categorias.includes(novaCat)) {
            setCategorias([...categorias, novaCat]);
          }
        }}
      />
    </div>
  );
}

interface GerenciarCategoriasDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apps: AplicativoSite[];
  categoriasDisponiveis: string[];
  categoriaInicialParaEditar?: string | null;
  onSalvarCategoriaCriada?: (novaCat: string) => void;
}

function GerenciarCategoriasDialog({
  open,
  onOpenChange,
  apps,
  categoriasDisponiveis,
  categoriaInicialParaEditar,
  onSalvarCategoriaCriada,
}: GerenciarCategoriasDialogProps) {
  const qc = useQueryClient();
  const [novaCategoriaInput, setNovaCategoriaInput] = useState("");
  const [editingCatNome, setEditingCatNome] = useState<string | null>(categoriaInicialParaEditar || null);
  const [editandoValor, setEditandoValor] = useState("");
  const [processando, setProcessando] = useState(false);

  useEffect(() => {
    if (categoriaInicialParaEditar) {
      setEditingCatNome(categoriaInicialParaEditar);
      setEditandoValor(categoriaInicialParaEditar);
    } else {
      setEditingCatNome(null);
      setEditandoValor("");
    }
  }, [categoriaInicialParaEditar, open]);

  const handleAdicionar = () => {
    const trimmed = novaCategoriaInput.trim();
    if (!trimmed) return toast.error("Informe o nome da categoria");
    const current = getStoredCategorias();
    if (current.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      return toast.error("Esta categoria já existe");
    }
    const updated = [...current, trimmed];
    setStoredCategorias(updated);
    setNovaCategoriaInput("");
    toast.success(`Categoria "${trimmed}" adicionada com sucesso!`);
    qc.invalidateQueries({ queryKey: ["aplicativos_sites"] });
    if (onSalvarCategoriaCriada) {
      onSalvarCategoriaCriada(trimmed);
    }
  };

  const handleIniciarEdicao = (cat: string) => {
    setEditingCatNome(cat);
    setEditandoValor(cat);
  };

  const handleSalvarEdicao = async (catAntiga: string) => {
    const nova = editandoValor.trim();
    if (!nova) return toast.error("O nome da categoria não pode ser vazio");
    if (nova.toLowerCase() === catAntiga.toLowerCase()) {
      setEditingCatNome(null);
      return;
    }
    setProcessando(true);
    try {
      await renomearCategoriaSites(catAntiga, nova, apps);
      toast.success(`Categoria renomeada para "${nova}" em todos os aplicativos!`);
      setEditingCatNome(null);
      qc.invalidateQueries({ queryKey: ["aplicativos_sites"] });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao renomear categoria");
    } finally {
      setProcessando(false);
    }
  };

  const handleExcluir = async (cat: string) => {
    const qtd = apps.filter((a) => getCategoriasApp(a.categoria).includes(cat)).length;
    const ok = await confirmDialog({
      title: `Excluir categoria "${cat}"?`,
      description:
        qtd > 0
          ? `Esta categoria está associada a ${qtd} aplicativo(s). Ao excluir, ela será removida desses aplicativos. Deseja continuar?`
          : `Tem certeza que deseja remover esta categoria da lista?`,
      confirmText: "Excluir",
      destructive: true,
    });
    if (!ok) return;

    setProcessando(true);
    try {
      await excluirCategoriaSites(cat, apps);
      toast.success(`Categoria "${cat}" excluída com sucesso`);
      qc.invalidateQueries({ queryKey: ["aplicativos_sites"] });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao excluir categoria");
    } finally {
      setProcessando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tags className="h-5 w-5 text-primary" />
            Gerenciar & Editar Categorias
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 flex-1 overflow-y-auto">
          {/* Adicionar Categoria */}
          <div className="space-y-1.5 p-3 rounded-lg border bg-muted/30">
            <Label className="text-xs font-semibold">Adicionar nova categoria</Label>
            <div className="flex gap-2">
              <Input
                value={novaCategoriaInput}
                onChange={(e) => setNovaCategoriaInput(e.target.value)}
                placeholder="Ex: Streaming Box, WebOS..."
                className="h-9 text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAdicionar();
                  }
                }}
              />
              <Button size="sm" onClick={handleAdicionar} className="h-9 text-xs gap-1 bg-primary shrink-0">
                <Plus className="h-3.5 w-3.5" /> Adicionar
              </Button>
            </div>
          </div>

          {/* Lista de Categorias com Opção de Editar / Renomear e Excluir */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-muted-foreground">Categorias Cadastradas</Label>
              <span className="text-[11px] text-muted-foreground">{categoriasDisponiveis.length} categorias</span>
            </div>

            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {categoriasDisponiveis.map((cat) => {
                const qtd = apps.filter((a) => getCategoriasApp(a.categoria).includes(cat)).length;
                const isEditing = editingCatNome === cat;

                return (
                  <div
                    key={cat}
                    className={cn(
                      "flex items-center justify-between p-2 rounded-md border text-xs transition-colors",
                      isEditing ? "border-primary bg-primary/5" : "bg-card hover:bg-muted/40"
                    )}
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-1.5 flex-1 mr-1">
                        <Input
                          value={editandoValor}
                          onChange={(e) => setEditandoValor(e.target.value)}
                          className="h-7 text-xs flex-1 font-medium"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleSalvarEdicao(cat);
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          disabled={processando}
                          onClick={() => handleSalvarEdicao(cat)}
                          className="h-7 px-2 text-xs bg-primary"
                        >
                          <Check className="h-3.5 w-3.5 mr-1" /> Salvar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingCatNome(null)}
                          className="h-7 px-2 text-xs"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{cat}</span>
                          <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0 h-4">
                            {qtd} {qtd === 1 ? "app" : "apps"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => handleIniciarEdicao(cat)}
                            title={`Editar nome da categoria "${cat}"`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-red-400 hover:text-red-500"
                            onClick={() => handleExcluir(cat)}
                            title={`Excluir categoria "${cat}"`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="pt-2 border-t">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
