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
    cell: ({ row }) => (
      <span className="font-medium truncate block max-w-[150px] sm:max-w-none">
        {row.original.tipo_impuesto}
      </span>
    ),
  },
  {
    accessorKey: "porcentaje",
    header: "Porcentaje",
    cell: ({ row }) => (
      <span className="text-sm sm:text-base">{row.original.porcentaje}%</span>
    ),
  },
  {
    accessorKey: "date_init",
    header: () => <span className="hidden sm:inline">Fecha Inicio</span>,
    cell: ({ row }) => (
      <span className="text-xs sm:text-sm text-muted-foreground">
        {formatDate(row.original.date_init)}
      </span>
    ),
  },
  {
    accessorKey: "date_finish",
    header: () => <span className="hidden sm:inline">Fecha Fin</span>,
    cell: ({ row }) => (
      <span className="text-xs sm:text-sm text-muted-foreground">
        {formatDate(row.original.date_finish)}
      </span>
    ),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => {
      const rule = row.original;
      return (
        <div className="text-right">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-10 sm:w-10">
                  <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 text-destructive shrink-0" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-[90vw] sm:max-w-md">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-base sm:text-lg">¿Estás seguro?</AlertDialogTitle>
                  <AlertDialogDescription className="text-xs sm:text-sm">
                    Esta acción es irreversible y eliminará la regla permanentemente.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                  <AlertDialogCancel className="w-full sm:w-auto m-0">Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => handleDeleteRule(rule.id)}
                    className="bg-destructive hover:bg-destructive/90 w-full sm:w-auto"
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
      <div className="w-full overflow-x-auto">
        <DataTable
          columns={columns}
          data={rules}
          filename="reglas-impuestos"
        />
      </div>
    );
}