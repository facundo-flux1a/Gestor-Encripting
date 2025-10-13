'use client';

import * as React from 'react';
import { useCompanyContext } from '@/context/CompanyProvider'; 
import { Plus, ChevronDown, Trash2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function CompaniesSelector() {
  const { 
    selectedCompanyIds, 
    toggleCompanyId,
    isLoading,
    companies,
    setCompanies
  } = useCompanyContext();

  const { toast } = useToast();
  const [availableCompanies, setAvailableCompanies] = React.useState(companies);
  const [isCreating, setIsCreating] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [companyToDelete, setCompanyToDelete] = React.useState<{ id: number; name: string; docCount: number } | null>(null);
  const [newCompany, setNewCompany] = React.useState({
    name: '',
    nombreFiscal: '',
    cif: '',
  });

  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);

  React.useEffect(() => {
    setAvailableCompanies(companies);
  }, [companies]);

  React.useEffect(() => {
    async function loadCompanies() {
      try {
        const response = await fetch('/api/companies');
        if (response.ok) {
          const data = await response.json();
          setAvailableCompanies(data);
          setCompanies(data);
        }
      } catch (error) {
        console.error('Error loading companies:', error);
      }
    }
    loadCompanies();
  }, [setCompanies]);

  React.useEffect(() => {
    const handleDragStart = () => {
      setIsDragging(true);
      setIsPopoverOpen(true);
    };
    
    const handleDragEnd = () => {
      setIsDragging(false);
    };

    const handleDrop = () => {
      setIsDragging(false);
    };

    window.addEventListener('dragstart', handleDragStart);
    window.addEventListener('dragend', handleDragEnd);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragstart', handleDragStart);
      window.removeEventListener('dragend', handleDragEnd);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  const handleCreateCompany = async () => {
    if (!newCompany.name.trim() || !newCompany.cif.trim()) {
      toast({
        title: "Error",
        description: "El nombre y CIF son obligatorios",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCompany),
      });

      if (response.ok) {
        const data = await response.json();
        const updatedCompanies = [...availableCompanies, data.company];
        setAvailableCompanies(updatedCompanies);
        setCompanies(updatedCompanies);
        setNewCompany({ name: '', nombreFiscal: '', cif: '' });
        toast({
          title: "Éxito",
          description: "Empresa creada correctamente",
        });
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.error || "Error al crear la empresa",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Error al crear la empresa",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteClick = async (companyId: number, companyName: string) => {
    console.log('🗑️ [CompaniesSelector] handleDeleteClick llamado:', { companyId, companyName });
    
    try {
      console.log('📡 [CompaniesSelector] Obteniendo documentos...');
      const response = await fetch('/api/documents');
      console.log('📡 [CompaniesSelector] Response status:', response.status);
      
      if (response.ok) {
        const documents = await response.json();
        console.log('📄 [CompaniesSelector] Documentos obtenidos:', documents.length);
        const docCount = documents.filter((doc: any) => doc.empresa_id === companyId).length;
        console.log('📊 [CompaniesSelector] Documentos de esta empresa:', docCount);
        
        console.log('✅ [CompaniesSelector] Abriendo diálogo de confirmación');
        setCompanyToDelete({ 
          id: companyId, 
          name: companyName,
          docCount 
        });
      } else {
        console.error('❌ [CompaniesSelector] Error al obtener documentos:', response.status);
        setCompanyToDelete({ 
          id: companyId, 
          name: companyName,
          docCount: 0 
        });
      }
    } catch (error) {
      console.error('❌ [CompaniesSelector] Error al contar documentos:', error);
      setCompanyToDelete({ 
        id: companyId, 
        name: companyName,
        docCount: 0 
      });
    }
  };

  const handleDeleteCompany = async () => {
    if (!companyToDelete) return;

    console.log('🗑️ [CompaniesSelector] Iniciando eliminación:', companyToDelete);
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/companies/${companyToDelete.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      console.log('📡 [CompaniesSelector] Respuesta del servidor:', data);

      if (response.ok) {
        const updatedCompanies = availableCompanies.filter(c => c.id !== companyToDelete.id);
        setAvailableCompanies(updatedCompanies);
        setCompanies(updatedCompanies);
        
        if (selectedCompanyIds.includes(companyToDelete.id)) {
          toggleCompanyId(companyToDelete.id);
        }

        toast({
          title: "Éxito",
          description: data.documentsDeleted 
            ? `Empresa eliminada junto con ${data.documentsDeleted} documento(s)` 
            : "Empresa eliminada correctamente",
        });
        
        console.log('✅ [CompaniesSelector] Recargando página...');
        window.location.reload();
      } else {
        console.error('❌ [CompaniesSelector] Error del servidor:', data);
        toast({
          title: "Error",
          description: data.error || "Error al eliminar la empresa",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('❌ [CompaniesSelector] Error en catch:', error);
      toast({
        title: "Error",
        description: "Error al eliminar la empresa",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setCompanyToDelete(null);
    }
  };

  const handleDragOver = (e: React.DragEvent, empresaId: number) => {
    e.preventDefault();
    e.currentTarget.classList.add('bg-primary/10', 'border-primary', 'scale-105');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('bg-primary/10', 'border-primary', 'scale-105');
  };

  const handleDrop = async (e: React.DragEvent, empresaId: number) => {
    e.preventDefault();
    e.currentTarget.classList.remove('bg-primary/10', 'border-primary', 'scale-105');

    try {
      const documentData = e.dataTransfer.getData('application/json');
      const document = JSON.parse(documentData);

      if (document.empresa_id === empresaId) {
        toast({
          title: "Sin cambios",
          description: "El documento ya pertenece a esta empresa",
        });
        return;
      }

      const response = await fetch(`/api/documents/${document.id_documento}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newEmpresaId: empresaId }),
      });

      if (response.ok) {
        const empresa = availableCompanies.find(c => c.id === empresaId);
        toast({
          title: "Documento movido",
          description: `El documento se movió a ${empresa?.name}`,
        });
        window.location.reload();
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.error || "Error al mover el documento",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error al mover documento:', error);
      toast({
        title: "Error",
        description: "Error al mover el documento",
        variant: "destructive",
      });
    }
  };

  // Componente de AlertDialog reutilizable
  const DeleteAlertDialog = () => (
    <AlertDialog open={companyToDelete !== null} onOpenChange={() => setCompanyToDelete(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            ¿Eliminar empresa y todos sus documentos?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <div>
              Esta acción <strong className="text-destructive">NO se puede deshacer</strong>.
            </div>
            {companyToDelete && (
              <>
                <div className="p-3 bg-muted rounded">
                  <div className="font-semibold">{companyToDelete.name}</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {companyToDelete.docCount === 0 
                      ? 'No tiene documentos asociados'
                      : `Tiene ${companyToDelete.docCount} documento(s) asociado(s)`
                    }
                  </div>
                </div>
                {companyToDelete.docCount > 0 && (
                  <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded">
                    <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      Se eliminarán <strong>{companyToDelete.docCount} documento(s)</strong> junto con la empresa de forma permanente.
                    </div>
                  </div>
                )}
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteCompany}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? 'Eliminando...' : 'Sí, eliminar todo'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (isLoading) {
    return <Skeleton className="w-full h-10" />;
  }

  if (availableCompanies.length === 0) {
    return (
      <>
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">No hay empresas</div>
          <div className="space-y-2">
            <Input
              placeholder="Nombre de empresa"
              value={newCompany.name}
              onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })}
            />
            <Input
              placeholder="Nombre fiscal (opcional)"
              value={newCompany.nombreFiscal}
              onChange={(e) => setNewCompany({ ...newCompany, nombreFiscal: e.target.value })}
            />
            <Input
              placeholder="CIF"
              value={newCompany.cif}
              onChange={(e) => setNewCompany({ ...newCompany, cif: e.target.value })}
            />
            <Button 
              onClick={handleCreateCompany} 
              disabled={isCreating}
              className="w-full"
            >
              <Plus className="mr-2 h-4 w-4" />
              {isCreating ? 'Creando...' : 'Crear Primera Empresa'}
            </Button>
          </div>
        </div>
        <DeleteAlertDialog />
      </>
    );
  }

  if (availableCompanies.length <= 5) {
    return (
      <>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Empresas</span>
          </div>
          
          {availableCompanies.map((company) => (
            <div
              key={company.id}
              className="flex items-center gap-2 p-2 rounded border-2 border-dashed border-transparent transition-all hover:border-primary/50"
              onDragOver={(e) => handleDragOver(e, company.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, company.id)}
            >
              <Checkbox
                id={`company-${company.id}`}
                checked={selectedCompanyIds.includes(company.id)}
                onCheckedChange={() => toggleCompanyId(company.id)}
              />
              <Label 
                htmlFor={`company-${company.id}`}
                className="flex-1 cursor-pointer text-sm"
              >
                {company.name}
              </Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={(e) => {
                  e.stopPropagation();
                  console.log('🖱️ [CompaniesSelector] Click en botón eliminar');
                  handleDeleteClick(company.id, company.name);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <p className="text-xs text-muted-foreground px-2">
            {isDragging ? '🎯 Suelta el documento en una empresa' : '💡 Arrastra documentos aquí para moverlos de empresa'}
          </p>

          <div className="space-y-2 pt-2 border-t">
            <Input
              placeholder="Nombre de empresa"
              value={newCompany.name}
              onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })}
            />
            <Input
              placeholder="Nombre fiscal (opcional)"
              value={newCompany.nombreFiscal}
              onChange={(e) => setNewCompany({ ...newCompany, nombreFiscal: e.target.value })}
            />
            <Input
              placeholder="CIF"
              value={newCompany.cif}
              onChange={(e) => setNewCompany({ ...newCompany, cif: e.target.value })}
            />
            <Button 
              onClick={handleCreateCompany} 
              disabled={isCreating}
              className="w-full"
              size="sm"
            >
              <Plus className="mr-2 h-4 w-4" />
              {isCreating ? 'Creando...' : 'Nueva'}
            </Button>
          </div>
        </div>
        <DeleteAlertDialog />
      </>
    );
  }

  return (
    <>
      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={isPopoverOpen}
            className={`w-full justify-between transition-all ${isDragging ? 'ring-2 ring-primary ring-offset-2 animate-pulse' : ''}`}
          >
            {selectedCompanyIds.length === 0
              ? 'Seleccionar empresas'
              : selectedCompanyIds.length === availableCompanies.length
              ? 'Todas las empresas'
              : `${selectedCompanyIds.length} seleccionada(s)`}
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          className="w-[300px] p-0" 
          align="start"
          onInteractOutside={(e) => {
            if (isDragging) {
              e.preventDefault();
            }
          }}
        >
          <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
            {availableCompanies.map((company) => (
              <div
                key={company.id}
                className="flex items-center gap-2 p-2 rounded border-2 border-dashed border-transparent transition-all hover:border-primary/50"
                onDragOver={(e) => handleDragOver(e, company.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, company.id)}
              >
                <Checkbox
                  id={`company-popover-${company.id}`}
                  checked={selectedCompanyIds.includes(company.id)}
                  onCheckedChange={() => toggleCompanyId(company.id)}
                />
                <Label 
                  htmlFor={`company-popover-${company.id}`}
                  className="flex-1 cursor-pointer text-sm"
                >
                  {company.name}
                </Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    console.log('🖱️ [CompaniesSelector] Click en botón eliminar (popover)');
                    handleDeleteClick(company.id, company.name);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="border-t p-4 space-y-2">
            <Input
              placeholder="Nombre de empresa"
              value={newCompany.name}
              onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })}
            />
            <Input
              placeholder="Nombre fiscal (opcional)"
              value={newCompany.nombreFiscal}
              onChange={(e) => setNewCompany({ ...newCompany, nombreFiscal: e.target.value })}
            />
            <Input
              placeholder="CIF"
              value={newCompany.cif}
              onChange={(e) => setNewCompany({ ...newCompany, cif: e.target.value })}
            />
            <Button 
              onClick={handleCreateCompany} 
              disabled={isCreating}
              className="w-full"
              size="sm"
            >
              <Plus className="mr-2 h-4 w-4" />
              {isCreating ? 'Creando...' : 'Nueva Empresa'}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground p-2 border-t">
            {isDragging ? '🎯 Suelta el documento aquí' : '💡 Arrastra documentos aquí para moverlos'}
          </p>
        </PopoverContent>
      </Popover>
      <DeleteAlertDialog />
    </>
  );
}