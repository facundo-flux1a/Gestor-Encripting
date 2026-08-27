'use client';

import * as React from 'react';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface DemoModeContextType {
  isDemoMode: boolean;
  setIsDemoMode: (active: boolean) => void;
  toggleDemoMode: () => void;
}

const DemoModeContext = createContext<DemoModeContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'gestor_demo_mode_active';

export function DemoModeProvider({ children }: { children: ReactNode }) {
  // Default to true for presentation video requirements
  const [isDemoMode, setIsDemoModeState] = useState<boolean>(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored === 'false') {
        setIsDemoModeState(false);
      } else {
        // Default to true if not explicitly disabled
        setIsDemoModeState(true);
        localStorage.setItem(LOCAL_STORAGE_KEY, 'true');
      }
    } catch (e) {
      console.warn('⚠️ [DemoModeProvider] LocalStorage read failed:', e);
    }
  }, []);

  const setIsDemoMode = (active: boolean) => {
    setIsDemoModeState(active);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, active ? 'true' : 'false');
    } catch (e) {
      console.warn('⚠️ [DemoModeProvider] LocalStorage write failed:', e);
    }
  };

  const toggleDemoMode = () => {
    setIsDemoMode(!isDemoMode);
  };

  return (
    <DemoModeContext.Provider value={{ isDemoMode, setIsDemoMode, toggleDemoMode }}>
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode() {
  const context = useContext(DemoModeContext);
  if (!context) {
    throw new Error('useDemoMode must be used within DemoModeProvider');
  }
  return context;
}
