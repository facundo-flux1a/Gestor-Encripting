'use client';
import { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback, ReactNode } from 'react';
import type { Company } from '@/lib/types';

import { useDemoMode } from './DemoModeContext';
import { DEMO_COMPANIES } from '@/lib/demo-data';

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
  const { isDemoMode } = useDemoMode();
  const [realCompanies, setCompanies] = useState<Company[]>([]);
  const [realSelectedIds, setSelectedCompanyIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Computed state considering Demo Mode
  const companies = isDemoMode ? DEMO_COMPANIES : realCompanies;
  const selectedCompanyIds = isDemoMode ? (realSelectedIds.length > 0 ? realSelectedIds.filter(id => DEMO_COMPANIES.some(c => c.id === id)) : [9991]) : realSelectedIds;

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
      const t0 = performance.now();
      try {
        setIsLoading(true);

        // Fetch companies and saved selection in parallel
        const [companiesRes, selectionRes] = await Promise.all([
          fetch('/api/companies'),
          fetch('/api/user/selected-companies'),
        ]);
        console.log(`⏱️ [PERF:client] CompanyProvider.fetch | ${Math.round(performance.now() - t0)}ms | companies=${companiesRes.status} selection=${selectionRes.status}`);

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

        const initialSelection =
          restoredIds.length > 0
            ? restoredIds
            : data.length === 1
              ? [data[0].id]
              : [];

        setSelectedCompanyIds((prev) => {
          if (
            prev.length !== initialSelection.length ||
            prev.some((id) => !initialSelection.includes(id))
          ) {
            return initialSelection;
          }
          return prev;
        });

        if (restoredIds.length === 0 && initialSelection.length === 1) {
          saveSelectionToRedis(initialSelection);
        }

        console.log(`⏱️ [PERF:client] CompanyProvider.TOTAL | ${Math.round(performance.now() - t0)}ms | companies=${data.length} selected=${initialSelection.length}`);
      } catch (error) {
        console.error('❌ [CompanyProvider] Error loading companies:', error);
        console.log(`⏱️ [PERF:client] CompanyProvider.TOTAL | ${Math.round(performance.now() - t0)}ms | error=1`);
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
