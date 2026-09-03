import { supabase } from "@/integrations/supabase/client";

const isBrowser = typeof window !== "undefined";

/**
 * Limpa o cache local do navegador para forçar a busca de dados frescos no Supabase.
 */
export function limparCacheLocal(chave?: string) {
  if (!isBrowser) return;
  try {
    if (!chave) {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("orbit_cache_"))
        .forEach((k) => localStorage.removeItem(k));
    } else {
      localStorage.removeItem(`orbit_cache_${chave}`);
    }
  } catch {}
}

// Limpeza preventiva de caches legados de clientes que possam ter ficado retidos no disco do navegador
if (isBrowser) {
  try {
    localStorage.removeItem("orbit_cache_clientes");
    localStorage.removeItem("orbit_cache_clientes_excluidos");
  } catch {}
}

async function getCached<T>(key: string, fetcher: () => Promise<T>, ttlMs = 15 * 60 * 1000): Promise<T> {
  if (isBrowser) {
    try {
      const raw = localStorage.getItem(`orbit_cache_${key}`);
      if (raw) {
        const { ts, data } = JSON.parse(raw);
        if (Date.now() - ts < ttlMs && data) {
          return data;
        }
      }
    } catch {}
  }

  const data = await fetcher();

  if (isBrowser) {
    try {
      localStorage.setItem(`orbit_cache_${key}`, JSON.stringify({ ts: Date.now(), data }));
    } catch {}
  }

  return data;
}

export async function fetchClientes() {
  const PAGE = 1000;
  let from = 0;
  const all: any[] = [];
  while (true) {
    const { data, error } = await supabase
      .from("clientes")
      .select("*, servidor:servidores(id, nome, custo_mensal)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const chunk = data ?? [];
    all.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }
  const seen = new Set<string>();
  return all.filter((c: any) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
}

export async function fetchClientesExcluidos() {
  const PAGE = 1000;
  let from = 0;
  const all: any[] = [];
  while (true) {
    const { data, error } = await supabase
      .from("clientes")
      .select("*, servidor:servidores(id, nome, custo_mensal)")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const chunk = data ?? [];
    all.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export async function fetchServidores() {
  return getCached("servidores", async () => {
    const { data, error } = await supabase
      .from("servidores")
      .select("*")
      .order("categoria", { ascending: true })
      .order("nome", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }, 30 * 60 * 1000); // 30 minutos de cache
}

export async function fetchHistorico(limit = 350) {
  const { data, error } = await supabase
    .from("historico_renovacoes")
    .select("*, cliente:clientes(id, nome)")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function fetchComprasCreditos(limit = 200) {
  const { data, error } = await supabase
    .from("creditos_compras")
    .select("*, servidor:servidores(id, nome, categoria)")
    .order("data_compra", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function fetchMovimentacoesCreditos(limit = 350) {
  const { data, error } = await supabase
    .from("creditos_movimentacoes")
    .select("*, servidor:servidores(id, nome), cliente:clientes(id, nome)")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function fetchSaldosCreditos(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc("creditos_saldos");
  if (error) throw error;
  const map: Record<string, number> = {};
  (data ?? []).forEach((r: any) => { map[r.servidor_id] = Number(r.saldo); });
  return map;
}

export async function fetchRevendedores() {
  const [revs, servidoresRes] = await Promise.all([
    supabase
      .from("revendedores")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(500),
    supabase.from("servidores").select("id, nome, custo_mensal, categoria"),
  ]);

  const servMap = new Map<string, any>();
  (servidoresRes.data ?? []).forEach((s: any) => servMap.set(s.id, s));

  return (revs.data ?? []).map((r: any) => ({
    ...r,
    servidor: r.servidor ?? (r.servidor_id ? servMap.get(r.servidor_id) : null) ?? null,
  }));
}

export async function fetchRevendedoresMovs(limit = 350) {
  const { data, error } = await supabase
    .from("revendedores_movimentacoes")
    .select("*, revendedor:revendedores(id, nome), servidor:servidores(id, nome)")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function fetchAtivacoesApps(limit = 350) {
  const { data, error } = await supabase
    .from("ativacoes_apps")
    .select("*, servidor:servidores(id, nome, categoria, custo_mensal)")
    .order("ativado_em", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function fetchLogsAuditoria() {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}

export async function fetchBackups() {
  const { data, error } = await supabase
    .from("backups")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}
