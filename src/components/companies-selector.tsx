'use client';

import * as React from 'react';
import { useCompanyContext } from '@/context/CompanyProvider'; 
import { Plus, ChevronDown } from 'lucide-react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from './ui/skeleton';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type Company = {
  id: number;
  name: string;
  nombreFiscal?: string | null;
  cif?: string;
};

export function CompaniesSelector() {
  const { 
    selectedCompanyIds, 
    setSelectedCompanyIds,
    toggleCompanyId,
    isLoading, 
    setIsLoading,
    companies,
    setCompanies
  } = useCompanyContext(); 

  const [availableCompanies, setAvailableCompanies] = React.useState<Company[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
  
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
        setCompanies(data); // ⬅️ ACTUALIZAR EL CONTEXTO TAMBIÉN
        
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        console.error("Error al hacer fetch en el selector:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchCompanies();
  }, [setIsLoading, setCompanies]); 

  const handleToggleCompany = (companyId: number) => {
    toggleCompanyId(companyId);
    console.log('Empresa toggled:', companyId);
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newCompanyName.trim() || !newCompanyCif.trim()) {
      setError('El nombre de la empresa y el CIF son obligatorios');
      return;
    }
    
    try {
      setIsCreating(true);
      setError(null);
      
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
      
      const responseText = await response.text();
      
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
      } catch {
        throw new Error('La respuesta del servidor no es JSON válido');
      }
      
      let newCompany: Company;
      
      if (result.success && result.company) {
        newCompany = result.company;
      } else if (result.id && result.name) {
        newCompany = result;
      } else {
        throw new Error('El servidor devolvió un formato de respuesta inesperado');
      }
      
      if (!newCompany.id || !newCompany.name) {
        throw new Error('La empresa creada no tiene todos los campos requeridos');
      }
      
      setAvailableCompanies(prev => [...prev, newCompany]);
      setCompanies(prev => [...prev, newCompany]); // ⬅️ ACTUALIZAR EL CONTEXTO TAMBIÉN
      setSelectedCompanyIds([...selectedCompanyIds, newCompany.id]);
      
      setNewCompanyName('');
      setNewCompanyNombreFiscal('');
      setNewCompanyCif('');
      setIsDialogOpen(false);
      
      console.log('✅ [CompaniesSelector] Empresa creada y agregada al contexto:', newCompany);
      
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

  const selectedCompaniesNames = availableCompanies
    .filter(c => selectedCompanyIds.includes(c.id))
    .map(c => c.name)
    .join(', ');

  // Si hay 5 o menos empresas, mostrar checkboxes
  if (availableCompanies.length <= 5) {
    return (
      <div className="p-2 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium leading-none">
            Empresas ({selectedCompanyIds.length} {selectedCompanyIds.length === 1 ? 'seleccionada' : 'seleccionadas'})
          </label>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 px-2">
                <Plus className="h-4 w-4 mr-1" />
                Nueva
              </Button>
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
                  <Label htmlFor="company-fiscal">Nombre Fiscal (opcional)</Label>
                  <Input
                    id="company-fiscal"
                    type="text"
                    placeholder="Ingresa el nombre fiscal"
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
        </div>
        
        <div className="space-y-2 border rounded-md p-3">
          {availableCompanies.map(company => (
            <div
              key={company.id}
              className="flex items-center space-x-2 hover:bg-accent rounded-md p-2 cursor-pointer transition-colors"
              onClick={() => handleToggleCompany(company.id)}
            >
              <Checkbox
                id={`company-${company.id}`}
                checked={selectedCompanyIds.includes(company.id)}
                onCheckedChange={() => handleToggleCompany(company.id)}
              />
              <label
                htmlFor={`company-${company.id}`}
                className="text-sm font-medium leading-none cursor-pointer flex-1"
              >
                {company.name}
              </label>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Si hay más de 5 empresas, mostrar un Popover con checkboxes
  return (
    <div className="p-2 space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium leading-none">
          Empresas ({selectedCompanyIds.length} {selectedCompanyIds.length === 1 ? 'seleccionada' : 'seleccionadas'})
        </label>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 px-2">
              <Plus className="h-4 w-4 mr-1" />
              Nueva
            </Button>
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
                <Label htmlFor="company-fiscal">Nombre Fiscal (opcional)</Label>
                <Input
                  id="company-fiscal"
                  type="text"
                  placeholder="Ingresa el nombre fiscal"
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
      </div>

      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={isPopoverOpen}
            className="w-full justify-between"
          >
            <span className="truncate">
              {selectedCompanyIds.length === 0
                ? 'Selecciona empresas...'
                : selectedCompanyIds.length === availableCompanies.length
                ? 'Todas las empresas'
                : `${selectedCompanyIds.length} ${selectedCompanyIds.length === 1 ? 'empresa seleccionada' : 'empresas seleccionadas'}`}
            </span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <div className="max-h-[300px] overflow-y-auto p-2">
            <div className="space-y-1">
              {availableCompanies.map(company => (
                <div
                  key={company.id}
                  className="flex items-center space-x-2 hover:bg-accent rounded-md p-2 cursor-pointer transition-colors"
                  onClick={() => handleToggleCompany(company.id)}
                >
                  <Checkbox
                    id={`company-dropdown-${company.id}`}
                    checked={selectedCompanyIds.includes(company.id)}
                    onCheckedChange={() => handleToggleCompany(company.id)}
                  />
                  <label
                    htmlFor={`company-dropdown-${company.id}`}
                    className="text-sm font-medium leading-none cursor-pointer flex-1"
                  >
                    {company.name}
                  </label>
                </div>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}