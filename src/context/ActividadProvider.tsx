'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type ActividadContextType = {
  shouldShowTutorial: boolean;
  isLoading: boolean;
  markAsCompleted: () => Promise<void>;
};

const ActividadContext = createContext<ActividadContextType | undefined>(undefined);

const STORAGE_KEY = 'actividad_tutorial_completed';

export const ActividadProvider = ({ children }: { children: ReactNode }) => {
  const [shouldShowTutorial, setShouldShowTutorial] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkTutorialStatus() {
      try {
        setIsLoading(true);

        console.log('📊 [ActividadProvider] Iniciando verificación de tutorial');

        // 1. Logear valor de localStorage
        if (typeof window !== 'undefined') {
          const localCompleted = localStorage.getItem(STORAGE_KEY);
          console.log('🔍 [ActividadProvider] Valor en localStorage:', localCompleted);
        }

        // 2. Verificar con el servidor
        const response = await fetch('/api/user/tutorial-actividad');

        if (response.ok) {
          const data = await response.json();
          console.log('📊 [ActividadProvider] Respuesta servidor:', data);

          const showTutorial = data.tutorial === true;
          console.log('📊 [ActividadProvider] shouldShowTutorial:', showTutorial);

          setShouldShowTutorial(showTutorial);

          // Si ya está completado en servidor, guardar en localStorage
          if (!showTutorial && typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, 'true');
            console.log('💾 [ActividadProvider] Guardado en localStorage (ya completado)');
          }
        } else {
          console.error('❌ [ActividadProvider] Error en respuesta:', response.status);
          setShouldShowTutorial(false);
        }
      } catch (error) {
        console.error('❌ [ActividadProvider] Error:', error);
        setShouldShowTutorial(false);
      } finally {
        setIsLoading(false);
        console.log('📊 [ActividadProvider] Verificación completada');
      }
    }

    checkTutorialStatus();
  }, []);

  const markAsCompleted = async () => {
    try {
      console.log('✅ [ActividadProvider] Marcando tutorial como completado');

      // 1. Marcar en localStorage inmediatamente
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, 'true');
        console.log('💾 [ActividadProvider] Guardado en localStorage');
      }

      // 2. Actualizar estado local
      setShouldShowTutorial(false);

      // 3. Enviar al servidor
      const response = await fetch('/api/user/tutorial-actividad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        console.log('✅ [ActividadProvider] Tutorial completado en servidor');
      } else {
        console.error('❌ [ActividadProvider] Error al completar en servidor:', response.status);
      }
    } catch (error) {
      console.error('❌ [ActividadProvider] Error:', error);
    }
  };

  return (
    <ActividadContext.Provider
      value={{
        shouldShowTutorial,
        isLoading,
        markAsCompleted
      }}
    >
      {children}
    </ActividadContext.Provider>
  );
};

export const useActividad = () => {
  const context = useContext(ActividadContext);
  if (context === undefined) {
    throw new Error('useActividad debe ser usado dentro de un ActividadProvider');
  }
  return context;
};