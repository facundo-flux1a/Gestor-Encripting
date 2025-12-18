'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type IndividualContextType = {
  shouldShowTutorial: boolean;
  isLoading: boolean;
  markAsCompleted: () => Promise<void>;
};

const IndividualContext = createContext<IndividualContextType | undefined>(undefined);

const STORAGE_KEY = 'individual_tutorial_completed';

export function IndividualProvider({ children }: { children: ReactNode }) {
  const [shouldShowTutorial, setShouldShowTutorial] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkTutorialStatus() {
      try {
        setIsLoading(true);
        
        console.log('📊 [IndividualProvider] Iniciando verificación de tutorial');
        
        // Fast path: Check localStorage first
        if (typeof window !== 'undefined') {
          const localCompleted = localStorage.getItem(STORAGE_KEY);
          console.log('🔍 [IndividualProvider] localStorage value:', localCompleted);
          
          if (localCompleted === 'true') {
            console.log('📊 [IndividualProvider] Tutorial ya completado (localStorage)');
            setShouldShowTutorial(false);
            setIsLoading(false);
            return;
          }
        }
        
        // Fallback: Check server
        console.log('🌐 [IndividualProvider] Consultando servidor...');
        const response = await fetch('/api/user/tutorial-individual');
        
        console.log('📡 [IndividualProvider] Response status:', response.status);
        
        if (response.ok) {
          const data = await response.json();
          console.log('📊 [IndividualProvider] Respuesta servidor:', data);
          console.log('📊 [IndividualProvider] data.tutorial:', data.tutorial);
          
          const showTutorial = data.tutorial === true;
          console.log('📊 [IndividualProvider] shouldShowTutorial:', showTutorial);
          
          setShouldShowTutorial(showTutorial);
          
          // Cache in localStorage if already completed
          if (!showTutorial && typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, 'true');
            console.log('💾 [IndividualProvider] Guardado en localStorage (ya completado)');
          }
        } else {
          console.error('❌ [IndividualProvider] Error en respuesta:', response.status);
          setShouldShowTutorial(false);
        }
      } catch (error) {
        console.error('❌ [IndividualProvider] Error:', error);
        setShouldShowTutorial(false);
      } finally {
        setIsLoading(false);
        console.log('📊 [IndividualProvider] Verificación completada');
      }
    }
    
    checkTutorialStatus();
  }, []);

  const markAsCompleted = async () => {
    try {
      console.log('✅ [IndividualProvider] Marcando tutorial como completado');
      
      // Update localStorage immediately
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, 'true');
      }
      
      // Update server
      await fetch('/api/user/tutorial-individual', {
        method: 'POST',
      });
      
      setShouldShowTutorial(false);
      console.log('✅ [IndividualProvider] Tutorial marcado como completado');
    } catch (error) {
      console.error('❌ [IndividualProvider] Error al marcar como completado:', error);
    }
  };

  return (
    <IndividualContext.Provider value={{ shouldShowTutorial, isLoading, markAsCompleted }}>
      {children}
    </IndividualContext.Provider>
  );
}

export function useIndividual() {
  const context = useContext(IndividualContext);
  if (context === undefined) {
    throw new Error('useIndividual must be used within IndividualProvider');
  }
  return context;
}