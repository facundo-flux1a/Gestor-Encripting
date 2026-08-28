'use client';

import * as React from 'react';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface DemoModeContextType {
  isDemoMode: boolean;
  setIsDemoMode: (active: boolean) => void;
  toggleDemoMode: () => void;
}

const DemoModeContext = createContext<DemoModeContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'gestor_demo_mode_v2';

export function DemoModeProvider({ children }: { children: ReactNode }) {
  // Demo mode is completely disabled — strictly real database data
  const [isDemoMode] = useState<boolean>(false);

  useEffect(() => {
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      localStorage.removeItem('gestor_demo_mode');
    } catch (e) {
      // ignore
    }
  }, []);

  const setIsDemoMode = () => {};
  const toggleDemoMode = () => {};

  return (
    <DemoModeContext.Provider value={{ isDemoMode: false, setIsDemoMode, toggleDemoMode }}>
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
