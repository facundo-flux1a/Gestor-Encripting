'use client';

import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { PreferencesProvider } from '@/contexts/preferences-context';
import { FilteringPreferences } from '@/components/settings/filtering-preferences';
import { DelsolConfigSection } from '@/components/settings/DelsolConfigSection';

export default function ConfiguracionPage() {
    return (
        <MainLayout>
            <div className="flex-1 space-y-6 p-4 pt-6 md:p-8 max-w-6xl mx-auto">
                <MainLayoutHeader>
                    <h2 className="text-3xl font-bold tracking-tight">Configuración del Sistema</h2>
                </MainLayoutHeader>

                <DelsolConfigSection />

                <FilteringPreferences />
            </div>
        </MainLayout>
    );
}
