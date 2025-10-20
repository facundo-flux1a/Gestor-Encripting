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
      <h1 className={cn("text-lg font-bold text-primary truncate", state === 'collapsed' && 'sr-only')}>
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
      className="size-8 p-1.5"
      onClick={toggleSidebar}
    >
      {state === 'expanded' ? <PanelLeftClose /> : <PanelRightClose />}
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
            <p className="text-sm font-medium leading-none">{user.nombre}</p>
            <p className="text-xs text-muted-foreground leading-none">{user.email}</p>
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
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

export function MainLayoutHeader({ children, className }: { children: React.ReactNode, className?: string }) {
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
    <header className={cn("flex h-auto min-h-14 items-center gap-4 border-b bg-background/80 px-4 sm:px-6", className)}>
      <div className="flex-1">{children}</div>
      <ThemeToggle />
    </header>
  )
}

export function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = React.useState<User | null>(null);

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

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/documents', label: 'Documentos', icon: FileText },
    { href: '/incidents', label: 'Incidencias', icon: AlertCircle },
    { href: '/proveedores', label: 'Proveedores', icon: Users }
  ];

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="p-3">
          <div className="flex items-center justify-between">
            <AppLogo />
            <SidebarToggle />
          </div>
        </SidebarHeader>
        <SidebarContent>
          {/* Selector de empresas */}
          <CompaniesSelector />
          
          <Separator className="mx-2" />
          
          {/* Menú de navegación */}
          <SidebarMenu>
            {navItems.map(item => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === item.href}
                  tooltip={item.label}>
                  <Link href={item.href}>
                    <item.icon />
                    <span className="group-data-[collapsible=icon]:hidden">
                      {item.label}
                    </span>
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
            <a href="https://flux1a.com.ar" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground">
              <img src="https://dashboard.flux1a.com.ar/_next/image?url=%2Flogo-simple1.png&w=1920&q=75" alt="Flux1a Logo" className="h-6 w-6" />
              <span className="group-data-[collapsible=icon]:hidden">
                Powered by Flux1a
              </span>
            </a>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <div className="w-full overflow-x-auto">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}