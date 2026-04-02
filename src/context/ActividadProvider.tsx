'use client';
import { createContext, useContext, useState, useEffect, ReactNode, Dispatch, SetStateAction } from 'react';

export interface ActividadFilters {
  status: string[];
  tipoDocumento: string;
  dateFrom: string;
  dateTo: string;
  searchText: string;
}

type ActividadContextType = {
  shouldShowTutorial: boolean;
  isLoading: boolean;
  markAsCompleted: () => Promise<void>;
  filters: ActividadFilters;
  setFilters: Dispatch<SetStateAction<ActividadFilters>>;
  tutorialActive: boolean;
  setTutorialMode: (active: boolean) => void;
};

const ActividadContext = createContext<ActividadContextType | undefined>(undefined);

const STORAGE_KEY = 'actividad_tutorial_completed';

export const ActividadProvider = ({ children }: { children: ReactNode }) => {
  const [shouldShowTutorial, setShouldShowTutorial] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // 🎯 Iniciamos con filtros VACÍOS por defecto (serán aplicados si NO hay tutorial)
  const [filters, setFilters] = useState<ActividadFilters>({
    status: [],
    tipoDocumento: '',
    dateFrom: '',
    dateTo: '',
    searchText: '',
  });
  const [tutorialActive, setTutorialActive] = useState(false);
  const [prevFilters, setPrevFilters] = useState<ActividadFilters | null>(null);

  const setTutorialMode = (active: boolean) => {
    setTutorialActive(active);
    if (active) {
      // Guardar y limpiar
      setPrevFilters({ ...filters });
      setFilters({
        status: [],
        tipoDocumento: '',
        dateFrom: '',
        dateTo: '',
        searchText: '',
      });
    } else if (prevFilters) {
      // Restaurar
      setFilters(prevFilters);
      setPrevFilters(null);
    }
  };

  useEffect(() => {
    async function checkTutorialStatus() {
      try {
        setIsLoading(true);

        console.log('📊 [ActividadProvider] Iniciando verificación de tutorial');

        // 1. Logear valor de localStorage
        if (typeof window !== 'undefined') {
          const localCompleted = localStorage.getItem(STORAGE_KEY);
          console.log('🔍 [ActividadProvider] Valor en localStorage:', localCompleted);
        }

        // 2. Verificar con el servidor
        const response = await fetch('/api/user/tutorial-actividad');

        if (response.ok) {
          const data = await response.json();
          console.log('📊 [ActividadProvider] Respuesta servidor:', data);

          let showTutorial = data.tutorial === true;

          // ✅ FORCE REPLAY CHECK
          if (typeof window !== 'undefined' && localStorage.getItem('force_tutorial_actividad') === 'true') {
            console.log('🔄 [ActividadProvider] Forzando tutorial por solicitud de usuario (Replay)');
            showTutorial = true;
          }

          console.log('📊 [ActividadProvider] shouldShowTutorial:', showTutorial);

          setShouldShowTutorial(showTutorial);

          // 🔥 LÓGICA DE FILTROS:
          if (showTutorial) {
            // Si hay tutorial, mantenemos filtros limpios y activamos modo tutorial
            console.log('✨ [ActividadProvider] Tutorial activo: filtros permanecen limpios');
            setTutorialActive(true);
          } else {
            // Si NO hay tutorial, aplicamos los filtros predeterminados de error
            console.log('🔍 [ActividadProvider] Sin tutorial: aplicando filtros por defecto');
            setFilters(prev => ({
              ...prev,
              status: ['fallido', 'interrumpido', 'error']
            }));
          }

          // Si ya está completado en servidor, guardar en localStorage
          if (!showTutorial && typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, 'true');
            console.log('💾 [ActividadProvider] Guardado en localStorage (ya completado)');
          }
        } else {
          console.error('❌ [ActividadProvider] Error en respuesta:', response.status);
          setShouldShowTutorial(false);
        }
      } catch (error) {
        console.error('❌ [ActividadProvider] Error:', error);
        setShouldShowTutorial(false);
      } finally {
        setIsLoading(false);
        console.log('📊 [ActividadProvider] Verificación completada');
      }
    }

    checkTutorialStatus();
  }, []);

  const markAsCompleted = async () => {
    try {
      console.log('✅ [ActividadProvider] Marcando tutorial como completado');

      // 1. Marcar en localStorage inmediatamente
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, 'true');
        console.log('💾 [ActividadProvider] Guardado en localStorage');
      }

      // 2. Actualizar estado local
      setShouldShowTutorial(false);

      // 3. Enviar al servidor
      const response = await fetch('/api/user/tutorial-actividad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        console.log('✅ [ActividadProvider] Tutorial completado en servidor');
      } else {
        console.error('❌ [ActividadProvider] Error al completar en servidor:', response.status);
      }

      // 4. Limpiar bandera de replay si existe y forzar recarga
      if (typeof window !== 'undefined') {
        localStorage.removeItem('force_tutorial_actividad');
        console.log('🔄 [ActividadProvider] Forzando recarga de página para limpiar estado de DOM');
        window.location.reload();
      }
    } catch (error) {
      console.error('❌ [ActividadProvider] Error:', error);
    }
  };

  return (
    <ActividadContext.Provider
      value={{
        shouldShowTutorial,
        isLoading,
        markAsCompleted,
        filters,
        setFilters,
        tutorialActive,
        setTutorialMode
      }}
    >
      {children}
    </ActividadContext.Provider>
  );
};

export const useActividad = () => {
  const context = useContext(ActividadContext);
  if (context === undefined) {
    throw new Error('useActividad debe ser usado dentro de un ActividadProvider');
  }
  return context;
};