'use client';

import { useEffect, useState } from 'react';
import { notFound } from 'next/navigation';
import { MainLayout, MainLayoutHeader } from '@/components/layout/main-layout';
import { getDocumentById, updateDocument } from '@/services/document-service';
import { type Document, DocumentUpdateSchema, type DocumentUpdatePayload } from '@/lib/types';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DocumentView } from '@/components/dashboard/document-view';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Edit, X, Save } from 'lucide-react';
import { Form } from '@/components/ui/form';


export default function DocumentoPage({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  const [doc, setDoc] = useState<Document | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const form = useForm<DocumentUpdatePayload>({
    resolver: zodResolver(DocumentUpdateSchema),
    defaultValues: {
        numero_factura: '',
        fecha_emision: '',
        proveedor: '',
        cif: '',
        base_imponible: 0,
        total: 0,
        tipo_documento: 'Factura',
        incidencia: false,
        fecha_vencimiento: '',
        moneda: 'EUR',
        observaciones: '',
        entidades: [],
        lineas: [],
        iva_details: [],
    }
  });

  useEffect(() => {
    async function fetchDocument() {
      if (isNaN(id)) {
        notFound();
        return;
      }
      try {
        setIsLoading(true);
        const fetchedDoc = await getDocumentById(id);
        if (!fetchedDoc) {
          notFound();
        } else {
          setDoc(fetchedDoc);
           form.reset({
            ...fetchedDoc,
            fecha_emision: fetchedDoc.fecha_emision ? new Date(fetchedDoc.fecha_emision).toISOString().split('T')[0] : '',
            fecha_vencimiento: fetchedDoc.fecha_vencimiento ? new Date(fetchedDoc.fecha_vencimiento).toISOString().split('T')[0] : '',
            fecha_creacion: fetchedDoc.fecha_creacion ? new Date(fetchedDoc.fecha_creacion).toISOString().split('T')[0] : '',
          });
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
    fetchDocument();
  }, [id, form, toast]);

  const onSubmit = async (data: DocumentUpdatePayload) => {
    if (!doc) return;
    setIsSaving(true);
    try {
      // The provider and cif are inside the entities array, we need to extract them for the payload
      const mainEntity = data.entidades.find(e => e.rol === 'proveedor' || e.rol === 'emisor' || e.rol === 'cliente' || e.rol === 'receptor');
      const payload = {
        ...data,
        proveedor: mainEntity?.nombre || '',
        cif: mainEntity?.identificador_fiscal || ''
      };

      await updateDocument(doc.id_documento, payload);
      const updatedDoc = await getDocumentById(id);
      setDoc(updatedDoc);
      if (updatedDoc) {
        form.reset({
          ...updatedDoc,
          fecha_emision: updatedDoc.fecha_emision ? new Date(updatedDoc.fecha_emision).toISOString().split('T')[0] : '',
          fecha_vencimiento: updatedDoc.fecha_vencimiento ? new Date(updatedDoc.fecha_vencimiento).toISOString().split('T')[0] : '',
          fecha_creacion: updatedDoc.fecha_creacion ? new Date(updatedDoc.fecha_creacion).toISOString().split('T')[0] : '',
        });
      }
      toast({
        title: 'Éxito',
        description: 'Documento actualizado correctamente.',
      });
      setIsEditing(false);
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
      form.reset({
        ...doc,
        fecha_emision: doc.fecha_emision ? new Date(doc.fecha_emision).toISOString().split('T')[0] : '',
        fecha_vencimiento: doc.fecha_vencimiento ? new Date(doc.fecha_vencimiento).toISOString().split('T')[0] : '',
        fecha_creacion: doc.fecha_creacion ? new Date(doc.fecha_creacion).toISOString().split('T')[0] : '',
    });
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

  return (
    <MainLayout>
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
                        <Button type="button" onClick={() => setIsEditing(true)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Editar
                        </Button>
                    )}
                    </div>
                </div>
                </MainLayoutHeader>
                
                <DocumentView doc={doc} isEditing={isEditing} form={form} />
            </div>
        </form>
      </Form>
    </MainLayout>
  );
}
