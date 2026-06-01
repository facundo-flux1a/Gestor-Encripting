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
        <Card className="h-full border-red-100 dark:border-red-900/20 bg-gradient-to-br from-white to-red-50/50 dark:from-background dark:to-red-900/10 transition-all duration-300 hover:shadow-lg hover:shadow-red-100/50 dark:hover:shadow-red-900/20">
            <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 w-fit rounded-xl bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-300">
                        <Users className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-xl text-red-950 dark:text-red-100">
                        Proveedores con mayor gasto
                    </CardTitle>
                </div>
                <CardDescription className="text-red-600/70 dark:text-red-300/70">
                    Ranking por volumen de facturación
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-6">
                    {data && data.length > 0 ? (
                        data.map((provider, index) => (
                            <div key={index} className="flex items-center group cursor-pointer p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-bold border border-red-200 dark:border-red-700/50 group-hover:scale-105 transition-transform duration-200">
                                    {provider.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="ml-4 space-y-1 flex-1">
                                    <p className="text-sm font-semibold leading-none text-slate-800 dark:text-slate-100 group-hover:text-red-700 dark:group-hover:text-red-300 transition-colors">
                                        {provider.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground group-hover:text-red-500/70 transition-colors">
                                        {provider.fiscalId}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <div className="font-bold text-red-700 dark:text-red-300 tabular-nums">
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
                            <Users className="h-8 w-8 text-red-200 dark:text-red-800" />
                            <span className="text-sm text-red-400 dark:text-red-600">No hay datos disponibles</span>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
