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
  Users
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
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-primary"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>
        </Button>
      </SidebarTrigger>
      <h1 className="text-xl font-semibold group-data-[collapsible=icon]:hidden">FluxiDocs</h1>
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
        <div className={cn("flex h-14 items-center gap-4 border-b bg-background/60 px-4 backdrop-blur-sm lg:h-auto lg:border-none lg:bg-transparent lg:px-0", className)}>
            <SidebarTrigger className="flex md:hidden" />
            <div className="w-full flex-1">{children}</div>
        </div>
    )
}

export function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="flex items-center justify-between p-2">
            <AppLogo />
            <div className="group-data-[collapsible=icon]:hidden">
                <SidebarToggle />
            </div>
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
              <SidebarMenuButton asChild isActive={pathname === '/documents'} tooltip="All Documents">
                 <Link href="/documents">
                  <FileText />
                  All Documents
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === '/incidents'} tooltip="Incidents">
                 <Link href="/incidents">
                  <Bell />
                  Incidents
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === '/proveedores'} tooltip="Proveedores">
                 <Link href="/proveedores">
                  <Users />
                  Proveedores
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-start gap-2 p-2 h-auto">
                 <Avatar className="h-8 w-8">
                  <AvatarImage data-ai-hint="profile avatar" src="https://placehold.co/100x100.png" alt="User Avatar" />
                  <AvatarFallback>JD</AvatarFallback>
                </Avatar>
                <div className="text-left group-data-[collapsible=icon]:hidden">
                  <p className="text-sm font-medium">Jane Doe</p>
                  <p className="text-xs text-muted-foreground">jane.doe@example.com</p>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 mb-2" side="top" align="start">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <UserCircle className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
