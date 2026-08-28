'use client';

import * as React from 'react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarFooter,
  useSidebar,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  FileText,
  LayoutDashboard,
  Users,
  AlertCircle,
  Settings,
  PanelLeftClose,
  PanelRightClose,
  LogOut,
  ShieldCheck,
  LogIn,
  Activity,
  Sparkles,
  Calendar,
  Webhook,
  BookOpen,
  Building2,
  UploadCloud,
} from "lucide-react";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getSession, logout } from '@/services/auth-service';
import { type User } from '@/lib/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from './theme-toggle';
import { RefreshButton } from './refresh-button';
import { Separator } from '@/components/ui/separator';

import { CompaniesSelector } from '../companies-selector';
import { useCompanyContext } from '@/context/CompanyProvider';
import { usePreferences } from '@/contexts/preferences-context';
import { SupportChatWidget } from '../support/support-chat-widget';
import { QueueTracker } from './queue-tracker';
import { GlobalUploadTracker } from '@/components/upload/global-upload-tracker';
import { useUploadQueueOptional } from '@/context/UploadQueueProvider';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { MuvailLogo } from '@/components/brand/muvail-logo';

function AppLogo() {
  const { state } = useSidebar();
  return (
    <MuvailLogo
      compact={state === 'collapsed'}
      className="min-w-0 transition-all duration-200"
      label="Muvail, gestión documental inteligente"
    />
  )
}

function SidebarToggle() {
  const { state, toggleSidebar } = useSidebar();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 p-1.5"
      onClick={toggleSidebar}
    >
      {state === 'expanded' ? <PanelLeftClose className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
    </Button>
  )
}

