
'use client';

import { useEffect, useState, useMemo, KeyboardEvent } from 'react';
import { notFound, useParams } from 'next/navigation';
import { MainLayout, MainLayoutHeader } from '@/components/layout/main-layout';
import { getDocumentById, updateDocument, deleteDocument } from '@/services/document-service';
import { type Document, DocumentUpdateSchema, type DocumentUpdatePayload } from '@/lib/types';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DocumentView } from '@/components/dashboard/document-view';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Edit, X, Save, ExternalLink, Trash2 } from 'lucide-react';
import { Form } from '@/components/ui/form';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ExportButton } from '@/components/dashboard/export-button';
import { AnalyzeDocumentCard } from '@/components/incidents/analyze-document-card';
import { DeleteConfirmationDialog } from '@/components/dashboard/delete-confirmation-dialog';
import { EditableEntityCard } from '@/components/dashboard/editable-entity-card';
import { useFieldArray } from 'react-hook-form';
import { FinancialDetailsCard } from '@/components/dashboard/financial-details-card';
import { PlusCircle } from 'lucide-react';


export default function DocumentoPage() {
  const params = useParams();
  const [doc, setDoc] = useState<Document | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { toast } = useToast();
  const [key, setKey] = useState(0); // Key to force re-render

  const form = useForm<DocumentUpdatePayload>({
    resolver: zodResolver(DocumentUpdateSchema),
    defaultValues: {}
  });

  const { fields: entidadFields, append: appendEntidad, remove: removeEntidad } = useFieldArray({
      control: form.control,
      name: "entidades"
  });

  const resetFormWithDocData = (docData: Document) => {
    form.reset({
        ...docData,
        fecha_emision: docData.fecha_emision ? new Date(docData.fecha_emision).toISOString().split('T')[0] : '',
        fecha_vencimiento: docData.fecha_vencimiento ? new Date(docData.fecha_vencimiento).toISOString().split('T')[0] : '',
        fecha_creacion: docData.fecha_creacion ? new Date(docData.fecha_creacion).toISOString().split('T')[0] : '',
    });
  }

  const fetchDocument = async (id: number) => {
    try {
      setIsLoading(true);
      const fetchedDoc = await getDocumentById(id);
      if (!fetchedDoc) {
        notFound();
      } else {
        setDoc(fetchedDoc);
        resetFormWithDocData(fetchedDoc);
      }
    } catch (error) {
      console.error("Failed to fetch document", error);
      toast({
        title: "Error",
        description: "No se pudo cargar el documento.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const idParam = params.id;
    const id = parseInt(Array.isArray(idParam) ? idParam[0] : idParam, 10);

    if (isNaN(id)) {
      notFound();
      return;
    }

    fetchDocument(id);
  }, [params.id, key]);


  const onAnalysisComplete = () => {
     // Increment key to trigger re-fetch of document data
     setKey(prevKey => prevKey + 1);
  };

  const handleDelete = async () => {
    if (!doc) return;
    try {
        await deleteDocument(doc.id_documento);
        toast({
            title: "Documento Eliminado",
            description: "El documento ha sido eliminado correctamente."
        });
        // The service function will handle the redirect
    } catch (error) {
        console.error("Failed to delete document", error);
        toast({
            title: "Error",
            description: "No se pudo eliminar el documento.",
            variant: "destructive",
        });
    }
  };


  const onSubmit = async (data: DocumentUpdatePayload) => {
    if (!doc) return;
    setIsSaving(true);
    try {
      const payload = { ...data };

      await updateDocument(doc.id_documento, payload);
      
      toast({
        title: 'Éxito',
        description: 'Documento actualizado correctamente.',
      });
      setIsEditing(false);
      // Re-fetch the document to show the latest data
      setKey(prevKey => prevKey + 1);

    } catch (error) {
      console.error(error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el documento.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  const resetForm = () => {
      if (!doc) return;
      resetFormWithDocData(doc);
  }


  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!doc) {
    return notFound();
  }

  const documentUrl = doc?.archivos?.[0]?.ruta_archivo;
  const exportData = doc ? [doc] : []; // ExportButton expects an array

  return (
    <MainLayout>
        <TooltipProvider>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                    <div className="flex-1 space-y-6 p-4 pt-6 md:p-8">
                        <MainLayoutHeader>
                        <div className="flex items-center justify-between space-y-2">
                            <h2 className="text-3xl font-bold tracking-tight">
                                {isEditing ? 'Editando Documento' : 'Detalles del Documento'}
                            </h2>
                            <div className="flex items-center space-x-2">
                            {isEditing ? (
                                <>
                                    <Button variant="outline" type="button" onClick={() => {
                                        setIsEditing(false);
                                        resetForm();
                                    }}>
                                        <X className="mr-2 h-4 w-4" />
                                        Cancelar
                                    </Button>
                                    <Button type="submit" disabled={isSaving}>
                                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                        Guardar Cambios
                                    </Button>
                                </>
                            ) : (
                                <>
                                 <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div tabIndex={0}> 
                                            <Button variant="outline" asChild={!!documentUrl} disabled={!documentUrl}>
                                                <a href={documentUrl || undefined} target="_blank" rel="noopener noreferrer">
                                                    <ExternalLink className="mr-2 h-4 w-4" />
                                                    Ver Documento
                                                </a>
                                            </Button>
                                        </div>
                                    </TooltipTrigger>
                                    {!documentUrl && (
                                        <TooltipContent>
                                            <p>No hay un archivo adjunto para este documento.</p>
                                        </TooltipContent>
                                    )}
                                </Tooltip>
                                
                                <Button type="button" onClick={() => setIsEditing(true)}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Editar
                                </Button>
                                <Button variant="destructive" type="button" onClick={() => setIsDeleteDialogOpen(true)}>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Eliminar
                                </Button>
                                <ExportButton data={exportData} filename={`documento_${doc.id_documento}`} />
                                </>
                            )}
                            </div>
                        </div>
                        </MainLayoutHeader>
                        
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                           <div className="lg:col-span-2 space-y-8">
                             <DocumentView doc={doc} isEditing={isEditing} form={form} />
                           </div>
                           <div className="space-y-6">
                               <AnalyzeDocumentCard documentId={doc.id_documento} onAnalysisComplete={onAnalysisComplete} />
                               
                               {entidadFields.map((field, index) => (
                                <EditableEntityCard
                                    key={field.id}
                                    isEditing={isEditing}
                                    form={form}
                                    entityIndex={index}
                                    removeEntity={() => removeEntidad(index)}
                                />
                               ))}

                                {isEditing && (
                                    <Button type="button" variant="outline" size="sm" onClick={() => appendEntidad({ rol: 'Otro', nombre: '', direccion: '', identificador_fiscal: '', telefono: '', email: '', datos_extra: null })}>
                                        <PlusCircle className="mr-2 h-4 w-4" /> Añadir Entidad
                                    </Button>
                                )}
                               
                               <FinancialDetailsCard doc={doc} isEditing={isEditing} form={form} />
                           </div>
                        </div>
                    </div>
                </form>
            </Form>
      </TooltipProvider>
      <DeleteConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDelete}
        documentNumber={doc.numero_factura}
      />
    </MainLayout>
  );
}
