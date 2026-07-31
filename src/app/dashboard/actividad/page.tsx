'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * Ruta deprecada: /dashboard/actividad
 * La actividad ahora se gestiona desde la Cola de Subidas (sidebar).
 * Redirigimos al dashboard para no dejar páginas huérfanas.
 */
export default function ActividadPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">Redirigiendo...</span>
    </div>
  );
}