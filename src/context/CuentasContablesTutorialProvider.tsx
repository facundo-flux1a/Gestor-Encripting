'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface CuentasContablesContextType {
  shouldShowTutorial: boolean;
  isLoading: boolean;
  markAsCompleted: () => Promise<void>;
  resetTutorial: () => void;
}

const CuentasContablesContext = createContext<CuentasContablesContextType | undefined>(undefined);

export function CuentasContablesTutorialProvider({ children }: { children: ReactNode }) {
  const [shouldShowTutorial, setShouldShowTutorial] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkStatus() {
      try {
        const forceReplay = typeof window !== 'undefined' && localStorage.getItem('force_tutorial_cuentas_contables') === 'true';
        if (forceReplay) {
          setShouldShowTutorial(true);
          setIsLoading(false);
          return;
        }

        const res = await fetch('/api/user/tutorial-cuentas-contables');
        if (res.ok) {
          const data = await res.json();
          setShouldShowTutorial(Boolean(data.shouldShow));
        }
      } catch (err) {
        console.error('Error checking cuentas-contables tutorial status:', err);
      } finally {
        setIsLoading(false);
      }
    }
    checkStatus();
  }, []);

  const markAsCompleted = useCallback(async () => {
    try {
      await fetch('/api/user/tutorial-cuentas-contables', { method: 'POST' });
      if (typeof window !== 'undefined') {
        localStorage.removeItem('force_tutorial_cuentas_contables');
      }
      setShouldShowTutorial(false);
    } catch (err) {
      console.error('Error marking cuentas-contables tutorial as completed:', err);
    }
  }, []);

  const resetTutorial = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('force_tutorial_cuentas_contables', 'true');
    }
    setShouldShowTutorial(true);
  }, []);

  return (
    <CuentasContablesContext.Provider value={{ shouldShowTutorial, isLoading, markAsCompleted, resetTutorial }}>
      {children}
    </CuentasContablesContext.Provider>
  );
}

export function useCuentasContablesTutorial() {
  const context = useContext(CuentasContablesContext);
  if (!context) throw new Error('useCuentasContablesTutorial must be used within CuentasContablesTutorialProvider');
  return context;
}
