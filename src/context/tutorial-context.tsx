'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type TutorialContextType = {
  shouldShowTutorial: boolean;
  isLoading: boolean;
  isTutorialActive: boolean;
  currentStep: number;
  setIsTutorialActive: (active: boolean) => void;
  setCurrentStep: (step: number) => void;
  completeTutorial: () => Promise<void>;
  skipTutorial: () => Promise<void>;
  lowerTutorialZIndex: () => void;  // ⬅️ NUEVO
  raiseTutorialZIndex: () => void;  // ⬅️ NUEVO
};

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

const STORAGE_KEY = 'tutorial_state';

type TutorialState = {
  isActive: boolean;
  currentStep: number;
};

export const TutorialProvider = ({ children }: { children: ReactNode }) => {
  const [shouldShowTutorial, setShouldShowTutorial] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isTutorialActive, setIsTutorialActiveState] = useState(false);
  const [currentStep, setCurrentStepState] = useState(0);

  // ✅ Cargar estado del tutorial desde localStorage al iniciar
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const state: TutorialState = JSON.parse(stored);
        console.log('📚 [TutorialProvider] Estado cargado de localStorage:', state);
        setIsTutorialActiveState(state.isActive);
        setCurrentStepState(state.currentStep);
      }
    } catch (error) {
      console.error('❌ [TutorialProvider] Error cargando estado:', error);
    }
  }, []);

  // ✅ Guardar estado en localStorage cada vez que cambia
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const state: TutorialState = {
      isActive: isTutorialActive,
      currentStep: currentStep,
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      console.log('💾 [TutorialProvider] Estado guardado:', state);
    } catch (error) {
      console.error('❌ [TutorialProvider] Error guardando estado:', error);
    }
  }, [isTutorialActive, currentStep]);

  useEffect(() => {
    async function checkTutorialStatus() {
      try {
        setIsLoading(true);
        
        // ✅ CRÍTICO: Verificar cookie PRIMERO, antes de la API
        if (typeof document !== 'undefined') {
          const cookies = document.cookie.split(';');
          const newUserCookie = cookies.find(c => c.trim().startsWith('new_user='));
          const isNewUser = newUserCookie?.includes('true');
          
          console.log('🔍 [TutorialProvider] Verificando nuevo usuario (cookie):', { 
            isNewUser, 
            allCookies: document.cookie 
          });
          
          if (isNewUser) {
            console.log('👶 [TutorialProvider] Usuario nuevo detectado via cookie - mostrando tutorial');
            setShouldShowTutorial(true);
            setIsLoading(false);
            
            // Borrar la cookie
            document.cookie = 'new_user=; path=/; max-age=0';
            return;
          }
        }
        
        const response = await fetch('/api/user/tutorial');
        
        if (response.ok) {
          const data = await response.json();
          console.log('📚 [TutorialProvider] RESPUESTA COMPLETA:', data);
          console.log('📚 [TutorialProvider] data.tutorial:', data.tutorial);
          console.log('📚 [TutorialProvider] Tipo:', typeof data.tutorial);
          
          const showTutorial = Boolean(data.tutorial);
          setShouldShowTutorial(showTutorial);
          console.log('📚 [TutorialProvider] shouldShowTutorial final:', showTutorial);
        }
      } catch (error) {
        console.error('❌ [TutorialProvider] Error obteniendo estado:', error);
        setShouldShowTutorial(false);
      } finally {
        setIsLoading(false);
      }
    }
    
    checkTutorialStatus();
  }, []);

  const setIsTutorialActive = (active: boolean) => {
    console.log('🎯 [TutorialProvider] setIsTutorialActive:', active);
    setIsTutorialActiveState(active);
    
    // Si se desactiva, limpiar localStorage
    if (!active && typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
      console.log('🗑️ [TutorialProvider] Estado limpiado de localStorage');
    }
  };

  const setCurrentStep = (step: number) => {
    console.log('📍 [TutorialProvider] setCurrentStep:', step);
    setCurrentStepState(step);
  };

  // ⬇️ NUEVO: Bajar z-index del tutorial
  const lowerTutorialZIndex = () => {
    if (typeof window === 'undefined') return;
    
    console.log('🔽 [TutorialProvider] Bajando z-index del tutorial');
    
    const driverPopover = document.querySelector('.driver-popover');
    const driverPopoverWrapper = document.querySelector('.driver-popover-wrapper');
    
    if (driverPopover) {
      (driverPopover as HTMLElement).style.zIndex = '50';
    }
    if (driverPopoverWrapper) {
      (driverPopoverWrapper as HTMLElement).style.zIndex = '50';
    }
  };

  // ⬆️ NUEVO: Subir z-index del tutorial
  const raiseTutorialZIndex = () => {
    if (typeof window === 'undefined') return;
    
    console.log('🔼 [TutorialProvider] Subiendo z-index del tutorial');
    
    const driverPopover = document.querySelector('.driver-popover');
    const driverPopoverWrapper = document.querySelector('.driver-popover-wrapper');
    
    if (driverPopover) {
      (driverPopover as HTMLElement).style.zIndex = '10002';
    }
    if (driverPopoverWrapper) {
      (driverPopoverWrapper as HTMLElement).style.zIndex = '10002';
    }
  };

  const completeTutorial = async () => {
    try {
      const response = await fetch('/api/user/tutorial', {
        method: 'POST',
      });
      
      if (response.ok) {
        setShouldShowTutorial(false);
        setIsTutorialActive(false);
        setCurrentStep(0);
        
        if (typeof window !== 'undefined') {
          localStorage.removeItem(STORAGE_KEY);
        }
        
        console.log('✅ [TutorialProvider] Tutorial completado');
      }
    } catch (error) {
      console.error('❌ [TutorialProvider] Error completando tutorial:', error);
    }
  };

  const skipTutorial = async () => {
    await completeTutorial();
  };

  return (
    <TutorialContext.Provider 
      value={{ 
        shouldShowTutorial, 
        isLoading, 
        isTutorialActive,
        currentStep,
        setIsTutorialActive,
        setCurrentStep,
        completeTutorial,
        skipTutorial,
        lowerTutorialZIndex,  // ⬅️ NUEVO
        raiseTutorialZIndex   // ⬅️ NUEVO
      }}
    >
      {children}
    </TutorialContext.Provider>
  );
};

export const useTutorial = () => {
  const context = useContext(TutorialContext);
  if (context === undefined) {
    throw new Error('useTutorial debe ser usado dentro de un TutorialProvider');
  }
  return context;
};