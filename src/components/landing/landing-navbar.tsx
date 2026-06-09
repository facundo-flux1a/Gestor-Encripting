'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { LogIn, LayoutDashboard } from 'lucide-react';
import { ThemeToggle } from '@/components/layout/theme-toggle';

export function LandingNavbar({ user }: { user: any }) {
    return (
        <nav className="fixed top-0 w-full z-50 border-b bg-background/80 backdrop-blur-md">
            <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                <Link href="/" className="hover:opacity-80 transition-opacity">
                    <span className="text-xl font-bold bg-gradient-to-r from-primary to-violet-400 bg-clip-text text-transparent">
                        Gestor Documental Muvail
                    </span>
                </Link>

                <div className="hidden md:flex items-center gap-8">
                    <Link href="#features" className="text-sm font-medium hover:text-primary transition-colors">Funcionalidades</Link>
                    {/* <Link href="#pricing" className="text-sm font-medium hover:text-primary transition-colors">Planes</Link> */}
                    <Link href="#about" className="text-sm font-medium hover:text-primary transition-colors">Nosotros</Link>
                </div>

                <div className="flex items-center gap-4">
                    <ThemeToggle />
                    {!user ? (
                        <>
                            <Button variant="ghost" size="sm" asChild className="hidden sm:flex">
                                <Link href="/auth/login">Iniciar Sesión</Link>
                            </Button>
                            <Button size="sm" asChild className="bg-primary hover:bg-primary/90 text-primary-foreground">
                                <Link href="/auth/login" className="flex items-center gap-2">
                                    <LogIn className="h-4 w-4" />
                                    <span>Acceder</span>
                                </Link>
                            </Button>
                        </>
                    ) : (
                        <Button size="sm" asChild className="bg-primary hover:bg-primary/90 text-primary-foreground">
                            <Link href="/dashboard" className="flex items-center gap-2">
                                <LayoutDashboard className="h-4 w-4" />
                                <span>Ir al Dashboard</span>
                            </Link>
                        </Button>
                    )}
                </div>
            </div>
        </nav>
    );
}
