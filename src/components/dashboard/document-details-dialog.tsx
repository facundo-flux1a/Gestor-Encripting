'use client';

import { useState, useEffect } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { type Document, DocumentUpdateSchema } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { updateDocument } from '@/services/document-service';
import { Loader2, Pencil, Save } from 'lucide-react';

type Inputs = z.infer<typeof DocumentUpdateSchema>;

export function DocumentDetailsDialog({ doc, isOpen, setIsOpen }: { doc: Document | null; isOpen: boolean; setIsOpen: (open: boolean) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<Inputs>({
    resolver: zodResolver(DocumentUpdateSchema),
  });
  
  useEffect(() => {
    if (doc) {
      const date = new Date(doc.fecha_subida);
      const formattedDate = date.toISOString().split('T')[0];
      reset({
        numero_factura: doc.numero_factura,
        fecha_subida: formattedDate,
        proveedor: doc.proveedor,
        cif: doc.cif,
        base_imponible: doc.base_imponible,
        total: doc.total,
      });
    }
  }, [doc, reset]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setIsEditing(false);
    }
  }

  const handleEditToggle = () => {
    setIsEditing(!isEditing);
  }
  
  const processSubmit: SubmitHandler<Inputs> = async (data) => {
    if (!doc) return;
    setIsSaving(true);
    try {
      await updateDocument(doc.id_documento, data);
      toast({
        title: "Documento actualizado",
        description: "Los cambios se han guardado correctamente.",
      });
      setIsEditing(false);
      // NOTE: We are not refreshing the data on the client side for now
      // A full page reload or re-fetch would be needed to see the changes in the table
    } catch (error) {
       toast({
        variant: "destructive",
        title: "Error al guardar",
        description: "No se pudieron guardar los cambios. Inténtalo de nuevo.",
      });
    } finally {
        setIsSaving(false);
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  if (!doc) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[625px]">
        <DialogHeader>
          <DialogTitle>Detalles del Documento</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Editando' : 'Vista detallada del'} documento: {doc.numero_factura}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(processSubmit)}>
          <div className="grid gap-4 py-4">
            {isEditing ? (
              <>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="numero_factura" className="text-right">Nº Factura</Label>
                  <Input id="numero_factura" {...register("numero_factura")} className="col-span-3" />
                  {errors.numero_factura && <p className="col-span-4 text-red-500 text-xs">{errors.numero_factura.message}</p>}
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="fecha_subida" className="text-right">Fecha</Label>
                  <Input id="fecha_subida" type="date" {...register("fecha_subida")} className="col-span-3" />
                   {errors.fecha_subida && <p className="col-span-4 text-red-500 text-xs">{errors.fecha_subida.message}</p>}
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="proveedor" className="text-right">Proveedor/Cliente</Label>
                  <Input id="proveedor" {...register("proveedor")} className="col-span-3" />
                   {errors.proveedor && <p className="col-span-4 text-red-500 text-xs">{errors.proveedor.message}</p>}
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="cif" className="text-right">CIF</Label>
                  <Input id="cif" {...register("cif")} className="col-span-3" />
                  {errors.cif && <p className="col-span-4 text-red-500 text-xs">{errors.cif.message}</p>}
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="base_imponible" className="text-right">Base Imponible</Label>
                  <Input id="base_imponible" type="number" step="0.01" {...register("base_imponible", { valueAsNumber: true })} className="col-span-3" />
                  {errors.base_imponible && <p className="col-span-4 text-red-500 text-xs">{errors.base_imponible.message}</p>}
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="total" className="text-right">Total</Label>
                  <Input id="total" type="number" step="0.01" {...register("total", { valueAsNumber: true })} className="col-span-3" />
                  {errors.total && <p className="col-span-4 text-red-500 text-xs">{errors.total.message}</p>}
                </div>
              </>
            ) : (
                <table className="w-full text-sm">
                    <tbody>
                        <tr className="border-b"><td className="font-semibold p-2">Nº Factura</td><td className="p-2">{doc.numero_factura}</td></tr>
                        <tr className="border-b"><td className="font-semibold p-2">Fecha</td><td className="p-2">{new Date(doc.fecha_subida).toLocaleDateString('es-ES')}</td></tr>
                        <tr className="border-b"><td className="font-semibold p-2">Proveedor/Cliente</td><td className="p-2">{doc.proveedor}</td></tr>
                        <tr className="border-b"><td className="font-semibold p-2">CIF</td><td className="p-2">{doc.cif}</td></tr>
                        <tr className="border-b"><td className="font-semibold p-2">Tipo Documento</td><td className="p-2">{doc.tipo_documento}</td></tr>
                        <tr className="border-b"><td className="font-semibold p-2">Base Imponible</td><td className="p-2 text-right">{formatCurrency(doc.base_imponible)}</td></tr>
                        {doc.iva_details.map((iva, index) => (
                            <tr key={index} className="border-b"><td className="font-semibold p-2 pl-6">{`IVA (${iva.porcentaje}%)`}</td><td className="p-2 text-right">{formatCurrency(iva.cuota)}</td></tr>
                        ))}
                        <tr><td className="font-semibold p-2">Total</td><td className="p-2 text-right font-bold">{formatCurrency(doc.total)}</td></tr>
                    </tbody>
                </table>
            )}
          </div>
          <DialogFooter>
            {isEditing ? (
              <>
                <Button type="button" variant="ghost" onClick={handleEditToggle}>Cancelar</Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Guardar Cambios
                </Button>
              </>
            ) : (
              <Button type="button" variant="outline" onClick={handleEditToggle}>
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
