'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { notFound, useParams, useSearchParams, useRouter } from 'next/navigation';
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
import { calcularTrimestreExtendido } from '@/lib/client-utils';
import { type QuarterOption } from '@/components/documento/quarter-reassignment-dialog';
import { UnifiedPreSaveDialog } from '@/components/documento/UnifiedPreSaveDialog';
import { normalizeCIF } from '@/lib/utils';
import { PreSaveIssue } from '@/lib/types';
import { checkTipoMismatch, checkFieldChanges } from '@/lib/presave-validations';
import { FiscalAuditConfirmDialog } from '@/components/dashboard/fiscal-audit-confirm-dialog';
import { useDocumentNavigation } from '@/hooks/useDocumentNavigation';
import { useDemoMode } from '@/context/DemoModeContext';
import { DEMO_DOCUMENTS } from '@/lib/demo-data';


function DocumentoPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isDemoMode } = useDemoMode();

  const docId = useMemo(() => {
    const idParam = params?.id;
    const rawId = Array.isArray(idParam) ? idParam[0] : idParam;
    const parsed = parseInt(rawId as string, 10);
    return isNaN(parsed) ? null : parsed;
  }, [params]);

  const [doc, setDoc] = useState<Document | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isAuditMode, setIsAuditMode] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isPreSaveDialogOpen, setIsPreSaveDialogOpen] = useState(false);

  const form = useForm<DocumentUpdatePayload>({
    resolver: zodResolver(DocumentUpdateSchema),
    defaultValues: { entidades: [], lineas: [], iva_details: [] }
  });

  const navState = useDocumentNavigation(docId, doc?.empresa_id, form.formState.isDirty);
  const [preSaveState, setPreSaveState] = useState<{
    pendingPayload: DocumentUpdatePayload;
    issues: PreSaveIssue[];
    quarterContext?: {
      newDate: string;
      targetQuarter: { año: number; trimestre: number };
      currentQuarter: { año: number; trimestre: number };
      isTargetClosed: boolean;
      availableQuarters: QuarterOption[];
    };
    healthTransition?: {
      wasInHealthCheck: boolean;
      willBeInHealthCheck: boolean;
      newIssueReason?: string;
    };
  } | null>(null);

  const { toast } = useToast();
  const lastDocIdRef = useRef<number | null>(null);

  // keep useFieldArray mounted so the form context is initialized
  useFieldArray({ control: form.control, name: 'entidades' });

  const resetFormWithDocData = useCallback((docData: Document) => {
    const clientEnt = docData.entidades?.find(e => e.rol === 'cliente' || e.rol === 'receptor');
    form.reset({
      ...docData,
      fecha_emision: docData.fecha_emision ? new Date(docData.fecha_emision).toISOString().split('T')[0] : '',
      fecha_vencimiento: docData.fecha_vencimiento ? new Date(docData.fecha_vencimiento).toISOString().split('T')[0] : '',
      cif: docData.cif || '',
      proveedor: docData.proveedor || '',
      empresa_nombre: docData.empresa_nombre || '',
      cliente_nombre: clientEnt?.nombre || '',
      cliente_cif: clientEnt?.identificador_fiscal || '',
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
    const baseNS = Number((fv as any).base_no_sujeta ?? (doc as any).base_no_sujeta ?? 0);
    const retencion = Number((fv as any).retencion_irpf ?? (doc as any).retencion_irpf ?? 0);
    const descuento = Number((fv as any).descuento_global ?? (doc as any).descuento_global ?? 0);
    const isAbono = total < 0 || base < 0 || String(doc?.tipo_documento ?? '').toUpperCase().includes('ABONO') || String(doc?.tipo_documento ?? '').toUpperCase().includes('RECTIFICATIVA');
    const retencionEfectiva = isAbono ? Math.abs(retencion) : -Math.abs(retencion);
    return Math.abs(total - (base + baseNS + taxes + retencionEfectiva - descuento)) <= 0.05;
  }, [doc, form.watch('total'), form.watch('base_imponible'), form.watch('iva_details'), form.watch('retencion_irpf' as any), form.watch('base_no_sujeta' as any), form.watch('descuento_global' as any), searchParams]);

  useEffect(() => {
    if (searchParams.get('audit') === 'true') setIsAuditMode(true);
  }, [searchParams]);

  const fetchDocument = useCallback(async (id: number) => {
    try {
      setIsLoading(true);

      if (isDemoMode) {
        const found = DEMO_DOCUMENTS.find(d => d.id_documento === id) || DEMO_DOCUMENTS[0];
        setDoc(found);
        if (lastDocIdRef.current !== found.id_documento) {
          resetFormWithDocData(found);
          lastDocIdRef.current = found.id_documento;
        }
        setIsLoading(false);
        return;
      }

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
  }, [toast, resetFormWithDocData, isDemoMode]);

  useEffect(() => {
    if (docId === null) { notFound(); return; }
    fetchDocument(docId);
    getAuditHistory(docId).then(setSuggestions).catch(console.error);
  }, [docId, fetchDocument]);

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

  const [isFiscalConfirmDialogOpen, setIsFiscalConfirmDialogOpen] = useState(false);

  const executeValidate = async () => {
    if (!doc) return;
    setIsValidating(true);
    try {
      const res = await fetch(`/api/documents/${doc.id_documento}/validate`, { method: 'POST' });
      if (!res.ok) throw new Error('Error al validar');
      if (doc.tipo_documento?.toUpperCase().includes('(SIN CONFIRMAR)')) {
        const cr = await fetch('/api/documents-confirm', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId: doc.id_documento }) });
        if (!cr.ok) throw new Error('Error al confirmar');
      }
      toast({ title: '✅ Documento Validado', description: 'El documento ha sido verificado e integrado a contabilidad.', className: 'bg-gradient-to-br from-green-500 to-emerald-600 text-white' });
      await clearSuggestions(doc.id_documento);
      setSuggestions([]);
      // Navegar de vuelta a la página anterior
      setTimeout(() => router.back(), 400);
    } catch {
      toast({ title: 'Error', description: 'No se pudieron validar las incidencias.', variant: 'destructive' });
    } finally {
      setIsValidating(false);
      setIsFiscalConfirmDialogOpen(false);
    }
  };

  const handleValidate = async () => {
    if (!doc) return;
    // Mostrar diálogo si hay cualquier señal de error activo:
    // - tiene incidencia abierta, O
    // - viene de health check (audit=true en URL), O
    // - tiene hcs_motivo registrado, O
    // - tiene mismatch matemático detectado
    const hasActiveIssue =
      !!doc.incidencia ||
      searchParams.get('audit') === 'true' ||
      !!(doc as any).hcs_motivo ||
      Number((doc as any).hcs_mismatch_amount || 0) > 0.05;

    if (hasActiveIssue) {
      setIsFiscalConfirmDialogOpen(true);
    } else {
      await executeValidate();
    }
  };

  const handleMarkDuplicate = async () => {
    if (!doc) return;
    try {
      const res = await fetch(`/api/documents/${doc.id_documento}/duplicate`, { method: 'POST' });
      if (!res.ok) throw new Error('Error al actualizar');

      if (doc.empresa_id) {
        try {
          await fetch('/api/documents/check-duplicates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ empresaId: doc.empresa_id }),
          });
        } catch (dupErr) {
          console.error('⚠️ [handleMarkDuplicate] Error forzando check-duplicates:', dupErr);
        }
      }

      toast({ title: '✅ Marcado como Duplicado', description: 'El documento ha sido enviado a revisión por duplicidad.', className: 'bg-gradient-to-br from-amber-500 to-orange-600 text-white' });
      await fetchDocument(doc.id_documento);
    } catch {
      toast({ title: 'Error', description: 'No se pudo marcar como duplicado.', variant: 'destructive' });
    }
  };

  const executeSave = async (payload: DocumentUpdatePayload) => {
    if (!doc) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/documents/${doc.id_documento}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!res.ok || !result.success) throw new Error(result.error || 'Error al actualizar');

      // 🔄 Forzar re-verificación de duplicados inmediata para la empresa
      const targetEmpresaId = doc.empresa_id;
      if (targetEmpresaId) {
        try {
          await fetch('/api/documents/check-duplicates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ empresaId: targetEmpresaId }),
          });
        } catch (dupErr) {
          console.error('⚠️ [executeSave] Error forzando check-duplicates:', dupErr);
        }
      }

      await fetchDocument(doc.id_documento);
      toast({
        title: '✅ Cambios Guardados',
        description: 'El documento y su configuración se actualizaron correctamente.',
        className: 'bg-gradient-to-br from-green-500 to-emerald-600 text-white'
      });
      setIsEditing(false);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'No se pudo actualizar el documento.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const onFormError = (errors: any) => {
    console.warn('⚠️ Error de validación en formulario:', errors);
    const firstKey = Object.keys(errors)[0];
    const firstErr = errors[firstKey];
    const msg = firstErr?.message || 'Por favor revisa los campos del formulario.';
    toast({
      title: '⚠️ Validación del formulario',
      description: String(msg),
      variant: 'destructive',
    });
  };

  const onSubmit = async (data: DocumentUpdatePayload) => {
    if (!doc || (!isEditing && !isAuditMode) || isSaving) return;

    // Mostrar spinner de inmediato mientras corren los chequeos previos al guardado
    setIsSaving(true);
    try {
    const finalData = { ...data };
    let updatedEntidades = [...(finalData.entidades || [])];

    if (finalData.proveedor !== undefined || finalData.cif !== undefined) {
      updatedEntidades = updatedEntidades.map(e => {
        if (e.rol === 'emisor' || e.rol === 'proveedor') {
          return { ...e, nombre: finalData.proveedor !== undefined ? finalData.proveedor : e.nombre, identificador_fiscal: finalData.cif !== undefined ? finalData.cif : e.identificador_fiscal };
        }
        return e;
      });
    }

    if (finalData.cliente_nombre !== undefined || finalData.cliente_cif !== undefined) {
      let foundClient = false;
      updatedEntidades = updatedEntidades.map(e => {
        if (e.rol === 'cliente' || e.rol === 'receptor') {
          foundClient = true;
          return { ...e, nombre: finalData.cliente_nombre !== undefined ? finalData.cliente_nombre : e.nombre, identificador_fiscal: finalData.cliente_cif !== undefined ? finalData.cliente_cif : e.identificador_fiscal };
        }
        return e;
      });
      if (!foundClient && (finalData.cliente_nombre || finalData.cliente_cif)) {
        updatedEntidades.push({ rol: 'cliente', nombre: finalData.cliente_nombre || null, identificador_fiscal: finalData.cliente_cif || null, direccion: null, telefono: null, email: null, datos_extra: null });
      }
    }

    finalData.entidades = updatedEntidades;

    const issues: PreSaveIssue[] = [];

    // ── V1: Tipo de Documento / is_issued Mismatch ───────────────────────
    const tipoIssue = checkTipoMismatch({
      tipoDocumento: finalData.tipo_documento || doc.tipo_documento,
      total: finalData.total ?? doc.total,
      entidades: updatedEntidades,
      empresaCIF: doc.empresa_cif,
      empresaNombre: doc.empresa_nombre,
      cif: finalData.cif,
      clienteCIF: finalData.cliente_cif,
    });
    if (tipoIssue) {
      issues.push(tipoIssue);
    }

    // ── V2: Revisión de cambios (diff original doc vs propuesto) ────────
    const originalIvaCuotas = (doc.iva_details || []).reduce((s: number, i: any) => s + Number(i.cuota || 0), 0);
    const proposedIvaCuotas = (finalData.iva_details || []).reduce((s: number, i: any) => s + Number(i.cuota || 0), 0);

    // Derive original client data from doc.entidades (Document type has no flat cliente_* fields)
    const origEntidades: any[] = (doc as any).entidades || [];
    const origClientEnt = origEntidades.find((e: any) => e.rol === 'cliente' || e.rol === 'receptor');
    const origProvEnt   = origEntidades.find((e: any) => e.rol === 'proveedor' || e.rol === 'emisor');

    const changesIssue = checkFieldChanges(
      {
        numero_documento:  doc.numero_documento,
        fecha_emision:     doc.fecha_emision ? new Date(doc.fecha_emision).toISOString().split('T')[0] : null,
        fecha_vencimiento: doc.fecha_vencimiento ? new Date(doc.fecha_vencimiento).toISOString().split('T')[0] : null,
        tipo_documento:    doc.tipo_documento,
        base_imponible:    Number(doc.base_imponible ?? 0),
        iva_cuotas_sum:    originalIvaCuotas,
        total:             Number(doc.total ?? 0),
        cif:               origProvEnt?.identificador_fiscal ?? doc.cif,
        proveedor:         origProvEnt?.nombre ?? doc.proveedor,
        cliente_cif:       origClientEnt?.identificador_fiscal ?? null,
        cliente_nombre:    origClientEnt?.nombre ?? null,
        moneda:            doc.moneda,
        observaciones:     doc.observaciones,
      },
      {
        numero_documento:  finalData.numero_documento ?? doc.numero_documento,
        fecha_emision:     finalData.fecha_emision ?? (doc.fecha_emision ? new Date(doc.fecha_emision).toISOString().split('T')[0] : null),
        fecha_vencimiento: finalData.fecha_vencimiento ?? (doc.fecha_vencimiento ? new Date(doc.fecha_vencimiento).toISOString().split('T')[0] : null),
        tipo_documento:    finalData.tipo_documento ?? doc.tipo_documento,
        base_imponible:    Number(finalData.base_imponible ?? doc.base_imponible ?? 0),
        iva_cuotas_sum:    proposedIvaCuotas,
        total:             Number(finalData.total ?? doc.total ?? 0),
        cif:               finalData.cif ?? origProvEnt?.identificador_fiscal ?? doc.cif,
        proveedor:         finalData.proveedor ?? origProvEnt?.nombre ?? doc.proveedor,
        cliente_cif:       finalData.cliente_cif ?? origClientEnt?.identificador_fiscal ?? null,
        cliente_nombre:    finalData.cliente_nombre ?? origClientEnt?.nombre ?? null,
        moneda:            finalData.moneda ?? doc.moneda,
        observaciones:     finalData.observaciones ?? doc.observaciones,
      }
    );
    if (changesIssue) issues.push(changesIssue);


    if (finalData.numero_documento && doc.empresa_id) {
      try {
        const res = await fetch(`/api/documents/${doc.id_documento}/pre-save-check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            numero_documento: finalData.numero_documento,
            empresa_id: doc.empresa_id,
            tipo_documento: finalData.tipo_documento || doc.tipo_documento,
            cif: finalData.cif || origProvEnt?.identificador_fiscal || doc.cif,
            proveedor: finalData.proveedor || origProvEnt?.nombre || doc.proveedor,
          }),
        });
        if (res.ok) {
          const checkRes = await res.json();
          if (checkRes.issues && Array.isArray(checkRes.issues)) {
            issues.push(...checkRes.issues);
          }
        }
      } catch (e) {
        console.error('Error en pre-save-check API:', e);
      }
    }

    const oldDateStr = doc.fecha_emision ? new Date(doc.fecha_emision).toISOString().split('T')[0] : '';
    const newDateStr = finalData.fecha_emision ? finalData.fecha_emision.split('T')[0] : oldDateStr;

    let quarterCtx: any = null;

    if (newDateStr) {
      let availableQuarters: QuarterOption[] = [];
      try {
        const resAvail = await fetch(`/api/trimestres/disponibles?empresa_id=${doc.empresa_id || ''}`);
        if (resAvail.ok) availableQuarters = await resAvail.json();
      } catch (e) { console.error(e); }

      const naturalQuarter = calcularTrimestreExtendido(newDateStr);
      const currentYear = new Date().getFullYear();
      const isPastYear = naturalQuarter.año < currentYear;

      let targetQuarter = naturalQuarter;
      if (isPastYear) {
        const openInCurrentYear = availableQuarters.find(q => q.año === currentYear && !q.cerrado);
        if (openInCurrentYear) {
          targetQuarter = { año: openInCurrentYear.año, trimestre: openInCurrentYear.trimestre };
        } else {
          targetQuarter = { año: currentYear, trimestre: 1 };
        }
      }

      const currentQuarter = {
        año: doc.año_trimestre || targetQuarter.año,
        trimestre: doc.num_trimestre || targetQuarter.trimestre
      };

      const isQuarterMismatch = currentQuarter.año !== targetQuarter.año || currentQuarter.trimestre !== targetQuarter.trimestre;

      if (newDateStr !== oldDateStr || !doc.num_trimestre || !doc.año_trimestre || isQuarterMismatch || isPastYear) {
        const isTargetOpen = availableQuarters.some(q => q.año === targetQuarter.año && q.trimestre === targetQuarter.trimestre && !q.cerrado);
        const isTargetClosed = !isTargetOpen;
        const isQuarterChanged = currentQuarter.año !== targetQuarter.año || currentQuarter.trimestre !== targetQuarter.trimestre;

        if (isTargetClosed || isQuarterChanged || isPastYear) {
          quarterCtx = {
            newDate: newDateStr,
            targetQuarter,
            naturalQuarter,
            isPastYear,
            currentQuarter,
            isTargetClosed,
            availableQuarters,
          };
          issues.push({
            type: 'QUARTER_CHANGE',
            title: 'Reasignación de Trimestre Fiscal',
            description: isPastYear
              ? `La fecha de emisión pertenece al ejercicio anterior (${naturalQuarter.año} - T${naturalQuarter.trimestre}). Por normativa fiscal, debe ser asignada al año actual (${targetQuarter.año} - T${targetQuarter.trimestre}).`
              : isTargetClosed
              ? `El trimestre de la fecha ingresada (${targetQuarter.año} - T${targetQuarter.trimestre}) está CERRADO.`
              : `La fecha ingresada corresponde al trimestre ${targetQuarter.año} - T${targetQuarter.trimestre}.`,
            blocking: false,
          });
        } else {
          finalData.año_trimestre = targetQuarter.año;
          finalData.num_trimestre = targetQuarter.trimestre;
        }
      }
    }

    // ── Simulación Pre-guardado de Health Check ──────────────────────
    const wasInHealthCheck = !!(doc as any).hcs_check_type || doc.incidencia || searchParams.get('audit') === 'true';
    const propBase = Number(finalData.base_imponible ?? doc.base_imponible ?? 0);
    const propTotal = Number(finalData.total ?? doc.total ?? 0);
    // Campos adicionales que afectan el total: base exenta, retención IRPF (campo separado), descuento
    const propBaseNoSujeta   = Number(finalData.base_no_sujeta   ?? (doc as any).base_no_sujeta   ?? 0);
    const propRetencionIrpf  = Number(finalData.retencion_irpf   ?? (doc as any).retencion_irpf   ?? 0);
    const propDescuentoGlobal = Number(finalData.descuento_global ?? (doc as any).descuento_global ?? 0);
    const mathMismatch = Math.abs(
      propTotal - (propBase + propBaseNoSujeta + proposedIvaCuotas - propRetencionIrpf - propDescuentoGlobal)
    ) > 0.05;

    let healthTransition: { wasInHealthCheck: boolean; willBeInHealthCheck: boolean; newIssueReason?: string } | undefined = undefined;

    if (wasInHealthCheck && !mathMismatch) {
      healthTransition = { wasInHealthCheck: true, willBeInHealthCheck: false };
    } else if (!wasInHealthCheck && mathMismatch) {
      healthTransition = { wasInHealthCheck: false, willBeInHealthCheck: true, newIssueReason: 'descuadre entre Importe Total y la suma de Base + IVA' };
    }

    if (issues.length > 0 || healthTransition) {
      // Pausamos el spinner: el usuario debe interactuar con el dialog antes de guardar
      setIsSaving(false);
      setPreSaveState({
        pendingPayload: finalData,
        issues,
        quarterContext: quarterCtx,
        healthTransition,
      });
      setIsPreSaveDialogOpen(true);
      return;
    }

    await executeSave(finalData);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Error al procesar el guardado.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePreSaveConfirm = async (resolutions: {
    año?: number;
    trimestre?: number;
    tipoDocumento?: string;
    validateAndRedirect?: boolean;
  }) => {
    if (!preSaveState?.pendingPayload) return;
    setIsPreSaveDialogOpen(false);
    const finalPayload = {
      ...preSaveState.pendingPayload,
      ...(resolutions.tipoDocumento ? { tipo_documento: resolutions.tipoDocumento } : {}),
      ...(resolutions.año ? { año_trimestre: resolutions.año } : {}),
      ...(resolutions.trimestre ? { num_trimestre: resolutions.trimestre } : {}),
    };
    await executeSave(finalPayload);

    if (resolutions.validateAndRedirect && doc) {
      try {
        await fetch('/api/documents/health-confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentId: doc.id_documento }),
        });
        toast({
          title: '✅ Documento Validado',
          description: 'El documento fue marcado como verificado y pasó a contabilidad.',
          className: 'bg-gradient-to-br from-green-500 to-emerald-600 text-white',
        });
        window.location.href = '/dashboard/health-check';
      } catch (e) {
        console.error('Error al autoconfirmar documento:', e);
      }
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
      <>
        <AuditSplitView
          doc={doc} form={form} suggestions={suggestions}
          onClose={() => setIsAuditMode(false)} isFixed={isFixed}
          onSubmit={onSubmit} isSaving={isSaving} onHistoryUpdate={refreshHistory}
          checkType={searchParams.get('checkType') || 'MISMATCH_MATEMATICO'}
          motivo={searchParams.get('motivo') || ''}
          navigation={navState}
        />
        {preSaveState && (
          <UnifiedPreSaveDialog
            isOpen={isPreSaveDialogOpen}
            onClose={() => setIsPreSaveDialogOpen(false)}
            onConfirm={handlePreSaveConfirm}
            issues={preSaveState.issues}
            quarterContext={preSaveState.quarterContext}
            healthTransition={preSaveState.healthTransition}
          />
        )}
      </>
    );
  }

  const reviewLayout = (
    <ReviewInvoiceLayout
      doc={doc} form={form} isEditing={isEditing} isSaving={isSaving}
      isDeleting={isDeleting} isValidating={isValidating} isEditable={isEditable}
      onEdit={() => setIsEditing(true)}
      onCancelEdit={() => { setIsEditing(false); resetForm(); }}
      onSave={form.handleSubmit(onSubmit, onFormError)}
      onDelete={() => setIsDeleteDialogOpen(true)}
      onValidate={handleValidate}
      onAuditMode={() => setIsAuditMode(true)}
      onMarkDuplicate={handleMarkDuplicate}
      navigation={navState}
    />
  );

  return (
    <MainLayout noPadding>
      <TooltipProvider>
        <Form {...form}>
          {isEditing
            ? <form onSubmit={form.handleSubmit(onSubmit, onFormError)}>{reviewLayout}</form>
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
      {preSaveState && (
        <UnifiedPreSaveDialog
          isOpen={isPreSaveDialogOpen}
          onClose={() => setIsPreSaveDialogOpen(false)}
          onConfirm={handlePreSaveConfirm}
          issues={preSaveState.issues}
          quarterContext={preSaveState.quarterContext}
          healthTransition={preSaveState.healthTransition}
        />
      )}
      <FiscalAuditConfirmDialog
        isOpen={isFiscalConfirmDialogOpen}
        onClose={() => setIsFiscalConfirmDialogOpen(false)}
        onConfirm={executeValidate}
        onEdit={() => {
          setIsFiscalConfirmDialogOpen(false);
          setIsEditing(true);
        }}
        documentNumber={doc.numero_documento || `ID: ${doc.id_documento}`}
        motivo={(() => {
          // 1. Motivo registrado por el health check engine
          if ((doc as any).hcs_motivo) return (doc as any).hcs_motivo;
          // 2. Motivo pasado por URL al navegar desde Centro de Salud
          if (searchParams.get('motivo')) return searchParams.get('motivo')!;
          // 3. Razones de revisión fiscal guardadas durante el OCR (puede ser objeto o string)
          const datosExtra = typeof (doc as any).datos_extra === 'string'
            ? JSON.parse((doc as any).datos_extra || '{}')
            : ((doc as any).datos_extra || {});
          if (datosExtra.fiscal_revision_reasons) {
            const r = datosExtra.fiscal_revision_reasons;
            // Si es objeto {code, message}, extraer el message; si es array, unirlo; si es string, usarlo tal cual
            if (typeof r === 'string') return r;
            if (Array.isArray(r)) return r.map((x: any) => (typeof x === 'string' ? x : x.message || JSON.stringify(x))).join(' | ');
            if (typeof r === 'object' && r !== null) return r.message || r.code || JSON.stringify(r);
          }
          // 4. Incidencia abierta
          if (doc.incidencia) return doc.incidencia;
          // 5. Calcular mismatch directamente desde los campos del doc
          const base = Number((doc as any).importe_sin_impuestos || doc.base_imponible || 0);
          const total = Number((doc as any).importe_total || (doc as any).total || 0);
          if (total > 0 && Math.abs(total - base) > 0.05 && base > 0) {
            return `Posible descuadre detectado: el importe total (${total.toFixed(2)}€) y la base imponible (${base.toFixed(2)}€) presentan diferencias que requieren verificación.`;
          }
          return undefined;
        })()}
        isConfirming={isValidating}
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