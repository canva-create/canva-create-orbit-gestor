import { supabase } from "@/integrations/supabase/client";

export const ADMIN_MASTER_EMAIL = "prof.rodolfo@yahoo.com.br";
export const ADMIN_MASTER_EMAILS = [
  "prof.rodolfo@yahoo.com.br",
  "canva@educaiguape.com.br",
];

export function isMasterAdmin(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return (
    ADMIN_MASTER_EMAILS.includes(clean) ||
    clean.includes("prof.rodolfo") ||
    clean.includes("rodolfo") ||
    clean.includes("educaiguape")
  );
}

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
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const sessionEmail = sessionData?.session?.user?.email?.trim().toLowerCase();
    if (isMasterAdmin(sessionEmail)) {
      return true;
    }

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return false;
    
    if (isMasterAdmin(u.user.email)) {
      try {
        await supabase.from("user_roles").upsert({ user_id: u.user.id, role: "admin" } as any, { onConflict: "user_id,role" });
      } catch {
        /* ignora erro de inserção caso já exista */
      }
      return true;
    }

    const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
    return !!data;
  } catch (err) {
    console.error("fetchIsAdmin error:", err);
    return false;
  }
}

export async function fetchMinhaLicenca() {
  const { data, error } = await supabase.rpc("minha_licenca_valida");
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}