const UserProfile = React.memo(function UserProfile({ user }: { user: User | null }) {
  if (!user) {
    return (
      <Button variant="ghost" className="flex items-center gap-2 p-2 h-auto text-left w-full justify-start" asChild>
        <Link href="/auth/login">
          <Avatar className="h-8 w-8 flex items-center justify-center bg-muted">
            <LogIn className="h-4 w-4" />
          </Avatar>
          <div className="group-data-[collapsible=icon]:hidden">
            <p className="text-sm font-medium leading-none">Iniciar Sesión</p>
          </div>
        </Link>
      </Button>
    )
  }

  const initials = user.nombre ? user.nombre.charAt(0).toUpperCase() : '?';

  const handleLogout = async () => {
    await logout();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex items-center gap-2 p-2 h-auto text-left w-full justify-start">
          <Avatar className="h-8 w-8">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="group-data-[collapsible=icon]:hidden">
            <p className="text-sm font-medium leading-none truncate">{user.nombre}</p>
            <p className="text-xs text-muted-foreground leading-none truncate">{user.email}</p>
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Mi Cuenta</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="mr-2 h-4 w-4" />
            <span>Ajustes</span>
          </Link>
        </DropdownMenuItem>
        {/* <DropdownMenuItem asChild>
          <Link href="/settings/tax-validation">
            <ShieldCheck className="mr-2 h-4 w-4" />
            <span>Impuestos</span>
          </Link>
        </DropdownMenuItem> */}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Cerrar Sesión</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

export function MainLayoutHeader({ children, className, hideSidebarTrigger = false }: { children: React.ReactNode, className?: string, hideSidebarTrigger?: boolean }) {
  const [user, setUser] = React.useState<User | null>(null);

  React.useEffect(() => {
    getSession().then(session => {
      if (session) {
        setUser({
          id: session.userId,
          email: session.email,
          nombre: session.nombre,
        });
      }
    });
  }, []);

  return (
    <header className={cn(
      "flex h-16 items-center gap-4 border-b border-border/80 bg-background/85 backdrop-blur-sm sticky top-0 z-50",
      "px-3 sm:px-4 lg:px-6",
      className
    )}>
      {/* Mobile: Mostrar trigger del sidebar solo si no está oculto */}
      {!hideSidebarTrigger && (
        <div className="md:hidden">
          <SidebarTrigger />
        </div>
      )}

      <div className="flex-1 min-w-0">{children}</div>

      <div className="flex items-center gap-2">
        <RefreshButton />
        <NotificationBell />
        <ThemeToggle />
      </div>
    </header>
  )
}

function SidebarAutoCollapser({ noPadding }: { noPadding: boolean }) {
  const { setOpen, isMobile } = useSidebar();
  React.useEffect(() => {
    if (noPadding && !isMobile) {
      setOpen(false);
    }
  }, [noPadding, isMobile, setOpen]);
  return null;
}

export function MainLayout({ children, noPadding = false }: { children: React.ReactNode; noPadding?: boolean }) {
  const pathname = usePathname();
  const [user, setUser] = React.useState<User | null>(null);
  const [unreadActivity, setUnreadActivity] = React.useState({ total: 0, hasErrors: false });
  const [auditoriaCount, setAuditoriaCount] = React.useState(0);
  const uploadQueue = useUploadQueueOptional();

  // ✅ Usar el contexto de compañías
  const { selectedCompanyIds } = useCompanyContext();

  React.useEffect(() => {
    getSession().then(session => {
      if (session) {
        setUser({
          id: session.userId,
          email: session.email,
          nombre: session.nombre,
        });
      } else {
        setUser(null);
      }
    });
  }, [pathname]);

  // Hook de preferencias
  const { preferences } = usePreferences();

  // Fetch de actividades no leídas
  const fetchUnreadCount = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();

      // Lógica de preferencias para Actividad
      const dinamizar = preferences?.dinamizar_actividad ?? true;
      const mostrarTodoSinSeleccion = preferences?.sin_seleccion_mostrar_todo ?? false;

      // 1. Manejo de sin selección (Prioritario)
      if (selectedCompanyIds.length === 0) {
        if (!mostrarTodoSinSeleccion) {
          // Si elige "No mostrar nada", esto aplica SIEMPRE que no haya selección,
          // independientemente de si "Dinamizar" está o no activo.
          setUnreadActivity({ total: 0, hasErrors: false });
          return;
        }
      } else {
        // 2. Manejo con selección
        if (dinamizar) {
          params.append('empresaId', selectedCompanyIds.join(','));
        }
      }

      const res = await fetch(`/api/activity/unread-count?${params}`);
      if (res.ok) {
        const data = await res.json();
        setUnreadActivity({
          total: data.total_unread || 0,
          hasErrors: (data.unreadFailed || 0) > 0,
        });
      }
    } catch (err) {
      console.error('Error fetching unread count:', err);
    }
  }, [selectedCompanyIds, preferences]);



  // Fetch unified Auditoria count (Incidents + Health Checks)
  const fetchAuditoriaCount = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();

      const dinamizar = preferences?.dinamizar_incidencias ?? true;
      const mostrarTodoSinSeleccion = preferences?.sin_seleccion_mostrar_todo ?? false;

      if (selectedCompanyIds.length === 0) {
        if (!mostrarTodoSinSeleccion) {
          setAuditoriaCount(0);
          return;
        }
      } else {
        if (dinamizar) {
          params.append('empresaId', selectedCompanyIds.join(','));
        }
      }

      const res = await fetch(`/api/auditoria/count?${params}`);
      if (res.ok) {
        const data = await res.json();
        setAuditoriaCount(data.count || 0);
      }
    } catch (err) {
      console.error('Error fetching auditoria count:', err);
    }
  }, [selectedCompanyIds, preferences]);

  React.useEffect(() => {
    fetchUnreadCount();
    fetchAuditoriaCount();
    const interval = setInterval(() => {
      fetchUnreadCount();
      fetchAuditoriaCount();
    }, 30000);

    const handleGlobalUpdate = () => {
      console.log('🔄 [MainLayout] Refetching counters due to global event');
      fetchUnreadCount();
      fetchAuditoriaCount();
    };

    window.addEventListener('documentUploaded', handleGlobalUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener('documentUploaded', handleGlobalUpdate);
    };
  }, [fetchUnreadCount, fetchAuditoriaCount]);

  React.useEffect(() => {
    fetchUnreadCount();
  }, [pathname, fetchUnreadCount]);

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/documents', label: 'Documentos', icon: FileText },
    { href: '/dashboard/auditoria', label: 'Centro de Seguridad', icon: ShieldCheck },
    { href: '/trimestres', label: 'Trimestres', icon: Calendar },
    { href: '/proveedores', label: 'Entidades', icon: Users },
    { href: '/dashboard/webhooks', label: 'Webhooks', icon: Webhook },
    { href: '/docs', label: 'Docs', icon: BookOpen },
  ];

  return (
    <SidebarProvider defaultOpen={!noPadding}>
      <SidebarAutoCollapser noPadding={noPadding} />
      <Sidebar collapsible={noPadding ? "offcanvas" : "icon"} className="border-sidebar-border bg-sidebar">
        <SidebarHeader className="p-3.5 group-data-[collapsible=icon]:p-2">
          <div className="flex items-center justify-between group-data-[collapsible=icon]:justify-center">
            <AppLogo />
            <div className="hidden md:block group-data-[collapsible=icon]:hidden">
              <SidebarToggle />
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          {/* 🎯 Selector de empresas CON data-tutorial */}
          <div className="px-2 group-data-[collapsible=icon]:hidden" data-tutorial="company-selector">
            <CompaniesSelector />
          </div>
          <CollapsedCompanyControl />

          <Separator className="mx-3 my-2 group-data-[collapsible=icon]:mx-2" />

          {/* Menú de navegación */}
          <SidebarMenu>
            {navItems.map(item => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === item.href}
                  tooltip={item.label}>
                  <Link href={item.href} className="flex items-center gap-2">
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="group-data-[collapsible=icon]:hidden truncate">
                      {item.label}
                    </span>

                    {/* Badge de incidencias/health check unificado - CENTRO DE SEGURIDAD */}
                    {item.href === '/dashboard/auditoria' && auditoriaCount > 0 && (
                      <span className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-500 dark:text-emerald-400 border border-emerald-500/30 group-data-[collapsible=icon]:hidden animate-in zoom-in duration-300">
                        <ShieldCheck className="w-3 h-3" />
                        {auditoriaCount}
                      </span>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}

            {/* Cola de Subidas: panel global (no página) */}
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Cola de Subidas"
                isActive={uploadQueue?.isOpen}
                onClick={() => uploadQueue?.toggleQueue()}
              >
                <UploadCloud className="h-4 w-4 shrink-0" />
                <span className="group-data-[collapsible=icon]:hidden truncate">
                  Cola de Subidas
                </span>
                {unreadActivity.total > 0 && (
                  <span
                    className={cn(
                      "ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium group-data-[collapsible=icon]:hidden",
                      unreadActivity.hasErrors
                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        : "bg-primary/10 text-primary border border-primary/20"
                    )}
                  >
                    {unreadActivity.hasErrors ? (
                      <AlertCircle className="w-3 h-3" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    {unreadActivity.total}
                  </span>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          
          <div className="group-data-[collapsible=icon]:hidden">
            <QueueTracker />
            <GlobalUploadTracker />
          </div>
        </SidebarContent>

        <SidebarFooter className="group-data-[collapsible=icon]:p-1">
          <div className="m-2 rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-1.5 group-data-[collapsible=icon]:m-0 group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0">
            <UserProfile user={user} />
          </div>
        </SidebarFooter>
      </Sidebar>

      {/* 🔥 FIX CRÍTICO: SidebarInset con overflow controlado */}
      <SidebarInset id="main-sidebar-inset" className={cn("overflow-x-hidden", !noPadding && "pb-20")}>
        <div className={cn("flex flex-col w-full", noPadding ? "h-[calc(100vh-0px)] overflow-hidden" : "min-h-screen")}>
          {children}
        </div>
      </SidebarInset>

      {/* Una única puerta de ayuda contextual; no compite con un segundo flotante. */}
      <SupportChatWidget />
    </SidebarProvider>
  );
}

function CollapsedCompanyControl() {
  const { toggleSidebar } = useSidebar();

  return (
    <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
      <SidebarMenuItem>
        <SidebarMenuButton
          type="button"
          tooltip="Empresas"
          onClick={toggleSidebar}
          aria-label="Abrir selector de empresas"
        >
          <Building2 className="h-4 w-4" />
          <span className="group-data-[collapsible=icon]:hidden">Empresas</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
