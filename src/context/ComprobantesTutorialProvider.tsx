'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface ComprobantesContextType {
  shouldShowTutorial: boolean;
  isLoading: boolean;
  markAsCompleted: () => Promise<void>;
  resetTutorial: () => void;
}

const ComprobantesTutorialContext = createContext<ComprobantesContextType | undefined>(undefined);

export function ComprobantesTutorialProvider({ children }: { children: ReactNode }) {
  const [shouldShowTutorial, setShouldShowTutorial] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkStatus() {
      try {
        const forceReplay = typeof window !== 'undefined' && localStorage.getItem('force_tutorial_comprobantes') === 'true';
        if (forceReplay) {
          setShouldShowTutorial(true);
          setIsLoading(false);
          return;
        }

        const res = await fetch('/api/user/tutorial-comprobantes');
        if (res.ok) {
          const data = await res.json();
          setShouldShowTutorial(Boolean(data.shouldShow));
        }
      } catch (err) {
        console.error('Error checking Comprobantes tutorial status:', err);
      } finally {
        setIsLoading(false);
      }
    }
    checkStatus();
  }, []);

  const markAsCompleted = useCallback(async () => {
    try {
      await fetch('/api/user/tutorial-comprobantes', { method: 'POST' });
      if (typeof window !== 'undefined') {
        localStorage.removeItem('force_tutorial_comprobantes');
      }
      setShouldShowTutorial(false);
    } catch (err) {
      console.error('Error marking Comprobantes tutorial as completed:', err);
    }
  }, []);

  const resetTutorial = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('force_tutorial_comprobantes', 'true');
    }
    setShouldShowTutorial(true);
  }, []);

  return (
    <ComprobantesTutorialContext.Provider value={{ shouldShowTutorial, isLoading, markAsCompleted, resetTutorial }}>
      {children}
    </ComprobantesTutorialContext.Provider>
  );
}

export function useComprobantesTutorial() {
  const context = useContext(ComprobantesTutorialContext);
  if (!context) throw new Error('useComprobantesTutorial must be used within ComprobantesTutorialProvider');
  return context;
}
