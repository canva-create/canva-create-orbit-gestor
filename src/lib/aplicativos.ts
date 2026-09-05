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
  created_at?: string;
  updated_at?: string;
}

export const APLICATIVOS_PADRAO: Omit<AplicativoCatalogo, "id">[] = [
  { nome: "IBO PLAYER", custo: 11.0, valor_venda: 25.0, categoria: "Player IPTV", ativo: true, observacao: "Um dos players mais populares para Smart TV" },
  { nome: "BOB PLAYER", custo: 11.0, valor_venda: 25.0, categoria: "Player IPTV", ativo: true, observacao: "Excelente compatibilidade com Samsung e LG" },
  { nome: "NINJA PLAYER", custo: 11.0, valor_venda: 25.0, categoria: "Player IPTV", ativo: true, observacao: "Interface rápida e fluida" },
  { nome: "CLOUDDY", custo: 12.0, valor_venda: 25.0, categoria: "Player IPTV", ativo: true, observacao: "Cloud Player com sincronização online" },
  { nome: "SMART ONE", custo: 13.0, valor_venda: 25.0, categoria: "Smart TV", ativo: true, observacao: "Player consagrado para Smart TVs" },
  { nome: "DUPLEX PLAY", custo: 11.0, valor_venda: 25.0, categoria: "Player IPTV", ativo: true, observacao: "Suporte amplo e estável" },
  { nome: "VU PLAYER PRO", custo: 11.0, valor_venda: 25.0, categoria: "Player IPTV", ativo: true, observacao: "Leve e com suporte a codecs modernos" },
  { nome: "XCIPTV", custo: 10.0, valor_venda: 25.0, categoria: "Android TV", ativo: true, observacao: "Player clássico para TV Box e Android" },
  { nome: "TIVIMATE", custo: 15.0, valor_venda: 30.0, categoria: "Android TV", ativo: true, observacao: "Player premium para TV Box" },
  { nome: "BAY TV", custo: 11.0, valor_venda: 25.0, categoria: "Smart TV", ativo: true, observacao: "Aplicativo leve para TV LG e Samsung" },
  { nome: "FLIX IPTV", custo: 12.0, valor_venda: 25.0, categoria: "Smart TV", ativo: true, observacao: "Interface moderna e rápida" },
  { nome: "SET IPTV", custo: 11.0, valor_venda: 25.0, categoria: "Smart TV", ativo: true, observacao: "Ativação anual tradicional" },
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
  const payload = {
    nome: app.nome?.trim().toUpperCase(),
    custo: Number(app.custo) || 0,
    valor_venda: Number(app.valor_venda) || 0,
    categoria: app.categoria?.trim() || "IPTV Player",
    observacao: app.observacao?.trim() || null,
    ativo: app.ativo ?? true,
    user_id: user?.id,
    updated_at: new Date().toISOString(),
  };

  try {
    if (app.id && !app.id.startsWith("seed-")) {
      const { data, error } = await supabase
        .from("aplicativos_catalogo" as any)
        .update(payload as any)
        .eq("id", app.id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as AplicativoCatalogo;
    } else {
      const { data, error } = await supabase
        .from("aplicativos_catalogo" as any)
        .insert({ ...payload, created_at: new Date().toISOString() } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as AplicativoCatalogo;
    }
  } catch (err) {
    console.warn("Erro ao salvar no Supabase, salvando no cache local:", err);
    // Salva no cache local como contingência
    const cached = getLocalCache();
    const id = app.id || `local-${Date.now()}`;
    const newItem: AplicativoCatalogo = {
      id,
      user_id: user?.id,
      nome: payload.nome || "NOVO APLICATIVO",
      custo: payload.custo,
      valor_venda: payload.valor_venda,
      categoria: payload.categoria,
      observacao: payload.observacao,
      ativo: payload.ativo,
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
