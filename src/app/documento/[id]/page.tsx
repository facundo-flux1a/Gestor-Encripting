'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { notFound, useParams, useSearchParams } from 'next/navigation';
import { MainLayout } from '@/components/layout/main-layout';
import { type Document, DocumentUpdateSchema, type DocumentUpdatePayload } from '@/lib/types';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { Form } from '@/components/ui/form';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useFieldArray } from 'react-hook-form';
import { DeleteConfirmationDialog } from '@/components/dashboard/delete-confirmation-dialog';
import { IndividualProvider } from '@/context/IndividualProvider';
import { IndividualTutorialRouter } from '@/components/documento/IndividualTutorialRouter';
import { AuditSplitView } from '@/components/dashboard/audit-split-view';
import { ReviewInvoiceLayout } from '@/components/dashboard/review-invoice-layout';
import { getAuditHistory, clearSuggestions } from '@/services/vertex-ai-service';

function DocumentoPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const [doc, setDoc] = useState<Document | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isAuditMode, setIsAuditMode] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const { toast } = useToast();
  const lastDocIdRef = useRef<number | null>(null);

  const form = useForm<DocumentUpdatePayload>({
    resolver: zodResolver(DocumentUpdateSchema),
    defaultValues: { entidades: [], lineas: [], iva_details: [] }
  });

  // keep useFieldArray mounted so the form context is initialized
  useFieldArray({ control: form.control, name: 'entidades' });

  const resetFormWithDocData = useCallback((docData: Document) => {
    form.reset({
      ...docData,
      fecha_emision: docData.fecha_emision ? new Date(docData.fecha_emision).toISOString().split('T')[0] : '',
      fecha_vencimiento: docData.fecha_vencimiento ? new Date(docData.fecha_vencimiento).toISOString().split('T')[0] : '',
      cif: docData.cif || '',
      proveedor: docData.proveedor || '',
    }, { keepErrors: false, keepDirty: false, keepIsSubmitted: false, keepTouched: false, keepIsValid: false, keepSubmitCount: false });
  }, [form]);

  const isEditable = useMemo(() => !doc?.trimestre_cerrado, [doc?.id_documento, doc?.trimestre_cerrado]);

  const isFixed = useMemo(() => {
    if (!doc) return true;
    const checkType = searchParams.get('checkType');
    if (checkType && checkType !== 'MISMATCH_MATEMATICO') return false;
    const fv = form.getValues();
    const base = Number(fv.base_imponible ?? doc.base_imponible ?? 0);
    const total = Number(fv.total ?? doc.total ?? 0);
    const taxes = (fv.iva_details || doc.iva_details || []).reduce((acc: number, t: any) => acc + Number(t.cuota || 0), 0);
    return Math.abs(total - (base + taxes)) <= 0.05;
  }, [doc, form.watch('total'), form.watch('base_imponible'), form.watch('iva_details'), searchParams]);

  useEffect(() => {
    if (searchParams.get('audit') === 'true') setIsAuditMode(true);
  }, [searchParams]);

  const fetchDocument = useCallback(async (id: number) => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/documents/${id}`, { method: 'GET', cache: 'no-store' });
      if (!res.ok) { if (res.status === 404) notFound(); throw new Error(`Error ${res.status}`); }
      const fetchedDoc = await res.json();
      setDoc(fetchedDoc);
      if (lastDocIdRef.current !== fetchedDoc.id_documento) {
        resetFormWithDocData(fetchedDoc);
        lastDocIdRef.current = fetchedDoc.id_documento;
      }
    } catch {
      toast({ title: 'Error', description: 'No se pudo cargar el documento.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast, resetFormWithDocData]);

  useEffect(() => {
    const idParam = params.id;
    const id = parseInt(Array.isArray(idParam) ? idParam[0] as string : idParam as string, 10);
    if (isNaN(id)) { notFound(); return; }
    fetchDocument(id);
    getAuditHistory(id).then(setSuggestions).catch(console.error);
  }, [params.id, fetchDocument]);

  useEffect(() => {
    if (isAuditMode && doc) getAuditHistory(doc.id_documento).then(setSuggestions).catch(console.error);
  }, [isAuditMode, doc?.id_documento]);

  const handleDelete = async () => {
    if (!doc) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/documents/${doc.id_documento}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) {
        toast({ title: '✅ Documento Eliminado', description: 'El documento ha sido eliminado correctamente.', className: 'bg-gradient-to-br from-green-500 to-emerald-600 text-white' });
        window.location.href = '/documents';
      } else {
        toast({ title: 'Error', description: result.error || 'No se pudo eliminar el documento.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'No se pudo eliminar el documento.', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleValidate = async () => {
    if (!doc?.incidencia) return;
    setIsValidating(true);
    try {
      const res = await fetch(`/api/documents/${doc.id_documento}/validate`, { method: 'POST' });
      if (!res.ok) throw new Error('Error al validar');
      if (doc.tipo_documento?.toUpperCase().includes('(SIN CONFIRMAR)')) {
        const cr = await fetch('/api/documents-confirm', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId: doc.id_documento }) });
        if (!cr.ok) throw new Error('Error al confirmar');
      }
      toast({ title: '✅ Documento Validado', description: 'Las incidencias han sido marcadas como resueltas', className: 'bg-gradient-to-br from-green-500 to-emerald-600 text-white' });
      await clearSuggestions(doc.id_documento);
      setSuggestions([]);
      fetchDocument(doc.id_documento);
    } catch {
      toast({ title: 'Error', description: 'No se pudieron validar las incidencias.', variant: 'destructive' });
    } finally {
      setIsValidating(false);
    }
  };

  const handleMarkDuplicate = async () => {
    if (!doc) return;
    try {
      const res = await fetch(`/api/documents/${doc.id_documento}/duplicate`, { method: 'POST' });
      if (!res.ok) throw new Error('Error al actualizar');
      
      toast({ title: '✅ Marcado como Duplicado', description: 'El documento ha sido enviado a revisión por duplicidad.', className: 'bg-gradient-to-br from-amber-500 to-orange-600 text-white' });
      fetchDocument(doc.id_documento);
    } catch {
      toast({ title: 'Error', description: 'No se pudo marcar como duplicado.', variant: 'destructive' });
    }
  };

  const onSubmit = async (data: DocumentUpdatePayload) => {
    if (!doc || (!isEditing && !isAuditMode) || isSaving) return;
    setIsSaving(true);
    try {
      // ✅ Sincronizar proveedor y cif modificados hacia el array de entidades antes de enviar
      const finalData = { ...data };
      if (finalData.proveedor !== undefined || finalData.cif !== undefined) {
        finalData.entidades = finalData.entidades.map(e => {
          if (e.rol === 'emisor' || e.rol === 'proveedor') {
            return {
              ...e,
              nombre: finalData.proveedor !== undefined ? finalData.proveedor : e.nombre,
              identificador_fiscal: finalData.cif !== undefined ? finalData.cif : e.identificador_fiscal
            };
          }
          return e;
        });
      }

      const res = await fetch(`/api/documents/${doc.id_documento}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(finalData) });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Error al actualizar');
      const updatedDoc = { ...doc, ...finalData };
      setDoc(updatedDoc);
      resetFormWithDocData(updatedDoc);
      toast({ title: '✅ Cambios Guardados', description: 'El documento se actualizó correctamente.', className: 'bg-gradient-to-br from-green-500 to-emerald-600 text-white' });
      setIsEditing(false);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'No se pudo actualizar el documento.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = useCallback(() => { if (doc) resetFormWithDocData(doc); }, [doc, resetFormWithDocData]);

  const refreshHistory = useCallback(async () => {
    if (doc) { try { setSuggestions(await getAuditHistory(doc.id_documento)); } catch (e) { console.error(e); } }
  }, [doc?.id_documento]);

  const isAuditRequest = searchParams.get('audit') === 'true';

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center space-y-4 animate-pulse">
            <Loader2 className={cn('h-12 w-12 animate-spin mx-auto', isAuditRequest ? 'text-violet-500' : 'text-primary')} />
            <p className={cn('text-sm font-bold uppercase tracking-widest', isAuditRequest ? 'text-violet-500' : 'text-muted-foreground')}>
              {isAuditRequest ? 'Preparando Health Check...' : 'Cargando documento...'}
            </p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!doc) return notFound();

  if (isAuditMode) {
    return (
      <AuditSplitView
        doc={doc} form={form} suggestions={suggestions}
        onClose={() => setIsAuditMode(false)} isFixed={isFixed}
        onSubmit={onSubmit} isSaving={isSaving} onHistoryUpdate={refreshHistory}
        checkType={searchParams.get('checkType') || 'MISMATCH_MATEMATICO'}
        motivo={searchParams.get('motivo') || ''}
      />
    );
  }

  const reviewLayout = (
    <ReviewInvoiceLayout
      doc={doc} form={form} isEditing={isEditing} isSaving={isSaving}
      isDeleting={isDeleting} isValidating={isValidating} isEditable={isEditable}
      onEdit={() => setIsEditing(true)}
      onCancelEdit={() => { setIsEditing(false); resetForm(); }}
      onSave={form.handleSubmit(onSubmit)}
      onDelete={() => setIsDeleteDialogOpen(true)}
      onValidate={handleValidate}
      onAuditMode={() => setIsAuditMode(true)}
      onMarkDuplicate={handleMarkDuplicate}
    />
  );

  return (
    <MainLayout noPadding>
      <TooltipProvider>
        <Form {...form}>
          {isEditing
            ? <form onSubmit={form.handleSubmit(onSubmit)}>{reviewLayout}</form>
            : reviewLayout
          }
        </Form>
      </TooltipProvider>
      <DeleteConfirmationDialog
        isOpen={isDeleteDialogOpen} onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDelete}
        documentNumber={doc.numero_documento || `ID: ${doc.id_documento}`}
        isDeleting={isDeleting}
      />
    </MainLayout>
  );
}

export default function DocumentoPage() {
  return (
    <IndividualProvider>
      <DocumentoPageContent />
      <IndividualTutorialRouter />
    </IndividualProvider>
  );
}