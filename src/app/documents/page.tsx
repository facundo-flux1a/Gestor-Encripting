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

function DocumentsPageContent() {
  const { selectedCompanyIds, companies } = useCompanyContext();
  
  const [documents, setDocuments] = React.useState<Document[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = React.useState(false);
  const [key, setKey] = React.useState(0);
  
  const [activeTab, setActiveTab] = React.useState('sin-confirmar');

  useDocumentEvents(() => {
    console.log('🔔 [DocumentsPage] Recargando documentos por evento externo');
    setKey(prevKey => prevKey + 1);
  });

  console.log('🏢 [DocumentsPage] selectedCompanyIds actual:', selectedCompanyIds);

  // 🔥 CALLBACK PARA CUANDO SE ELIMINA O CONFIRMA UN DOCUMENTO
  const handleDocumentChanged = React.useCallback(() => {
    console.log('✅ [DocumentsPage] Documento modificado, recargando...');
    setKey(prevKey => prevKey + 1);
  }, []);

  const handleUploadComplete = () => {
    console.log('✅ [DocumentsPage] Upload completado, recargando documentos');
    setKey(prevKey => prevKey + 1);
  };

  React.useEffect(() => {
    console.log('🔄 [DocumentsPage] useEffect ejecutado - selectedCompanyIds:', selectedCompanyIds, 'key:', key);
    
    async function loadDocuments() {
      if (!selectedCompanyIds || selectedCompanyIds.length === 0) {
        console.log('⚠️ [DocumentsPage] No hay empresas seleccionadas, limpiando documentos');
        setDocuments([]);
        setLoading(false);
        return;
      }

      try {
        console.log('🔍 [DocumentsPage] Iniciando fetch con companyIds:', selectedCompanyIds);
        setLoading(true);
        setError(null);
        
        const queryParams = selectedCompanyIds.map(id => `companyId=${id}`).join('&');
        const url = `/api/documents?${queryParams}`;
        
        console.log('🌐 [DocumentsPage] URL completa:', url);
        
        const response = await fetch(url, {
          cache: 'no-store', // 🔥 Forzar no caché
          headers: {
            'Cache-Control': 'no-cache'
          }
        });
        console.log('📡 [DocumentsPage] Response status:', response.status);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('❌ [DocumentsPage] Error response:', errorData);
          throw new Error('Error al cargar documentos desde la API');
        }
        
        const data = await response.json();
        
        if (data.debug) {
          console.log('🔍 [DEBUG] Información del servidor:', data.debug);
        }
        
        const docs = data.documents || data;
        console.log('📄 [DocumentsPage] Documentos recibidos:', docs.length, 'documentos');
        if (docs.length > 0) {
          console.log('📄 [DocumentsPage] Primer documento:', docs[0]);
        }
        setDocuments(docs);
      } catch (err) {
        console.error('❌ [DocumentsPage] Error loading documents:', err);
        setError('Error al cargar los documentos');
      } finally {
        setLoading(false);
        console.log('✅ [DocumentsPage] Loading finalizado');
      }
    }

    loadDocuments();
  }, [selectedCompanyIds, key]);

  const { facturas, otrosDocumentos, sinConfirmar } = React.useMemo(() => {
    const facturas: Document[] = [];
    const otrosDocumentos: Document[] = [];
    const sinConfirmar: Document[] = [];
    documents.forEach(doc => {
      if (doc.tipo_documento?.toLowerCase().includes('(sin confirmar)')) {
        sinConfirmar.push(doc);
      } else if (doc.tipo_documento?.toLowerCase().includes('factura')) {
        facturas.push(doc);
      } else {
        otrosDocumentos.push(doc);
      }
    });
    
    console.log('📊 [DocumentsPage] Documentos categorizados - Facturas:', facturas.length, 'Otros:', otrosDocumentos.length, 'Sin confirmar:', sinConfirmar.length);
    
    return { facturas, otrosDocumentos, sinConfirmar };
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

  if (!selectedCompanyIds || selectedCompanyIds.length === 0) {
    return (
      <>
        <MainLayoutHeader>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">
              Documentos
            </h1>
          </div>
          <Button onClick={() => setIsUploadOpen(true)}>Subir Documento</Button>
        </MainLayoutHeader>
        
        <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
          <div className="text-center text-muted-foreground">
            Selecciona al menos una empresa para ver sus documentos
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
      <MainLayoutHeader>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">
            Documentos
            {selectedCompanyIds.length > 1 && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                ({selectedCompanyIds.length} empresas)
              </span>
            )}
          </h1>
        </div>
        <Button onClick={() => setIsUploadOpen(true)}>Subir Documento</Button>
      </MainLayoutHeader>
      
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        {loading ? (
          <div className="text-center text-muted-foreground">Cargando documentos...</div>
        ) : error ? (
          <div className="text-center text-destructive">{error}</div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList>
              <TabsTrigger value="sin-confirmar">Sin Confirmar ({sinConfirmar.length})</TabsTrigger>
              <TabsTrigger value="facturas">Facturas ({facturas.length})</TabsTrigger>
              <TabsTrigger value="otros">Otros Documentos ({otrosDocumentos.length})</TabsTrigger>
            </TabsList>
            
            <TabsContent value="sin-confirmar" className="space-y-4">
              <DocumentsTable 
                documents={sinConfirmar} 
                filename="documentos_sin_confirmar"
                showConfirmButton={true}  
                viewId="documentos-sin-confirmar" 
                enableColumnPersistence={true}
                onDocumentChanged={handleDocumentChanged}
              />
            </TabsContent>
            
            <TabsContent value="facturas" className="space-y-4">
              <DocumentsTable 
                documents={facturas} 
                filename="facturas" 
                viewId="documentos-facturas"
                enableColumnPersistence={true}
                onDocumentChanged={handleDocumentChanged}
              />
            </TabsContent>
            
            <TabsContent value="otros" className="space-y-4">
              <GroupedDocumentsView 
                documents={otrosDocumentos} 
                filename="otros_documentos"
                hiddenColumns={otherDocsHiddenColumns} 
                viewId="documentos-otros"
                enableColumnPersistence={true}
              />
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