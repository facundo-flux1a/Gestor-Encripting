
'use client';
import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { getDocuments } from "@/services/document-service";
import { DocumentsTable } from "@/components/dashboard/documents-table";
import { Button } from "@/components/ui/button";
import { Upload, ChevronsUpDown } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import type { Document } from "@/lib/types";
import { UploadDocumentDialog } from "@/components/dashboard/upload-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const normalizeDocType = (type: string | null | undefined): string => {
    if (!type || type.trim() === '') return 'Otro';
    const lower = type.trim().toLowerCase();
    
    if (lower.includes('factura')) {
        return 'Factura';
    }
    
    return lower.charAt(0).toUpperCase() + lower.slice(1);
};


export default function DocumentsPage() {
  const [allDocuments, setAllDocuments] = useState<Document[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [docTypeFilter, setDocTypeFilter] = useState('todos');

  const fetchDocuments = () => {
    getDocuments().then(docs => {
        setAllDocuments(docs);
    });
  }

  useEffect(() => {
    fetchDocuments();
  }, []);
  
  const handleUploadSuccess = () => {
    fetchDocuments(); // Re-fetch documents after successful upload
  }

  const documentTypes = useMemo(() => {
    const types = new Set(allDocuments.map(doc => normalizeDocType(doc.tipo_documento)));
    return ['todos', ...Array.from(types)].sort();
  }, [allDocuments]);

  const filteredDocuments = useMemo(() => {
    if (docTypeFilter === 'todos') {
      return allDocuments;
    }
    return allDocuments.filter(doc => normalizeDocType(doc.tipo_documento) === docTypeFilter);
  }, [allDocuments, docTypeFilter]);
  
  const pageTitle = docTypeFilter === 'todos' ? 'Todos los Documentos' : `Documentos: ${docTypeFilter}`;
  const pageDescription = docTypeFilter === 'todos' 
    ? 'Gestiona y revisa todos tus documentos.'
    : `Viendo todos los documentos de tipo "${docTypeFilter}".`;

  const hiddenColumns = docTypeFilter === 'todos' ? [] : ['tipo_documento'];
  const filename = docTypeFilter === 'todos' ? 'todos-los-documentos' : `documentos_${docTypeFilter}`;

  return (
    <MainLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <MainLayoutHeader>
            <div className="flex-1">
                <h2 className="text-3xl font-bold tracking-tight">{pageTitle}</h2>
                <p className="text-muted-foreground">
                   {pageDescription}
                </p>
            </div>
            <div className="flex items-center space-x-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="min-w-[200px] justify-between">
                      {docTypeFilter === 'todos' ? 'Filtrar por tipo...' : docTypeFilter}
                      <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56">
                    <DropdownMenuLabel>Selecciona un tipo de documento</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuRadioGroup value={docTypeFilter} onValueChange={setDocTypeFilter}>
                       {documentTypes.map(type => (
                        <DropdownMenuRadioItem key={type} value={type} className="capitalize">
                          {type === 'todos' ? 'Todos los tipos' : type}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button onClick={() => setIsUploadOpen(true)}>
                    <Upload className="mr-2" />
                    Subir Documento
                </Button>
            </div>
        </MainLayoutHeader>
        <div className="mt-6">
           <DocumentsTable documents={filteredDocuments} hiddenColumns={hiddenColumns} filename={filename} />
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

