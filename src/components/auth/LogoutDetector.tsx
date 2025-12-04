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
      console.log('🧹 [LogoutDetector] Detectado logout, limpiando storage completo');
      
      // 1. Limpiar uploads
      clearUploadStorage();
      
      // 2. ✅ NUEVO: Limpiar TODOS los datos de sesión del usuario
      const keysToRemove = [
        'selectedCompanyIds',
        'lastSelectedCompanyIds',
        'userPreferences',
        'dashboardFilters',
        'companyCache',
        'documentFilters',
        'incidentFilters',
        'providerFilters',
        'lastViewedDocument',
        'lastViewedProvider',
        'tabState',
        'sortPreferences',
        'columnPreferences',
        // Agregar aquí cualquier otra key que uses en tu app
      ];

      keysToRemove.forEach(key => {
        try {
          const removed = localStorage.getItem(key);
          if (removed) {
            localStorage.removeItem(key);
            console.log(`  ✅ Eliminado: ${key}`);
          }
        } catch (error) {
          console.error(`  ❌ Error eliminando ${key}:`, error);
        }
      });
      
      // 3. ✅ OPCIONAL: Limpiar sessionStorage también
      try {
        sessionStorage.clear();
        console.log('  ✅ sessionStorage limpiado');
      } catch (error) {
        console.error('  ❌ Error limpiando sessionStorage:', error);
      }

      console.log('✅ [LogoutDetector] Limpieza completa finalizada');
      
      // 4. Limpiar el query param de la URL sin recargar
      if (window.history.replaceState) {
        const url = new URL(window.location.href);
        url.searchParams.delete('logout');
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [searchParams]);
  
  return null; // No renderiza nada
}