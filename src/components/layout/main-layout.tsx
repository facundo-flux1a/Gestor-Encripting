
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
  useSidebar
} from "@/components/ui/sidebar";
import {
  FileText,
  LayoutDashboard,
  Users,
  AlertCircle,
  Settings,
  PanelLeftClose,
  PanelRightClose,
  LifeBuoy
} from "lucide-react";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Main Logo and Toggle Button
function AppLogo() {
  const { state } = useSidebar();
  return (
    <div className="flex items-center gap-2.5">
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 256 256"
            className="h-8 w-8 text-primary flex-shrink-0"
            fill="currentColor"
        >
            <path d="M156,128a28,28,0,1,1-28-28A28.03,28.03,0,0,1,156,128ZM48,128a80,80,0,1,0,80-80A80.09,80.09,0,0,0,48,128Zm160,0A80.11,80.11,0,0,1,154.2,205.82,12,12,0,0,1,136,204.13V151.3a52,52,0,1,0-52-52H31.87A12,12,0,0,1,14.2,81.8a80.11,80.11,0,0,1,193.6,0,12,12,0,0,1-17.67,17.46H160A36,36,0,1,1,124,160h44.13a12,12,0,0,1,11.66,8.2A80.11,80.11,0,0,1,208,128Zm-80,44a44,44,0,1,0-44-44A44.05,44.05,0,0,0,128,172Z"/>
        </svg>
        <h1 className={cn("text-lg font-bold text-primary truncate", state === 'collapsed' && 'sr-only')}>FLUXIDOCS</h1>
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

export function MainLayoutHeader({ children, className }: { children: React.ReactNode, className?: string }) {
    return (
        <header className={cn("flex h-auto min-h-14 items-center gap-4 border-b bg-background/80 px-4 sm:px-6", className)}>
            {children}
        </header>
    )
}


export function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  const navItems = [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/documents', label: 'Documentos', icon: FileText },
      { href: '/incidents', label: 'Incidencias', icon: AlertCircle },
      { href: '/proveedores', label: 'Proveedores', icon: Users }
  ];

  const isActive = (href: string) => {
    if (href === '/') {
        return pathname === '/';
    }
    return pathname.startsWith(href);
  }


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
          <SidebarMenu>
            {navItems.map(item => (
                <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton 
                        asChild 
                        isActive={isActive(item.href)} 
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
           <SidebarMenu>
                <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Ajustes">
                        <Link href="/settings">
                            <Settings />
                             <span className="group-data-[collapsible=icon]:hidden">Ajustes</span>
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
                 <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Soporte">
                        <Link href="#">
                            <LifeBuoy />
                             <span className="group-data-[collapsible=icon]:hidden">Soporte</span>
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
           </SidebarMenu>
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
