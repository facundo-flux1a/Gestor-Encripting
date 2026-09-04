'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { LogIn, LayoutDashboard } from 'lucide-react';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { MuvailLogo } from '@/components/brand/muvail-logo';

export function LandingNavbar({ user }: { user: any }) {
    return (
        <nav className="fixed top-0 z-50 w-full border-b border-border bg-background pt-[env(safe-area-inset-top)]">
            <div className="container mx-auto flex h-[4.5rem] items-center justify-between px-4">
                <Link href="/" className="rounded-lg transition-opacity hover:opacity-80" aria-label="Ir al inicio de Muvail">
                    <MuvailLogo />
                </Link>

                <div className="hidden items-center gap-7 md:flex">
                    <Link href="#como-funciona" className="text-sm font-semibold text-muted-foreground transition-colors hover:text-primary">Cómo funciona</Link>
                    <Link href="#producto" className="text-sm font-semibold text-muted-foreground transition-colors hover:text-primary">Producto</Link>
                    <Link href="#para-quien" className="text-sm font-semibold text-muted-foreground transition-colors hover:text-primary">Para quién</Link>
                    <Link href="#contacto" className="text-sm font-semibold text-muted-foreground transition-colors hover:text-primary">Contacto</Link>
                </div>

                <div className="flex items-center gap-4">
                    <ThemeToggle />
                    {!user ? (
                        <>
                            <Button variant="ghost" size="sm" asChild className="hidden sm:flex">
                                <Link href="/auth/login">Iniciar Sesión</Link>
                            </Button>
                            <Button size="sm" asChild className="h-9 rounded-lg bg-primary px-4 font-semibold text-primary-foreground hover:bg-primary/90">
                                <Link href="/auth/login" className="flex items-center gap-2">
                                    <LogIn className="h-4 w-4" />
                                    <span>Acceder</span>
                                </Link>
                            </Button>
                        </>
                    ) : (
                        <Button size="sm" asChild className="h-9 rounded-lg bg-primary px-4 font-semibold text-primary-foreground hover:bg-primary/90">
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
