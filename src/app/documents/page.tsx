'use client'

import * as React from 'react'
import { getDocuments } from '@/services/document-service'
import { useSidebar } from '@/components/ui/sidebar'
import { Document } from '@/lib/types'
import { MainLayout, MainLayoutHeader } from '@/components/layout/main-layout'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { DocumentsTable } from '@/components/dashboard/documents-table' // Asumo que tienes un componente de tabla
import { Button } from '@/components/ui/button'
import { UploadDocumentDialog } from '@/components/dashboard/upload-dialog'

function DocumentsPageContent() {
  const { selectedCompanyId } = useSidebar();
  const [documents, setDocuments] = React.useState<Document[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = React.useState(false);
  const [key, setKey] = React.useState(0); // Para forzar la recarga

  const handleUploadSuccess = () => {
    setKey(prevKey => prevKey + 1); // Cambia la key para forzar el useEffect
  };

  React.useEffect(() => {
    async function loadDocuments() {
      try {
        setLoading(true);
        setError(null);
        
        const docs = await getDocuments(selectedCompanyId ?? undefined);
        setDocuments(docs);
      } catch (err) {
        console.error('Error loading documents:', err);
        setError('Error al cargar los documentos');
      } finally {
        setLoading(false);
      }
    }

    loadDocuments();
  }, [selectedCompanyId, key]);

  return (
    <>
      <MainLayoutHeader>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">
            Documentos
            {selectedCompanyId && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                ({documents.length} documentos)
              </span>
            )}
          </h1>
        </div>
        <Button onClick={() => setIsUploadOpen(true)}>Subir Documento</Button>
      </MainLayoutHeader>
      
      <div className="flex-1 p-4 pt-6 md:p-8">
        {loading ? (
          <div className="text-center text-muted-foreground">Cargando documentos...</div>
        ) : error ? (
          <div className="text-center text-destructive">{error}</div>
        ) : (
          <DocumentsTable documents={documents} />
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
