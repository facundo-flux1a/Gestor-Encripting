import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { getDocuments } from "@/services/document-service";
import { DocumentsTable } from "@/components/dashboard/documents-table";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";

export default async function DocumentsPage() {
  const documents = await getDocuments();
  
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
            <DocumentsTable documents={documents} />
        </div>
      </div>
    </MainLayout>
  );
}
