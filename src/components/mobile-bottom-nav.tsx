import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  AlertTriangle,
  Handshake,
  Menu,
} from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { useQuery } from "@tanstack/react-query";
import { fetchClientes } from "@/lib/queries";
import { diasParaVencer } from "@/lib/iptv";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

export function MobileBottomNav() {
  const { toggleSidebar, openMobile, setOpenMobile } = useSidebar();
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: fetchClientes,
  });

  const countAtivos = useMemo(() => {
    return (clientes as any[]).filter((c) => {
      const d = diasParaVencer(c.data_vencimento);
      return (
        (d === null || d >= 0) &&
        c.status !== "cancelado" &&
        c.status !== "suspenso"
      );
    }).length;
  }, [clientes]);

  const countVencidos = useMemo(() => {
    return (clientes as any[]).filter((c) => {
      if (c.status === "cancelado" || c.status === "suspenso") return false;
      const d = diasParaVencer(c.data_vencimento);
      const isArquivado = d !== null && d < -365;
      if (isArquivado) return false;
      return (
        (d !== null && d < 0) ||
        (c.status === "vencido" && (d === null || d < 0))
      );
    }).length;
  }, [clientes]);

  const navItems = [
    {
      label: "Início",
      url: "/",
      icon: LayoutDashboard,
      active: currentPath === "/",
    },
    {
      label: "Clientes",
      url: "/clientes",
      icon: Users,
      active: currentPath.startsWith("/clientes"),
      badge: countAtivos,
      badgeColor: "bg-emerald-500 text-white",
    },
    {
      label: "Vencidos",
      url: "/vencidos",
      icon: AlertTriangle,
      active: currentPath.startsWith("/vencidos"),
      badge: countVencidos,
      badgeColor: "bg-rose-500 text-white",
    },
    {
      label: "Revendas",
      url: "/revendedores",
      icon: Handshake,
      active: currentPath.startsWith("/revendedores"),
    },
  ];

  return (
    <nav
      aria-label="Navegação móvel"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-border/80 shadow-lg transition-all"
    >
      <div className="grid grid-cols-5 h-16 items-center px-1 pb-[max(0.25rem,env(safe-area-inset-bottom,0px))]">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.url}
              to={item.url}
              onClick={() => setOpenMobile(false)}
              className={cn(
                "flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all relative min-h-[48px] select-none",
                item.active
                  ? "text-primary font-bold bg-primary/10"
                  : "text-muted-foreground hover:text-foreground font-medium"
              )}
            >
              <div className="relative">
                <Icon
                  className={cn(
                    "h-5 w-5 transition-transform",
                    item.active && "scale-110 text-primary"
                  )}
                />
                {typeof item.badge === "number" && item.badge > 0 && (
                  <span
                    className={cn(
                      "absolute -top-1.5 -right-3 text-[9px] font-bold px-1 min-w-[16px] h-[16px] rounded-full flex items-center justify-center shadow-xs tabular-nums leading-none",
                      item.badgeColor
                    )}
                  >
                    {item.badge > 999 ? "999+" : item.badge}
                  </span>
                )}
              </div>
              <span className="text-[10.5px] mt-1 tracking-tight leading-none truncate max-w-full">
                {item.label}
              </span>
            </Link>
          );
        })}

        {/* Botão de Menu para abrir gaveta completa com todas as abas */}
        <button
          type="button"
          onClick={() => toggleSidebar()}
          className={cn(
            "flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all relative min-h-[48px] select-none cursor-pointer",
            openMobile
              ? "text-primary font-bold bg-primary/10"
              : "text-muted-foreground hover:text-foreground font-medium"
          )}
          aria-label="Abrir todas as abas e opções"
          title="Mais opções e páginas"
        >
          <div className="relative">
            <Menu
              className={cn(
                "h-5 w-5 transition-transform",
                openMobile && "scale-110 text-primary"
              )}
            />
          </div>
          <span className="text-[10.5px] mt-1 tracking-tight leading-none">
            Mais
          </span>
        </button>
      </div>
    </nav>
  );
}
