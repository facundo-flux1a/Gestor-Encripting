

'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type TaxValidationRule } from "@/lib/types";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Trash2 } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useState, useMemo, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { DataTable } from "../ui/data-table";
import type { ColumnDef } from "@tanstack/react-table";


const formatDate = (dateString: string) => {
    try {
        const date = new Date(dateString);
        const userTimezoneOffset = date.getTimezoneOffset() * 60000;
        return new Date(date.getTime() + userTimezoneOffset).toLocaleDateString('es-ES', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
    } catch {
        return 'N/A';
    }
};

interface TaxRulesTableProps {
    rules: TaxValidationRule[];
    onRuleUpdated: (id: number, vigente: boolean) => Promise<void>;
    onRuleDeleted: (id: number) => Promise<void>;
}

const getColumns = (
  handleToggleVigente: (id: number, currentStatus: boolean) => void,
  handleDeleteRule: (id: number) => void
): ColumnDef<TaxValidationRule>[] => [
  {
    accessorKey: "vigente",
    header: "Activa",
    cell: ({ row }) => {
      const rule = row.original;
      return (
        <Switch
          checked={rule.vigente}
          onCheckedChange={(checked) => handleToggleVigente(rule.id, checked)}
        />
      );
    },
  },
  {
    accessorKey: "tipo_impuesto",
    header: "Tipo Impuesto",
  },
  {
    accessorKey: "porcentaje",
    header: "Porcentaje",
    cell: ({ row }) => `${row.original.porcentaje}%`,
  },
  {
    accessorKey: "date_init",
    header: "Fecha Inicio",
    cell: ({ row }) => formatDate(row.original.date_init),
  },
  {
    accessorKey: "date_finish",
    header: "Fecha Fin",
    cell: ({ row }) => formatDate(row.original.date_finish),
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const rule = row.original;
      return (
        <div className="text-right">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción es irreversible y eliminará la regla permanentemente.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => handleDeleteRule(rule.id)}
                    className="bg-destructive hover:bg-destructive/90"
                  >
                    Eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
        </div>
      );
    },
  },
];


export function TaxRulesTable({ rules, onRuleUpdated, onRuleDeleted }: TaxRulesTableProps) {
    const { toast } = useToast();

    const handleToggleVigente = useCallback(async (id: number, currentStatus: boolean) => {
        try {
            await onRuleUpdated(id, currentStatus);
            toast({ title: "Regla actualizada", description: "El estado de la regla ha sido cambiado." });
        } catch (error) {
            toast({ title: "Error", description: "No se pudo actualizar la regla.", variant: "destructive" });
        }
    }, [onRuleUpdated, toast]);

    const handleDeleteRule = useCallback(async (id: number) => {
        try {
            await onRuleDeleted(id);
            toast({ title: "Regla eliminada", description: "La regla ha sido eliminada correctamente." });
        } catch (error) {
            toast({ title: "Error", description: "No se pudo eliminar la regla.", variant: "destructive" });
        }
    }, [onRuleDeleted, toast]);
    
    const columns = useMemo(
      () => getColumns(handleToggleVigente, handleDeleteRule),
      [handleToggleVigente, handleDeleteRule]
    );

    return (
      <DataTable
        columns={columns}
        data={rules}
        filename="reglas-impuestos"
      />
    );
}
