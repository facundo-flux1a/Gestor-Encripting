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
          className="w-full justify-between"
          data-tutorial="company-selector"
        >
          {selectedCompanyIds.length === 0
            ? 'Seleccionar empresas'
            : selectedCompanyIds.length === companies.length
              ? 'Todas las empresas'
              : `${selectedCompanyIds.length} seleccionada(s)`}
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
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