import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { PixButton } from "@/components/pix-notificacoes";
import { RefreshCw } from "lucide-react";

import { LicenseGate } from "@/components/license-gate";
import { APP_TAGLINE } from "@/lib/app-version";
import { garantirBackupAutomatico } from "@/lib/backup";
import { sincronizarGoogle, statusGoogle } from "@/lib/google-backup.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: Layout,
});

function Layout() {
  const [email, setEmail] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;

    // Checagem inicial de sessão no cliente
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (!data?.session) {
        navigate({ to: "/auth" });
      } else {
        setEmail(data.session.user?.email ?? null);
        setCheckingAuth(false);
      }
    });

    // Escutar alterações de autenticação
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "SIGNED_OUT") {
        navigate({ to: "/auth" });
      } else if (session?.user?.email) {
        setEmail(session.user.email);
        setCheckingAuth(false);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

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
    navigate({ to: "/auth" });
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-muted-foreground text-sm">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 animate-spin text-primary" />
          <span>Verificando autenticação…</span>
        </div>
      </div>
    );
  }

  return (
    <LicenseGate>
    <SidebarProvider defaultOpen={false}>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="min-h-14 h-auto py-2 flex items-center justify-between border-b border-border/50 px-3 sm:px-4 bg-card/40 backdrop-blur">
            <div className="flex items-center gap-2 sm:gap-3">
              <SidebarTrigger className="h-9 w-9 text-foreground" />
              <div className="leading-tight">
                <div className="text-lg font-semibold uppercase tracking-wide">ORBIT</div>
                <div className="text-[10px] text-muted-foreground hidden md:block">{APP_TAGLINE}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
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