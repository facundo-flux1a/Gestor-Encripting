'use client';
import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { getIncidents } from "@/services/document-service";
import { DocumentsTable } from "@/components/dashboard/documents-table";
import { useEffect, useState } from "react";
import type { Document } from "@/lib/types";

export default function IncidentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getIncidents().then(docs => {
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
                    <h2 className="text-3xl font-bold tracking-tight">Incidencias</h2>
                    <p className="text-muted-foreground">
                        Documentos con incidencias pendientes de revisar.
                    </p>
                </div>
            </div>
        </MainLayoutHeader>
        <div>
           {isLoading ? <p>Cargando incidencias...</p> : <DocumentsTable documents={documents} />}
        </div>
      </div>
    </MainLayout>
  );
}
