'use client';

import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { PreferencesProvider } from '@/contexts/preferences-context';
import { FilteringPreferences } from '@/components/settings/filtering-preferences';

export default function ConfiguracionPage() {
    return (
        <MainLayout>
            <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
                <MainLayoutHeader>
                    <h2 className="text-3xl font-bold tracking-tight">Configuración de Alertas</h2>
                </MainLayoutHeader>

                <FilteringPreferences />
            </div>
        </MainLayout>
    );
}
