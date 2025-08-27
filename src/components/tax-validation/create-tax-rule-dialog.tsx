
'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, PlusCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateTaxValidationRuleSchema, type CreateTaxValidationRulePayload } from '@/lib/types';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';
import { createTaxValidationRule } from '@/services/tax-validation-service';

export function CreateTaxRuleDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<CreateTaxValidationRulePayload>({
    resolver: zodResolver(CreateTaxValidationRuleSchema),
    defaultValues: {
      date_init: '',
      date_finish: '',
      tipo_impuesto: 'IVA',
      porcentaje: 21,
    }
  });

  const onSubmit = async (data: CreateTaxValidationRulePayload) => {
    try {
      await createTaxValidationRule(data);
      toast({ title: "Éxito", description: "Nueva regla de validación creada. Refresca la página para ver los cambios." });
      setIsOpen(false);
      form.reset();
    } catch (error) {
      toast({ title: "Error", description: "No se pudo crear la regla.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
            <Button>
                <PlusCircle className="mr-2 h-4 w-4" />
                Crear Nueva Regla
            </Button>
        </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear Nueva Regla de Validación</DialogTitle>
          <DialogDescription>
            Define los parámetros para una nueva regla de validación de impuestos.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                 <FormField
                    control={form.control}
                    name="date_init"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Fecha de Inicio</FormLabel>
                            <FormControl>
                                <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                 />
                <FormField
                    control={form.control}
                    name="date_finish"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Fecha de Fin</FormLabel>
                            <FormControl>
                                <Input type="date" {...field} />
                            </FormControl>
                             <FormMessage />
                        </FormItem>
                    )}
                 />
                <FormField
                    control={form.control}
                    name="tipo_impuesto"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Tipo de Impuesto</FormLabel>
                            <FormControl>
                                <Input {...field} placeholder="Ej: IVA" />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                 />
                <FormField
                    control={form.control}
                    name="porcentaje"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Porcentaje</FormLabel>
                            <FormControl>
                                <Input type="number" step="0.01" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />
                            </FormControl>
                             <FormMessage />
                        </FormItem>
                    )}
                 />

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={form.formState.isSubmitting}>
                        Cancelar
                    </Button>
                    <Button type="submit" disabled={form.formState.isSubmitting}>
                        {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Crear Regla
                    </Button>
                </DialogFooter>
            </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
