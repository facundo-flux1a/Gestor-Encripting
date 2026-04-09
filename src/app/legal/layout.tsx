'use client';

import { useEffect, useState } from 'react';
import { getSession } from '@/services/auth-service';
import { LandingNavbar } from '@/components/landing/landing-navbar';
import { LandingFooter } from '@/components/landing/landing-footer';

export default function LegalLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        async function loadSession() {
            try {
                const session = await getSession();
                setUser(session);
            } catch (err) {
                console.error('Error loading session:', err);
            }
        }
        loadSession();
    }, []);

    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col">
            <LandingNavbar user={user} />
            <main className="flex-1 pt-32 pb-20">
                <div className="container mx-auto px-4 max-w-4xl">
                    <div className="glass-panel p-8 md:p-12 rounded-3xl border-primary/10 shadow-3xl bg-card/30 backdrop-blur-md animate-fade-in">
                        {children}
                    </div>
                </div>
            </main>
            <LandingFooter />
        </div>
    );
}
