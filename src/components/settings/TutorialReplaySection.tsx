'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlayCircle, Info } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";

const TUTORIALS = [
    { id: 'dashboard', name: 'Dashboard General', path: '/dashboard', storageKey: 'force_tutorial_dashboard' },
    { id: 'documentos', name: 'Gestión de Documentos', path: '/dashboard', storageKey: 'force_tutorial_documentos' },
    { id: 'trimestres', name: 'Resumen Trimestral', path: '/dashboard/trimestres', storageKey: 'force_tutorial_trimestres' },
    { id: 'actividad', name: 'Historial de Actividad', path: '/dashboard/actividad', storageKey: 'force_tutorial_actividad' },
    { id: 'incidencias', name: 'Gestión de Incidencias', path: '/dashboard/incidencias', storageKey: 'force_tutorial_incidencias' },
    { id: 'proveedores', name: 'Directorio de Proveedores', path: '/dashboard/proveedores', storageKey: 'force_tutorial_proveedores' },
];

export function TutorialReplaySection() {
    const router = useRouter();
    const pathname = usePathname();

    const handleReplay = (tutorial: typeof TUTORIALS[0]) => {
        // Set a temporary flag to force the tutorial
        localStorage.setItem(tutorial.storageKey, 'true');

        // If we are already on the target path, we need to "trick" the provider
        // into re-running its effect. A query param change is enough since they use usePathname()
        if (pathname === tutorial.path) {
            router.push(`${tutorial.path}?replay=${Date.now()}`);
        } else {
            router.push(tutorial.path);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <PlayCircle className="h-5 w-5 text-primary" />
                    Repetir Tutoriales
                </CardTitle>
                <CardDescription>
                    ¿Necesitas repasar alguna sección? Volvé a ver los tutoriales interactivos en cualquier momento.
                    Ver un tutorial de nuevo no afectará tu estado de progreso actual.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {TUTORIALS.map((tutorial) => (
                        <div
                            key={tutorial.id}
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors group"
                        >
                            <span className="text-sm font-medium">{tutorial.name}</span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleReplay(tutorial)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <PlayCircle className="h-4 w-4 mr-1" />
                                Iniciar
                            </Button>
                        </div>
                    ))}
                </div>
                <div className="mt-4 flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-400">
                    <Info className="h-4 w-4 shrink-0" />
                    <p>
                        Para volver a ver el tutorial de un <strong>documento individual</strong>, simplemente abrí cualquier documento y, si no lo has visto antes, aparecerá automáticamente. Los tutoriales generales se pueden activar desde aquí.
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}
