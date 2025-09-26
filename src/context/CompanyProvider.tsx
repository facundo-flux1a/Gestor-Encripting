'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getCompanies } from '@/services/document-service';

// Define los tipos para el contexto
type Company = {
  id: number;
  name: string;
};

type CompanyContextType = {
  companies: Company[];
  selectedCompanyId: string | null;
  setSelectedCompanyId: (id: string | null) => void;
};

// Crea el contexto con un valor inicial nulo
const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

// Define el componente del proveedor del contexto
export const CompanyProvider = ({ children }: { children: ReactNode }) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  useEffect(() => {
    // Al cargar, se obtienen las empresas de la base de datos
    getCompanies().then(companiesList => {
      const companiesData = companiesList.map(c => ({
        id: c.id,
        name: c.name,
      }));
      setCompanies(companiesData);
      // Opcional: Establecer una empresa por defecto (por ejemplo, la primera)
      if (companiesData.length > 0) {
        setSelectedCompanyId(companiesData[0].id.toString());
      }
    });
  }, []);

  const value = {
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
  };

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
};

// Hook personalizado para usar el contexto fácilmente en otros componentes
export const useCompanyContext = () => {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error('useCompanyContext debe ser usado dentro de un CompanyProvider');
  }
  return context;
};