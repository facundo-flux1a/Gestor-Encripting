'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { notFound, useParams, useSearchParams } from 'next/navigation';
import { MainLayout, MainLayoutHeader } from '@/components/layout/main-layout';
import { type Document, DocumentUpdateSchema, type DocumentUpdatePayload } from '@/lib/types';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DocumentView } from '@/components/dashboard/document-view';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Edit, X, Save, Trash2, ShieldCheck, Eye, Lock } from 'lucide-react';
import { Form } from '@/components/ui/form';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ExportButton } from '@/components/dashboard/export-button';
import { AnalyzeDocumentCard } from '@/components/incidents/analyze-document-card';
import { DeleteConfirmationDialog } from '@/components/dashboard/delete-confirmation-dialog';
import { EditableEntityCard } from '@/components/dashboard/editable-entity-card';
import { useFieldArray } from 'react-hook-form';
import { FinancialDetailsCard } from '@/components/dashboard/financial-details-card';
import { PlusCircle } from 'lucide-react';
import { DocumentPreviewDialog } from '@/components/dashboard/document-preview-dialog';
import { IndividualProvider } from '@/context/IndividualProvider';
import { IndividualTutorialRouter } from '@/components/documento/IndividualTutorialRouter';
import { AuditSplitView } from '@/components/dashboard/audit-split-view';
import { getAuditHistory, diagnoseDocument, clearSuggestions } from '@/services/vertex-ai-service';

const formatNumber = (num: number | string): string => {
  const value = typeof num === 'string' ? parseFloat(num) : num;
  if (isNaN(value)) return '0';

  const parts = value.toString().split('.');
  const integerPart = parts[0];
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return formattedInteger;
};

