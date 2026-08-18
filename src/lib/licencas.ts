import { supabase } from "@/integrations/supabase/client";

export const ADMIN_MASTER_EMAIL = "prof.rodolfo@yahoo.com.br";

export type LicencaStatus = "ativa" | "utilizada" | "expirada" | "bloqueada";

export function gerarCodigoLicenca(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bloco = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `LM-${bloco(4)}-${bloco(4)}-${bloco(4)}-${bloco(4)}`;
}

export function statusInfo(status: string, dataExpiracao: string) {
  const expirada = new Date(dataExpiracao).getTime() < Date.now();
  if (status === "bloqueada") return { label: "Bloqueada", tone: "bg-red-500/15 text-red-400 border-red-500/30" };
  if (status === "expirada" || expirada) return { label: "Expirada", tone: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" };
  if (status === "utilizada" || status === "ativa") return { label: "Liberado", tone: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
  return { label: "Disponível", tone: "bg-blue-500/15 text-blue-400 border-blue-500/30" };
}

export async function fetchIsAdmin(): Promise<boolean> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return false;
  
  // O usuário com o e-mail prof.rodolfo@yahoo.com.br é o administrador mestre
  if (u.user.email && u.user.email.trim().toLowerCase() === ADMIN_MASTER_EMAIL.toLowerCase()) {
    // Garante que o registro de role admin exista no banco
    try {
      await supabase.from("user_roles").upsert({ user_id: u.user.id, role: "admin" } as any, { onConflict: "user_id,role" });
    } catch {
      /* ignora erro de inserção caso já exista */
    }
    return true;
  }

  const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
  return !!data;
}

export async function fetchMinhaLicenca() {
  const { data, error } = await supabase.rpc("minha_licenca_valida");
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}