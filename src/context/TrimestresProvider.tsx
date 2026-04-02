'use client';
import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { usePathname } from 'next/navigation';

type TrimestresContextType = {
  shouldShowTutorial: boolean;
  isTutorialActive: boolean;
  currentStep: number;
  isLoading: boolean;
  mostrarVacios: boolean;
  setMostrarVacios: (show: boolean) => void;
  setTutorialState: (active: boolean, step: number) => void;
  markAsCompleted: () => Promise<void>;
};

const TrimestresContext = createContext<TrimestresContextType | undefined>(undefined);

const STORAGE_KEY = 'trimestres_tutorial_completed';

export const TrimestresProvider = ({ children }: { children: ReactNode }) => {
  const [shouldShowTutorial, setShouldShowTutorial] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    async function checkTutorialStatus() {
      try {
        setIsLoading(true);

        console.log('📚 [TrimestresProvider] Iniciando verificación de tutorial. Path:', pathname);

        // 1. Logear valor de localStorage
        if (typeof window !== 'undefined') {
          const localCompleted = localStorage.getItem(STORAGE_KEY);
          console.log('🔍 [TrimestresProvider] Valor en localStorage:', localCompleted);
        }


        // 2. Verificar con el servidor
        const response = await fetch('/api/user/tutorial-trimestres');

        if (response.ok) {
          const data = await response.json();
          console.log('📚 [TrimestresProvider] Respuesta servidor:', data);

          let showTutorial = data.tutorial === true;

          // ✅ FORCE REPLAY CHECK
          if (typeof window !== 'undefined' && localStorage.getItem('force_tutorial_trimestres') === 'true') {
            console.log('🔄 [TrimestresProvider] Forzando tutorial por solicitud de usuario (Replay)');
            showTutorial = true;
          }

          console.log('📚 [TrimestresProvider] shouldShowTutorial:', showTutorial);

          setShouldShowTutorial(showTutorial);

          // Si ya está completado en servidor, guardar en localStorage
          if (!showTutorial && typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, 'true');
            console.log('💾 [TrimestresProvider] Guardado en localStorage (ya completado)');
          }
        } else {
          console.error('❌ [TrimestresProvider] Error en respuesta:', response.status);
          setShouldShowTutorial(false);
        }
      } catch (error) {
        console.error('❌ [TrimestresProvider] Error:', error);
        setShouldShowTutorial(false);
      } finally {
        setIsLoading(false);
        console.log('📚 [TrimestresProvider] Verificación completada');
      }
    }

    checkTutorialStatus();
  }, [pathname]);

  const markAsCompleted = useCallback(async () => {
    try {
      console.log('✅ [TrimestresProvider] Marcando tutorial como completado');

      // 1. Marcar en localStorage inmediatamente
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, 'true');
        console.log('💾 [TrimestresProvider] Guardado en localStorage');
      }

      // 2. Actualizar estado local
      setShouldShowTutorial(false);

      // 3. Enviar al servidor
      const response = await fetch('/api/user/tutorial-trimestres', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        console.log('✅ [TrimestresProvider] Tutorial completado en servidor');
        // Clear replay flag
        if (typeof window !== 'undefined') {
          localStorage.removeItem('force_tutorial_trimestres');
          // ✅ REFRESH FORZADO SIEMPRE: Para limpiar el DOM/clases inyectadas por driver.js 
          // y evitar que quede bloqueada la interfaz de usuario.
          console.log('🔄 [TrimestresProvider] Forzando recarga de página para limpiar estado de replay');
          window.location.reload();
        }
      } else {
        console.error('❌ [TrimestresProvider] Error al completar en servidor:', response.status);
      }
    } catch (error) {
      console.error('❌ [TrimestresProvider] Error:', error);
    }
  }, []);

  const [isTutorialActive, setIsTutorialActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [mostrarVacios, setMostrarVacios] = useState(false);

  const setTutorialState = useCallback((active: boolean, step: number) => {
    setIsTutorialActive(active);
    setCurrentStep(step);
  }, []);

  return (
    <TrimestresContext.Provider
      value={{
        shouldShowTutorial,
        isTutorialActive,
        currentStep,
        isLoading,
        mostrarVacios,
        setMostrarVacios,
        setTutorialState,
        markAsCompleted
      }}
    >
      {children}
    </TrimestresContext.Provider>
  );
};

export const useTrimestres = () => {
  const context = useContext(TrimestresContext);
  if (context === undefined) {
    throw new Error('useTrimestres debe ser usado dentro de un TrimestresProvider');
  }
  return context;
};