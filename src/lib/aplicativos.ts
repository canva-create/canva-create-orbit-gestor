import { supabase } from "@/integrations/supabase/client";

export interface AplicativoCatalogo {
  id: string;
  user_id?: string;
  nome: string;
  custo: number;
  valor_venda: number;
  categoria?: string | null;
  observacao?: string | null;
  ativo: boolean;
  site_url?: string | null;
  fracao_creditos?: number | null;
  created_at?: string;
  updated_at?: string;
}

export const APLICATIVOS_PADRAO: Omit<AplicativoCatalogo, "id">[] = [
  { nome: "IBO PLAYER", custo: 11.0, valor_venda: 25.0, categoria: "Player IPTV", ativo: true, site_url: "https://iboplayer.com", fracao_creditos: 1.0, observacao: "Um dos players mais populares para Smart TV" },
  { nome: "BOB PLAYER", custo: 11.0, valor_venda: 25.0, categoria: "Player IPTV", ativo: true, site_url: "https://bobplayer.com", fracao_creditos: 1.0, observacao: "Excelente compatibilidade com Samsung e LG" },
  { nome: "NINJA PLAYER", custo: 11.0, valor_venda: 25.0, categoria: "Player IPTV", ativo: true, site_url: "https://ninjaplayer.tv", fracao_creditos: 1.0, observacao: "Interface rápida e fluida" },
  { nome: "CLOUDDY", custo: 12.0, valor_venda: 25.0, categoria: "Player IPTV", ativo: true, site_url: "https://cloudy.pro", fracao_creditos: 1.0, observacao: "Cloud Player com sincronização online" },
  { nome: "SMART ONE", custo: 13.0, valor_venda: 25.0, categoria: "Smart TV", ativo: true, site_url: "https://smartone-iptv.com", fracao_creditos: 1.0, observacao: "Player consagrado para Smart TVs" },
  { nome: "DUPLEX PLAY", custo: 11.0, valor_venda: 25.0, categoria: "Player IPTV", ativo: true, site_url: "https://duplexplay.com", fracao_creditos: 1.0, observacao: "Suporte amplo e estável" },
  { nome: "VU PLAYER PRO", custo: 11.0, valor_venda: 25.0, categoria: "Player IPTV", ativo: true, site_url: "https://vuplayer.pro", fracao_creditos: 1.0, observacao: "Leve e com suporte a codecs modernos" },
  { nome: "XCIPTV", custo: 10.0, valor_venda: 25.0, categoria: "Android TV", ativo: true, site_url: "https://xciptv.net", fracao_creditos: 1.0, observacao: "Player clássico para TV Box e Android" },
  { nome: "TIVIMATE", custo: 15.0, valor_venda: 30.0, categoria: "Android TV", ativo: true, site_url: "https://tivimate.com", fracao_creditos: 1.0, observacao: "Player premium para TV Box" },
  { nome: "BAY TV", custo: 11.0, valor_venda: 25.0, categoria: "Smart TV", ativo: true, site_url: "https://baytvapp.com", fracao_creditos: 1.0, observacao: "Aplicativo leve para TV LG e Samsung" },
  { nome: "FLIX IPTV", custo: 12.0, valor_venda: 25.0, categoria: "Smart TV", ativo: true, site_url: "https://flixiptv.cc", fracao_creditos: 1.0, observacao: "Interface moderna e rápida" },
  { nome: "SET IPTV", custo: 11.0, valor_venda: 25.0, categoria: "Smart TV", ativo: true, site_url: "https://setsiptv.com", fracao_creditos: 1.0, observacao: "Ativação anual tradicional" },
];

const STORAGE_KEY = "orbit:aplicativos_catalogo_cache";

