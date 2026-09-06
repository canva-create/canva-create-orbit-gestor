import { Link, useRouterState } from "@tanstack/react-router";
import {
  Server,
  LayoutDashboard,
  Users,
  History,
  Tv,
  AlertTriangle,
  Handshake,
  UserCog,
  Boxes,
  Wallet,
  Activity,
  DatabaseBackup,
  QrCode,
  Settings,
  Smartphone,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { APP_TAGLINE } from "@/lib/app-version";
import { cn } from "@/lib/utils";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Clientes Ativos", url: "/clientes", icon: Users },
  { title: "Clientes Vencidos", url: "/vencidos", icon: AlertTriangle },
  { title: "Revendedores", url: "/revendedores", icon: Handshake },
  { title: "Servidores", url: "/servidores", icon: Server },
  { title: "Gestão de Créditos", url: "/creditos", icon: Boxes },
  { title: "Ativação de Aplicativos", url: "/ativacoes", icon: Smartphone },
  { title: "Pagamento de Funcionários", url: "/faturamento", icon: Wallet },
  { title: "Central de Gestão", url: "/central", icon: Activity },
  { title: "Pagamento Pix", url: "/pix", icon: QrCode },
  { title: "Histórico", url: "/historico", icon: History },
  { title: "Auditoria", url: "/auditoria", icon: ShieldCheck },
  { title: "Backup", url: "/backup", icon: DatabaseBackup },
];

export function AppSidebar() {
  const { state, setOpen, isMobile, setOpenMobile } = useSidebar();
  const collapsed = isMobile ? false : state === "collapsed";
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (p: string) => (p === "/" ? currentPath === "/" : currentPath.startsWith(p));

  const handleLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    } else {
      setOpen(false);
    }
  };

  return (
    <Sidebar
      collapsible="icon"
      onMouseEnter={() => {
        if (!isMobile) setOpen(true);
      }}
      onMouseLeave={() => {
        if (!isMobile) setOpen(false);
      }}
    >
      <SidebarHeader className="overflow-hidden">
        <div
          className={cn(
            "flex items-center py-3 transition-all",
            collapsed ? "justify-center px-0" : "gap-2.5 px-3"
          )}
        >
          <div
            className="h-9 w-9 rounded-lg bg-primary/20 border border-primary/30 grid place-items-center shrink-0 shadow-sm"
            title={collapsed ? `ORBIT - ${APP_TAGLINE}` : undefined}
          >
            <Tv className="h-5 w-5 text-primary" />
          </div>
          {!collapsed && (
            <div className="leading-tight min-w-0 flex-1 truncate animate-in fade-in duration-200">
              <div className="font-bold text-lg uppercase tracking-wide truncate">ORBIT</div>
              <div className="text-[10px] text-muted-foreground leading-snug truncate" title={APP_TAGLINE}>
                {APP_TAGLINE}
              </div>
            </div>
          )}
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 ml-auto text-muted-foreground hover:text-foreground shrink-0"
              onClick={() => setOpenMobile(false)}
              title="Fechar menu"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Fechar</span>
            </Button>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{!collapsed ? "Menu" : "•••"}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <Link
                      to={item.url}
                      onClick={handleLinkClick}
                      className="flex items-center gap-2"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/configuracoes")}>
              <Link
                to="/configuracoes"
                search={{ tab: "mensagens" }}
                onClick={handleLinkClick}
                className="flex items-center gap-2"
              >
                <Settings className="h-4 w-4 shrink-0" />
                {!collapsed && <span>Configurações</span>}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/conta")}>
              <Link
                to="/conta"
                onClick={handleLinkClick}
                className="flex items-center gap-2"
              >
                <UserCog className="h-4 w-4 shrink-0" />
                {!collapsed && <span>Minha Conta</span>}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}