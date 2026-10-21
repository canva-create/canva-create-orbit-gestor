import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { RefreshCw, Menu } from "lucide-react";

import { LicenseGate } from "@/components/license-gate";
import { APP_TAGLINE } from "@/lib/app-version";
import { registrarLogAcesso } from "@/lib/audit";
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
        const uEmail = data.session.user?.email ?? null;
        const uId = data.session.user?.id;
        setEmail(uEmail);
        setCheckingAuth(false);
        if (uEmail && uId) {
          registrarLogAcesso(uEmail, uId);
        }
      }
    });

    // Escutar alterações de autenticação
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "SIGNED_OUT") {
        navigate({ to: "/auth" });
      } else if (session?.user?.email && session?.user?.id) {
        setEmail(session.user.email);
        setCheckingAuth(false);
        registrarLogAcesso(session.user.email, session.user.id);
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
          try {
            const g = await statusGoogle();
            if (g?.ativo) await sincronizarGoogle({ data: { backupId: novo.id } });
          } catch {
            /* Falha no envio ao Google não afeta o backup salvo no banco */
          }
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
          <header className="sticky top-0 z-30 min-h-14 h-auto py-2 flex items-center justify-between border-b border-border/50 px-3 sm:px-4 bg-card/80 backdrop-blur-md">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <SidebarTrigger
                className="h-9 w-9 text-foreground hover:bg-accent/80 border border-border/50 rounded-lg shrink-0 flex items-center justify-center cursor-pointer shadow-xs"
                title="Menu de Navegação"
              >
                <Menu className="h-5 w-5" />
                <span className="sr-only">Menu de Navegação</span>
              </SidebarTrigger>
              <div className="leading-tight min-w-0 truncate">
                <div className="text-xl sm:text-2xl font-black uppercase tracking-wider text-foreground truncate">RODOLFO TV</div>
                <div className="text-[11px] text-muted-foreground hidden md:block font-medium">{APP_TAGLINE}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <span className="text-xs text-muted-foreground hidden sm:inline">{email}</span>
              <button onClick={signOut} className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent font-medium transition-colors cursor-pointer">
                Sair
              </button>
            </div>
          </header>
          <main className="flex-1 overflow-auto pb-20 md:pb-6">
            <Outlet />
          </main>
          <MobileBottomNav />
        </div>
      </div>
    </SidebarProvider>
    </LicenseGate>
  );
}