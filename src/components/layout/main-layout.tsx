
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
  SidebarTrigger,
  useSidebar
} from "@/components/ui/sidebar";
import {
  FileText,
  LayoutDashboard,
  Users,
  AlertCircle,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelRightClose
} from "lucide-react";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils";
import { logout } from '@/services/auth-service';
import type { SessionPayload } from '@/lib/types';


// Main Logo and Toggle Button
function AppLogo() {
  const { state } = useSidebar();
  return (
    <div className="flex items-center gap-2.5">
      <h1 className={cn("text-xl font-bold text-primary", state === 'collapsed' && 'hidden')}>GESTOR DOCUMENTAL</h1>
    </div>
  )
}

function SidebarToggle() {
    const { state, toggleSidebar } = useSidebar();
    return (
        <Button 
            variant="ghost" 
            size="icon"
            className="hidden size-8 p-1.5 md:flex"
            onClick={toggleSidebar}
        >
          {state === 'expanded' ? <PanelLeftClose /> : <PanelRightClose />}
        </Button>
    )
}

// User Profile Section for Sidebar Footer
function UserProfile({ session }: { session: SessionPayload | null }) {
    const handleLogout = async () => {
        await logout();
        window.location.href = '/auth/login';
    };

    if (!session?.username) {
        return (
            <div className="p-2">
                 <Button variant="outline" className="w-full" asChild>
                    <Link href="/auth/login">Iniciar Sesión</Link>
                </Button>
            </div>
        )
    }
    
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="w-full justify-start items-center gap-3 p-2 h-auto">
                    <Avatar className="h-9 w-9">
                        <AvatarImage data-ai-hint="profile avatar" src="https://placehold.co/100x100.png" alt="User Avatar" />
                        <AvatarFallback>{session.username.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="text-left group-data-[collapsible=icon]:hidden">
                        <p className="font-semibold text-sm">{session.username}</p>
                        <p className="text-xs text-muted-foreground">{session.role}</p>
                    </div>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" side="top" sideOffset={10}>
              <DropdownMenuLabel>Mi Cuenta</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                 <Link href="/settings">
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Ajustes</span>
                 </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                 <LogOut className="mr-2 h-4 w-4" />
                <span>Cerrar sesión</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

export function MainLayoutHeader({ children, className }: { children: React.ReactNode, className?: string }) {
    return (
        <header className={cn("sticky top-0 z-10 flex h-auto min-h-14 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-sm sm:px-6", className)}>
            <SidebarTrigger className="flex md:hidden" />
            <div className="hidden md:flex">
                <SidebarToggle />
            </div>
            {children}
        </header>
    )
}


export function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [session, setSession] = React.useState<SessionPayload | null>(null);

  React.useEffect(() => {
    async function fetchSession() {
        try {
            const res = await fetch('/api/session');
            if(res.ok) {
                const data = await res.json();
                setSession(data.session);
            }
        } catch(e) {
            console.error("Could not fetch session", e)
        }
    }
    fetchSession();
  }, [])
  
  const navItems = [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/documents', label: 'Documentos', icon: FileText },
      { href: '/incidents', label: 'Incidencias', icon: AlertCircle },
      { href: '/proveedores', label: 'Proveedores', icon: Users }
  ];

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="flex items-center justify-between p-3">
            <AppLogo />
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {navItems.map(item => (
                <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton 
                        asChild 
                        isActive={item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)} 
                        tooltip={item.label}>
                        <Link href={item.href}>
                            <item.icon />
                            {item.label}
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
           <UserProfile session={session} />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
