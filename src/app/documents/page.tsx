'use client';
import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { getDocuments } from "@/services/document-service";
import { DocumentsTable } from "@/components/dashboard/documents-table";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { useEffect, useState } from "react";
import type { Document } from "@/lib/types";

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getDocuments().then(docs => {
        setDocuments(docs);
        setIsLoading(false);
    });
  }, []);
  
  return (
    <MainLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <MainLayoutHeader>
            <div className="flex items-center justify-between space-y-2">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Todos los Documentos</h2>
                    <p className="text-muted-foreground">
                        Gestiona y revisa todos tus documentos.
                    </p>
                </div>
                <div className="flex items-center space-x-2">
                    <Button>
                        <Upload className="mr-2" />
                        Subir Documento
                    </Button>
                </div>
            </div>
        </MainLayoutHeader>
        <div>
            {isLoading ? <p>Cargando documentos...</p> : <DocumentsTable documents={documents} />}
        </div>
      </div>
    </MainLayout>
  );
}
