'use client'

import * as React from 'react'
import { useCompanyContext } from '@/context/CompanyProvider'
import { Document } from '@/lib/types'
import { MainLayout, MainLayoutHeader } from '@/components/layout/main-layout'
import { DocumentsTable } from '@/components/dashboard/documents-table'
import { Button } from '@/components/ui/button'
import { UploadDocumentDialog } from '@/components/dashboard/upload-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

function DocumentsPageContent() {
  const { selectedCompanyId } = useCompanyContext();
  
  const [documents, setDocuments] = React.useState<Document[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = React.useState();
  const [key, setKey] = React.useState(0);

  // DEBUG: Log cuando cambia selectedCompanyId
  console.log('🏢 [DocumentsPage] selectedCompanyId actual:', selectedCompanyId);

  const handleUploadSuccess = () => {
    setKey(prevKey => prevKey + 1);
  };

  React.useEffect(() => {
    console.log('🔄 [DocumentsPage] useEffect ejecutado - selectedCompanyId:', selectedCompanyId, 'key:', key);
    
    async function loadDocuments() {
      if (!selectedCompanyId) {
        console.log('⚠️ [DocumentsPage] No hay empresa seleccionada, limpiando documentos');
        setDocuments([]);
        setLoading(false);
        return;
      }

      try {
        console.log('🔍 [DocumentsPage] Iniciando fetch con companyId:', selectedCompanyId);
        setLoading(true);
        setError(null);
        
        const response = await fetch(`/api/documents?companyId=${selectedCompanyId}`);
        console.log('📡 [DocumentsPage] Response status:', response.status);
        
        if (!response.ok) {
          throw new Error('Error al cargar documentos desde la API');
        }
        
        const docs = await response.json();
        console.log('📄 [DocumentsPage] Documentos recibidos:', docs.length, 'documentos');
        console.log('📄 [DocumentsPage] Primer documento:', docs[0]);
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
  }, [selectedCompanyId, key]);

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

  if (!selectedCompanyId) {
    return (
      <>
        <MainLayoutHeader>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">
              Documentos
            </h1>
          </div>
        </MainLayoutHeader>
        
        <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
          <div className="text-center text-muted-foreground">
            Selecciona una empresa para ver sus documentos
          </div>
        </div>
      </>
    );
  }

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
        {loading ? (
          <div className="text-center text-muted-foreground">Cargando documentos...</div>
        ) : error ? (
          <div className="text-center text-destructive">{error}</div>
        ) : (
          <Tabs defaultValue="facturas" className="space-y-4">
            <TabsList>
              <TabsTrigger value="sin-confirmar">Sin Confirmar ({sinConfirmar.length})</TabsTrigger>
              <TabsTrigger value="facturas">Facturas ({facturas.length})</TabsTrigger>
              <TabsTrigger value="otros">Otros Documentos ({otrosDocumentos.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="sin-confirmar" className="space-y-4">
              <DocumentsTable documents={sinConfirmar} filename="documentos_sin_confirmar" />
            </TabsContent>
            <TabsContent value="facturas" className="space-y-4">
              <DocumentsTable documents={facturas} filename="facturas" />
            </TabsContent>
            <TabsContent value="otros" className="space-y-4">
              <DocumentsTable 
                documents={otrosDocumentos} 
                filename="otros_documentos"
                hiddenColumns={otherDocsHiddenColumns} 
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
       <UploadDocumentDialog 
        isOpen={isUploadOpen} 
        setIsOpen={setIsUploadOpen} 
        onUploadSuccess={handleUploadSuccess}
      />
    </>
  );
}

export default function DocumentsPage() {
    return (
        <MainLayout>
            <DocumentsPageContent />
        </MainLayout>
    )
}