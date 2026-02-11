'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface UserPreferences {
  dinamizar_actividad: boolean;
  dinamizar_incidencias: boolean;
  sin_seleccion_mostrar_todo: boolean;
}

interface PreferencesContextType {
  preferences: UserPreferences | null;
  loading: boolean;
  updatePreferences: (updates: Partial<UserPreferences>) => Promise<void>;
  refetch: () => Promise<void>;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPreferences = useCallback(async () => {
    try {
      const response = await fetch('/api/user/preferences');
      if (response.ok) {
        const data = await response.json();
        setPreferences(data);
      }
    } catch (error) {
      console.error('❌ [PreferencesContext] Error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const updatePreferences = useCallback(async (updates: Partial<UserPreferences>) => {
    try {
      const response = await fetch('/api/user/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (response.ok) {
        setPreferences(prev => prev ? { ...prev, ...updates } : null);
      } else {
        throw new Error('Error al actualizar preferencias');
      }
    } catch (error) {
      console.error('❌ [PreferencesContext] Error:', error);
      throw error;
    }
  }, []);

  const refetch = useCallback(async () => {
    setLoading(true);
    await fetchPreferences();
  }, [fetchPreferences]);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  return (
    <PreferencesContext.Provider value={{ preferences, loading, updatePreferences, refetch }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (context === undefined) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
}