function getLocalCache(): AplicativoCatalogo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setLocalCache(items: AplicativoCatalogo[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

/**
 * Busca os aplicativos cadastrados no Supabase com resiliência a fallback local
 */
export async function fetchAplicativosCatalogo(): Promise<AplicativoCatalogo[]> {
  try {
    const { data, error } = await supabase
      .from("aplicativos_catalogo" as any)
      .select("*")
      .order("nome", { ascending: true });

    if (error) {
      // Se a tabela ainda não foi criada no Supabase Cloud, usa fallback local
      console.warn("Aviso ao buscar aplicativos_catalogo no Supabase (usando fallback local):", error.message);
      const cached = getLocalCache();
      if (cached.length > 0) return cached;

      // Se nem cache local existe, inicializa com o seed padrão
      const seeded: AplicativoCatalogo[] = APLICATIVOS_PADRAO.map((a, idx) => ({
        ...a,
        id: `seed-${idx + 1}`,
      }));
      setLocalCache(seeded);
      return seeded;
    }

    const items = (data as unknown as AplicativoCatalogo[]) ?? [];

    // Se o banco estiver vazio pela primeira vez, inicializa com os padrões
    if (items.length === 0) {
      const user = (await supabase.auth.getUser()).data.user;
      if (user) {
        try {
          const toInsert = APLICATIVOS_PADRAO.map((a) => ({
            ...a,
            user_id: user.id,
          }));
          const { data: inserted } = await supabase
            .from("aplicativos_catalogo" as any)
            .insert(toInsert as any)
            .select();
          if (inserted && inserted.length > 0) {
            const list = inserted as unknown as AplicativoCatalogo[];
            setLocalCache(list);
            return list;
          }
        } catch (seedErr) {
          console.warn("Erro ao fazer seed inicial no Supabase:", seedErr);
        }
      }

      const seeded: AplicativoCatalogo[] = APLICATIVOS_PADRAO.map((a, idx) => ({
        ...a,
        id: `seed-${idx + 1}`,
      }));
      setLocalCache(seeded);
      return seeded;
    }

    setLocalCache(items);
    return items;
  } catch (err) {
    console.warn("Falha geral ao buscar aplicativos_catalogo, usando fallback:", err);
    const cached = getLocalCache();
    if (cached.length > 0) return cached;
    return APLICATIVOS_PADRAO.map((a, idx) => ({
      ...a,
      id: `seed-${idx + 1}`,
    }));
  }
}

/**
 * Salva ou atualiza um aplicativo
 */
export async function upsertAplicativoCatalogo(app: Partial<AplicativoCatalogo>): Promise<AplicativoCatalogo> {
  const user = (await supabase.auth.getUser()).data.user;
  const siteUrl = app.site_url ? ensureAbsoluteUrl(app.site_url) : null;
  const fracao = app.fracao_creditos !== undefined && app.fracao_creditos !== null ? Number(app.fracao_creditos) : 1.0;

  const fullPayload = {
    nome: app.nome?.trim().toUpperCase(),
    custo: Number(app.custo) || 0,
    valor_venda: Number(app.valor_venda) || 0,
    categoria: app.categoria?.trim() || "IPTV Player",
    observacao: app.observacao?.trim() || null,
    ativo: app.ativo ?? true,
    site_url: siteUrl,
    fracao_creditos: fracao,
    user_id: user?.id,
    updated_at: new Date().toISOString(),
  };

  const basePayload = {
    nome: fullPayload.nome,
    custo: fullPayload.custo,
    valor_venda: fullPayload.valor_venda,
    categoria: fullPayload.categoria,
    observacao: fullPayload.observacao,
    ativo: fullPayload.ativo,
    user_id: fullPayload.user_id,
    updated_at: fullPayload.updated_at,
  };

  try {
    if (app.id && !app.id.startsWith("seed-")) {
      // Tenta salvar com as novas colunas
      let res = await supabase
        .from("aplicativos_catalogo" as any)
        .update(fullPayload as any)
        .eq("id", app.id)
        .select()
        .single();

      // Se der erro por coluna não existente no Supabase remoto, tenta sem as colunas novas
      if (res.error && (res.error.message?.includes("column") || res.error.message?.includes("does not exist"))) {
        res = await supabase
          .from("aplicativos_catalogo" as any)
          .update(basePayload as any)
          .eq("id", app.id)
          .select()
          .single();
      }

      if (res.error) throw res.error;
      const returned = { ...(res.data as unknown as AplicativoCatalogo), site_url: siteUrl, fracao_creditos: fracao };
      const cached = getLocalCache();
      const idx = cached.findIndex((i) => i.id === app.id);
      if (idx >= 0) cached[idx] = { ...cached[idx], ...returned };
      setLocalCache(cached);
      return returned;
    } else {
      let res = await supabase
        .from("aplicativos_catalogo" as any)
        .insert({ ...fullPayload, created_at: new Date().toISOString() } as any)
        .select()
        .single();

      if (res.error && (res.error.message?.includes("column") || res.error.message?.includes("does not exist"))) {
        res = await supabase
          .from("aplicativos_catalogo" as any)
          .insert({ ...basePayload, created_at: new Date().toISOString() } as any)
          .select()
          .single();
      }

      if (res.error) throw res.error;
      const returned = { ...(res.data as unknown as AplicativoCatalogo), site_url: siteUrl, fracao_creditos: fracao };
      const cached = getLocalCache();
      cached.push(returned);
      setLocalCache(cached);
      return returned;
    }
  } catch (err) {
    console.warn("Erro ao salvar no Supabase, salvando no cache local:", err);
    const cached = getLocalCache();
    const id = app.id || `local-${Date.now()}`;
    const newItem: AplicativoCatalogo = {
      id,
      user_id: user?.id,
      nome: fullPayload.nome || "NOVO APLICATIVO",
      custo: fullPayload.custo,
      valor_venda: fullPayload.valor_venda,
      categoria: fullPayload.categoria,
      observacao: fullPayload.observacao,
      ativo: fullPayload.ativo,
      site_url: siteUrl,
      fracao_creditos: fracao,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const existsIndex = cached.findIndex((i) => i.id === id || i.nome.toUpperCase() === newItem.nome);
    if (existsIndex >= 0) {
      cached[existsIndex] = { ...cached[existsIndex], ...newItem };
    } else {
      cached.push(newItem);
    }
    setLocalCache(cached);
    return newItem;
  }
}

/**
 * Garante que a URL seja absoluta, prefixando com https:// se necessário
 */
export function ensureAbsoluteUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Localiza a URL do site oficial do aplicativo buscando pelo nome
 * Suporta busca tanto na lista de aplicativos_sites quanto no catálogo de preços
 */
export function findAppSiteUrl(
  appName: string | null | undefined,
  apps: Array<{ nome: string; site_url?: string | null }> = [],
): string | null {
  if (!appName || !apps || apps.length === 0) return null;
  const norm = appName.trim().toUpperCase();
  if (!norm) return null;

  // 1. Busca exata por nome
  const exact = apps.find((a) => a.nome && a.nome.trim().toUpperCase() === norm);
  if (exact?.site_url) return ensureAbsoluteUrl(exact.site_url);

  // 2. Busca por inclusão (ex: cliente tem "IBO PLAYER PRO" e catálogo tem "IBO PLAYER")
  const partial = apps.find(
    (a) =>
      a.site_url &&
      a.nome &&
      (norm.includes(a.nome.trim().toUpperCase()) || a.nome.trim().toUpperCase().includes(norm)),
  );
  if (partial?.site_url) return ensureAbsoluteUrl(partial.site_url);

  return null;
}

/**
 * Remove um aplicativo do catálogo de preços
 */
export async function deleteAplicativoCatalogo(id: string): Promise<void> {
  try {
    if (!id.startsWith("seed-") && !id.startsWith("local-")) {
      const { error } = await supabase
        .from("aplicativos_catalogo" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    }
  } catch (err) {
    console.warn("Erro ao excluir do Supabase, removendo do cache local:", err);
  } finally {
    const cached = getLocalCache().filter((i) => i.id !== id);
    setLocalCache(cached);
  }
}

/* ==========================================================================
   SUBCATEGORIA: APLICATIVOS & SITES OFICIAIS (INDEPENDENTE DE CUSTO)
   ========================================================================== */

export interface AplicativoSite {
  id: string;
  user_id?: string;
  nome: string;
  categoria?: string | null;
  site_url?: string | null;
  observacao?: string | null;
  created_at?: string;
  updated_at?: string;
}

export const CATEGORIAS_APLICATIVOS = [
  "Todos",
  "Player IPTV",
  "Smart TV (Samsung/LG)",
  "Android TV / Fire Stick",
  "Roku TV",
  "Apple TV / iOS",
  "Windows / PC",
  "Outros",
] as const;

export const APLICATIVOS_SITES_PADRAO: Omit<AplicativoSite, "id">[] = [
  { nome: "IBO PLAYER", categoria: "Smart TV (Samsung/LG)", site_url: "https://iboplayer.com", observacao: "Portal oficial de ativação. Compatível com Samsung Tizen e LG webOS." },
  { nome: "BOB PLAYER", categoria: "Smart TV (Samsung/LG)", site_url: "https://bobplayer.com", observacao: "Excelente para TVs Samsung e LG recentes." },
  { nome: "NINJA PLAYER", categoria: "Smart TV (Samsung/LG)", site_url: "https://ninjaplayer.tv", observacao: "Interface rápida e fluida com suporte a múltiplos codecs." },
  { nome: "CLOUDDY", categoria: "Player IPTV", site_url: "https://cloudy.pro", observacao: "Player em nuvem com painel de gerenciamento online de listas." },
  { nome: "SMART ONE", categoria: "Smart TV (Samsung/LG)", site_url: "https://smartone-iptv.com", observacao: "Player consagrado para Smart TVs." },
  { nome: "DUPLEX PLAY", categoria: "Player IPTV", site_url: "https://duplexplay.com", observacao: "Suporte tradicional e interface amigável." },
  { nome: "VU PLAYER PRO", categoria: "Smart TV (Samsung/LG)", site_url: "https://vuplayer.pro", observacao: "Player moderno para TVs e TV Box." },
  { nome: "XCIPTV", categoria: "Android TV / Fire Stick", site_url: "https://xciptv.net", observacao: "Player clássico para TV Box, Mi Stick e Fire Stick." },
  { nome: "TIVIMATE", categoria: "Android TV / Fire Stick", site_url: "https://tivimate.com", observacao: "Melhor experiência e recursos avançados para Android TV." },
  { nome: "BAY TV", categoria: "Smart TV (Samsung/LG)", site_url: "https://baytvapp.com", observacao: "Leve e direto para TVs LG e Samsung." },
  { nome: "FLIX IPTV", categoria: "Smart TV (Samsung/LG)", site_url: "https://flixiptv.cc", observacao: "Interface veloz e intuitiva." },
  { nome: "SET IPTV", categoria: "Smart TV (Samsung/LG)", site_url: "https://setsiptv.com", observacao: "Ativação anual tradicional." },
  { nome: "IPTV SMARTERS PRO", categoria: "Android TV / Fire Stick", site_url: "https://www.iptvsmarters.com", observacao: "Player grátis multiplataforma para celulares e TV Box." },
  { nome: "SS IPTV", categoria: "Smart TV (Samsung/LG)", site_url: "https://ss-iptv.com", observacao: "Player gratuito com upload de lista m3u pelo site." },
  { nome: "SMART STB", categoria: "Smart TV (Samsung/LG)", site_url: "https://smart-stb.net", observacao: "Emulador de portal MAG / STB direto na Smart TV." },
  { nome: "GSE SMART IPTV", categoria: "Apple TV / iOS", site_url: "https://gsesmartiptv.com", observacao: "Excelente opção para iPhone, iPad e Apple TV." },
  { nome: "IBO PLAYER PRO", categoria: "Smart TV (Samsung/LG)", site_url: "https://iboplayer.com", observacao: "Versão Pro com mais opções de personalização." },
  { nome: "HOT IPTV", categoria: "Smart TV (Samsung/LG)", site_url: "https://hotiptv.org", observacao: "Player moderno para Smart TVs." },
  { nome: "ELK PLAYER", categoria: "Smart TV (Samsung/LG)", site_url: "https://elkplayer.com", observacao: "Player com interface limpa." },
  { nome: "QUICK PLAYER", categoria: "Player IPTV", site_url: "https://quickplayer.net", observacao: "Carregamento rápido de canais." },
];

const SITES_STORAGE_KEY = "orbit:aplicativos_sites_cache";

function getLocalSitesCache(): AplicativoSite[] {
  try {
    const raw = localStorage.getItem(SITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setLocalSitesCache(items: AplicativoSite[]) {
  try {
    localStorage.setItem(SITES_STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

/**
 * Busca todos os aplicativos e sites oficiais
 */
export async function fetchAplicativosSites(): Promise<AplicativoSite[]> {
  try {
    const { data, error } = await supabase
      .from("aplicativos_sites" as any)
      .select("*")
      .order("categoria", { ascending: true })
      .order("nome", { ascending: true });

    if (error) {
      console.warn("Aviso ao buscar aplicativos_sites no Supabase (usando fallback local):", error.message);
      const cached = getLocalSitesCache();
      if (cached.length > 0) return cached;

      const seeded: AplicativoSite[] = APLICATIVOS_SITES_PADRAO.map((a, idx) => ({
        ...a,
        id: `seed-site-${idx + 1}`,
      }));
      setLocalSitesCache(seeded);
      return seeded;
    }

    const items = (data as unknown as AplicativoSite[]) ?? [];

    if (items.length === 0) {
      const cached = getLocalSitesCache();
      if (cached.length > 0) return cached;

      const seeded: AplicativoSite[] = APLICATIVOS_SITES_PADRAO.map((a, idx) => ({
        ...a,
        id: `seed-site-${idx + 1}`,
      }));
      setLocalSitesCache(seeded);
      return seeded;
    }

    setLocalSitesCache(items);
    return items;
  } catch (err) {
    console.warn("Erro ao buscar aplicativos_sites:", err);
    return getLocalSitesCache();
  }
}

/**
 * Cria ou atualiza um aplicativo na subcategoria de Aplicativos & Sites
 */
export async function upsertAplicativoSite(app: Partial<AplicativoSite>): Promise<AplicativoSite> {
  const user = (await supabase.auth.getUser()).data.user;
  const siteUrl = ensureAbsoluteUrl(app.site_url);

  const payload: any = {
    nome: (app.nome || "").trim().toUpperCase(),
    categoria: (app.categoria || "Player IPTV").trim(),
    site_url: siteUrl,
    observacao: app.observacao?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  try {
    if (app.id && !app.id.startsWith("seed-") && !app.id.startsWith("local-") && !app.id.startsWith("disc-")) {
      const { data, error } = await supabase
        .from("aplicativos_sites" as any)
        .update(payload)
        .eq("id", app.id)
        .select()
        .single();
      if (error) throw error;
      const returned = data as unknown as AplicativoSite;
      const cached = getLocalSitesCache();
      const idx = cached.findIndex((i) => i.id === app.id);
      if (idx >= 0) cached[idx] = returned;
      else cached.push(returned);
      setLocalSitesCache(cached);
      return returned;
    } else {
      const { data, error } = await supabase
        .from("aplicativos_sites" as any)
        .insert({ ...payload, created_at: new Date().toISOString() })
        .select()
        .single();
      if (error) throw error;
      const returned = data as unknown as AplicativoSite;
      const cached = getLocalSitesCache();
      cached.push(returned);
      setLocalSitesCache(cached);
      return returned;
    }
  } catch (err) {
    console.warn("Salvando aplicativo_site no cache local:", err);
    const cached = getLocalSitesCache();
    const id = app.id && !app.id.startsWith("disc-") ? app.id : `local-site-${Date.now()}`;
    const newItem: AplicativoSite = {
      id,
      user_id: user?.id,
      nome: payload.nome,
      categoria: payload.categoria,
      site_url: payload.site_url,
      observacao: payload.observacao,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const existsIdx = cached.findIndex((i) => i.id === id || i.nome.toUpperCase() === newItem.nome);
    if (existsIdx >= 0) cached[existsIdx] = newItem;
    else cached.push(newItem);
    setLocalSitesCache(cached);
    return newItem;
  }
}

/**
 * Remove um aplicativo da subcategoria de Aplicativos & Sites
 */
export async function deleteAplicativoSite(id: string): Promise<void> {
  try {
    if (!id.startsWith("seed-") && !id.startsWith("local-") && !id.startsWith("disc-")) {
      const { error } = await supabase
        .from("aplicativos_sites" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    }
  } catch (err) {
    console.warn("Erro ao excluir aplicativo_site do Supabase:", err);
  } finally {
    const cached = getLocalSitesCache().filter((i) => i.id !== id);
    setLocalSitesCache(cached);
  }
}

/**
 * Descobre automaticamente todos os nomes de aplicativos disponíveis já cadastrados no sistema
 * (clientes, catálogo de preços, ativações e lista padrão)
 */
export function descobrirTodosAplicativos(
  clientes: any[] = [],
  catalogo: any[] = [],
  ativacoes: any[] = [],
): string[] {
  const set = new Set<string>();

  // 1. Apps padrão
  APLICATIVOS_SITES_PADRAO.forEach((a) => {
    if (a.nome) set.add(a.nome.trim().toUpperCase());
  });

  // 2. Apps do catálogo de preços
  catalogo.forEach((c) => {
    if (c.nome) set.add(String(c.nome).trim().toUpperCase());
  });

  // 3. Apps dos clientes
  clientes.forEach((c) => {
    if (c.aplicativo && String(c.aplicativo).trim().length > 1) {
      set.add(String(c.aplicativo).trim().toUpperCase());
    }
  });

  // 4. Apps das ativações
  ativacoes.forEach((a) => {
    if (a.aplicativo && String(a.aplicativo).trim().length > 1) {
      set.add(String(a.aplicativo).trim().toUpperCase());
    }
  });

  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

