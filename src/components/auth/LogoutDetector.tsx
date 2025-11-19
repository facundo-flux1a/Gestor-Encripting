'use client';

import { useEffect } from 'react';
import { clearUploadStorage } from '@/components/upload/upload-progress-card';
import { useSearchParams } from 'next/navigation';

/**
 * Componente que detecta cuando el usuario cerró sesión y limpia el localStorage
 * Debe colocarse en las páginas de login/register
 */
export function LogoutDetector() {
  const searchParams = useSearchParams();
  
  useEffect(() => {
    // Si viene del logout, limpiar storage
    if (searchParams.get('logout') === 'true') {
      console.log('🧹 [LogoutDetector] Detectado logout, limpiando storage');
      clearUploadStorage();
      
      // Limpiar el query param de la URL sin recargar
      if (window.history.replaceState) {
        const url = new URL(window.location.href);
        url.searchParams.delete('logout');
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [searchParams]);
  
  return null; // No renderiza nada
}