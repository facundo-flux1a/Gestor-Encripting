'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface DocsContextType {
  shouldShowTutorial: boolean;
  isLoading: boolean;
  hasApiKey: boolean;
  tourMode: 'prompt' | 'graphical' | 'interactive';
  setTourMode: (mode: 'prompt' | 'graphical' | 'interactive') => void;
  markAsCompleted: () => Promise<void>;
  resetTutorial: () => void;
}

const DocsContext = createContext<DocsContextType | undefined>(undefined);

export function DocsProvider({ children }: { children: ReactNode }) {
  const [shouldShowTutorial, setShouldShowTutorial] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [tourMode, setTourMode] = useState<'prompt' | 'graphical' | 'interactive'>('prompt');

  useEffect(() => {
    async function checkStatus() {
      try {
        const forceReplay = localStorage.getItem('force_tutorial_docs') === 'true';

        // Check user keys first
        let userHasKeys = false;
        try {
          const keysRes = await fetch('/api/user/api-keys');
          if (keysRes.ok) {
            const keys = await keysRes.json();
            userHasKeys = Array.isArray(keys) && keys.length > 0;
            setHasApiKey(userHasKeys);
          }
        } catch (e) {
          console.warn('Could not check user API keys:', e);
        }

        if (forceReplay) {
          setShouldShowTutorial(true);
          setTourMode(userHasKeys ? 'interactive' : 'prompt');
          setIsLoading(false);
          return;
        }

        const res = await fetch('/api/user/tutorial-docs');
        if (res.ok) {
          const data = await res.json();
          const show = Boolean(data.shouldShow);
          setShouldShowTutorial(show);
          if (show) {
            setTourMode(userHasKeys ? 'interactive' : 'prompt');
          }
        }
      } catch (err) {
        console.error('Error checking docs tutorial status:', err);
      } finally {
        setIsLoading(false);
      }
    }
    checkStatus();
  }, []);

  const markAsCompleted = async () => {
    try {
      await fetch('/api/user/tutorial-docs', { method: 'POST' });
      localStorage.removeItem('force_tutorial_docs');
      setShouldShowTutorial(false);
    } catch (err) {
      console.error('Error marking docs tutorial as completed:', err);
    }
  };

  const resetTutorial = () => {
    localStorage.setItem('force_tutorial_docs', 'true');
    setShouldShowTutorial(true);
    setTourMode(hasApiKey ? 'interactive' : 'prompt');
  };

  return (
    <DocsContext.Provider
      value={{
        shouldShowTutorial,
        isLoading,
        hasApiKey,
        tourMode,
        setTourMode,
        markAsCompleted,
        resetTutorial,
      }}
    >
      {children}
    </DocsContext.Provider>
  );
}

export function useDocsTutorial() {
  const context = useContext(DocsContext);
  if (!context) throw new Error('useDocsTutorial must be used within DocsProvider');
  return context;
}
