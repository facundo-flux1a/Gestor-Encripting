
'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { type TaxValidationRule } from '@/lib/types';
import { DataTable } from '@/components/ui/data-table';
import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useToast } from '@/hooks/use-toast';
import { updateTaxRuleVigente, deleteTaxRule } from '@/services/tax-validation-service';

interface TaxRulesTableProps {
    rules: TaxValidationRule[];
}

const formatDate = (dateString: string) => {
    try {
        const date = new Date(dateString);
        // Adjust for timezone offset to display the correct date
        const userTimezoneOffset = date.getTimezoneOffset() * 60000;
        return new Date(date.getTime() + userTimezoneOffset).toLocaleDateString('es-ES', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
    } catch {
        return 'N/A';
    }
}

export function TaxRulesTable({ rules }: TaxRulesTableProps) {
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [ruleToDelete, setRuleToDelete] = useState<number | null>(null);
    const { toast } = useToast();

    // The component receives rules as props and does not manage its own state for them.
    // Actions will call server actions and the user will refresh to see changes.

    const handleToggleVigente = async (id: number, currentStatus: boolean) => {
        try {
            await updateTaxRuleVigente(id, !currentStatus);
            toast({ title: "Estado Actualizado", description: "El estado de la regla ha cambiado. Refresca para ver los cambios." });
        } catch (error) {
            toast({ title: "Error", description: "No se pudo actualizar la regla.", variant: "destructive" });
        }
    };

    const handleDeleteRule = (id: number) => {
        setRuleToDelete(id);
        setIsDeleteDialogOpen(true);
    };

    const confirmDelete = async () => {
        if (ruleToDelete !== null) {
            try {
                await deleteTaxRule(ruleToDelete);
                toast({ title: "Regla Eliminada", description: "La regla ha sido eliminada. Refresca para ver los cambios." });
            } catch (error) {
                 toast({ title: "Error", description: "No se pudo eliminar la regla.", variant: "destructive" });
            } finally {
                setRuleToDelete(null);
                setIsDeleteDialogOpen(false);
            }
        }
    };

    const columns: ColumnDef<TaxValidationRule>[] = [
        {
            accessorKey: 'vigente',
            header: 'Activa',
            cell: ({ row }) => (
                <Switch
                    checked={row.original.vigente}
                    onCheckedChange={() => handleToggleVigente(row.original.id, row.original.vigente)}
                />
            )
        },
        {
            accessorKey: 'tipo_impuesto',
            header: 'Tipo Impuesto',
        },
        {
            accessorKey: 'porcentaje',
            header: 'Porcentaje',
            cell: ({ row }) => `${row.original.porcentaje}%`
        },
        {
            accessorKey: 'date_init',
            header: 'Fecha Inicio',
            cell: ({ row }) => formatDate(row.original.date_init)
        },
        {
            accessorKey: 'date_finish',
            header: 'Fecha Fin',
            cell: ({ row }) => formatDate(row.original.date_finish)
        },
        {
            id: 'actions',
            cell: ({ row }) => {
                const rule = row.original;
                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Abrir menú</span>
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleDeleteRule(rule.id)} className="text-destructive">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Eliminar
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                );
            },
        },
    ];

    return (
        <>
            <DataTable
                columns={columns}
                data={rules}
                filename="reglas_validacion_impuestos"
            />
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Estás seguro de que quieres eliminar esta regla?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción es irreversible y eliminará permanentemente la regla de validación.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">
                            Eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
