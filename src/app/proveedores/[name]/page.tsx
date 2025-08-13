'use client';

import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { useParams, notFound } from "next/navigation";
import { useEffect, useState } from "react";
import { Building } from "lucide-react";

export default function ProveedorDetailPage() {
    const params = useParams();
    const [providerName, setProviderName] = useState<string | null>(null);

    useEffect(() => {
        if (params.name) {
            const decodedName = decodeURIComponent(params.name as string);
            setProviderName(decodedName);
        } else {
            notFound();
        }
    }, [params.name]);

    if (!providerName) {
        return (
             <MainLayout>
                <div className="flex flex-1 items-center justify-center">
                    <p>Cargando proveedor...</p>
                </div>
            </MainLayout>
        )
    }

    return (
        <MainLayout>
            <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
                <MainLayoutHeader>
                    <div className="flex items-center justify-between space-y-2">
                        <div>
                             <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                                <Building className="h-8 w-8 text-primary" />
                                {providerName}
                            </h2>
                            <p className="text-muted-foreground">
                                Resumen de productos y actividad del proveedor.
                            </p>
                        </div>
                    </div>
                </MainLayoutHeader>
                <div className="mt-8">
                    <p>Aquí se mostrarán los detalles del proveedor y la lista de sus productos.</p>
                </div>
            </div>
        </MainLayout>
    );
}