'use client';

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
} from "@/components/ui/sidebar";
import {
  FileText,
  LayoutDashboard,
  Bell,
  UserCircle,
  Settings,
  PanelLeftClose,
  PanelRightClose,
  Users,
  LogOut,
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
import { useSidebar } from "@/components/ui/sidebar";

function AppLogo() {
  return (
    <div className="flex items-center gap-2">
      <SidebarTrigger>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 256 256"
              className="h-6 w-6 text-primary"
              fill="currentColor"
            >
              <path d="M156,128a28,28,0,1,1-28-28A28.03,28.03,0,0,1,156,128ZM48,128a80,80,0,1,0,80-80A80.09,80.09,0,0,0,48,128Zm160,0A80.11,80.11,0,0,1,154.2,205.82,12,12,0,0,1,136,204.13V151.3a52,52,0,1,0-52-52H31.87A12,12,0,0,1,14.2,81.8a80.11,80.11,0,0,1,193.6,0,12,12,0,0,1-17.67,17.46H160A36,36,0,1,1,124,160h44.13a12,12,0,0,1,11.66,8.2A80.11,80.11,0,0,1,208,128Zm-80,44a44,44,0,1,0-44-44A44.05,44.05,0,0,0,128,172Z"/>
            </svg>
        </Button>
      </SidebarTrigger>
      <h1 className="text-xl font-semibold group-data-[collapsible=icon]:hidden">Gestor Documental</h1>
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

export function MainLayoutHeader({ children, className }: { children: React.ReactNode, className?: string }) {
    return (
        <header className={cn("sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/60 px-4 backdrop-blur-sm sm:h-16 sm:px-6", className)}>
            <SidebarTrigger className="flex md:hidden" />
            <div className="hidden md:flex">
                <SidebarToggle />
            </div>
            <div className="flex-1">{children}</div>
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Bell className="h-4 w-4" />
                    <span className="sr-only">Notificaciones</span>
                </Button>
                 <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                         <Avatar className="h-8 w-8">
                          <AvatarImage data-ai-hint="profile avatar" src="https://placehold.co/100x100.png" alt="User Avatar" />
                          <AvatarFallback>JD</AvatarFallback>
                        </Avatar>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="end">
                      <DropdownMenuLabel>Mi Cuenta</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem>
                        <UserCircle className="mr-2 h-4 w-4" />
                        <span>Perfil</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Settings className="mr-2 h-4 w-4" />
                        <span>Ajustes</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem>
                         <LogOut className="mr-2 h-4 w-4" />
                        <span>Cerrar sesión</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
            </div>
        </header>
    )
}

export function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="flex items-center justify-between p-2">
            <AppLogo />
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === '/'} tooltip="Dashboard">
                <Link href="/">
                  <LayoutDashboard />
                  Dashboard
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.startsWith('/documents')} tooltip="Documentos">
                 <Link href="/documents">
                  <FileText />
                  Documentos
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === '/incidents'} tooltip="Incidencias">
                 <Link href="/incidents">
                  <Bell />
                  Incidencias
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.startsWith('/proveedores')} tooltip="Proveedores">
                 <Link href="/proveedores">
                  <Users />
                  Proveedores
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
           <div className="p-2 group-data-[collapsible=icon]:hidden">
                <Button variant="outline" className="w-full">
                    <Settings className="mr-2" />
                    Ajustes
                </Button>
           </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
