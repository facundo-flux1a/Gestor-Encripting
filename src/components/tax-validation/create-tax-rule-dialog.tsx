
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateTaxValidationRuleSchema, type CreateTaxValidationRulePayload } from '@/lib/types';
import { createTaxValidationRule } from '@/services/tax-validation-service';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface CreateTaxRuleDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onRuleCreated: () => void;
}

export function CreateTaxRuleDialog({ isOpen, setIsOpen, onRuleCreated }: CreateTaxRuleDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<CreateTaxValidationRulePayload>({
    resolver: zodResolver(CreateTaxValidationRuleSchema),
    defaultValues: {
      date_init: '',
      date_finish: '',
      tipo_impuesto: 'IVA',
      porcentaje: 21,
    },
  });

  const onSubmit = async (data: CreateTaxValidationRulePayload) => {
    setIsLoading(true);
    try {
      await createTaxValidationRule(data);
      onRuleCreated();
      setIsOpen(false);
      form.reset();
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "No se pudo crear la regla de validación.",
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Crear Nueva Regla de Validación</DialogTitle>
          <DialogDescription>
            Define un impuesto y un rango de fechas en el que su uso se considera una incidencia.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 py-4">
            <FormField
              control={form.control}
              name="tipo_impuesto"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Impuesto</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Ej: IVA, IRPF" />
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
                  <FormLabel>Porcentaje Inválido (%)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
            <DialogFooter>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Crear Regla
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
