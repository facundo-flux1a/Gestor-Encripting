'use client';

import { useForm, UseFormReturn } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { type DocumentUpdatePayload } from '@/lib/types';
import { Loader2, Save } from 'lucide-react';

interface DocumentFormProps {
  form: UseFormReturn<DocumentUpdatePayload>;
  onSubmit: (data: DocumentUpdatePayload) => void;
  isSaving: boolean;
}

export function DocumentForm({ form, onSubmit, isSaving }: DocumentFormProps) {
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Información Principal</CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-8">
            <FormField
              control={form.control}
              name="numero_factura"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nº Factura</FormLabel>
                  <FormControl>
                    <Input placeholder="Nº de factura" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="fecha_subida"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha de Emisión</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="proveedor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Proveedor / Cliente</FormLabel>
                  <FormControl>
                    <Input placeholder="Nombre del proveedor o cliente" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="cif"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CIF/NIF</FormLabel>
                  <FormControl>
                    <Input placeholder="Identificador fiscal" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Detalles Financieros</CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-8">
            <FormField
              control={form.control}
              name="base_imponible"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Base Imponible</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="total"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Importe Total</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end">
            <Button type="submit" disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Guardar Cambios
            </Button>
        </div>

      </form>
    </Form>
  );
}
