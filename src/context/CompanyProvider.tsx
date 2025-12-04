'use client';
import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import type { Company } from '@/lib/types';

type CompanyContextType = {
  companies: Company[];
  setCompanies: (companies: Company[] | ((prev: Company[]) => Company[])) => void;
  selectedCompanyIds: number[];
  setSelectedCompanyIds: (ids: number[]) => void;
  toggleCompanyId: (id: number) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
};

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export const CompanyProvider = ({ children }: { children: ReactNode }) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadCompanies() {
      try {
        setIsLoading(true);
        const response = await fetch('/api/companies');
        if (response.ok) {
          const data = await response.json();
          
          console.log('🏢 [CompanyProvider] Empresas obtenidas del servidor:', data.length);
          
          setCompanies(data);
          
          // ✅ CRÍTICO: SIEMPRE resetear selección al cargar empresas
          // Esto evita que se mantengan IDs de otras cuentas
          setSelectedCompanyIds([]);
          
          console.log('✅ [CompanyProvider] selectedCompanyIds reseteado a []');
        }
      } catch (error) {
        console.error('❌ [CompanyProvider] Error loading companies:', error);
        // ✅ En caso de error, también resetear
        setCompanies([]);
        setSelectedCompanyIds([]);
      } finally {
        setIsLoading(false);
      }
    }
    loadCompanies();
  }, []);

  const toggleCompanyId = (id: number) => {
    setSelectedCompanyIds(prev => {
      // ✅ VALIDACIÓN: Solo permitir IDs que existan en companies
      const validCompanyIds = companies.map(c => c.id);
      
      if (!validCompanyIds.includes(id)) {
        console.warn('⚠️ [CompanyProvider] Intento de toggle con ID inválido:', id);
        console.warn('⚠️ [CompanyProvider] IDs válidos:', validCompanyIds);
        return prev; // No cambiar nada si el ID no es válido
      }
      
      const newSelection = prev.includes(id)
        ? prev.filter(companyId => companyId !== id)
        : [...prev, id];
      
      console.log('🔄 [CompanyProvider] Toggle empresa', id, '- Nueva selección:', newSelection);
      return newSelection;
    });
  };

  // ✅ NUEVO: Validar selectedCompanyIds cada vez que cambien las companies
  useEffect(() => {
    if (companies.length > 0 && selectedCompanyIds.length > 0) {
      const validCompanyIds = companies.map(c => c.id);
      const invalidIds = selectedCompanyIds.filter(id => !validCompanyIds.includes(id));
      
      if (invalidIds.length > 0) {
        console.warn('🚨 [CompanyProvider] IDs inválidos detectados:', invalidIds);
        console.warn('🚨 [CompanyProvider] Limpiando selectedCompanyIds...');
        
        // Filtrar solo IDs válidos
        const validSelection = selectedCompanyIds.filter(id => validCompanyIds.includes(id));
        setSelectedCompanyIds(validSelection);
        
        console.log('✅ [CompanyProvider] selectedCompanyIds limpiado:', validSelection);
      }
    }
  }, [companies, selectedCompanyIds]);

  const value = useMemo(() => ({
    companies,
    setCompanies,
    selectedCompanyIds,
    setSelectedCompanyIds,
    toggleCompanyId,
    isLoading,
    setIsLoading,
  }), [companies, selectedCompanyIds, isLoading]);

  console.log('🏢 [CompanyProvider] Companies:', companies.length, 'Selected:', selectedCompanyIds);

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
};

export const useCompanyContext = () => {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error('useCompanyContext debe ser usado dentro de un CompanyProvider');
  }
  return context;
};