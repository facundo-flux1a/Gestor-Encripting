'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users } from 'lucide-react';

interface TopClientsProps {
    data: Array<{
        name: string;
        total: number;
        fiscalId: string;
        documentCount?: number;
    }>;
}

export function TopClients({ data }: TopClientsProps) {
    return (
        <Card className="h-full border-green-100 dark:border-green-900/20 bg-gradient-to-br from-white to-green-50/50 dark:from-background dark:to-green-900/10 transition-all duration-300 hover:shadow-lg hover:shadow-green-100/50 dark:hover:shadow-green-900/20">
            <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 w-fit rounded-xl bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-300">
                        <Users className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-xl text-green-950 dark:text-green-100">
                        Clientes con mayor ingreso
                    </CardTitle>
                </div>
                <CardDescription className="text-green-600/70 dark:text-green-300/70">
                    Ranking por volumen de facturación
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-6">
                    {data && data.length > 0 ? (
                        data.map((client, index) => (
                            <div key={index} className="flex items-center group cursor-pointer p-2 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 font-bold border border-green-200 dark:border-green-700/50 group-hover:scale-105 transition-transform duration-200">
                                    {client.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="ml-4 space-y-1 flex-1">
                                    <p className="text-sm font-semibold leading-none text-slate-800 dark:text-slate-100 group-hover:text-green-700 dark:group-hover:text-green-300 transition-colors">
                                        {client.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground group-hover:text-green-500/70 transition-colors">
                                        {client.fiscalId}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <div className="font-bold text-green-700 dark:text-green-300 tabular-nums">
                                        {new Intl.NumberFormat('es-ES', {
                                            style: 'currency',
                                            currency: 'EUR'
                                        }).format(client.total)}
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="flex h-[200px] items-center justify-center text-muted-foreground flex-col gap-2">
                            <Users className="h-8 w-8 text-green-200 dark:text-green-800" />
                            <span className="text-sm text-green-400 dark:text-green-600">No hay datos disponibles</span>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
