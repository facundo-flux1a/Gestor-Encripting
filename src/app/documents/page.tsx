
'use client';
import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { getDocuments } from "@/services/document-service";
import { DocumentsTable } from "@/components/dashboard/documents-table";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { Document } from "@/lib/types";
import { ExportButton } from "@/components/dashboard/export-button";
import { UploadDocumentDialog } from "@/components/dashboard/upload-dialog";

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const fetchDocuments = () => {
    setIsLoading(true);
    getDocuments().then(docs => {
        setDocuments(docs);
        setIsLoading(false);
    });
  }

  useEffect(() => {
    fetchDocuments();
  }, []);
  
  const handleUploadSuccess = () => {
    fetchDocuments(); // Re-fetch documents after successful upload
  }

  return (
    <MainLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <MainLayoutHeader>
            <div className="flex-1">
                <h2 className="text-3xl font-bold tracking-tight">Todos los Documentos</h2>
                <p className="text-muted-foreground">
                    Gestiona y revisa todos tus documentos.
                </p>
            </div>
            <div className="flex items-center space-x-2">
                <Button onClick={() => setIsUploadOpen(true)}>
                    <Upload className="mr-2" />
                    Subir Documento
                </Button>
                <ExportButton data={documents} filename="todos-los-documentos" />
            </div>
        </MainLayoutHeader>
        <div className="mt-6">
            {isLoading ? (
                <div className="flex justify-center items-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : (
                <DocumentsTable documents={documents} />
            )}
        </div>
      </div>
      <UploadDocumentDialog 
        isOpen={isUploadOpen}
        setIsOpen={setIsUploadOpen}
        onUploadSuccess={handleUploadSuccess}
      />
    </MainLayout>
  );
}
