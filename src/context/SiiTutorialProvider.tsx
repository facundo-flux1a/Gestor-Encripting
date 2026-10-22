'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface SiiContextType {
  shouldShowTutorial: boolean;
  isLoading: boolean;
  markAsCompleted: () => Promise<void>;
  resetTutorial: () => void;
}

const SiiTutorialContext = createContext<SiiContextType | undefined>(undefined);

export function SiiTutorialProvider({ children }: { children: ReactNode }) {
  const [shouldShowTutorial, setShouldShowTutorial] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkStatus() {
      try {
        const forceReplay = typeof window !== 'undefined' && localStorage.getItem('force_tutorial_sii') === 'true';
        if (forceReplay) {
          setShouldShowTutorial(true);
          setIsLoading(false);
          return;
        }

        const res = await fetch('/api/user/tutorial-sii');
        if (res.ok) {
          const data = await res.json();
          setShouldShowTutorial(Boolean(data.shouldShow));
        }
      } catch (err) {
        console.error('Error checking SII tutorial status:', err);
      } finally {
        setIsLoading(false);
      }
    }
    checkStatus();
  }, []);

  const markAsCompleted = useCallback(async () => {
    try {
      await fetch('/api/user/tutorial-sii', { method: 'POST' });
      if (typeof window !== 'undefined') {
        localStorage.removeItem('force_tutorial_sii');
      }
      setShouldShowTutorial(false);
    } catch (err) {
      console.error('Error marking SII tutorial as completed:', err);
    }
  }, []);

  const resetTutorial = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('force_tutorial_sii', 'true');
    }
    setShouldShowTutorial(true);
  }, []);

  return (
    <SiiTutorialContext.Provider value={{ shouldShowTutorial, isLoading, markAsCompleted, resetTutorial }}>
      {children}
    </SiiTutorialContext.Provider>
  );
}

export function useSiiTutorial() {
  const context = useContext(SiiTutorialContext);
  if (!context) throw new Error('useSiiTutorial must be used within SiiTutorialProvider');
  return context;
}
