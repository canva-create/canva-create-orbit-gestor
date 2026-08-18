import { supabase } from "@/integrations/supabase/client";

/**
 * Busca todas as linhas de uma consulta paginando de 1000 em 1000.
 * Necessário porque o PostgREST corta em 1000 linhas e limites fixos (500)
 * faziam a Dashboard mostrar totais menores do que as abas de origem.
 */
async function fetchAllPaged(build: (from: number, to: number) => any) {
  const PAGE = 1000;
  let from = 0;
  const all: any[] = [];
  while (true) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    const chunk = data ?? [];
    all.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export async function fetchClientes() {
  const PAGE = 1000;
  let from = 0;
  const all: any[] = [];
  // Paginação para superar o limite padrão de 1000 linhas do PostgREST.
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
  // Dedupe por id para evitar duplicatas causadas por empates de ordenação entre páginas.
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
  const { data, error } = await supabase
    .from("servidores")
    .select("*")
    .order("categoria", { ascending: true })
    .order("nome", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchHistorico() {
  return fetchAllPaged((from, to) =>
    supabase
      .from("historico_renovacoes")
      .select("*, cliente:clientes(id, nome)")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
  );
}

export async function fetchComprasCreditos() {
  const { data, error } = await supabase
    .from("creditos_compras")
    .select("*, servidor:servidores(id, nome, categoria)")
    .order("data_compra", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchMovimentacoesCreditos() {
  return fetchAllPaged((from, to) =>
    supabase
      .from("creditos_movimentacoes")
      .select("*, servidor:servidores(id, nome), cliente:clientes(id, nome)")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
  );
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
    fetchAllPaged((from, to) =>
      supabase
        .from("revendedores")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    ),
    supabase.from("servidores").select("id, nome, custo_mensal, categoria"),
  ]);

  const servMap = new Map<string, any>();
  (servidoresRes.data ?? []).forEach((s: any) => servMap.set(s.id, s));

  return (revs ?? []).map((r: any) => ({
    ...r,
    servidor: r.servidor ?? (r.servidor_id ? servMap.get(r.servidor_id) : null) ?? null,
  }));
}

export async function fetchRevendedoresMovs() {
  return fetchAllPaged((from, to) =>
    supabase
      .from("revendedores_movimentacoes")
      .select("*, revendedor:revendedores(id, nome), servidor:servidores(id, nome)")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
  );
}
export async function fetchAtivacoesApps() {
  return fetchAllPaged((from, to) =>
    supabase
      .from("ativacoes_apps")
      .select("*, servidor:servidores(id, nome, categoria, custo_mensal)")
      .order("ativado_em", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
  );
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
