import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  UserCheck,
} from "lucide-react";
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
import { fetchIsAdmin } from "@/lib/licencas";

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
  { title: "Backup", url: "/backup", icon: DatabaseBackup },
  { title: "Pagamento Pix", url: "/pix", icon: QrCode },
  { title: "Histórico", url: "/historico", icon: History },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [isAdmin, setIsAdmin] = useState(false);
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (p: string) => (p === "/" ? currentPath === "/" : currentPath.startsWith(p));

  useEffect(() => {
    fetchIsAdmin().then(setIsAdmin);
  }, []);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="h-9 w-9 rounded-lg bg-primary/20 border border-primary/30 grid place-items-center shrink-0">
            <Tv className="h-5 w-5 text-primary" />
          </div>
          {!collapsed && (
            <div className="leading-tight min-w-0">
              <div className="font-bold text-lg uppercase tracking-wide">ORBIT</div>
              <div className="text-[10px] text-muted-foreground leading-snug">{APP_TAGLINE}</div>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/licencas")}>
                    <Link to="/licencas" className="flex items-center gap-2 text-emerald-400 hover:text-emerald-300">
                      <UserCheck className="h-4 w-4 text-emerald-400" />
                      {!collapsed && <span>Liberação de Acessos</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/configuracoes")}>
              <Link to="/configuracoes" search={{ tab: "mensagens" }} className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                {!collapsed && <span>Configurações</span>}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/conta")}>
              <Link to="/conta" className="flex items-center gap-2">
                <UserCog className="h-4 w-4" />
                {!collapsed && <span>Minha Conta</span>}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}