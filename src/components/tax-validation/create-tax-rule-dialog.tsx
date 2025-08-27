
'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateTaxValidationRuleSchema, type CreateTaxValidationRulePayload } from '@/lib/types';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';

interface CreateTaxRuleDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onRuleCreated: (payload: CreateTaxValidationRulePayload) => Promise<boolean>;
}

export function CreateTaxRuleDialog({ isOpen, setIsOpen, onRuleCreated }: CreateTaxRuleDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
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
    setIsSubmitting(true);
    const success = await onRuleCreated(data);
    if (success) {
      setIsOpen(false);
      form.reset();
    }
    setIsSubmitting(false);
  };
  
  const handleOpenChange = (open: boolean) => {
      if(isSubmitting) return;
      setIsOpen(open);
      if(!open) form.reset();
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
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
                                <Input type="number" step="0.01" {...field} />
                            </FormControl>
                             <FormMessage />
                        </FormItem>
                    )}
                 />

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
                        Cancelar
                    </Button>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Crear Regla
                    </Button>
                </DialogFooter>
            </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
