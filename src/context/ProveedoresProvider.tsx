'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

interface ProveedoresContextType {
  shouldShowTutorial: boolean;
  isLoading: boolean;
  markAsCompleted: () => Promise<void>;
}

const ProveedoresContext = createContext<ProveedoresContextType | undefined>(undefined);

export function ProveedoresProvider({ children }: { children: React.ReactNode }) {
  const [shouldShowTutorial, setShouldShowTutorial] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;

    const checkTutorial = async () => {
      try {
        // Logear valor de localStorage
        const localCompleted = localStorage.getItem('proveedores_tutorial_completed');
        console.log('🔍 [ProveedoresProvider] Valor en localStorage:', localCompleted);

        // 📡 Si no está en localStorage, consultar servidor
        console.log('🔍 [ProveedoresProvider] Consultando estado del tutorial...');
        const response = await fetch('/api/user/tutorial-proveedores');

        if (!response.ok) {
          throw new Error('Error al obtener estado del tutorial');
        }

        const data = await response.json();
        console.log('📊 [ProveedoresProvider] Estado recibido:', data);

        setShouldShowTutorial(data.shouldShow);

        // Si ya está completado en servidor, guardarlo en localStorage
        if (!data.shouldShow) {
          localStorage.setItem('proveedores_tutorial_completed', 'true');
        }

      } catch (error) {
        console.error('❌ [ProveedoresProvider] Error:', error);
        setShouldShowTutorial(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkTutorial();
  }, []);

  const markAsCompleted = async () => {
    try {
      console.log('✅ [ProveedoresProvider] Marcando tutorial como completado...');

      // Guardar en localStorage primero (optimistic update)
      localStorage.setItem('proveedores_tutorial_completed', 'true');
      setShouldShowTutorial(false);

      // Actualizar en servidor
      const response = await fetch('/api/user/tutorial-proveedores', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Error al completar tutorial');
      }

      console.log('✅ [ProveedoresProvider] Tutorial completado exitosamente');

    } catch (error) {
      console.error('❌ [ProveedoresProvider] Error al completar:', error);
      // Rollback en caso de error
      localStorage.removeItem('proveedores_tutorial_completed');
      setShouldShowTutorial(true);
    }
  };

  return (
    <ProveedoresContext.Provider value={{ shouldShowTutorial, isLoading, markAsCompleted }}>
      {children}
    </ProveedoresContext.Provider>
  );
}

export function useProveedores() {
  const context = useContext(ProveedoresContext);
  if (context === undefined) {
    throw new Error('useProveedores must be used within a ProveedoresProvider');
  }
  return context;
}