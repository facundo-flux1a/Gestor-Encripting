
'use client';

import { useState, useMemo, useCallback } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import type { TaxValidationRule } from '@/lib/types';
import { DataTable } from '@/components/ui/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { updateTaxRuleVigente, deleteTaxRule } from '@/services/tax-validation-service';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const formatDate = (date: string) => {
    try {
        const d = new Date(date);
        const utcDate = new Date(d.valueOf() + d.getTimezoneOffset() * 60 * 1000);
        return new Intl.DateTimeFormat('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }).format(utcDate);
    } catch (e) {
        return 'Fecha inválida';
    }
};

const getColumns = (
    onToggle: (rule: TaxValidationRule) => void,
    onDelete: (rule: TaxValidationRule) => void
): ColumnDef<TaxValidationRule>[] => [
    {
        accessorKey: 'vigente',
        header: 'Vigente',
        cell: ({ row }) => (
            <Switch
                checked={row.original.vigente}
                onCheckedChange={() => onToggle(row.original)}
            />
        )
    },
    {
        accessorKey: 'tipo_impuesto',
        header: 'Tipo de Impuesto',
         cell: ({ row }) => (
            <Badge variant="secondary">{row.original.tipo_impuesto}</Badge>
        )
    },
    {
        accessorKey: 'porcentaje',
        header: 'Porcentaje Inválido',
        cell: ({ row }) => `${row.original.porcentaje}%`
    },
    {
        accessorKey: 'date_init',
        header: 'Desde',
        cell: ({ row }) => formatDate(row.original.date_init)
    },
    {
        accessorKey: 'date_finish',
        header: 'Hasta',
        cell: ({ row }) => formatDate(row.original.date_finish)
    },
    {
        id: 'actions',
        cell: ({ row }) => (
            <div className="text-right">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Abrir menú</span>
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onDelete(row.original)} className="text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Eliminar
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        )
    }
];

export function TaxRulesTable({ rules, onRuleUpdated, onRuleDeleted }: { rules: TaxValidationRule[], onRuleUpdated: () => void, onRuleDeleted: () => void }) {
    const { toast } = useToast();
    const [isDeleting, setIsDeleting] = useState<TaxValidationRule | null>(null);

    const handleToggleVigente = useCallback(async (rule: TaxValidationRule) => {
        try {
            await updateTaxRuleVigente(rule.id, !rule.vigente);
            onRuleUpdated();
        } catch (error) {
            console.error("Failed to update rule", error);
            toast({ title: "Error", description: "No se pudo actualizar la regla.", variant: "destructive" });
        }
    }, [onRuleUpdated, toast]);

    const handleDeleteRule = useCallback(async () => {
        if (!isDeleting) return;
        try {
            await deleteTaxRule(isDeleting.id);
            onRuleDeleted();
        } catch (error) {
             console.error("Failed to delete rule", error);
            toast({ title: "Error", description: "No se pudo eliminar la regla.", variant: "destructive" });
        } finally {
            setIsDeleting(null);
        }
    }, [isDeleting, onRuleDeleted, toast]);
    
    const columns = useMemo(() => getColumns(handleToggleVigente, setIsDeleting), [handleToggleVigente]);

    return (
        <>
            <DataTable columns={columns} data={rules} filename="reglas_impuestos" />
            <AlertDialog open={!!isDeleting} onOpenChange={(open) => !open && setIsDeleting(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción no se puede deshacer. Se eliminará permanentemente la regla de validación de impuestos.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteRule} className="bg-destructive hover:bg-destructive/80">
                            Sí, eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

