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

export const APLICATIVOS_PADRAO: Omit<AplicativoCatalogo, "id">[] = [];

const STORAGE_KEY = "orbit:aplicativos_catalogo_cache";

function getLocalCache(): AplicativoCatalogo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item: AplicativoCatalogo) => {
      if (!item || !item.nome) return false;
      if (typeof item.id === "string" && item.id.startsWith("seed-")) return false;
      return true;
    });
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
 * Sincroniza o catálogo de preços para a nuvem (Supabase integracoes)
 */
async function syncCatalogoToCloud(apps: AplicativoCatalogo[]) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    const payload: any = {
      provider: "app_prices_catalog",
      nome: "Catálogo de Preços de Apps",
      credenciais: { apps },
      ativo: true,
      status: "ativo",
      updated_at: new Date().toISOString(),
    };
    if (uid) payload.user_id = uid;

    const { error } = await (supabase as any)
      .from("integracoes")
      .upsert(payload, { onConflict: "user_id,provider" });

    if (error) {
      const { data: existing } = await (supabase as any)
        .from("integracoes")
        .select("id")
        .eq("provider", "app_prices_catalog")
        .maybeSingle();

      if (existing?.id) {
        await (supabase as any)
          .from("integracoes")
          .update(payload)
          .eq("id", existing.id);
      } else {
        await (supabase as any)
          .from("integracoes")
          .insert(payload);
      }
    }
  } catch (err) {
    console.warn("Erro ao sincronizar catálogo de preços na nuvem:", err);
  }
}

/**
 * Busca os aplicativos cadastrados no Supabase integracoes com fallback e auto-sync local
 */
export async function fetchAplicativosCatalogo(): Promise<AplicativoCatalogo[]> {
  try {
    const { data: row, error } = await (supabase as any)
      .from("integracoes")
      .select("id, credenciais, updated_at")
      .eq("provider", "app_prices_catalog")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && row && row.credenciais) {
      const cred = typeof row.credenciais === "string" ? JSON.parse(row.credenciais) : row.credenciais;
      const remoteApps: AplicativoCatalogo[] = Array.isArray(cred?.apps) ? cred.apps : [];

      if (remoteApps.length > 0) {
        setLocalCache(remoteApps);
        return remoteApps;
      }
    }

    const local = getLocalCache();
    if (local.length > 0) {
      syncCatalogoToCloud(local).catch(() => {});
      return local;
    }

    return [];
  } catch (err) {
    console.warn("Falha ao buscar catálogo de aplicativos da nuvem, usando cache local:", err);
    return getLocalCache();
  }
}

/**
 * Salva ou atualiza um aplicativo no catálogo de preços com persistência na nuvem
 */
