'use client';

import * as React from 'react';
import { useCompanyContext } from '@/context/CompanyProvider';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

/**
 * Selector de empresas para headers (estilo popover)
 * SIEMPRE se muestra como botón con popover, sin importar el número de empresas
 * Usa el contexto global de CompanyProvider
 */
export function CompaniesHeaderSelector() {
  const {
    companies,
    selectedCompanyIds,
    toggleCompanyId,
    isLoading
  } = useCompanyContext();

  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);

  if (isLoading) {
    return (
      <Button variant="outline" disabled className="w-full justify-between">
        Cargando empresas...
      </Button>
    );
  }

  if (companies.length === 0) {
    return (
      <Button variant="outline" disabled className="w-full justify-between">
        No hay empresas
      </Button>
    );
  }

  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={isPopoverOpen}
          className="w-full max-w-[100px] xs:max-w-[120px] sm:max-w-[220px] justify-between text-xs sm:text-sm px-2 sm:px-3"
          data-tutorial="company-selector"
        >
          <span className="truncate sm:hidden">
            {selectedCompanyIds.length === 0
              ? 'Empresas'
              : selectedCompanyIds.length === companies.length
                ? 'Todas'
                : `${selectedCompanyIds.length} sel.`}
          </span>
          <span className="truncate hidden sm:inline">
            {selectedCompanyIds.length === 0
              ? 'Seleccionar empresas'
              : selectedCompanyIds.length === companies.length
                ? 'Todas las empresas'
                : `${selectedCompanyIds.length} seleccionada(s)`}
          </span>
          <ChevronDown className="ml-1 sm:ml-2 h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[300px] p-0"
        align="start"
      >
        <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
          {companies.map((company) => (
            <div key={company.id}>
              <div className="flex items-center gap-2 p-2 rounded transition-all">
                <Checkbox
                  id={`company-header-${company.id}`}
                  checked={selectedCompanyIds.includes(company.id)}
                  onCheckedChange={() => toggleCompanyId(company.id)}
                />
                <Label
                  htmlFor={`company-header-${company.id}`}
                  className="flex-1 cursor-pointer text-sm"
                >
                  {company.name}
                </Label>
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}