
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
    const handleRedirection = async () => {
      try {
        // Aquí puedes agregar lógica de autenticación si es necesario
        // Por ejemplo, verificar si el usuario está autenticado
        
        // Simular una verificación rápida (puedes reemplazar con tu lógica real)
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // El middleware manejará la redirección, pero esto es un fallback
        router.replace('/dashboard');
      } catch (error) {
        console.error('Error durante la redirección:', error);
        // En caso de error, redirigir a una página de error o login
        router.replace('/dashboard');
      } finally {
        setIsRedirecting(false);
      }
    };

    handleRedirection();
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
          <p className="text-lg font-medium text-foreground">Redirigiendo...</p>
          <p className="text-sm text-muted-foreground">
            Cargando aplicación de gestión de documentos
          </p>
        </div>
      </div>
    </div>
  );
}
