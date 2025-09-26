'use client';
import { createContext, useContext, useState, useMemo, ReactNode } from 'react';

// Tipos de datos
type CompanyContextType = {
  selectedCompanyId: string | null;
  setSelectedCompanyId: (id: string | null) => void;
  // Agregamos un estado de carga, por si lo necesita el Dashboard
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
};

// Crea el contexto con un valor inicial nulo
const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

// Define el componente del proveedor
export const CompanyProvider = ({ children }: { children: ReactNode }) => {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const value = useMemo(() => ({
    selectedCompanyId,
    setSelectedCompanyId,
    isLoading,
    setIsLoading,
  }), [selectedCompanyId, isLoading]);

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
};

// Hook para usar el contexto
export const useCompanyContext = () => {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error('useCompanyContext debe ser usado dentro de un CompanyProvider');
  }
  return context;
};