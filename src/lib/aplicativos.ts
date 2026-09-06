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
 * Localiza a URL do site oficial do aplicativo buscando pelo nome no catálogo
 */
export function findAppSiteUrl(appName: string | null | undefined, apps: AplicativoCatalogo[] = []): string | null {
  if (!appName || !apps || apps.length === 0) return null;
  const norm = appName.trim().toUpperCase();
  if (!norm) return null;

  // 1. Busca exata por nome
  const exact = apps.find((a) => a.nome.trim().toUpperCase() === norm);
  if (exact?.site_url) return ensureAbsoluteUrl(exact.site_url);

  // 2. Busca por inclusão (ex: cliente tem "IBO PLAYER PRO" e catálogo tem "IBO PLAYER")
  const partial = apps.find(
    (a) =>
      a.site_url &&
      (norm.includes(a.nome.trim().toUpperCase()) || a.nome.trim().toUpperCase().includes(norm)),
  );
  if (partial?.site_url) return ensureAbsoluteUrl(partial.site_url);

  return null;
}

/**
 * Remove um aplicativo do catálogo
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
