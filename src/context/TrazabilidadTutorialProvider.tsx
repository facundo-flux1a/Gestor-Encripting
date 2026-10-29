'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface TrazabilidadTutorialContextType {
  shouldShowTutorial: boolean;
  isLoading: boolean;
  markAsCompleted: () => Promise<void>;
  resetTutorial: () => void;
}

const TrazabilidadTutorialContext = createContext<TrazabilidadTutorialContextType | undefined>(undefined);

export function TrazabilidadTutorialProvider({ children }: { children: ReactNode }) {
  const [shouldShowTutorial, setShouldShowTutorial] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkStatus() {
      try {
        const forceReplay = localStorage.getItem('force_tutorial_trazabilidad') === 'true';
        if (forceReplay) {
          setShouldShowTutorial(true);
          setIsLoading(false);
          return;
        }

        const res = await fetch('/api/user/tutorial-trazabilidad');
        if (res.ok) {
          const data = await res.json();
          setShouldShowTutorial(Boolean(data.shouldShow));
        }
      } catch (err) {
        console.error('Error checking trazabilidad tutorial status:', err);
      } finally {
        setIsLoading(false);
      }
    }
    checkStatus();
  }, []);

  const markAsCompleted = async () => {
    try {
      await fetch('/api/user/tutorial-trazabilidad', { method: 'POST' });
      if (typeof window !== 'undefined') {
        localStorage.removeItem('force_tutorial_trazabilidad');
      }
      setShouldShowTutorial(false);
    } catch (err) {
      console.error('Error marking trazabilidad tutorial as completed:', err);
    }
  };

  const resetTutorial = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('force_tutorial_trazabilidad', 'true');
    }
    setShouldShowTutorial(true);
  };

  return (
    <TrazabilidadTutorialContext.Provider value={{ shouldShowTutorial, isLoading, markAsCompleted, resetTutorial }}>
      {children}
    </TrazabilidadTutorialContext.Provider>
  );
}

export function useTrazabilidadTutorial() {
  const context = useContext(TrazabilidadTutorialContext);
  if (!context) throw new Error('useTrazabilidadTutorial must be used within TrazabilidadTutorialProvider');
  return context;
}
