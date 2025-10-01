'use client';

import * as React from 'react';
import { useCompanyContext } from '@/context/CompanyProvider'; 
import { Plus } from 'lucide-react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from './ui/skeleton';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Tipo actualizado: nombreFiscal es opcional
type Company = {
  id: number;
  name: string;
  nombreFiscal?: string | null;
  cif: string;
};

export function CompaniesSelector() {
  const { 
    selectedCompanyId, 
    setSelectedCompanyId, 
    isLoading, 
    setIsLoading 
  } = useCompanyContext(); 

  const [availableCompanies, setAvailableCompanies] = React.useState<Company[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [newCompanyName, setNewCompanyName] = React.useState('');
  const [newCompanyNombreFiscal, setNewCompanyNombreFiscal] = React.useState('');
  const [newCompanyCif, setNewCompanyCif] = React.useState('');
  const [isCreating, setIsCreating] = React.useState(false);

  React.useEffect(() => {
    async function fetchCompanies() {
      try {
        setIsLoading(true);
        const response = await fetch('/api/companies'); 
        
        if (!response.ok) {
          throw new Error('Failed to fetch companies');
        }
        
        const data: Company[] = await response.json();
        
        setAvailableCompanies(data); 
        
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
  }, [selectedCompanyId, setSelectedCompanyId, setIsLoading]); 

  const handleValueChange = (companyId: string) => {
    setSelectedCompanyId(companyId); 
    console.log('Empresa seleccionada (Global ID):', companyId);
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validar solo los campos obligatorios
    if (!newCompanyName.trim() || !newCompanyCif.trim()) {
      setError('El nombre de la empresa y el CIF son obligatorios');
      return;
    }
    
    try {
      setIsCreating(true);
      setError(null);
      
      console.log('Creando empresa:', {
        name: newCompanyName.trim(),
        nombreFiscal: newCompanyNombreFiscal.trim() || null,
        cif: newCompanyCif.trim()
      });
      
      const response = await fetch('/api/companies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          name: newCompanyName.trim(),
          nombreFiscal: newCompanyNombreFiscal.trim() || null,
          cif: newCompanyCif.trim()
        }),
      });
      
      console.log('Response status:', response.status);
      
      const responseText = await response.text();
      console.log('Response body:', responseText);
      
      if (!response.ok) {
        let errorMessage = `Error ${response.status}: ${response.statusText}`;
        try {
          const errorData = JSON.parse(responseText);
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch {
          errorMessage = responseText || errorMessage;
        }
        throw new Error(errorMessage);
      }
      
      let result;
      try {
        result = JSON.parse(responseText);
        console.log('Parsed result:', result);
      } catch {
        throw new Error('La respuesta del servidor no es JSON válido');
      }
      
      let newCompany: Company;
      
      if (result.success && result.company) {
        newCompany = result.company;
      } else if (result.id && result.name) {
        newCompany = result;
      } else {
        console.error('Formato de respuesta inesperado:', result);
        throw new Error('El servidor devolvió un formato de respuesta inesperado');
      }
      
      // Validar solo campos obligatorios
      if (!newCompany.id || !newCompany.name || !newCompany.cif) {
        throw new Error('La empresa creada no tiene todos los campos requeridos');
      }
      
      setAvailableCompanies(prev => [...prev, newCompany]);
      setSelectedCompanyId(newCompany.id.toString());
      
      // Limpiar todos los campos del formulario
      setNewCompanyName('');
      setNewCompanyNombreFiscal('');
      setNewCompanyCif('');
      setIsDialogOpen(false);
      
      console.log('Nueva empresa creada exitosamente:', newCompany);
      
    } catch (err) {
      console.error('Error completo al crear empresa:', err);
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido al crear la empresa';
      setError(errorMessage);
    } finally {
      setIsCreating(false);
    }
  };

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
          
          {availableCompanies.length > 0 && (
            <div className="border-t border-border my-1" />
          )}
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <button className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50">
                <Plus className="mr-2 h-4 w-4" />
                Agregar nueva empresa
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Crear Nueva Empresa</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateCompany} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="company-name">Nombre de la empresa *</Label>
                  <Input
                    id="company-name"
                    type="text"
                    placeholder="Ingresa el nombre de la empresa"
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    disabled={isCreating}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company-cif">CIF *</Label>
                  <Input
                    id="company-cif"
                    type="text"
                    placeholder="Ingresa el CIF"
                    value={newCompanyCif}
                    onChange={(e) => setNewCompanyCif(e.target.value)}
                    disabled={isCreating}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company-fiscal">Nombre Fiscal (recomendado)</Label>
                  <Input
                    id="company-fiscal"
                    type="text"
                    placeholder="Ingresa el nombre fiscal (opcional)"
                    value={newCompanyNombreFiscal}
                    onChange={(e) => setNewCompanyNombreFiscal(e.target.value)}
                    disabled={isCreating}
                  />
                </div>
                {error && (
                  <div className="text-sm text-red-500">{error}</div>
                )}
                <div className="flex justify-end space-x-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => {
                      setIsDialogOpen(false);
                      setError(null);
                    }}
                    disabled={isCreating}
                  >
                    Cancelar
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={!newCompanyName.trim() || !newCompanyCif.trim() || isCreating}
                  >
                    {isCreating ? 'Creando...' : 'Crear Empresa'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </SelectContent>
      </Select>
    </div>
  );
}