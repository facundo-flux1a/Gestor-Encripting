'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users } from 'lucide-react';

interface TopProvidersProps {
    data: Array<{
        name: string;
        total: number;
        fiscalId: string;
        documentCount?: number;
    }>;
}

export function TopProviders({ data }: TopProvidersProps) {
    return (
        <Card className="h-full border-violet-100 dark:border-violet-900/20 bg-gradient-to-br from-white to-violet-50/50 dark:from-background dark:to-violet-900/10 transition-all duration-300 hover:shadow-lg hover:shadow-violet-100/50 dark:hover:shadow-violet-900/20">
            <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 w-fit rounded-xl bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-300">
                        <Users className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-xl text-violet-950 dark:text-violet-100">
                        Proveedores con mayor gasto
                    </CardTitle>
                </div>
                <CardDescription className="text-violet-600/70 dark:text-violet-300/70">
                    Ranking por volumen de facturación
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-6">
                    {data && data.length > 0 ? (
                        data.map((provider, index) => (
                            <div key={index} className="flex items-center group cursor-pointer p-2 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 font-bold border border-violet-200 dark:border-violet-700/50 group-hover:scale-105 transition-transform duration-200">
                                    {provider.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="ml-4 space-y-1 flex-1">
                                    <p className="text-sm font-semibold leading-none text-slate-800 dark:text-slate-100 group-hover:text-violet-700 dark:group-hover:text-violet-300 transition-colors">
                                        {provider.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground group-hover:text-violet-500/70 transition-colors">
                                        {provider.fiscalId}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <div className="font-bold text-violet-700 dark:text-violet-300 tabular-nums">
                                        {new Intl.NumberFormat('es-ES', {
                                            style: 'currency',
                                            currency: 'EUR'
                                        }).format(provider.total)}
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="flex h-[200px] items-center justify-center text-muted-foreground flex-col gap-2">
                            <Users className="h-8 w-8 text-violet-200 dark:text-violet-800" />
                            <span className="text-sm text-violet-400 dark:text-violet-600">No hay datos disponibles</span>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
