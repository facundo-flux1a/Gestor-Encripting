'use client';

import * as React from 'react';
import { useCompanyContext } from '@/context/CompanyProvider'; 
import { Plus } from 'lucide-react';

// Importa los componentes de UI
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from './ui/skeleton';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
    setIsLoading 
  } = useCompanyContext(); 

  // La lista de empresas SÍ se queda en el estado local, porque solo la necesita este componente.
  const [availableCompanies, setAvailableCompanies] = React.useState<Company[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  
  // Estados para el modal de agregar empresa
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [newCompanyName, setNewCompanyName] = React.useState('');
  const [isCreating, setIsCreating] = React.useState(false);

  React.useEffect(() => {
    async function fetchCompanies() {
      try {
        setIsLoading(true);
        // La URL que ya funciona
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
  }, [selectedCompanyId, setSelectedCompanyId, setIsLoading]); 

  const handleValueChange = (companyId: string) => {
    // ✅ Actualiza el estado global
    setSelectedCompanyId(companyId); 
    console.log('Empresa seleccionada (Global ID):', companyId);
  };

  // Función para crear una nueva empresa
  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newCompanyName.trim()) return;
    
    try {
      setIsCreating(true);
      setError(null); // Limpiar errores previos
      
      console.log('Creando empresa:', newCompanyName.trim());
      
      const response = await fetch('/api/companies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          name: newCompanyName.trim()
        }),
      });
      
      console.log('Response status:', response.status);
      console.log('Response headers:', response.headers);
      
      // Intentar obtener el contenido de la respuesta
      const responseText = await response.text();
      console.log('Response body:', responseText);
      
      if (!response.ok) {
        let errorMessage = `Error ${response.status}: ${response.statusText}`;
        try {
          const errorData = JSON.parse(responseText);
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch {
          // Si no es JSON válido, usar el texto tal como está
          errorMessage = responseText || errorMessage;
        }
        throw new Error(errorMessage);
      }
      
      // Intentar parsear la respuesta como JSON
      let result;
      try {
        result = JSON.parse(responseText);
        console.log('Parsed result:', result);
      } catch {
        throw new Error('La respuesta del servidor no es JSON válido');
      }
      
      // Manejar diferentes formatos de respuesta
      let newCompany: Company;
      
      if (result.success && result.company) {
        // Formato: { success: true, company: {...} }
        newCompany = result.company;
      } else if (result.id && result.name) {
        // Formato directo: { id: 1, name: "..." }
        newCompany = result;
      } else {
        console.error('Formato de respuesta inesperado:', result);
        throw new Error('El servidor devolvió un formato de respuesta inesperado');
      }
      
      // Validar que la empresa tenga los campos necesarios
      if (!newCompany.id || !newCompany.name) {
        throw new Error('La empresa creada no tiene los campos requeridos (id, name)');
      }
      
      // Agregar la nueva empresa a la lista
      setAvailableCompanies(prev => [...prev, newCompany]);
      
      // Seleccionar automáticamente la nueva empresa
      setSelectedCompanyId(newCompany.id.toString());
      
      // Limpiar el formulario y cerrar el modal
      setNewCompanyName('');
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

  // El resto del código de renderizado
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
          
          {/* Separador y botón para agregar nueva empresa */}
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
                  <Label htmlFor="company-name">Nombre de la empresa</Label>
                  <Input
                    id="company-name"
                    type="text"
                    placeholder="Ingresa el nombre de la empresa"
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    disabled={isCreating}
                  />
                </div>
                <div className="flex justify-end space-x-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsDialogOpen(false)}
                    disabled={isCreating}
                  >
                    Cancelar
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={!newCompanyName.trim() || isCreating}
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