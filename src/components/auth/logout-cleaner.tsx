'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Componente que limpia el localStorage cuando se detecta logout=true
 * Agregar en app/auth/login/page.tsx
 */
export function LogoutCleanup() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const isLogout = searchParams.get('logout');
    
    if (isLogout === 'true') {
      console.log('🧹 [LogoutCleanup] Limpiando localStorage...');
      
      // Limpiar SOLO las keys relacionadas con el app
      const keysToRemove = [
        'selectedCompanyIds',
        'lastSelectedCompanyIds',
        'userPreferences',
        'dashboardFilters',
        'companyCache',
        // Agregar más keys si es necesario
      ];

      keysToRemove.forEach(key => {
        try {
          localStorage.removeItem(key);
          console.log(`✅ [LogoutCleanup] Eliminado: ${key}`);
        } catch (error) {
          console.error(`❌ [LogoutCleanup] Error eliminando ${key}:`, error);
        }
      });

      console.log('✅ [LogoutCleanup] localStorage limpiado correctamente');
      
      // Limpiar el query param sin recargar
      window.history.replaceState({}, '', '/auth/login');
    }
  }, [searchParams]);

  return null; // No renderiza nada
}