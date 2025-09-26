'use client';

import * as React from 'react';
import { useCompanyContext } from '@/context/CompanyProvider'; 

// Importa los componentes de UI
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from './ui/skeleton';

// Tipos
type Company = {
  id: number;
  name: string;
};

export function CompaniesSelector() {
  // ✅ Usamos el Contexto (estado global) para MANEJAR LA SELECCIÓN y la CARGA
  const { 
    selectedCompanyId, 
    setSelectedCompanyId, 
    isLoading, 
    setIsLoading // Usamos este para el loading state
  } = useCompanyContext(); 

  // La lista de empresas SÍ se queda en el estado local, porque solo la necesita este componente.
  const [availableCompanies, setAvailableCompanies] = React.useState<Company[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function fetchCompanies() {
      try {
        setIsLoading(true);
        // La URL que ya funciona
        const response = await fetch('/api/companies'); 
        
        if (!response.ok) {
          throw new Error('Failed to fetch companies');
        }
        
        const data: Company[] = await response.json();
        
        // Guardamos la lista en el estado local del componente
        setAvailableCompanies(data); 
        
        // Establecemos la primera empresa seleccionada en el estado global si no hay ninguna.
        if (data.length > 0 && selectedCompanyId === null) {
          setSelectedCompanyId(data[0].id.toString());
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        console.error("Error al hacer fetch en el selector:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchCompanies();
  // El useEffect solo se vuelve a ejecutar si el ID de la sesión cambia.
  }, [selectedCompanyId, setSelectedCompanyId, setIsLoading]); 

  const handleValueChange = (companyId: string) => {
    // ✅ Actualiza el estado global
    setSelectedCompanyId(companyId); 
    console.log('Empresa seleccionada (Global ID):', companyId);
  };

  // El resto del código de renderizado (ya usa isLoading y selectedCompanyId)
  if (isLoading) {
    return (
      <div className="p-2 space-y-2">
         <Skeleton className="h-4 w-1/4" />
         <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (error) {
    return <div className="p-2 text-sm text-red-500">Error: {error}</div>;
  }
  
  if(availableCompanies.length === 0){
      return (
          <div className="p-2 text-sm text-muted-foreground">
              No se encontraron empresas.
          </div>
      )
  }

  return (
    <div className="p-2 space-y-2">
      <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
        Empresa
      </label>
      <Select value={selectedCompanyId || ''} onValueChange={handleValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Selecciona una empresa" />
        </SelectTrigger>
        <SelectContent>
          {availableCompanies.map(company => (
            <SelectItem key={company.id} value={company.id.toString()}>
              {company.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}