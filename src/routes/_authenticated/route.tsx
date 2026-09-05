import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { PixButton } from "@/components/pix-notificacoes";

import { LicenseGate } from "@/components/license-gate";
import { APP_TAGLINE } from "@/lib/app-version";
import { garantirBackupAutomatico } from "@/lib/backup";
import { sincronizarGoogle, statusGoogle } from "@/lib/google-backup.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: Layout,
});

function Layout() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) window.location.href = "/auth";
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Backup automático diário às 23:59 — se o sistema estiver fechado no horário,
  // o backup pendente é gerado na próxima abertura.
  useEffect(() => {
    let rodando = false;
    const checar = async () => {
      if (rodando) return;
      rodando = true;
      try {
        const novo = await garantirBackupAutomatico();
        if (novo) {
          const g = await statusGoogle();
          if (g?.ativo) await sincronizarGoogle({ data: { backupId: novo.id } });
        }
      } catch {
        /* silencioso: não bloqueia o uso do sistema */
      } finally {
        rodando = false;
      }
    };
    checar();
    const id = setInterval(checar, 30 * 60_000); // Checa a cada 30 minutos em vez de a cada 1 minuto
    return () => clearInterval(id);
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }

  return (
    <LicenseGate>
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="min-h-14 h-auto py-2 flex items-center justify-between border-b border-border/50 px-4 bg-card/40 backdrop-blur">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <div className="leading-tight">
                <div className="text-lg font-semibold uppercase tracking-wide">ORBIT</div>
                <div className="text-[10px] text-muted-foreground hidden md:block">{APP_TAGLINE}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              
              <PixButton />
              <span className="text-xs text-muted-foreground hidden sm:inline">{email}</span>
              <button onClick={signOut} className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent">
                Sair
              </button>
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
    </LicenseGate>
  );
}