'use client';
import { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback, ReactNode } from 'react';
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

  // Debounce ref for saving selection to Redis
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Save selection to Redis (debounced 600ms) ────────────────────────────
  const saveSelectionToRedis = useCallback((ids: number[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await fetch('/api/user/selected-companies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids }),
        });
        console.log('💾 [CompanyProvider] Selección guardada en Redis:', ids);
      } catch (err) {
        console.warn('⚠️ [CompanyProvider] No se pudo guardar selección en Redis:', err);
      }
    }, 600);
  }, []);

  // ─── Load companies + restore saved selection ────────────────────────────
  useEffect(() => {
    async function loadCompanies() {
      try {
        setIsLoading(true);

        // Fetch companies and saved selection in parallel
        const [companiesRes, selectionRes] = await Promise.all([
          fetch('/api/companies'),
          fetch('/api/user/selected-companies'),
        ]);

        if (!companiesRes.ok) {
          if (companiesRes.status === 401 || companiesRes.status === 403) {
            // If it fails with Auth error, don't crash, let layout handle logout
            return;
          }
          throw new Error('Error al cargar empresas');
        }

        const data: Company[] = await companiesRes.json();
        const selectionData = selectionRes.ok ? await selectionRes.json() : { ids: [] };

        setCompanies(data);

        // Restore only valid IDs (prevents stale IDs from a different account or removed company)
        const validIds = data.map((c) => c.id);
        const restoredIds = (selectionData.ids as number[]).filter((id) =>
          validIds.includes(id)
        );

        setSelectedCompanyIds((prev) => {
          // Only update if the length changed or arrays mismatch to prevent constant re-renders
          if (prev.length !== restoredIds.length || prev.some(id => !restoredIds.includes(id))) {
            return restoredIds;
          }
          return prev;
        });
      } catch (error) {
        console.error('❌ [CompanyProvider] Error loading companies:', error);
        // Only wipe on critical hard error, maybe keep old state if it's intermittent failure
      } finally {
        setIsLoading(false);
      }
    }

    // Initial load
    loadCompanies();
  }, []);

  // ─── Toggle + save ────────────────────────────────────────────────────────
  const toggleCompanyId = useCallback((id: number) => {
    setSelectedCompanyIds((prev) => {
      const validCompanyIds = companies.map((c) => c.id);

      if (!validCompanyIds.includes(id)) {
        console.warn('⚠️ [CompanyProvider] Intento de toggle con ID inválido:', id);
        return prev;
      }

      const newSelection = prev.includes(id)
        ? prev.filter((companyId) => companyId !== id)
        : [...prev, id];

      console.log('🔄 [CompanyProvider] Toggle empresa', id, '- Nueva selección:', newSelection);

      // Persist asynchronously (debounced)
      saveSelectionToRedis(newSelection);

      return newSelection;
    });
  }, [companies, saveSelectionToRedis]);

  // ─── Validate selectedCompanyIds when companies reload ───────────────────
  useEffect(() => {
    if (companies.length > 0 && selectedCompanyIds.length > 0) {
      const validIds = companies.map((c) => c.id);
      const invalidIds = selectedCompanyIds.filter((id) => !validIds.includes(id));

      if (invalidIds.length > 0) {
        console.warn('🚨 [CompanyProvider] IDs inválidos detectados y limpiados:', invalidIds);
        const validSelection = selectedCompanyIds.filter((id) => validIds.includes(id));
        setSelectedCompanyIds(validSelection);
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
  }), [companies, selectedCompanyIds, isLoading, toggleCompanyId]);



  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
};

export const useCompanyContext = () => {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error('useCompanyContext debe ser usado dentro de un CompanyProvider');
  }
  return context;
};
