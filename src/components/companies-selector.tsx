'use client';

import * as React from 'react';
const { useEffect, useState } = React;
import { useCompanyContext } from '@/context/CompanyProvider'; 
import { Plus, ChevronDown, Trash2, AlertTriangle, HelpCircle, Settings, Mail, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTutorial } from '@/context/tutorial-context';

import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

interface Company {
  id: number;
  name: string;
  nombre_fiscal?: string;
  CIF: string;
  mail_de_carga?: string;
}

// Función de validación de email
const isValidEmail = (email: string): boolean => {
  if (!email.trim()) return true;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

// Componente separado para el formulario de creación
const CreateCompanyFormComponent = React.memo(({ 
  onSubmit, 
  isCreating 
}: { 
  onSubmit: (data: any) => void;
  isCreating: boolean;
}) => {
  const nameRef = React.useRef<HTMLInputElement>(null);
  const fiscalRef = React.useRef<HTMLInputElement>(null);
  const cifRef = React.useRef<HTMLInputElement>(null);
  const emailRef = React.useRef<HTMLInputElement>(null);
  const [emailError, setEmailError] = React.useState<string>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const email = emailRef.current?.value || '';
    
    if (email && !isValidEmail(email)) {
      setEmailError('Formato de email inválido');
      return;
    }
    
    setEmailError('');
    
    onSubmit({
      name: nameRef.current?.value || '',
      nombreFiscal: fiscalRef.current?.value || '',
      cif: cifRef.current?.value || '',
      mailDeCarga: email,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="company-name" className="text-sm font-medium">
            Nombre de empresa *
          </Label>
          <span title="El nombre de empresa que se mostrará" className="cursor-help">
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
          </span>
        </div>
        <Input
          ref={nameRef}
          id="company-name"
          placeholder="Ej: Mi Empresa S.L."
          autoComplete="off"
          disabled={isCreating}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="company-fiscal" className="text-sm font-medium">
            Nombre fiscal <span className="text-muted-foreground">(opcional)</span>
          </Label>
          <span title="Nombre Fiscal de la Empresa" className="cursor-help">
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
          </span>
        </div>
        <Input
          ref={fiscalRef}
          id="company-fiscal"
          placeholder="Ej: Mi Empresa Sociedad Limitada"
          autoComplete="off"
          disabled={isCreating}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="company-cif" className="text-sm font-medium">
            CIF *
          </Label>
          <span title="Nombre del sistema de identificación tributaria" className="cursor-help">
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
          </span>
        </div>
        <Input
          ref={cifRef}
          id="company-cif"
          placeholder="Ej: B12345678"
          autoComplete="off"
          disabled={isCreating}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="company-email" className="text-sm font-medium">
            Mail de carga <span className="text-muted-foreground">(opcional)</span>
          </Label>
          <span title="Dirección de correo electrónico desde el cual cargar documentos" className="cursor-help">
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
          </span>
        </div>
        <Input
          ref={emailRef}
          id="company-email"
          type="email"
          placeholder="Ej: documentos@miempresa.com"
          autoComplete="off"
          disabled={isCreating}
          onChange={(e) => {
            if (e.target.value && !isValidEmail(e.target.value)) {
              setEmailError('Formato de email inválido');
            } else {
              setEmailError('');
            }
          }}
        />
        {emailError && (
          <p className="text-sm text-destructive">{emailError}</p>
        )}
      </div>
    </form>
  );
});

CreateCompanyFormComponent.displayName = 'CreateCompanyFormComponent';

// Componente para edición
const EditCompanyFormComponent = React.memo(({ 
  company,
  onEmailValidation
}: { 
  company: Company;
  onEmailValidation: (isValid: boolean) => void;
}) => {
  const [localName, setLocalName] = React.useState(company.name || '');
  const [localFiscal, setLocalFiscal] = React.useState(company.nombre_fiscal ?? '');
  const [localCIF, setLocalCIF] = React.useState(company.CIF || '');
  const [localEmail, setLocalEmail] = React.useState(company.mail_de_carga ?? '');
  const [emailError, setEmailError] = React.useState<string>('');

  React.useEffect(() => {
    setLocalName(company.name || '');
    setLocalFiscal(company.nombre_fiscal || '');
    setLocalCIF(company.CIF || '');
    setLocalEmail(company.mail_de_carga || '');
  }, [company]);

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalEmail(value);
    
    if (value && !isValidEmail(value)) {
      setEmailError('Formato de email inválido');
      onEmailValidation(false);
    } else {
      setEmailError('');
      onEmailValidation(true);
    }
  };

  return (
    <form id={`edit-form-${company.id}`} className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="edit-company-name" className="text-sm font-medium">
            Nombre de empresa *
          </Label>
          <span title="El nombre de empresa que se mostrará" className="cursor-help">
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
          </span>
        </div>
        <Input
          id="edit-company-name"
          name="name"
          value={localName}
          onChange={(e) => setLocalName(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="edit-company-fiscal" className="text-sm font-medium">
            Nombre fiscal <span className="text-muted-foreground">(opcional)</span>
          </Label>
          <span title="Nombre Fiscal de la Empresa" className="cursor-help">
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
          </span>
        </div>
        <Input
          id="edit-company-fiscal"
          name="nombreFiscal"
          placeholder="Ej: Mi Empresa Sociedad Limitada"
          value={localFiscal}
          onChange={(e) => setLocalFiscal(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="edit-company-cif" className="text-sm font-medium">
            CIF <span className="text-muted-foreground">(opcional)</span>
          </Label>
          <span title="Nombre del sistema de identificación tributaria" className="cursor-help">
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
          </span>
        </div>
        <Input
          id="edit-company-cif"
          name="cif"
          placeholder="Ej: B12345678"
          value={localCIF}
          onChange={(e) => setLocalCIF(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="edit-company-email" className="text-sm font-medium">
            Mail de carga <span className="text-muted-foreground">(opcional)</span>
          </Label>
          <span title="Dirección de correo electrónico desde el cual cargar documentos" className="cursor-help">
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
          </span>
        </div>
        <Input
          id="edit-company-email"
          name="mailDeCarga"
          type="email"
          placeholder="Ej: documentos@miempresa.com"
          value={localEmail}
          onChange={handleEmailChange}
          autoComplete="off"
        />
        {emailError && (
          <p className="text-sm text-destructive">{emailError}</p>
        )}
      </div>
    </form>
  );
});

EditCompanyFormComponent.displayName = 'EditCompanyFormComponent';

export function CompaniesSelector() {
  const { 
    selectedCompanyIds, 
    toggleCompanyId,
    isLoading,
    companies,
    setCompanies
  } = useCompanyContext();

  // ✅ CAMBIO: Agregar lowerTutorialZIndex y raiseTutorialZIndex
  const { isTutorialActive, currentStep, lowerTutorialZIndex, raiseTutorialZIndex } = useTutorial();
  const [isStep2, setIsStep2] = useState(false);

  useEffect(() => {
    const checkStep2 = () => {
      const element = document.querySelector('[data-tutorial-step2="true"]');
      setIsStep2(element !== null);
    };
    
    checkStep2();
    const interval = setInterval(checkStep2, 100);
    return () => clearInterval(interval);
  }, []);
  
  const shouldBlockClose = isTutorialActive || isStep2;

  console.log('🎭 CompaniesSelector:', { isTutorialActive, isStep2, shouldBlockClose });
  
  const { toast } = useToast();
  const [availableCompanies, setAvailableCompanies] = React.useState(companies);
  const [isCreating, setIsCreating] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [companyToDelete, setCompanyToDelete] = React.useState<{ id: number; name: string; docCount: number } | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);
  const [editingCompany, setEditingCompany] = React.useState<Company | null>(null);
  const [originalCompany, setOriginalCompany] = React.useState<Company | null>(null);
  const [isEmailValid, setIsEmailValid] = React.useState(true);

  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isZIndexLowered, setIsZIndexLowered] = React.useState(false); // ⬅️ AGREGAR ESTA LÍNEA


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
  console.log('🔍 [useEffect z-index] Ejecutando:', {
    isTutorialActive,
    currentStep,
    isPopoverOpen,
    isZIndexLowered,
    shouldAct: isTutorialActive && currentStep === 1
  });

  if (!isTutorialActive || currentStep !== 1) {
    console.log('❌ [useEffect z-index] NO cumple condiciones - saliendo');
    if (isZIndexLowered) {
      console.log('🔄 Reseteando isZIndexLowered');
      setIsZIndexLowered(false);
    }
    return;
  }
  
  // ⬅️ CAMBIO: Usar isPopoverOpen en lugar de isCreateDialogOpen
  if (isPopoverOpen && !isZIndexLowered) {
    console.log('🔽 [useEffect z-index] Popover ABIERTO en paso 2 - bajando z-index UNA VEZ');
    lowerTutorialZIndex();
    setIsZIndexLowered(true);
  } else if (!isPopoverOpen && isZIndexLowered) {
    console.log('🔼 [useEffect z-index] Popover CERRADO - subiendo z-index UNA VEZ');
    raiseTutorialZIndex();
    setIsZIndexLowered(false);
  }
}, [isPopoverOpen, isTutorialActive, currentStep, isZIndexLowered, lowerTutorialZIndex, raiseTutorialZIndex]);

  // ✅ NUEVO: Controlar z-index del tutorial cuando se abre/cierra el Dialog en paso 2


  // ✅ NUEVO: Bloquear cierre del popover durante tutorial
  React.useEffect(() => {
    if (!isTutorialActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTutorialActive) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isTutorialActive]);
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

  const handleCreateCompany = React.useCallback(async (data: any) => {
    if (!data.name.trim() || !data.cif.trim()) {
      toast({
        title: "Error",
        description: "El nombre y CIF son obligatorios",
        variant: "destructive",
      });
      return;
    }

    if (data.mailDeCarga && !isValidEmail(data.mailDeCarga)) {
      toast({
        title: "Error",
        description: "El formato del email es inválido",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const responseData = await response.json();
        const updatedCompanies = [...availableCompanies, responseData.company];
        setAvailableCompanies(updatedCompanies);
        setCompanies(updatedCompanies);
        setIsCreateDialogOpen(false);
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
  }, [availableCompanies, setCompanies, toast]);

  const handleEditClick = (company: Company) => {
    setEditingCompany(company);
    setOriginalCompany({ ...company });
    setIsEditDialogOpen(true);
    setIsEmailValid(true);
  };

  const handleSaveCompany = async () => {
    if (!editingCompany || !originalCompany) return;

    try {
      const formElement = document.getElementById(`edit-form-${editingCompany.id}`) as HTMLFormElement;
      if (!formElement) {
        toast({
          title: 'Error',
          description: 'No se pudo leer el formulario',
          variant: 'destructive',
        });
        return;
      }

      const formData = new FormData(formElement);
      const name = (formData.get('name') as string)?.trim();
      const nombreFiscal = (formData.get('nombreFiscal') as string)?.trim();
      const cif = (formData.get('cif') as string)?.trim();
      const mailDeCarga = (formData.get('mailDeCarga') as string)?.trim();

      const nameChanged = name !== originalCompany.name;
      const fiscalChanged = nombreFiscal !== (originalCompany.nombre_fiscal || '');
      const cifChanged = cif !== (originalCompany.CIF || '');
      const emailChanged = mailDeCarga !== (originalCompany.mail_de_carga || '');

      if (!nameChanged && !fiscalChanged && !cifChanged && !emailChanged) {
        toast({
          title: 'Sin cambios',
          description: 'No se detectaron cambios en la empresa',
        });
        setIsEditDialogOpen(false);
        setEditingCompany(null);
        setOriginalCompany(null);
        return;
      }

      if (nameChanged && !name) {
        toast({
          title: 'Error',
          description: 'El nombre no puede estar vacío',
          variant: 'destructive',
        });
        return;
      }

      if (emailChanged && mailDeCarga && !isValidEmail(mailDeCarga)) {
        toast({
          title: 'Error',
          description: 'El formato del email es inválido',
          variant: 'destructive',
        });
        return;
      }

      const payload: any = {};

      if (nameChanged) {
        payload.name = name;
      }

      if (fiscalChanged) {
        payload.nombreFiscal = nombreFiscal || null;
      }

      if (cifChanged) {
        payload.cif = cif || null;
      }

      if (emailChanged) {
        payload.mailDeCarga = mailDeCarga || null;
      }

      setIsCreating(true);

      const response = await fetch(`/api/companies/${editingCompany.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al actualizar la empresa');
      }

      if (data.company) {
        setCompanies((prev) =>
          prev.map((c) =>
            c.id === editingCompany.id ? data.company : c
          )
        );
        setAvailableCompanies((prev) =>
          prev.map((c) =>
            c.id === editingCompany.id ? data.company : c
          )
        );
      }

      toast({
        title: 'Éxito',
        description: 'Empresa actualizada correctamente',
      });

      setEditingCompany(null);
      setOriginalCompany(null);
      setIsEditDialogOpen(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Error al actualizar la empresa',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

const handleDeleteClick = async (companyId: number, companyName: string) => {
    // ✅ Primero cerrar el dialog de edición
    setIsEditDialogOpen(false);
    
    // ✅ Pequeño delay para que se complete la animación de cierre
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      const response = await fetch(`/api/companies/${companyId}`);
      
      if (response.ok) {
        const data = await response.json();
        const docCount = data.count || 0;
        
        setCompanyToDelete({ 
          id: companyId, 
          name: companyName,
          docCount 
        });
      } else {
        setCompanyToDelete({ 
          id: companyId, 
          name: companyName,
          docCount: 0 
        });
      }
    } catch (error) {
      console.error('Error al contar documentos:', error);
      setCompanyToDelete({ 
        id: companyId, 
        name: companyName,
        docCount: 0 
      });
    }
  };

  const handleDeleteCompany = async () => {
    if (!companyToDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/companies/${companyToDelete.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok) {
        const updatedCompanies = availableCompanies.filter(c => c.id !== companyToDelete.id);
        setAvailableCompanies(updatedCompanies);
        setCompanies(updatedCompanies);
        
        if (selectedCompanyIds.includes(companyToDelete.id)) {
          toggleCompanyId(companyToDelete.id);
        }

        setIsEditDialogOpen(false);
        setEditingCompany(null);
        setOriginalCompany(null);

        toast({
          title: "Éxito",
          description: data.documentsDeleted 
            ? `Empresa eliminada junto con ${data.documentsDeleted} documento(s)` 
            : "Empresa eliminada correctamente",
        });
        
        window.location.reload();
      } else {
        toast({
          title: "Error",
          description: data.error || "Error al eliminar la empresa",
          variant: "destructive",
        });
      }
    } catch (error) {
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

      if (document.id_de_empresa === empresaId) {
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
  };// CONTINÚA DESDE PARTE 2...

  const CompanyWithWarning = ({ company, labelId }: { company: Company; labelId: string }) => {
    const hasNoEmail = 
      company.mail_de_carga === null || 
      company.mail_de_carga === undefined || 
      (typeof company.mail_de_carga === 'string' && company.mail_de_carga.trim() === '');
    
    return (
      <div className="flex items-center gap-2 flex-1">
        {hasNoEmail && (
          <span 
            title="Esta empresa no tiene configurado un mail de carga. No podrás subir documentos desde el correo electrónico."
            className="cursor-help text-amber-500"
          >
            <AlertTriangle className="h-4 w-4" />
          </span>
        )}
        <Label 
          htmlFor={labelId}
          className="flex-1 cursor-pointer text-sm"
        >
          {company.name}
        </Label>
      </div>
    );
  };

  const DeleteAlertDialog = () => (
    <AlertDialog open={companyToDelete !== null} onOpenChange={() => setCompanyToDelete(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            ¿Eliminar empresa y todos sus documentos?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Esta acción <strong className="text-destructive">NO se puede deshacer</strong>.
              </p>
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
            </div>
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
        <div className="space-y-4" data-tutorial="company-selector">
          <div className="text-sm text-muted-foreground">No hay empresas</div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Agregar Empresa
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crear nueva empresa</DialogTitle>
                <DialogDescription>
                  Complete los datos de la nueva empresa
                </DialogDescription>
              </DialogHeader>
              <CreateCompanyFormComponent 
                onSubmit={handleCreateCompany}
                isCreating={isCreating}
              />
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                  disabled={isCreating}
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={() => {
                    const form = document.querySelector('form');
                    if (form) {
                      const event = new Event('submit', { bubbles: true, cancelable: true });
                      form.dispatchEvent(event);
                    }
                  }}
                  disabled={isCreating}
                >
                  {isCreating ? 'Creando...' : 'Crear Empresa'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <DeleteAlertDialog />
      </>
    );
  }

  if (availableCompanies.length <= 5) {
    return (
      <>
        <div className="space-y-3" data-tutorial="company-selector">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Empresas</span>
          </div>
          
          {availableCompanies.map((company) => (
            <div key={company.id}>
              <div
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
                <CompanyWithWarning company={company} labelId={`company-${company.id}`} />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 hover:bg-primary/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditClick(company);
                  }}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}

          <p className="text-xs text-muted-foreground px-2">
            {isDragging ? '🎯 Suelta el documento en una empresa' : '💡 Arrastra documentos aquí para moverlos de empresa'}
          </p>

          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full" size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Agregar Empresa
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crear nueva empresa</DialogTitle>
                <DialogDescription>
                  Complete los datos de la nueva empresa
                </DialogDescription>
              </DialogHeader>
              <CreateCompanyFormComponent 
                onSubmit={handleCreateCompany}
                isCreating={isCreating}
              />
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                  disabled={isCreating}
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={() => {
                    const form = document.querySelector('form');
                    if (form) {
                      const event = new Event('submit', { bubbles: true, cancelable: true });
                      form.dispatchEvent(event);
                    }
                  }}
                  disabled={isCreating}
                >
                  {isCreating ? 'Creando...' : 'Crear Empresa'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Configurar empresa</DialogTitle>
              <DialogDescription>
                Modifica los datos de la empresa o elimínala
              </DialogDescription>
            </DialogHeader>
            {editingCompany && (
              <EditCompanyFormComponent 
                key={editingCompany.id}
                company={editingCompany}
                onEmailValidation={setIsEmailValid}
              />
            )}
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                variant="destructive"
                className="w-full sm:w-auto sm:mr-auto"
                onClick={(e) => {
                  e.stopPropagation();
                  if (editingCompany) {
                    handleDeleteClick(editingCompany.id, editingCompany.name);
                  }
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Eliminar Empresa
              </Button>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  variant="outline"
                  className="flex-1 sm:flex-none"
                  onClick={() => {
                    setIsEditDialogOpen(false);
                    setEditingCompany(null);
                    setOriginalCompany(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button 
                  type="button"
                  className="flex-1 sm:flex-none"
                  onClick={handleSaveCompany}
                  disabled={isCreating || !isEmailValid}
                >
                  {isCreating ? 'Guardando...' : 'Guardar Cambios'}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <DeleteAlertDialog />
      </>
    );
  }

  return (
  <>
    <div data-tutorial="company-selector">
      <Popover 
  open={isPopoverOpen} 
  onOpenChange={(open) => {
  const isInStep2 = document.querySelector('[data-tutorial-step2="true"]') !== null;
  const noHayEmpresas = availableCompanies.length === 0;  // ⬅️ AGREGAR
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 [POPOVER onOpenChange] TRIGGERED');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Estado actual:', { 
    open_nuevo: open,
    isPopoverOpen_actual: isPopoverOpen,
    isInStep2,
    noHayEmpresas,  // ⬅️ AGREGAR
    isCreateDialogOpen,
    isTutorialActive,
    currentStep
  });
  
  // ⬅️ MODIFICAR ESTA LÍNEA
  const shouldBlock = (isInStep2 || isCreateDialogOpen || (isTutorialActive && noHayEmpresas)) && !open;
  
  console.log('🎯 Decisión:', {
    shouldBlock,
    razon: shouldBlock ? (isInStep2 ? 'Paso 2 activo' : noHayEmpresas ? 'No hay empresas en tutorial' : 'Dialog abierto') : 'Permitir cambio'
  });
  
  if (shouldBlock) {
    console.log('🚫 [POPOVER] BLOQUEANDO cierre del popover');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return;
  }
  
  console.log('✅ [POPOVER] PERMITIENDO cambio de estado a:', open);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  setIsPopoverOpen(open);
}}>
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
          className="w-[400px] p-0" 
          align="start"
        >
          {/* ✅ SI NO HAY EMPRESAS Y ESTÁ EN TUTORIAL - MOSTRAR FORM INLINE */}
          {availableCompanies.length === 0 && isTutorialActive ? (
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Crear tu primera empresa 🏢</h4>
                <p className="text-xs text-muted-foreground">
                  Complete los datos básicos para continuar
                </p>
              </div>
              
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  handleCreateCompany({
                    name: formData.get('name'),
                    nombreFiscal: formData.get('nombreFiscal'),
                    cif: formData.get('cif'),
                    mailDeCarga: formData.get('mailDeCarga'),
                  });
                }} 
                className="space-y-3"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="inline-name" className="text-xs font-medium">
                    Nombre * 
                  </Label>
                  <Input
                    id="inline-name"
                    name="name"
                    placeholder="Mi Empresa S.L."
                    required
                    disabled={isCreating}
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="inline-fiscal" className="text-xs text-muted-foreground">
                    Nombre fiscal (opcional)
                  </Label>
                  <Input
                    id="inline-fiscal"
                    name="nombreFiscal"
                    placeholder="Nombre fiscal"
                    disabled={isCreating}
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="inline-cif" className="text-xs font-medium">
                    CIF *
                  </Label>
                  <Input
                    id="inline-cif"
                    name="cif"
                    placeholder="B12345678"
                    required
                    disabled={isCreating}
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="inline-email" className="text-xs text-muted-foreground">
                    Mail de carga (opcional)
                  </Label>
                  <Input
                    id="inline-email"
                    name="mailDeCarga"
                    type="email"
                    placeholder="docs@miempresa.com"
                    disabled={isCreating}
                    className="h-9 text-sm"
                  />
                </div>

                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={isCreating}
                  size="sm"
                >
                  {isCreating ? 'Creando...' : 'Crear Empresa'}
                </Button>
              </form>
            </div>
          ) : (
            /* ✅ SI HAY EMPRESAS - MOSTRAR LISTA NORMAL */
            <>
              <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
                {availableCompanies.map((company) => (
                  <div key={company.id}>
                    <div
                      className="flex items-center gap-2 p-2 rounded border-2 border-dashed border-transparent transition-all hover:border-primary/50"
                      onDragOver={(e) => handleDragOver(e, company.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, company.id)}
                    >
                      <Checkbox
                        id={`company-popover-${company.id}`}
                        checked={selectedCompanyIds.includes(company.id)}
                        onCheckedChange={() => {
                          toggleCompanyId(company.id);
                          if (!isTutorialActive) {
                            setIsPopoverOpen(false);
                          }
                        }}
                      />
                      <CompanyWithWarning company={company} labelId={`company-popover-${company.id}`} />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 hover:bg-primary/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditClick(company);
                        }}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* ✅ BOTÓN AGREGAR EMPRESA - SOLO SI NO ESTÁ EN TUTORIAL */}
              {!isTutorialActive && (
                <div className="border-t p-4">
                  <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="w-full" size="sm">
                        <Plus className="mr-2 h-4 w-4" />
                        Agregar Empresa
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Crear nueva empresa</DialogTitle>
                        <DialogDescription>
                          Complete los datos de la nueva empresa
                        </DialogDescription>
                      </DialogHeader>
                      <CreateCompanyFormComponent 
                        onSubmit={handleCreateCompany}
                        isCreating={isCreating}
                      />
                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => setIsCreateDialogOpen(false)}
                          disabled={isCreating}
                        >
                          Cancelar
                        </Button>
                        <Button 
                          onClick={() => {
                            const form = document.querySelector('form');
                            if (form) {
                              const event = new Event('submit', { bubbles: true, cancelable: true });
                              form.dispatchEvent(event);
                            }
                          }}
                          disabled={isCreating}
                        >
                          {isCreating ? 'Creando...' : 'Crear Empresa'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              )}

              <p className="text-xs text-muted-foreground p-2 border-t">
                {isDragging ? '🎯 Suelta el documento aquí' : '💡 Arrastra documentos aquí para moverlos'}
              </p>
            </>
          )}
        </PopoverContent>
      </Popover>
    </div>

    <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configurar empresa</DialogTitle>
          <DialogDescription>
            Modifica los datos de la empresa o elimínala
          </DialogDescription>
        </DialogHeader>
        {editingCompany && (
          <EditCompanyFormComponent 
            key={editingCompany.id}
            company={editingCompany}
            onEmailValidation={setIsEmailValid}
          />
        )}
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="destructive"
            className="w-full sm:w-auto sm:mr-auto"
            onClick={(e) => {
              e.stopPropagation();
              if (editingCompany) {
                handleDeleteClick(editingCompany.id, editingCompany.name);
              }
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Eliminar Empresa
          </Button>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              className="flex-1 sm:flex-none"
              onClick={() => {
                setIsEditDialogOpen(false);
                setEditingCompany(null);
                setOriginalCompany(null);
              }}
            >
              Cancelar
            </Button>
            <Button 
              type="button"
              className="flex-1 sm:flex-none"
              onClick={handleSaveCompany}
              disabled={isCreating || !isEmailValid}
            >
              {isCreating ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <DeleteAlertDialog />
  </>
);}