'use client'

import * as React from 'react'
import { useCompanyContext } from '@/context/CompanyProvider'
import { Document } from '@/lib/types'
import { MainLayout, MainLayoutHeader } from '@/components/layout/main-layout'
import { DocumentsTable } from '@/components/dashboard/documents-table'
import { GroupedDocumentsView } from '@/components/dashboard/grouped-documents-view'
import { Button } from '@/components/ui/button'
import { UploadDialog } from '@/components/dashboard/upload-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDocumentEvents } from '@/hooks/useDocumentEvents'
import { Upload, Loader2, FileText, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { DocumentosTutorial } from '@/components/tutorials/DocumentosTutorial'

function DocumentsPageContent() {
  const { selectedCompanyIds, companies } = useCompanyContext();
  
  const [documents, setDocuments] = React.useState<Document[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = React.useState(false);
  const [key, setKey] = React.useState(0);
  const [isExportingPdf, setIsExportingPdf] = React.useState(false);
  
  const [activeTab, setActiveTab] = React.useState('sin-confirmar');
  const [isTabChanging, setIsTabChanging] = React.useState(false);
  const { toast } = useToast();

  useDocumentEvents(() => {
    setKey(prevKey => prevKey + 1);
  });

  const handleDocumentChanged = React.useCallback(() => {
    setKey(prevKey => prevKey + 1);
  }, []);

  const handleUploadComplete = () => {
    setKey(prevKey => prevKey + 1);
  };

  React.useEffect(() => {
    async function loadDocuments() {
      if (!selectedCompanyIds || selectedCompanyIds.length === 0) {
        setDocuments([]);
        setLoading(false);
        return;
      }

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
          throw new Error('Error al cargar documentos desde la API');
        }
        
        const data = await response.json();
        const docs = data.documents || data;
        setDocuments(docs);
      } catch (err) {
        console.error('❌ [DocumentsPage] Error loading documents:', err);
        setError('Error al cargar los documentos');
      } finally {
        setLoading(false);
      }
    }

    loadDocuments();
  }, [selectedCompanyIds, key]);

  // ✅ CLASIFICACIÓN CORREGIDA: Prioriza tipo ABONO antes del signo
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
      const total = doc.total || 0;
      
      console.log(`📄 Doc ${doc.id_documento}: Tipo="${doc.tipo_documento}", Total=${total}`);
      
      // PASO 1: Verificar si es "sin confirmar"
      if (tipoLower.includes('(sin confirmar)')) {
        sinConfirmar.push(doc);
        console.log(`   ⚠️ -> Sin confirmar`);
        return;
      }
      
      // PASO 2: Verificar si es factura o abono
      const esFacturaOAbono = tipoLower.includes('factura') || tipoLower.includes('abono');
      
      if (!esFacturaOAbono) {
        otrosDocumentos.push(doc);
        console.log(`   📦 -> Otros`);
        return;
      }
      
      // ✅ LÓGICA CORREGIDA DE CLASIFICACIÓN
      let esEmitida = false;
      
      // REGLA 1: Si el tipo dice explícitamente "EMITIDA" o "EMITIDO"
      if (/emitid[oa]/i.test(tipoLower)) {
        esEmitida = true;
        console.log(`   ✅ Tipo incluye "emitida" -> EMITIDA`);
      }
      // REGLA 2: Si el tipo dice explícitamente "RECIBIDA" o "RECIBIDO"
      else if (/recibid[oa]/i.test(tipoLower)) {
        esEmitida = false;
        console.log(`   ✅ Tipo incluye "recibida" -> RECIBIDA`);
      }
      // ⬅️ REGLA 3 NUEVA: Es un ABONO sin especificar emitida/recibida
      else if (tipoLower.includes('abono')) {
        // Los abonos sin especificar se asumen EMITIDOS por defecto
        // (más común devolver dinero a clientes que recibir de proveedores)
        esEmitida = true;
        console.log(`   🎫 Es ABONO sin especificar -> EMITIDO (por defecto)`);
      }
      // REGLA 4: Es una FACTURA sin especificar emitida/recibida
      else {
        // Usar el signo del total como fallback
        esEmitida = total < 0;
        console.log(`   ⚖️ Total ${total < 0 ? 'negativo' : 'positivo'} -> ${esEmitida ? 'EMITIDA' : 'RECIBIDA'}`);
      }
      
      // Clasificar en la categoría correspondiente
      if (esEmitida) {
        facturasEmitidas.push(doc);
        console.log(`   ✅ -> FACTURAS EMITIDAS`);
      } else {
        facturasRecibidas.push(doc);
        console.log(`   ✅ -> FACTURAS RECIBIDAS`);
      }
    });
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('📊 Clasificación final:', {
      emitidas: facturasEmitidas.length,
      recibidas: facturasRecibidas.length,
      otros: otrosDocumentos.length,
      sinConfirmar: sinConfirmar.length
    });
    console.log('═══════════════════════════════════════════════════════');
    
    return { facturasEmitidas, facturasRecibidas, otrosDocumentos, sinConfirmar };
  }, [documents]);

  const otherDocsHiddenColumns = [
    'base_21', 'iva_21', 'base_10', 'iva_10', 'base_4', 'iva_4', 'base_0', 'iva_0',
    'retencion', 'base_imponible', 'iva', 'total'
  ];

  const companiesForUpload = React.useMemo(() => {
    return companies.map(company => ({
      id: company.id,
      nombre: company.name || company.nombre || `Empresa ${company.id}`
    }));
  }, [companies]);

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
      setActiveTab(value);
      setIsTabChanging(true);
      
      setTimeout(() => {
        setIsTabChanging(false);
      }, 300);
    }
  };

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
  };// Empty state cuando no hay empresas seleccionadas
  if (!selectedCompanyIds || selectedCompanyIds.length === 0) {
    return (
      <>
        <DocumentosTutorial />
        
        <MainLayoutHeader>
          <div className="flex items-center justify-between w-full gap-2">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
              <div className="transition-transform duration-300 hover:scale-110 hover:rotate-3">
                <FileText className="h-5 w-5 sm:h-6 sm:w-6 shrink-0 text-primary" />
              </div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight truncate">
                Documentos
              </h1>
            </div>
            <Button 
              onClick={() => setIsUploadOpen(true)}
              size="sm"
              className="gap-2 shrink-0 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/20"
              data-tutorial="upload-button"
            >
              <Upload className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
              <span className="hidden sm:inline">Subir</span>
            </Button>
          </div>
        </MainLayoutHeader>
        
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
        />
      </>
    );
  }

  return (
    <>
      <DocumentosTutorial />
      
      <MainLayoutHeader>
        <div className="flex items-center justify-between w-full gap-2">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
            <div className="transition-transform duration-300 hover:scale-110 hover:rotate-3">
              <FileText className="h-5 w-5 sm:h-6 sm:w-6 shrink-0 text-primary" />
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight truncate">
              Documentos
            </h1>
            {selectedCompanyIds.length > 1 && (
              <Badge 
                variant="secondary" 
                className="hidden md:inline-flex shrink-0 transition-all duration-300 hover:scale-110 hover:bg-primary/20 hover:border-primary"
              >
                {selectedCompanyIds.length}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
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
          </div>
        </div>
      </MainLayoutHeader>

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
                    className="flex items-center gap-2 transition-all duration-300 hover:scale-105 data-[state=active]:bg-green-500/10 data-[state=active]:text-green-600 dark:data-[state=active]:text-green-400 data-[state=active]:shadow-lg data-[state=active]:shadow-green-500/20"
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
                    className="flex items-center gap-2 transition-all duration-300 hover:scale-105 data-[state=active]:bg-blue-500/10 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-lg data-[state=active]:shadow-blue-500/20"
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
                  <h3 className="text-base font-semibold mb-2 transition-colors duration-300 hover:text-green-600">
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
                    viewId="documentos-sin-confirmar" 
                    enableColumnPersistence={true}
                    onDocumentChanged={handleDocumentChanged}
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
                    viewId="documentos-facturas-emitidas"
                    enableColumnPersistence={true}
                    onDocumentChanged={handleDocumentChanged}
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
                    viewId="documentos-facturas-recibidas"
                    enableColumnPersistence={true}
                    onDocumentChanged={handleDocumentChanged}
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
      />
    </>
  );
}

export default function DocumentsPage() {
  return (
    <MainLayout>
      <DocumentsPageContent />
    </MainLayout>
  );
}