const formatCurrency = (amount: number | string): string => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0,00 €';

  const fixed = num.toFixed(2);
  const parts = fixed.split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1];

  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return `${formattedInteger},${decimalPart} €`;
};

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
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isAuditMode, setIsAuditMode] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const { toast } = useToast();

  const lastDocIdRef = useRef<number | null>(null);

  const form = useForm<DocumentUpdatePayload>({
    resolver: zodResolver(DocumentUpdateSchema),
    defaultValues: {
      entidades: [],
      lineas: [],
      iva_details: []
    }
  });

  const { fields: entidadFields, append: appendEntidad, remove: removeEntidad } = useFieldArray({
    control: form.control,
    name: "entidades"
  });

  const resetFormWithDocData = useCallback((docData: Document) => {
    // Extraer CIF de datos_extra
    const cifFromDatosExtra = docData.datos_extra?.CLIENTE?.CIF ||
      docData.datos_extra?.METADATOS?.NIF_CIF_RELACIONADO ||
      docData.datos_extra?.EMPRESA_EMISORA?.CIF ||
      '';

    const formData = {
      ...docData,
      fecha_emision: docData.fecha_emision ? new Date(docData.fecha_emision).toISOString().split('T')[0] : '',
      fecha_vencimiento: docData.fecha_vencimiento ? new Date(docData.fecha_vencimiento).toISOString().split('T')[0] : '',
      cif: cifFromDatosExtra, // ⬅️ Agregar CIF desde datos_extra
    };

    form.reset(formData, {
      keepErrors: false,
      keepDirty: false,
      keepIsSubmitted: false,
      keepTouched: false,
      keepIsValid: false,
      keepSubmitCount: false,
    });
  }, [form]);

  const isEditable = useMemo(() => {
    if (!doc) return false;
    return !doc.trimestre_cerrado;
  }, [doc?.id_documento, doc?.trimestre_cerrado]);

  // Calcular si el documento está cuadrado (para el auto-ocultado de sugerencias)
  const isFixed = useMemo(() => {
    if (!doc) return true;
    const formValues = form.getValues();
    const base = Number(formValues.base_imponible ?? doc.base_imponible ?? 0);
    const total = Number(formValues.total ?? doc.total ?? 0);

    // Sumar cuotas de impuestos (iva_details)
    const taxes = (formValues.iva_details || doc.iva_details || []).reduce((acc: number, tax: any) => acc + Number(tax.cuota || 0), 0);

    const diff = Math.abs(total - (base + taxes));
    return diff <= 0.05;
  }, [doc, form.watch('total'), form.watch('base_imponible'), form.watch('iva_details')]);

  useEffect(() => {
    const auditParam = searchParams.get('audit');
    if (auditParam === 'true') {
      console.log('🔍 [page] Modo Auditoría forzado por URL');
      setIsAuditMode(true);
    }
  }, [searchParams]);

  const fetchDocument = useCallback(async (id: number) => {
    try {
      setIsLoading(true);

      const response = await fetch(`/api/documents/${id}`, {
        method: 'GET',
        cache: 'no-store'
      });

      if (!response.ok) {
        if (response.status === 404) {
          notFound();
        }
        throw new Error(`Error ${response.status}`);
      }

      const fetchedDoc = await response.json();
      setDoc(fetchedDoc);

      if (lastDocIdRef.current !== fetchedDoc.id_documento) {
        console.log('🔄 [page] Reseteando form para nuevo documento:', fetchedDoc.id_documento);
        resetFormWithDocData(fetchedDoc);
        lastDocIdRef.current = fetchedDoc.id_documento;
      }

    } catch (error) {
      console.error("Failed to fetch document", error);
      toast({
        title: "Error",
        description: "No se pudo cargar el documento.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, resetFormWithDocData]);

  useEffect(() => {
    const idParam = params.id;
    const id = parseInt(Array.isArray(idParam) ? idParam[0] as string : idParam as string, 10);

    if (isNaN(id)) {
      notFound();
      return;
    }

    fetchDocument(id);

    // Cargar sugerencias persistentes
    getAuditHistory(id).then(setSuggestions).catch(console.error);
  }, [params.id, fetchDocument]);

  // Re-cargar sugerencias al entrar en modo auditoría para asegurar frescura
  useEffect(() => {
    if (isAuditMode && doc) {
      getAuditHistory(doc.id_documento).then(setSuggestions).catch(console.error);
    }
  }, [isAuditMode, doc?.id_documento]);

  const onAnalysisComplete = useCallback(() => {
    if (doc) {
      fetchDocument(doc.id_documento);
      getAuditHistory(doc.id_documento).then(setSuggestions).catch(console.error);
    }
  }, [doc, fetchDocument]);

  // Auto-audit trigger eliminado a petición del usuario para mantener control manual

  const handleDelete = async () => {
    if (!doc) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/documents/${doc.id_documento}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "✅ Documento Eliminado",
          description: "El documento ha sido eliminado correctamente.",
          className: "bg-gradient-to-br from-green-500 to-emerald-600 text-white",
        });
        window.location.href = '/documents';
      } else {
        toast({
          title: "Error",
          description: result.error || "No se pudo eliminar el documento.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Failed to delete document", error);
      toast({
        title: "Error",
        description: "No se pudo eliminar el documento.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleValidate = async () => {
    if (!doc || !doc.incidencia) return;
    setIsValidating(true);
    try {
      const response = await fetch(`/api/documents/${doc.id_documento}/validate`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Error al validar');
      }

      const esSinConfirmar = doc.tipo_documento?.toUpperCase().includes('(SIN CONFIRMAR)');

      if (esSinConfirmar) {
        const confirmResponse = await fetch('/api/documents-confirm', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentId: doc.id_documento })
        });

        if (!confirmResponse.ok) {
          throw new Error('Error al confirmar el documento');
        }
      }

      toast({
        title: "✅ Documento Validado",
        description: esSinConfirmar
          ? "Incidencias resueltas y documento confirmado"
          : "Las incidencias han sido marcadas como resueltas",
        className: "bg-gradient-to-br from-green-500 to-emerald-600 text-white",
      });

      // Limpiar sugerencias de la IA ya que el documento es válido
      await clearSuggestions(doc.id_documento);
      setSuggestions([]);

      fetchDocument(doc.id_documento);
    } catch (error) {
      console.error("Failed to validate incidents", error);
      toast({
        title: "Error",
        description: "No se pudieron validar las incidencias.",
        variant: "destructive",
      });
    } finally {
      setIsValidating(false);
    }
  }

  const onSubmit = async (data: DocumentUpdatePayload) => {
    if (!doc) return;

    // ✅ GUARD: Prevenir ejecución si no está en modo edición ni modo auditoría
    if (!isEditing && !isAuditMode) {
      console.log('⚠️ [onSubmit] Bloqueado - no está en modo edición ni auditoría');
      return;
    }

    if (isSaving) {
      console.log('⚠️ [onSubmit] Bloqueado - ya está guardando');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/documents/${doc.id_documento}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Error al actualizar');
      }

      const updatedDoc = { ...doc, ...data };
      setDoc(updatedDoc);
      resetFormWithDocData(updatedDoc);

      toast({
        title: '✅ Cambios Guardados',
        description: 'El documento se actualizó correctamente.',
        className: "bg-gradient-to-br from-green-500 to-emerald-600 text-white",
      });

      setIsEditing(false);

    } catch (error: any) {
      console.error(error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo actualizar el documento.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = useCallback(() => {
    if (!doc) return;
    console.log('🔄 [page] Reset manual al cancelar edición');
    resetFormWithDocData(doc);
  }, [doc, resetFormWithDocData]);

  // isEditable y isFixed han sido movidos arriba para soporte de auto-audit

  const refreshHistory = useCallback(async () => {
    if (doc) {
      try {
        const history = await getAuditHistory(doc.id_documento);
        setSuggestions(history);
      } catch (err) {
        console.error("Error refreshing audit history", err);
      }
    }
  }, [doc?.id_documento]);

  const isAuditRequest = searchParams.get('audit') === 'true';

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center space-y-4 animate-pulse">
            <Loader2 className={cn("h-12 w-12 animate-spin mx-auto", isAuditRequest ? "text-violet-500" : "text-primary")} />
            <p className={cn("text-sm font-bold uppercase tracking-widest", isAuditRequest ? "text-violet-500" : "text-muted-foreground")}>
              {isAuditRequest ? 'Preparando Health Check...' : 'Cargando documento...'}
            </p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!doc) {
    return notFound();
  }

  const documentUrl = doc?.archivos?.[0]?.ruta_archivo;
  const exportData = doc ? [doc] : [];

  // El return de AuditSplitView se mantiene aquí
  if (isAuditMode && doc) {
    return (
      <AuditSplitView
        doc={doc}
        form={form}
        suggestions={suggestions}
        onClose={() => setIsAuditMode(false)}
        isFixed={isFixed}
        onSubmit={onSubmit}
        isSaving={isSaving}
        onHistoryUpdate={refreshHistory}
      />
    );
  }

  // ✅ CONTENIDO SIN FORM
  const pageContent = (
    <div className="flex-1 space-y-4 sm:space-y-6 p-4 pt-4 sm:pt-6 sm:p-6 lg:p-8">
      <MainLayoutHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between w-full gap-3 sm:gap-4 animate-fade-in" style={{ animationDelay: '0ms' }} data-tutorial="documento-header">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight truncate bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
              {isEditing ? (
                <span className="flex items-center gap-2">
                  <Edit className="h-6 w-6 text-primary animate-pulse" />
                  Editando Documento
                </span>
              ) : (
                'Detalles del Documento'
              )}
            </h2>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap" data-tutorial="documento-actions">
            {isEditing ? (
              <>
                <Button
                  variant="outline"
                  type="button"
                  size="sm"
                  onClick={() => {
                    setIsEditing(false);
                    resetForm();
                  }}
                  className="flex-1 sm:flex-none hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all duration-200 group"
                >
                  <X className="mr-2 h-4 w-4 group-hover:rotate-90 transition-transform duration-300" />
                  <span className="hidden xs:inline">Cancelar</span>
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSaving || !form.formState.isDirty}
                  className="flex-1 sm:flex-none bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 disabled:scale-100 disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  <span className="hidden xs:inline">Guardar</span>
                </Button>
              </>
            ) : (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div tabIndex={0} className="flex-1 sm:flex-none">
                      <Button
                        variant="outline"
                        type="button"
                        size="sm"
                        onClick={() => setIsPreviewOpen(true)}
                        disabled={!documentUrl}
                        className="w-full sm:w-auto hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 dark:hover:bg-blue-950 dark:hover:text-blue-400 dark:hover:border-blue-700 transition-all duration-200 group disabled:cursor-not-allowed"
                        data-tutorial="documento-archivo"
                      >
                        <Eye className="h-4 w-4 sm:mr-2 group-hover:scale-110 transition-transform duration-200" />
                        <span className="hidden sm:inline">Ver</span>
                      </Button>
                    </div>
                  </TooltipTrigger>
                  {!documentUrl && (
                    <TooltipContent>
                      <p>No hay un archivo adjunto</p>
                    </TooltipContent>
                  )}
                </Tooltip>

                {doc.incidencia && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleValidate}
                    disabled={isValidating}
                    className="hidden md:flex bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 group"
                  >
                    {isValidating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform duration-200" />
                    )}
                    Validar
                  </Button>
                )}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <div tabIndex={0} className="flex-1 sm:flex-none">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setIsEditing(true)}
                        disabled={!isEditable}
                        className="w-full sm:w-auto hover:bg-primary/90 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 disabled:scale-100 disabled:opacity-50 group"
                      >
                        {isEditable ? (
                          <Edit className="h-4 w-4 sm:mr-2 group-hover:rotate-12 transition-transform duration-200" />
                        ) : (
                          <Lock className="h-4 w-4 sm:mr-2" />
                        )}
                        <span className="hidden sm:inline">Editar</span>
                      </Button>
                    </div>
                  </TooltipTrigger>
                  {!isEditable && (
                    <TooltipContent>
                      <p>El trimestre está cerrado</p>
                    </TooltipContent>
                  )}
                </Tooltip>

                <Button
                  variant="outline"
                  type="button"
                  size="sm"
                  onClick={() => setIsAuditMode(true)}
                  className="hidden md:flex bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100 hover:border-violet-300 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800 transition-all shadow-sm"
                >
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Modo Auditoría
                </Button>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="hidden lg:block">
                      <Button
                        variant="destructive"
                        type="button"
                        size="sm"
                        onClick={() => setIsDeleteDialogOpen(true)}
                        disabled={isDeleting || !isEditable}
                        className="hover:bg-destructive/90 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 group disabled:opacity-50 disabled:scale-100"
                      >
                        {isDeleting ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : !isEditable ? (
                          <Lock className="mr-2 h-4 w-4" />
                        ) : (
                          <Trash2 className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform duration-200" />
                        )}
                        Eliminar
                      </Button>
                    </div>
                  </TooltipTrigger>
                  {!isEditable && (
                    <TooltipContent side="bottom" className="bg-destructive text-destructive-foreground border-none">
                      <p>No se puede eliminar: Trimestre cerrado</p>
                    </TooltipContent>
                  )}
                </Tooltip>

                <div className="hidden lg:block">
                  <ExportButton
                    data={exportData}
                    filename={`documento_${doc.id_documento}`}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </MainLayoutHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
        <div className="lg:col-span-2 space-y-4 sm:space-y-6 lg:space-y-8 animate-fade-in" style={{ animationDelay: '50ms' }}>
          <div className="transition-all duration-300 hover:scale-[1.01]" data-tutorial="documento-view">
            <DocumentView doc={doc} isEditing={isEditing} form={form} />
          </div>
        </div>

        <div className="space-y-4 sm:space-y-6">
          {doc.incidencia && (
            <div
              className="bg-red-50 border border-red-200 rounded-lg p-4 dark:bg-red-950 dark:border-red-800"
              data-tutorial="documento-incidencias"
            >
              <p className="text-sm text-red-800 dark:text-red-200">
                <strong>⚠️ Incidencia detectada:</strong> {doc.incidencia_razon || 'Este documento tiene problemas sin resolver.'}
              </p>
            </div>
          )}

          <div className="animate-fade-in group" style={{ animationDelay: '100ms' }} data-tutorial="documento-financiero">
            <div className="transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/10">
              <FinancialDetailsCard
                doc={doc}
                isEditing={isEditing}
                form={form}
              />
            </div>
          </div>

          <div data-tutorial="documento-entidades">
            {entidadFields.map((field, index) => (
              <div
                key={field.id}
                className="animate-fade-in group mb-4"
                style={{ animationDelay: `${150 + (index * 50)}ms` }}
              >
                <div className="transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/10">
                  <EditableEntityCard
                    isEditing={isEditing}
                    form={form}
                    entityIndex={index}
                    removeEntity={() => removeEntidad(index)}
                  />
                </div>
              </div>
            ))}
          </div>

          {isEditing && (
            <div className="animate-fade-in" style={{ animationDelay: `${150 + (entidadFields.length * 50)}ms` }}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => appendEntidad({
                  rol: 'Otro',
                  nombre: '',
                  direccion: '',
                  identificador_fiscal: '',
                  telefono: '',
                  email: '',
                  datos_extra: null
                })}
                className="w-full hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all duration-200 group"
              >
                <PlusCircle className="mr-2 h-4 w-4 group-hover:rotate-90 transition-transform duration-300" />
                Añadir Entidad
              </Button>
            </div>
          )}

          <div className="animate-fade-in group" style={{ animationDelay: `${250 + (entidadFields.length * 50)}ms` }} data-tutorial="documento-analizar">
            <div className="transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/10">
              <AnalyzeDocumentCard
                documentId={doc.id_documento}
                onAnalysisComplete={onAnalysisComplete}
              />
            </div>
          </div>

          {!isEditing && (
            <div className="flex flex-col gap-2 lg:hidden animate-fade-in" style={{ animationDelay: `${250 + (entidadFields.length * 50)}ms` }}>
              {doc.incidencia && (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleValidate}
                  disabled={isValidating}
                  className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 group"
                >
                  {isValidating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform duration-200" />
                  )}
                  Validar Incidencias
                </Button>
              )}

              <Button
                variant="destructive"
                type="button"
                size="sm"
                onClick={() => setIsDeleteDialogOpen(true)}
                disabled={isDeleting || !isEditable}
                className="w-full hover:bg-destructive/90 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 group disabled:opacity-50"
              >
                {isDeleting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : !isEditable ? (
                  <Lock className="mr-2 h-4 w-4" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform duration-200" />
                )}
                {isEditable ? 'Eliminar Documento' : 'Documento Bloqueado'}
              </Button>

              <ExportButton
                data={exportData}
                filename={`documento_${doc.id_documento}`}
                className="w-full"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <MainLayout>
      <TooltipProvider>
        <Form {...form}>
          {/* ✅ FORM SOLO ENVUELVE CUANDO ESTÁ EN MODO EDICIÓN */}
          {isEditing ? (
            <form onSubmit={form.handleSubmit(onSubmit)}>
              {pageContent}
            </form>
          ) : (
            pageContent
          )}
        </Form>
      </TooltipProvider>

      <DeleteConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDelete}
        documentNumber={doc.numero_documento || `ID: ${doc.id_documento}`}
        isDeleting={isDeleting}
      />
      <DocumentPreviewDialog
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        documentUrl={documentUrl ?? null}
        documentName={doc.archivos?.[0]?.nombre_archivo || `documento_${doc.id_documento}.pdf`}
      />

      <style jsx global>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.5s ease-out forwards;
          opacity: 0;
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-fade-in {
            animation: none;
            opacity: 1;
          }
        }
      `}</style>
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