
'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { type TaxValidationRule } from '@/lib/types';
import { DataTable } from '@/components/ui/data-table';
import { useState, useMemo, useCallback } from 'react';
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
} from "@/components/ui/alert-dialog"

interface TaxRulesTableProps {
    rules: TaxValidationRule[];
    onRuleUpdated: (id: number, vigente: boolean) => void;
    onRuleDeleted: (id: number) => void;
}


export function TaxRulesTable({ rules, onRuleUpdated, onRuleDeleted }: TaxRulesTableProps) {
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [ruleToDelete, setRuleToDelete] = useState<number | null>(null);

    const handleToggleVigente = useCallback((id: number, currentStatus: boolean) => {
        onRuleUpdated(id, !currentStatus);
    }, [onRuleUpdated]);
    
    const handleDeleteRule = useCallback((id: number) => {
        setRuleToDelete(id);
        setIsDeleteDialogOpen(true);
    }, []);

    const confirmDelete = useCallback(() => {
        if (ruleToDelete !== null) {
            onRuleDeleted(ruleToDelete);
            setRuleToDelete(null);
        }
        setIsDeleteDialogOpen(false);
    }, [ruleToDelete, onRuleDeleted]);

    const columns: ColumnDef<TaxValidationRule>[] = useMemo(() => [
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
        },
        {
            accessorKey: 'date_finish',
            header: 'Fecha Fin',
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
    ], [handleToggleVigente, handleDeleteRule]);

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

