'use client';
import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import type { Company } from '@/lib/types';

type CompanyContextType = {
  companies: Company[];
  setCompanies: (companies: Company[] | ((prev: Company[]) => Company[])) => void; // ⬅️ NUEVO
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
          setCompanies(data);
          setSelectedCompanyIds([]);
        }
      } catch (error) {
        console.error('Error loading companies:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadCompanies();
  }, []);

  const toggleCompanyId = (id: number) => {
    setSelectedCompanyIds(prev => {
      const newSelection = prev.includes(id)
        ? prev.filter(companyId => companyId !== id)
        : [...prev, id];
      
      console.log('🔄 [CompanyProvider] Toggle empresa', id, '- Nueva selección:', newSelection);
      return newSelection;
    });
  };

  const value = useMemo(() => ({
    companies,
    setCompanies, // ⬅️ NUEVO
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