'use client';

import * as React from 'react';
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, FileSpreadsheet, FileType, FileJson } from "lucide-react";
import { type Column, type Row } from '@tanstack/react-table';
import { generateAdvancedExport } from '@/lib/export-utils';

interface ExportButtonProps {
    columns: Column<any, unknown>[];
    data: Row<any>[];
    filename: string;
    exportContext?: 'trimestres' | 'documentos' | 'documentos_emitidas' | 'documentos_recibidas' | 'otros';
    includeSummary?: boolean;
}

const getHeaderName = (col: Column<any, unknown>): string => {
    const headerDef = col.columnDef.header;
    if (typeof headerDef === 'string') return headerDef;

    const readableId = col.id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    return readableId.charAt(0).toUpperCase() + readableId.slice(1);
};

export function ExportButton({ columns, data, filename, exportContext, includeSummary }: ExportButtonProps) {
    const [includeFileUrls, setIncludeFileUrls] = React.useState(false);
    const [includeEntities, setIncludeEntities] = React.useState(false);

    const handleExport = (format: 'excel' | 'csv' | 'json') => {
        const exportableColumns = columns.filter(col => col.id !== 'select' && col.id !== 'actions');

        const utilColumns = exportableColumns.map(col => ({
            id: col.id,
            header: getHeaderName(col)
        }));

        generateAdvancedExport(data, utilColumns, {
            filename,
            format,
            ...(format === 'excel' && includeSummary ? { includeSummary: true } : {}),
            ...(format === 'excel' && exportContext ? { exportContext } : {}),
            ...(format === 'excel' && includeFileUrls ? { includeFileUrls: true } : {}),
            ...(format === 'excel' && includeEntities ? { includeEntities: true } : {}),
        });
    };

    // Contexto soporta checkboxes solo en trimestres/documentos
    const showExcelOptions = !exportContext || ['trimestres', 'documentos', 'documentos_emitidas', 'documentos_recibidas', 'otros'].includes(exportContext);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    className="gap-1.5 sm:gap-2 h-8 sm:h-9 text-xs sm:text-sm"
                >
                    <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                    <span className="hidden xs:inline">Exportar</span>
                    <span className="xs:hidden">Export</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 sm:w-56">
                {showExcelOptions ? (
                    <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="text-xs sm:text-sm gap-2 cursor-pointer">
                            <FileSpreadsheet className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                            <span>Excel (.xlsx)</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-64 p-2">
                            <p className="text-xs font-medium text-muted-foreground px-2 py-1 mb-1">
                                Opciones de exportación
                            </p>
                            {/* Checkbox: URL de archivos */}
                            <label
                                htmlFor="export-file-urls"
                                className="flex items-start gap-2.5 px-2 py-2 rounded-sm hover:bg-accent cursor-pointer select-none"
                                onClick={e => e.stopPropagation()}
                            >
                                <Checkbox
                                    id="export-file-urls"
                                    checked={includeFileUrls}
                                    onCheckedChange={v => setIncludeFileUrls(!!v)}
                                    className="mt-0.5 shrink-0"
                                />
                                <div>
                                    <p className="text-xs font-medium leading-tight">Incluir URL de archivos</p>
                                    <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                                        Agrega el enlace al documento original (MinIO) como columna extra
                                    </p>
                                </div>
                            </label>
                            {/* Checkbox: Información completa de entidades */}
                            <label
                                htmlFor="export-entities"
                                className="flex items-start gap-2.5 px-2 py-2 rounded-sm hover:bg-accent cursor-pointer select-none"
                                onClick={e => e.stopPropagation()}
                            >
                                <Checkbox
                                    id="export-entities"
                                    checked={includeEntities}
                                    onCheckedChange={v => setIncludeEntities(!!v)}
                                    className="mt-0.5 shrink-0"
                                />
                                <div>
                                    <p className="text-xs font-medium leading-tight">Incluir info de entidades</p>
                                    <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                                        Agrega pestaña de directorio completo de proveedores y clientes, y columna Proveedor/Cliente en la lista
                                    </p>
                                </div>
                            </label>
                            <DropdownMenuSeparator className="my-1" />
                            <DropdownMenuItem
                                onClick={() => handleExport('excel')}
                                className="text-xs sm:text-sm gap-2 cursor-pointer font-medium justify-center"
                            >
                                <FileSpreadsheet className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                                Exportar Excel
                            </DropdownMenuItem>
                        </DropdownMenuSubContent>
                    </DropdownMenuSub>
                ) : (
                    <DropdownMenuItem
                        onClick={() => handleExport('excel')}
                        className="text-xs sm:text-sm gap-2 cursor-pointer"
                    >
                        <FileSpreadsheet className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                        <span>Excel (.xlsx)</span>
                    </DropdownMenuItem>
                )}
                <DropdownMenuItem
                    onClick={() => handleExport('csv')}
                    className="text-xs sm:text-sm gap-2 cursor-pointer"
                >
                    <FileType className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                    <span>CSV (.csv)</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => handleExport('json')}
                    className="text-xs sm:text-sm gap-2 cursor-pointer"
                >
                    <FileJson className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                    <span>JSON (.json)</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}