export async function upsertAplicativoCatalogo(app: Partial<AplicativoCatalogo>): Promise<AplicativoCatalogo> {
  const user = (await supabase.auth.getUser()).data.user;
  const siteUrl = app.site_url ? ensureAbsoluteUrl(app.site_url) : null;
  const fracao = app.fracao_creditos !== undefined && app.fracao_creditos !== null ? Number(app.fracao_creditos) : 1.0;

  const id = app.id && !app.id.startsWith("seed-")
    ? app.id
    : `cat-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  const item: AplicativoCatalogo = {
    id,
    user_id: user?.id,
    nome: (app.nome || "NOVO APLICATIVO").trim().toUpperCase(),
    custo: Number(app.custo) || 0,
    valor_venda: Number(app.valor_venda) || 0,
    categoria: app.categoria?.trim() || "IPTV Player",
    observacao: app.observacao?.trim() || null,
    ativo: app.ativo ?? true,
    site_url: siteUrl,
    fracao_creditos: fracao,
    created_at: app.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const cached = getLocalCache();
  const existsIdx = cached.findIndex((i) => i.id === id || i.nome.toUpperCase() === item.nome);
  if (existsIdx >= 0) {
    cached[existsIdx] = { ...cached[existsIdx], ...item };
  } else {
    cached.push(item);
  }
  setLocalCache(cached);

  await syncCatalogoToCloud(cached);
  return item;
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
  const cached = getLocalCache().filter((i) => i.id !== id);
  setLocalCache(cached);
  await syncCatalogoToCloud(cached);
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

export const CATEGORIAS_APLICATIVOS_PADRAO: string[] = [
  "Player IPTV",
  "Smart TV (Samsung/LG)",
  "Android TV / Fire Stick",
  "Roku TV",
  "Apple TV / iOS",
  "Windows / PC",
  "Outros",
];

export const CATEGORIAS_STORAGE_KEY = "orbit:aplicativos_sites_categorias";

export function getStoredCategorias(): string[] {
  try {
    const raw = localStorage.getItem(CATEGORIAS_STORAGE_KEY);
    if (!raw) return [...CATEGORIAS_APLICATIVOS_PADRAO];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return [...CATEGORIAS_APLICATIVOS_PADRAO];
  } catch {
    return [...CATEGORIAS_APLICATIVOS_PADRAO];
  }
}

export function setStoredCategorias(cats: string[]): void {
  try {
    const unique = Array.from(new Set(cats.map((c) => c.trim()).filter(Boolean)));
    localStorage.setItem(CATEGORIAS_STORAGE_KEY, JSON.stringify(unique));
  } catch {}
}

export function getCategoriasApp(categoria?: string | null): string[] {
  if (!categoria) return ["Player IPTV"];
  if (categoria.startsWith("[") && categoria.endsWith("]")) {
    try {
      const parsed = JSON.parse(categoria);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((c) => String(c).trim()).filter(Boolean);
      }
    } catch {}
  }
  const parts = categoria
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : ["Player IPTV"];
}

export function formatCategoriasApp(categorias: string[]): string {
  const clean = Array.from(new Set(categorias.map((c) => c.trim()).filter(Boolean)));
  return clean.join(", ");
}

export function getCategoriasDisponiveis(apps: AplicativoSite[] = []): string[] {
  const set = new Set<string>();
  CATEGORIAS_APLICATIVOS_PADRAO.forEach((c) => set.add(c));
  getStoredCategorias().forEach((c) => set.add(c));
  apps.forEach((a) => {
    getCategoriasApp(a.categoria).forEach((c) => set.add(c));
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export async function renomearCategoriaSites(
  categoriaAntiga: string,
  categoriaNova: string,
  apps: AplicativoSite[]
): Promise<void> {
  const antigaNorm = categoriaAntiga.trim();
  const novaNorm = categoriaNova.trim();
  if (!antigaNorm || !novaNorm || antigaNorm.toLowerCase() === novaNorm.toLowerCase()) return;

  // 1. Atualiza categorias salvas
  const stored = getStoredCategorias();
  const newStored = stored.map((c) => (c.trim().toLowerCase() === antigaNorm.toLowerCase() ? novaNorm : c));
  if (!newStored.some((c) => c.toLowerCase() === novaNorm.toLowerCase())) {
    newStored.push(novaNorm);
  }
  setStoredCategorias(newStored);

  // 2. Atualiza cada aplicativo que continha a categoria antiga
  const updatedApps = apps.map((app) => {
    const cats = getCategoriasApp(app.categoria);
    const hasOld = cats.some((c) => c.toLowerCase() === antigaNorm.toLowerCase());
    if (hasOld) {
      const updatedCats = cats.map((c) => (c.toLowerCase() === antigaNorm.toLowerCase() ? novaNorm : c));
      return {
        ...app,
        categoria: formatCategoriasApp(updatedCats),
      };
    }
    return app;
  });

  setLocalSitesCache(updatedApps);
  await syncSitesToCloud(updatedApps, newStored);
}

export async function excluirCategoriaSites(
  categoriaParaExcluir: string,
  apps: AplicativoSite[],
  categoriaDestino: string = "Outros"
): Promise<void> {
  const targetNorm = categoriaParaExcluir.trim();
  if (!targetNorm) return;

  // 1. Atualiza categorias salvas
  const stored = getStoredCategorias().filter((c) => c.trim().toLowerCase() !== targetNorm.toLowerCase());
  if (stored.length === 0) stored.push("Outros");
  setStoredCategorias(stored);

  // 2. Atualiza cada aplicativo que continha a categoria
  const updatedApps = apps.map((app) => {
    const cats = getCategoriasApp(app.categoria);
    const hasTarget = cats.some((c) => c.toLowerCase() === targetNorm.toLowerCase());
    if (hasTarget) {
      let filtered = cats.filter((c) => c.toLowerCase() !== targetNorm.toLowerCase());
      if (filtered.length === 0) {
        filtered = [categoriaDestino || "Outros"];
      }
      return {
        ...app,
        categoria: formatCategoriasApp(filtered),
      };
    }
    return app;
  });

  setLocalSitesCache(updatedApps);
  await syncSitesToCloud(updatedApps, stored);
}

export const APLICATIVOS_SITES_PADRAO: Omit<AplicativoSite, "id">[] = [];

const SITES_STORAGE_KEY = "orbit:aplicativos_sites_cache";

function getLocalSitesCache(): AplicativoSite[] {
  try {
    const raw = localStorage.getItem(SITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item: AplicativoSite) => {
      if (!item || !item.nome) return false;
      if (typeof item.id === "string" && item.id.startsWith("seed-")) return false;
      return true;
    });
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
 * Sincroniza a lista de aplicativos e sites e suas categorias na nuvem (Supabase integracoes)
 */
async function syncSitesToCloud(apps: AplicativoSite[], categorias?: string[]) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    const cats = categorias || getStoredCategorias();
    const payload: any = {
      provider: "app_sites_catalog",
      nome: "Catálogo de Sites de Apps",
      credenciais: { apps, categorias: cats },
      ativo: true,
      status: "ativo",
      updated_at: new Date().toISOString(),
    };
    if (uid) payload.user_id = uid;

    const { error } = await (supabase as any)
      .from("integracoes")
      .upsert(payload, { onConflict: "user_id,provider" });

    if (error) {
      const { data: existing } = await (supabase as any)
        .from("integracoes")
        .select("id")
        .eq("provider", "app_sites_catalog")
        .maybeSingle();

      if (existing?.id) {
        await (supabase as any)
          .from("integracoes")
          .update(payload)
          .eq("id", existing.id);
      } else {
        await (supabase as any)
          .from("integracoes")
          .insert(payload);
      }
    }
  } catch (err) {
    console.warn("Erro ao sincronizar sites na nuvem:", err);
  }
}

/**
 * Busca todos os aplicativos e sites oficiais do Supabase integracoes com auto-sync local
 */
export async function fetchAplicativosSites(): Promise<AplicativoSite[]> {
  try {
    const { data: row, error } = await (supabase as any)
      .from("integracoes")
      .select("id, credenciais, updated_at")
      .eq("provider", "app_sites_catalog")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && row && row.credenciais) {
      const cred = typeof row.credenciais === "string" ? JSON.parse(row.credenciais) : row.credenciais;
      const remoteApps: AplicativoSite[] = Array.isArray(cred?.apps) ? cred.apps : [];
      const remoteCats: string[] = Array.isArray(cred?.categorias) ? cred.categorias : [];

      if (remoteApps.length > 0) {
        setLocalSitesCache(remoteApps);
        if (remoteCats.length > 0) {
          setStoredCategorias(remoteCats);
        }
        return remoteApps;
      }
    }

    const local = getLocalSitesCache();
    if (local.length > 0) {
      syncSitesToCloud(local, getStoredCategorias()).catch(() => {});
      return local;
    }

    return [];
  } catch (err) {
    console.warn("Falha ao buscar aplicativos_sites da nuvem, usando cache local:", err);
    return getLocalSitesCache();
  }
}

/**
 * Cria ou atualiza um aplicativo na subcategoria de Aplicativos & Sites com persistência na nuvem
 */
export async function upsertAplicativoSite(app: Partial<AplicativoSite>): Promise<AplicativoSite> {
  const user = (await supabase.auth.getUser()).data.user;
  const siteUrl = ensureAbsoluteUrl(app.site_url);

  const id = app.id && !app.id.startsWith("disc-") && !app.id.startsWith("seed-")
    ? app.id
    : `site-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  const item: AplicativoSite = {
    id,
    user_id: user?.id,
    nome: (app.nome || "").trim().toUpperCase(),
    categoria: (app.categoria || "Player IPTV").trim(),
    site_url: siteUrl,
    observacao: app.observacao?.trim() || null,
    created_at: app.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const cached = getLocalSitesCache();
  const existsIdx = cached.findIndex((i) => i.id === id || i.nome.toUpperCase() === item.nome);
  if (existsIdx >= 0) {
    cached[existsIdx] = { ...cached[existsIdx], ...item };
  } else {
    cached.push(item);
  }
  setLocalSitesCache(cached);

  await syncSitesToCloud(cached);
  return item;
}

/**
 * Remove um aplicativo da subcategoria de Aplicativos & Sites
 */
export async function deleteAplicativoSite(id: string): Promise<void> {
  const cached = getLocalSitesCache().filter((i) => i.id !== id);
  setLocalSitesCache(cached);
  await syncSitesToCloud(cached);
}

/**
 * Descobre automaticamente todos os nomes de aplicativos disponíveis já cadastrados no sistema
 * (catálogo de preços, clientes e ativações)
 */
export function descobrirTodosAplicativos(
  clientes: any[] = [],
  catalogo: any[] = [],
  ativacoes: any[] = [],
): string[] {
  const set = new Set<string>();

  // 1. Apps do catálogo de preços
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

