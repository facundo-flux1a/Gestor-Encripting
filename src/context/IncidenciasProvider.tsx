'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type IncidenciasContextType = {
  shouldShowTutorial: boolean;
  isLoading: boolean;
  markAsCompleted: () => Promise<void>;
};

const IncidenciasContext = createContext<IncidenciasContextType | undefined>(undefined);

const STORAGE_KEY = 'incidencias_tutorial_completed';

export function IncidenciasProvider({ children }: { children: ReactNode }) {
  const [shouldShowTutorial, setShouldShowTutorial] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkTutorialStatus() {
      try {
        setIsLoading(true);

        console.log('📊 [IncidenciasProvider] Iniciando verificación de tutorial');

        // Logear valor de localStorage
        if (typeof window !== 'undefined') {
          const localCompleted = localStorage.getItem(STORAGE_KEY);
          console.log('🔍 [IncidenciasProvider] Valor en localStorage:', localCompleted);
        }

        // Fallback: Check server
        console.log('🌐 [IncidenciasProvider] Consultando servidor...');
        const response = await fetch('/api/user/tutorial-incidencias');

        console.log('📡 [IncidenciasProvider] Response status:', response.status);

        if (response.ok) {
          const data = await response.json();
          console.log('📊 [IncidenciasProvider] Respuesta servidor:', data);
          console.log('📊 [IncidenciasProvider] data.tutorial:', data.tutorial);

          let showTutorial = data.tutorial === true;

          // ✅ FORCE REPLAY CHECK
          if (typeof window !== 'undefined' && localStorage.getItem('force_tutorial_incidencias') === 'true') {
            console.log('🔄 [IncidenciasProvider] Forzando tutorial por solicitud de usuario (Replay)');
            showTutorial = true;
          }

          console.log('📊 [IncidenciasProvider] shouldShowTutorial:', showTutorial);

          setShouldShowTutorial(showTutorial);

          // Cache in localStorage if already completed
          if (!showTutorial && typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, 'true');
            console.log('💾 [IncidenciasProvider] Guardado en localStorage (ya completado)');
          }
        } else {
          console.error('❌ [IncidenciasProvider] Error en respuesta:', response.status);
          setShouldShowTutorial(false);
        }
      } catch (error) {
        console.error('❌ [IncidenciasProvider] Error:', error);
        setShouldShowTutorial(false);
      } finally {
        setIsLoading(false);
        console.log('📊 [IncidenciasProvider] Verificación completada');
      }
    }

    checkTutorialStatus();
  }, []);

  const markAsCompleted = async () => {
    try {
      console.log('✅ [IncidenciasProvider] Marcando tutorial como completado');

      // Update localStorage immediately
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, 'true');
      }

      // Update server
      await fetch('/api/user/tutorial-incidencias', {
        method: 'POST',
      });

      // Clear replay flag
      if (typeof window !== 'undefined') {
        localStorage.removeItem('force_tutorial_incidencias');
      }

      setShouldShowTutorial(false);
      console.log('✅ [IncidenciasProvider] Tutorial marcado como completado');

      // ✅ REFRESH FORZADO SIEMPRE: Para limpiar el DOM/clases inyectadas por driver.js 
      if (typeof window !== 'undefined') {
        console.log('🔄 [IncidenciasProvider] Forzando recarga de página para limpiar estado de DOM');
        window.location.reload();
      }
    } catch (error) {
      console.error('❌ [IncidenciasProvider] Error al marcar como completado:', error);
    }
  };

  return (
    <IncidenciasContext.Provider value={{ shouldShowTutorial, isLoading, markAsCompleted }}>
      {children}
    </IncidenciasContext.Provider>
  );
}

export function useIncidencias() {
  const context = useContext(IncidenciasContext);
  if (context === undefined) {
    throw new Error('useIncidencias must be used within IncidenciasProvider');
  }
  return context;
}