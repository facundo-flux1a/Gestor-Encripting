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
import { Separator } from '@/components/ui/separator';
import { CompaniesSelector } from '../companies-selector';

function AppLogo() {
  const { state } = useSidebar();
  return (
    <div className="flex items-center gap-2.5">
      <h1 className={cn(
        "text-base sm:text-lg font-bold text-primary truncate transition-all",
        state === 'collapsed' && 'sr-only'
      )}>
        Gestor Documental
      </h1>
    </div>
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
        <DropdownMenuItem asChild>
          <Link href="/settings/tax-validation">
            <ShieldCheck className="mr-2 h-4 w-4" />
            <span>Impuestos</span>
          </Link>
        </DropdownMenuItem>
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
      "flex h-14 items-center gap-4 border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50",
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
        <ThemeToggle />
      </div>
    </header>
  )
}

export function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = React.useState<User | null>(null);
  const [unreadActivity, setUnreadActivity] = React.useState({ total: 0, hasErrors: false });
  const [incidentCount, setIncidentCount] = React.useState(0);

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

  // Fetch de actividades no leídas
  const fetchUnreadCount = React.useCallback(async () => {
    try {
      const res = await fetch('/api/activity/unread-count');
      if (res.ok) {
        const data = await res.json();
        setUnreadActivity({
          total: data.totalUnread || 0,
          hasErrors: (data.unreadFailed || 0) > 0,
        });
      }
    } catch (err) {
      console.error('Error fetching unread count:', err);
    }
  }, []);

  // Fetch de incidencias pendientes
  const fetchIncidentCount = React.useCallback(async () => {
    try {
      const res = await fetch('/api/incidents/count');
      if (res.ok) {
        const data = await res.json();
        setIncidentCount(data.count || 0);
      }
    } catch (err) {
      console.error('Error fetching incident count:', err);
    }
  }, []);

  React.useEffect(() => {
    fetchUnreadCount();
    fetchIncidentCount();
    const interval = setInterval(() => {
      fetchUnreadCount();
      fetchIncidentCount();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount, fetchIncidentCount]);

  React.useEffect(() => {
    if (pathname !== '/dashboard/actividad') {
      fetchUnreadCount();
    }
  }, [pathname, fetchUnreadCount]);

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/documents', label: 'Documentos', icon: FileText },
    { href: '/trimestres', label: 'Trimestres', icon: Calendar },
    { href: '/dashboard/actividad', label: 'Actividad', icon: Activity },
    { href: '/incidents', label: 'Incidencias', icon: AlertCircle },
    { href: '/proveedores', label: 'Proveedores', icon: Users }
  ];

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="p-3">
          <div className="flex items-center justify-between">
            <AppLogo />
            <div className="hidden md:block">
              <SidebarToggle />
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          {/* 🎯 Selector de empresas CON data-tutorial */}
          <div className="px-2" data-tutorial="company-selector">
            <CompaniesSelector />
          </div>

          <Separator className="mx-2 my-2" />

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
                    {/* Badge de actividades no leídas */}
                    {item.href === '/dashboard/actividad' && unreadActivity.total > 0 && (
                      <span
                        className={cn(
                          "ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium group-data-[collapsible=icon]:hidden",
                          unreadActivity.hasErrors
                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                            : "bg-violet-500/20 text-violet-400 border border-violet-500/30"
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

                    {/* Badge de incidencias pendientes - SOLO EN INCIDENCIAS */}
                    {item.href === '/incidents' && incidentCount > 0 && (
                      <span className="ml-auto w-5 h-5 flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold group-data-[collapsible=icon]:hidden animate-in zoom-in duration-300">
                        {incidentCount}
                      </span>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter>
          <div className="p-2 border-t">
            <UserProfile user={user} />
          </div>
          <Separator />
          <div className="p-2 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:py-2">
            <a
              href="https://flux1a.com.ar"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <img
                src="https://www.allbase.com.ar/_next/image?url=%2Ficons%2FSIMBOLO%20DEGRADADO.png&w=32&q=75"
                alt="Flux1a Logo"
                className="h-6 w-6 shrink-0"
              />
              <span className="group-data-[collapsible=icon]:hidden">
                Powered by AllBase
              </span>
            </a>
          </div>
        </SidebarFooter>
      </Sidebar>

      {/* 🔥 FIX CRÍTICO: SidebarInset con overflow controlado */}
      <SidebarInset id="main-sidebar-inset" className="overflow-x-hidden">
        <div className="flex flex-col min-h-screen w-full">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}