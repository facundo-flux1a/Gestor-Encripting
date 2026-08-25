'use client'

import * as React from 'react'
import { useCompanyContext } from '@/context/CompanyProvider'
import { useDataRefresh } from '@/context/DataRefreshProvider';
import { Document } from '@/lib/types'
import { calculateFinancials } from '@/lib/financial-engine'
import { MainLayout } from '@/components/layout/main-layout'
import { PageHeader } from '@/components/layout/page-header'
import { DocumentsTable } from '@/components/dashboard/documents-table'
import { GroupedDocumentsView } from '@/components/dashboard/grouped-documents-view'
import { Button } from '@/components/ui/button'
import { UploadDialog } from '@/components/dashboard/upload-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDocumentEvents } from '@/hooks/useDocumentEvents'
import { Upload, Loader2, FileText, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { DocumentosTutorialRouter } from '@/components/tutorials/DocumentosTutorialRouter'
import { useTutorial } from '@/context/tutorial-context'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Suspense } from 'react'

function DocumentsPageContent() {
  const { selectedCompanyIds, companies } = useCompanyContext();
  const { refreshKey } = useDataRefresh();
  const { isTutorialActive, currentStep } = useTutorial();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [documents, setDocuments] = React.useState<Document[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = React.useState(false);
  const [key, setKey] = React.useState(0);
  const [isExportingPdf, setIsExportingPdf] = React.useState(false);

  const tabFromUrl = searchParams.get('tab');
  const [isTabChanging, setIsTabChanging] = React.useState(false);
  const { toast } = useToast();

  // 🎯 DRAG & DROP STATE
  const [draggedDocs, setDraggedDocs] = React.useState<number[]>([]);
  const [dragOverTab, setDragOverTab] = React.useState<string | null>(null);


  useDocumentEvents(() => {
    setKey(prevKey => prevKey + 1);
  });

  const handleDocumentChanged = React.useCallback(() => {
    setKey(prevKey => prevKey + 1);
  }, []);

  const handleUploadComplete = () => {
    setKey(prevKey => prevKey + 1);
  };

  // 🔥 Escuchar evento global 'documentUploaded' (para el tutorial y dialogs)
  React.useEffect(() => {
    const handleGlobalUpload = () => {
      console.log('🔄 [DocumentsPage] Evento global detectado, recargando...');
      setKey(prev => prev + 1);
    };

    window.addEventListener('documentUploaded', handleGlobalUpload);
    return () => window.removeEventListener('documentUploaded', handleGlobalUpload);
  }, []);

  React.useEffect(() => {
    async function loadDocuments() {
      if (!selectedCompanyIds || selectedCompanyIds.length === 0) {
        console.log('📭 [DocumentsPage] Sin empresas seleccionadas — lista vacía');
        setDocuments([]);
        setLoading(false);
        return;
      }

      const t0 = performance.now();
      console.log('📥 [DocumentsPage] Cargando documentos...', {
        companyIds: selectedCompanyIds,
        refetchKey: key,
      });
      try {
        setLoading(true);
        setError(null);

        const queryParams = selectedCompanyIds.map(id => `companyId=${id}`).join('&');
        const url = `/api/documents?${queryParams}`;

        const response = await fetch(url, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache'
          }
        });

        if (!response.ok) {
          console.error('❌ [DocumentsPage] API documents no OK', {
            status: response.status,
            statusText: response.statusText,
            url,
          });
          throw new Error('Error al cargar documentos desde la API');
        }

        const data = await response.json();
        const docs = data.documents || data;
        setDocuments(docs);
        if (Array.isArray(docs) && docs.length > 0) {
          try {
            const ids = docs.map((d: any) => d.id_documento).filter(Boolean);
            sessionStorage.setItem('document_navigation_ids', JSON.stringify(ids));
            sessionStorage.setItem('document_origin_url', '/documents');
          } catch (e) {
            console.warn('⚠️ [DocumentsPage] Error guardando navegación:', e);
          }
        }
        console.log(`⏱️ [PERF:client] DocumentsPage.fetch | ${Math.round(performance.now() - t0)}ms | docs=${Array.isArray(docs) ? docs.length : '?'} companies=${selectedCompanyIds.join(',')}`);
      } catch (err) {
        console.error('❌ [DocumentsPage] Error loading documents:', err);
        console.log(`⏱️ [PERF:client] DocumentsPage.fetch | ${Math.round(performance.now() - t0)}ms | error=1`);
        setError('Error al cargar los documentos');
      } finally {
        setLoading(false);
      }
    }

    loadDocuments();
  }, [selectedCompanyIds, key, refreshKey]);

  // ✅ CLASIFICACIÓN CORREGIDA: Validación de CIF para abonos
  const { facturasEmitidas, facturasRecibidas, otrosDocumentos, sinConfirmar } = React.useMemo(() => {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 [CLASIFICACIÓN] INICIO');
    console.log('═══════════════════════════════════════════════════════');

    const facturasEmitidas: Document[] = [];
    const facturasRecibidas: Document[] = [];
    const otrosDocumentos: Document[] = [];
    const sinConfirmar: Document[] = [];

    documents.forEach(doc => {
      const tipoLower = doc.tipo_documento?.toLowerCase() || '';

      // PASO 1: Verificar si es "sin confirmar"
      if (tipoLower.includes('(sin confirmar)')) {
        sinConfirmar.push(doc);
        return;
      }

      // PASO 2: Verificar si es factura, abono o albarán
      const esFacturaOAbono = tipoLower.includes('factura')
        || tipoLower.includes('abono')
        || tipoLower.includes('albaran')
        || tipoLower.includes('albarán');

      if (!esFacturaOAbono) {
        otrosDocumentos.push(doc);
        return;
      }

      // ✅ CLASIFICACIÓN: usar is_issued del backend (misma lógica que Trimestres/Dashboard)
      // is_issued = 1 → emitida (ingreso), 0 → recibida (gasto)
      // Fallback: si undefined (doc sin entidades/CIF), usar signo del total
      let esEmitida: boolean;
      if (doc.is_issued !== undefined) {
        esEmitida = doc.is_issued === 1;
      } else {
        // Fallback legacy: facturas emitidas suelen tener total positivo
        esEmitida = (doc.total || 0) > 0;
      }

      if (esEmitida) {
        facturasEmitidas.push(doc);
      } else {
        facturasRecibidas.push(doc);
      }
    });

    return { facturasEmitidas, facturasRecibidas, otrosDocumentos, sinConfirmar };
  }, [documents]);

  const computedFooters = React.useMemo(() => {
    const computeForDocs = (docs: Document[]) => {
      const { ingresos, gastos } = calculateFinancials(docs, null);

      const VAT_RATES = [21, 15, 10, 4, 0];

      // Sum components for the breakdown
      const iBase = VAT_RATES.reduce((acc, rate) => acc + (ingresos.bases[rate]?.total || 0), 0);
      const gBase = VAT_RATES.reduce((acc, rate) => acc + (gastos.bases[rate]?.total || 0), 0);

      // Sum real taxes (IVA + Recargo)
      const iIvaReal = VAT_RATES.reduce((acc, rate) => acc + (ingresos.ivaDB[rate]?.total || 0), 0);
      const gIvaReal = VAT_RATES.reduce((acc, rate) => acc + (gastos.ivaDB[rate]?.total || 0), 0);

      // Sum theoretical taxes
      const iIvaTeo = VAT_RATES.reduce((acc, rate) => acc + (ingresos.ivaTeorico[rate]?.total || 0), 0);
      const gIvaTeo = VAT_RATES.reduce((acc, rate) => acc + (gastos.ivaTeorico[rate]?.total || 0), 0);

      const totalBase = iBase + gBase;
      const totalIva = iIvaTeo + gIvaTeo;
      const totalRecargo = ingresos.recargos.total + gastos.recargos.total;
      const totalGeneral = ingresos.totalReal.total + gastos.totalReal.total;

      // Adjustment for theoretical total: Base + IvaTeo + Recargos - Retenciones - Descuentos
      const totalDescuentos = ingresos.descuentos.total + gastos.descuentos.total;
      const totalTeorico = totalBase + totalIva + totalRecargo - (ingresos.retenciones.total + gastos.retenciones.total) - totalDescuentos;

      return {
        base: Number(totalBase.toFixed(2)),
        iva: Number(totalIva.toFixed(2)),
        recargo: Number(totalRecargo.toFixed(2)),
        total: Number(totalTeorico.toFixed(2)),
        breakdown: {
          ingresos: {
            base: Number(iBase.toFixed(2)),
            iva: Number(iIvaReal.toFixed(2)),
            recargo: Number(ingresos.recargos.total.toFixed(2)),
            retencion: Number(ingresos.retenciones.total.toFixed(2)),
            total: Number(ingresos.totalReal.total.toFixed(2))
          },
          gastos: {
            base: Number(gBase.toFixed(2)),
            iva: Number(gIvaReal.toFixed(2)),
            recargo: Number(gastos.recargos.total.toFixed(2)),
            retencion: Number(gastos.retenciones.total.toFixed(2)),
            total: Number(gastos.totalReal.total.toFixed(2))
          }
        }
      };
    };

    return {
      sinConfirmar: computeForDocs(sinConfirmar),
      emitidas: computeForDocs(facturasEmitidas),
      recibidas: computeForDocs(facturasRecibidas),
      otros: computeForDocs(otrosDocumentos)
    };
  }, [sinConfirmar, facturasEmitidas, facturasRecibidas, otrosDocumentos]);

  const otherDocsHiddenColumns = [
    'base_21', 'iva_21', 'base_10', 'iva_10', 'base_4', 'iva_4', 'base_0', 'iva_0',
    'retencion', 'base_imponible', 'iva', 'total'
  ];

  const companiesForUpload = React.useMemo(() => {
    return companies.map(company => ({
      id: company.id,
      nombre: company.name || (`Empresa ${company.id}` as string)
    }));
  }, [companies]);

  // ✅ REDIRECCIÓN DINÁMICA: Usar el tab de la URL o calcular el más relevante
  const activeTab = React.useMemo(() => {
    if (tabFromUrl) return tabFromUrl;

    // Si entramos a /documents seco, priorizamos la que tenga chicha (datos)
    if (loading || documents.length === 0) return 'sin-confirmar';

    if (facturasRecibidas.length > 0) return 'recibidas';
    if (facturasEmitidas.length > 0) return 'emitidas';
    if (otrosDocumentos.length > 0) return 'otros';

    return 'sin-confirmar';
  }, [tabFromUrl, loading, documents.length, facturasRecibidas.length, facturasEmitidas.length, otrosDocumentos.length]);

  const currentDocuments = React.useMemo(() => {
    switch (activeTab) {
      case 'sin-confirmar':
        return sinConfirmar;
      case 'emitidas':
        return facturasEmitidas;
      case 'recibidas':
        return facturasRecibidas;
      case 'otros':
        return otrosDocumentos;
      default:
        return [];
    }
  }, [activeTab, sinConfirmar, facturasEmitidas, facturasRecibidas, otrosDocumentos]);

  const handleTabChange = (value: string) => {
    if (value !== activeTab) {
      setIsTabChanging(true);

      // Actualizar URL sin recargar
      const params = new URLSearchParams(searchParams);
      params.set('tab', value);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });

      setTimeout(() => {
        setIsTabChanging(false);
      }, 300);
    }
  };

  // 🧭 TUTORIAL AUTO-TAB SWITCH (Paso 4: Filtros y Categorías)
  React.useEffect(() => {
    // currentStep 3 es "Filtros y Categorías" en DocumentosTutorial.tsx
    if (isTutorialActive && currentStep === 3) {
      // Prioridad a la que tenga documentos
      if (activeTab === 'sin-confirmar' && sinConfirmar.length === 0) {
        if (otrosDocumentos.length > 0) handleTabChange('otros');
        else if (facturasEmitidas.length > 0) handleTabChange('emitidas');
        else if (facturasRecibidas.length > 0) handleTabChange('recibidas');
      }
      // Caso inverso: si estamos en una vacía pero hay alguna con docs
      else if (currentDocuments.length === 0) {
        const target = sinConfirmar.length > 0 ? 'sin-confirmar' :
          facturasEmitidas.length > 0 ? 'emitidas' :
            facturasRecibidas.length > 0 ? 'recibidas' :
              otrosDocumentos.length > 0 ? 'otros' : null;
        if (target && target !== activeTab) handleTabChange(target);
      }
    }
  }, [isTutorialActive, currentStep, activeTab, sinConfirmar, facturasEmitidas, facturasRecibidas, otrosDocumentos, currentDocuments]);

  const handleExportPdf = async () => {
    if (currentDocuments.length === 0) {
      toast({
        title: 'Sin documentos',
        description: 'No hay documentos para exportar',
        variant: 'destructive'
      });
      return;
    }

    setIsExportingPdf(true);

    try {
      const statusMap: { [key: string]: string } = {
        'sin-confirmar': 'pending',
        'emitidas': 'emitidas',
        'recibidas': 'recibidas',
        'otros': 'others'
      };

      const filters = {
        empresaIds: selectedCompanyIds,
        año: null,
        trimestre: null,
        status: statusMap[activeTab] || 'all',
        search: ''
      };

      const response = await fetch('/api/export-documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(filters)
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Error al exportar');
      }

      toast({
        title: 'Exportación iniciada',
        description: 'Te notificaremos cuando el PDF esté listo para descargar',
      });

    } catch (error) {
      console.error('Error exportando PDF:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Error al exportar documentos',
        variant: 'destructive'
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // DRAG & DROP HANDLERS
  // ═══════════════════════════════════════════════════════════

  const handleDragStart = React.useCallback((selectedIds: number[]) => {
    console.log('🎯 [Drag] Iniciando drag con documentos:', selectedIds);
    setDraggedDocs(selectedIds);
  }, []);

  const handleDropOnTab = React.useCallback(async (targetTab: string) => {
    if (draggedDocs.length === 0) {
      console.log('⚠️ [Drag] No hay documentos arrastrados');
      return;
    }

    console.log(`📥 [Drag] Drop en tab "${targetTab}" con ${draggedDocs.length} documento(s)`);

    // Determinar nueva dirección basada en tab
    let nuevaDireccion: 'Emitida' | 'Recibida' | null = null;

    if (targetTab === 'emitidas') {
      nuevaDireccion = 'Emitida';
    } else if (targetTab === 'recibidas') {
      nuevaDireccion = 'Recibida';
    } else {
      // No se puede drag a "Sin Confirmar" u "Otros"
      toast({
        title: 'Acción no permitida',
        description: 'Solo puedes arrastrar documentos a Emitidas o Recibidas',
        variant: 'destructive'
      });
      setDraggedDocs([]);
      setDragOverTab(null);
      return;
    }

    try {
      let updated = 0;
      let skipped = 0;

      // Actualizar cada documento
      for (const docId of draggedDocs) {
        const doc = documents.find(d => d.id_documento === docId);
        if (!doc) {
          console.warn(`⚠️ [Drag] Documento #${docId} no encontrado`);
          skipped++;
          continue;
        }


        // 🆕 Determinar de qué tab viene el documento
        const enEmitidas = facturasEmitidas.some(d => d.id_documento === docId);
        const enRecibidas = facturasRecibidas.some(d => d.id_documento === docId);

        let direccionActual: string | null = null;
        if (enEmitidas) {
          direccionActual = 'Emitida';
        } else if (enRecibidas) {
          direccionActual = 'Recibida';
        } else {
          console.warn(`⚠️ [Drag] Documento #${docId} no está en ninguna tab conocida`);
          skipped++;
          continue;
        }

        // Si el documento ya está en el tab de destino, skip
        if ((targetTab === 'emitidas' && direccionActual === 'Emitida') ||
          (targetTab === 'recibidas' && direccionActual === 'Recibida')) {
          console.log(`⏭️ [Drag] Doc #${docId} ya está en tab "${targetTab}", skip`);
          skipped++;
          continue;
        }

        // Extraer tipo base (Factura, Abono, Albarán)
        const tipoActual = doc.tipo_documento || '';
        const tipoBase = tipoActual.replace(/(Emitida|Emitido|Recibida|Recibido)/gi, '').trim();

        // Verificar que tenga un tipo base válido
        if (!tipoBase || tipoBase.length < 3) {
          console.warn(`⚠️ [Drag] Documento #${docId} no tiene tipo válido: "${tipoActual}"`);
          skipped++;
          continue;
        }

        // Construir nuevo tipo normalizado
        const nuevoTipo = `${tipoBase} ${nuevaDireccion}`;

        console.log(`🔄 [Drag] Doc #${docId}: "${tipoActual}" → "${nuevoTipo}"`);

        // Llamar API para actualizar
        const response = await fetch(`/api/documents/${docId}/field`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fieldName: 'tipo_documento', value: nuevoTipo })
        });

        if (response.ok) {
          updated++;
        } else {
          console.error(`❌ [Drag] Error actualizando doc #${docId}`);
          skipped++;
        }
      }

      // Recargar documentos
      setKey(prev => prev + 1);

      // Mostrar resultado
      if (updated > 0) {
        toast({
          title: 'Documentos actualizados',
          description: `${updated} documento(s) movido(s) a ${nuevaDireccion}${skipped > 0 ? `. ${skipped} omitido(s)` : ''}`
        });
      } else {
        toast({
          title: 'No se actualizó ningún documento',
          description: 'Los documentos seleccionados no pudieron clasificarse',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('❌ [Drag] Error en drop:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron actualizar los documentos',
        variant: 'destructive'
      });
    } finally {
      setDraggedDocs([]);
      setDragOverTab(null);
    }
  }, [draggedDocs, documents, toast]);

  // Empty state cuando no hay empresas seleccionadas
  if (!selectedCompanyIds || selectedCompanyIds.length === 0) {
    return (
      <>
        <DocumentosTutorialRouter />

        <PageHeader
          title="Documentos"
          icon={FileText}
        >
          <Button
            onClick={() => setIsUploadOpen(true)}
            size="sm"
            className="gap-2 shrink-0 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/20"
            data-tutorial="upload-button"
          >
            <Upload className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
            <span className="hidden sm:inline">Subir</span>
          </Button>
        </PageHeader>

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center space-y-3 max-w-md transition-all duration-300 hover:scale-105">
            <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center transition-all duration-300 hover:bg-primary/10 hover:shadow-lg hover:shadow-primary/20">
              <FileText className="h-8 w-8 text-muted-foreground transition-all duration-300 hover:text-primary hover:scale-110" />
            </div>
            <h3 className="text-lg font-semibold transition-colors duration-300 hover:text-primary">
              No hay empresa seleccionada
            </h3>
            <p className="text-sm text-muted-foreground">
              Selecciona al menos una empresa para ver sus documentos
            </p>
          </div>
        </div>

        <UploadDialog
          isOpen={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          companies={companiesForUpload}
          onUploadComplete={handleUploadComplete}
          defaultCompanyId={selectedCompanyIds.length === 1 ? String(selectedCompanyIds[0]) : undefined}
        />
      </>
    );
  }

  return (
    <>
      <DocumentosTutorialRouter />

      <PageHeader
        title="Documentos"
        icon={FileText}
        badgeCount={selectedCompanyIds.length}
      >
        <Button
          onClick={() => setIsUploadOpen(true)}
          size="sm"
          className="gap-2 group transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/20"
          data-tutorial="upload-button"
        >
          <Upload className="h-4 w-4 transition-transform duration-300 group-hover:scale-110 group-hover:-translate-y-0.5" />
          <span className="hidden lg:inline">Subir Documento</span>
          <span className="lg:hidden hidden sm:inline">Subir</span>
        </Button>
      </PageHeader>

      <div className="flex-1 space-y-4 p-4 sm:p-6 lg:p-8">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="text-sm text-muted-foreground animate-pulse">
                Cargando documentos...
              </p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-3 max-w-md px-4 transition-all duration-300 hover:scale-105">
              <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center transition-all duration-300 hover:bg-destructive/20 hover:shadow-lg hover:shadow-destructive/20">
                <AlertCircle className="h-6 w-6 text-destructive transition-transform duration-300 hover:scale-110 animate-pulse" />
              </div>
              <h3 className="text-base font-semibold">Error al cargar</h3>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
            {/* Tabs List */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
              <div className="w-full sm:w-auto overflow-x-auto" data-tutorial="tabs-filters">
                <TabsList className="inline-flex w-full sm:w-auto">
                  <TabsTrigger
                    value="sin-confirmar"
                    disabled={isTutorialActive && currentStep === 3}
                    className="flex items-center gap-2 transition-all duration-300 hover:scale-105 data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-600 dark:data-[state=active]:text-amber-400 data-[state=active]:shadow-lg data-[state=active]:shadow-amber-500/20"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12" />
                    <span className="whitespace-nowrap">Sin Confirmar</span>
                    <Badge
                      variant="secondary"
                      className="ml-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 transition-all duration-300 hover:scale-110 hover:bg-amber-500/20"
                    >
                      {sinConfirmar.length}
                    </Badge>
                  </TabsTrigger>

                  {/* Facturas Emitidas */}
                  <TabsTrigger
                    value="emitidas"
                    disabled={isTutorialActive && currentStep === 3}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverTab('emitidas');
                    }}
                    onDragLeave={() => setDragOverTab(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDropOnTab('emitidas');
                    }}
                    className={`flex items-center gap-2 transition-all duration-300 hover:scale-105 data-[state=active]:bg-green-500/10 data-[state=active]:text-green-600 dark:data-[state=active]:text-green-400 data-[state=active]:shadow-lg data-[state=active]:shadow-green-500/20 ${dragOverTab === 'emitidas' ? 'ring-2 ring-green-500 bg-green-500/20 scale-105' : ''
                      }`}
                  >
                    <TrendingUp className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12" />
                    <span className="whitespace-nowrap">Facturas Emitidas</span>
                    <Badge
                      variant="secondary"
                      className="ml-1 bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 transition-all duration-300 hover:scale-110 hover:bg-green-500/20"
                    >
                      {facturasEmitidas.length}
                    </Badge>
                  </TabsTrigger>

                  {/* Facturas Recibidas */}
                  <TabsTrigger
                    value="recibidas"
                    disabled={isTutorialActive && currentStep === 3}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverTab('recibidas');
                    }}
                    onDragLeave={() => setDragOverTab(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDropOnTab('recibidas');
                    }}
                    className={`flex items-center gap-2 transition-all duration-300 hover:scale-105 data-[state=active]:bg-blue-500/10 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-lg data-[state=active]:shadow-blue-500/20 ${dragOverTab === 'recibidas' ? 'ring-2 ring-blue-500 bg-blue-500/20 scale-105' : ''
                      }`}
                  >
                    <TrendingDown className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12" />
                    <span className="whitespace-nowrap">Facturas Recibidas</span>
                    <Badge
                      variant="secondary"
                      className="ml-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 transition-all duration-300 hover:scale-110 hover:bg-blue-500/20"
                    >
                      {facturasRecibidas.length}
                    </Badge>
                  </TabsTrigger>

                  <TabsTrigger
                    value="otros"
                    disabled={isTutorialActive && currentStep === 3}
                    className="flex items-center gap-2 transition-all duration-300 hover:scale-105 data-[state=active]:bg-purple-500/10 data-[state=active]:text-purple-600 dark:data-[state=active]:text-purple-400 data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/20"
                  >
                    <FileText className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12" />
                    <span className="whitespace-nowrap">Otros</span>
                    <Badge
                      variant="secondary"
                      className="ml-1 bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 transition-all duration-300 hover:scale-110 hover:bg-purple-500/20"
                    >
                      {otrosDocumentos.length}
                    </Badge>
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Botón de exportar PDF */}
              {currentDocuments.length > 0 && (
                <Button
                  variant="outline"
                  onClick={handleExportPdf}
                  disabled={isExportingPdf}
                  className="gap-1.5 sm:gap-2 h-8 sm:h-9 text-xs sm:text-sm shrink-0 group transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/20 hover:border-primary disabled:hover:scale-100"
                  data-tutorial="export-pdf"
                >
                  <TrendingDown className="h-3.5 w-3.5 sm:h-4 sm:w-4 transition-transform duration-300 group-hover:scale-110 group-hover:-translate-y-0.5" />
                  <span className="hidden xs:inline">
                    {isExportingPdf ? 'Generando...' : 'Exportar PDF'}
                  </span>
                  <span className="xs:hidden">PDF</span>
                </Button>
              )}
            </div>

            {/* Tab Contents */}
            <TabsContent value="sin-confirmar" className="space-y-4 animate-in fade-in duration-300">
              {isTabChanging ? (
                <div className="flex items-center justify-center py-24">
                  <div className="text-center space-y-3">
                    <Loader2 className="h-10 w-10 animate-spin mx-auto text-amber-500" />
                    <p className="text-sm text-muted-foreground animate-pulse">
                      Cargando sin confirmar...
                    </p>
                  </div>
                </div>
              ) : sinConfirmar.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4 transition-all duration-300 hover:bg-green-500/10 hover:shadow-lg hover:shadow-green-500/20 hover:scale-110">
                    <AlertCircle className="h-6 w-6 text-muted-foreground transition-all duration-300 hover:text-green-500 hover:scale-110" />
                  </div>
                  <h3 className="text-base font-semibold mb-2 transition-colors duration-300 hover:text-amber-500">
                    No hay documentos sin confirmar
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Todos los documentos han sido confirmados
                  </p>
                </div>
              ) : (
                <div data-tutorial="documents-table">
                  <DocumentsTable
                    documents={sinConfirmar}
                    filename="documentos_sin_confirmar"
                    showConfirmButton={true}
                    exportContext="documentos"
                    viewId="documentos-sin-confirmar"
                    enableColumnPersistence={true}
                    onDocumentChanged={handleDocumentChanged}
                    onDragStart={handleDragStart}
                    footerValues={computedFooters.sinConfirmar}
                  />
                </div>
              )}
            </TabsContent>
            {/* Facturas Emitidas */}
            <TabsContent value="emitidas" className="space-y-4 animate-in fade-in duration-300">
              {isTabChanging ? (
                <div className="flex items-center justify-center py-24">
                  <div className="text-center space-y-3">
                    <Loader2 className="h-10 w-10 animate-spin mx-auto text-green-500" />
                    <p className="text-sm text-muted-foreground animate-pulse">
                      Cargando facturas emitidas...
                    </p>
                  </div>
                </div>
              ) : facturasEmitidas.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4 transition-all duration-300 hover:bg-green-500/10 hover:shadow-lg hover:shadow-green-500/20 hover:scale-110">
                    <TrendingUp className="h-6 w-6 text-muted-foreground transition-all duration-300 hover:text-green-500 hover:scale-110" />
                  </div>
                  <h3 className="text-base font-semibold mb-2 transition-colors duration-300 hover:text-green-600">
                    No hay facturas emitidas
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Aún no se han registrado facturas emitidas
                  </p>
                </div>
              ) : (
                <div data-tutorial="documents-table">
                  <DocumentsTable
                    documents={facturasEmitidas}
                    filename="facturas_emitidas"
                    exportContext="documentos_emitidas"
                    viewId="documentos-facturas-emitidas"
                    enableColumnPersistence={true}
                    onDocumentChanged={handleDocumentChanged}
                    onDragStart={handleDragStart}
                    footerValues={computedFooters.emitidas}
                  />
                </div>
              )}
            </TabsContent>

            {/* Facturas Recibidas */}
            <TabsContent value="recibidas" className="space-y-4 animate-in fade-in duration-300">
              {isTabChanging ? (
                <div className="flex items-center justify-center py-24">
                  <div className="text-center space-y-3">
                    <Loader2 className="h-10 w-10 animate-spin mx-auto text-blue-500" />
                    <p className="text-sm text-muted-foreground animate-pulse">
                      Cargando facturas recibidas...
                    </p>
                  </div>
                </div>
              ) : facturasRecibidas.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4 transition-all duration-300 hover:bg-blue-500/10 hover:shadow-lg hover:shadow-blue-500/20 hover:scale-110">
                    <TrendingDown className="h-6 w-6 text-muted-foreground transition-all duration-300 hover:text-blue-500 hover:scale-110" />
                  </div>
                  <h3 className="text-base font-semibold mb-2 transition-colors duration-300 hover:text-blue-600">
                    No hay facturas recibidas
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Aún no se han registrado facturas recibidas
                  </p>
                </div>
              ) : (
                <div data-tutorial="documents-table">
                  <DocumentsTable
                    documents={facturasRecibidas}
                    filename="facturas_recibidas"
                    exportContext="documentos_recibidas"
                    viewId="documentos-facturas-recibidas"
                    enableColumnPersistence={true}
                    onDocumentChanged={handleDocumentChanged}
                    onDragStart={handleDragStart}
                    footerValues={computedFooters.recibidas}
                  />
                </div>
              )}
            </TabsContent>

            {/* Tab Otros */}
            <TabsContent value="otros" className="space-y-4 animate-in fade-in duration-300">
              {isTabChanging ? (
                <div className="flex items-center justify-center py-24">
                  <div className="text-center space-y-3">
                    <Loader2 className="h-10 w-10 animate-spin mx-auto text-purple-500" />
                    <p className="text-sm text-muted-foreground animate-pulse">
                      Cargando otros documentos...
                    </p>
                  </div>
                </div>
              ) : otrosDocumentos.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4 transition-all duration-300 hover:bg-purple-500/10 hover:shadow-lg hover:shadow-purple-500/20 hover:scale-110">
                    <FileText className="h-6 w-6 text-muted-foreground transition-all duration-300 hover:text-purple-500 hover:scale-110" />
                  </div>
                  <h3 className="text-base font-semibold mb-2 transition-colors duration-300 hover:text-purple-600">
                    No hay otros documentos
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Aún no se han registrado otros tipos de documentos
                  </p>
                </div>
              ) : (
                <div data-tutorial="documents-table">
                  <GroupedDocumentsView
                    documents={otrosDocumentos}
                    filename="otros_documentos"
                    hiddenColumns={otherDocsHiddenColumns}
                    onDocumentChanged={handleDocumentChanged}
                  />
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      <UploadDialog
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        companies={companiesForUpload}
        onUploadComplete={handleUploadComplete}
        defaultCompanyId={selectedCompanyIds.length === 1 ? String(selectedCompanyIds[0]) : undefined}
      />
    </>
  );
}
export default function DocumentsPage() {
  return (
    <MainLayout>
      <Suspense fallback={
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }>
        <DocumentsPageContent />
      </Suspense>
    </MainLayout>
  );
}