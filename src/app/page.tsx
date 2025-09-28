
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation'; 
import { Loader2 } from 'lucide-react';

// Este componente actúa como guardian y redirige a la página apropiada
// basándose en el estado de autenticación.
export default function RootPage() {
  const router = useRouter();
  const [isRedirecting, setIsRedirecting] = useState(true);

  useEffect(() => {
    // El middleware se encarga de toda la lógica de redirección.
    // Este componente solo muestra un loader como fallback visual.
    // Si el middleware funciona, el usuario nunca debería ver esto por mucho tiempo.
    // En un caso de error, podríamos redirigir a una página de error o login.
  }, [router]);

  // Mostrar un loader más elaborado mientras se redirige
  return (
    <div className="flex h-screen w-full items-center justify-center bg-gradient-to-br from-background to-muted">
      <div className="flex flex-col items-center space-y-4">
        <div className="relative">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="absolute inset-0 h-8 w-8 animate-ping rounded-full bg-primary/20" />
        </div>
        <div className="text-center">
          <p className="text-lg font-medium text-foreground">Cargando...</p>
          <p className="text-sm text-muted-foreground">
            Iniciando aplicación de gestión de documentos
          </p>
        </div>
      </div>
    </div>
  );
}
