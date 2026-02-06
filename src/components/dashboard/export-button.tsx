'use client';

import * as React from 'react';
import * as XLSX from 'xlsx';
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Download, FileText, FileSpreadsheet, FileType } from "lucide-react";
import { type Column, type Row } from '@tanstack/react-table';

interface ExportButtonProps {
    columns: Column<any, unknown>[];
    data: Row<any>[];
    filename: string;
}

const formatCurrency = (amount: number, minimumFractionDigits = 2) => {
    if (isNaN(amount)) return '0,00';
    return new Intl.NumberFormat('es-ES', {
        style: 'decimal',
        minimumFractionDigits,
        maximumFractionDigits: 2
    }).format(amount);
};

const getCellString = (cell: any): string => {
    const value = cell.getValue();
    const columnId = cell.column.id;

    if (value instanceof Date) {
        return value.toLocaleDateString('es-ES');
    }
    if (typeof value === 'boolean') {
        return value ? 'Sí' : 'No';
    }

    // For specific tax columns, dig into the original row data
    if (columnId.startsWith('base_') || columnId.startsWith('iva_')) {
        const rateMatch = columnId.match(/\d+/);
        if (rateMatch) {
            const rate = Number(rateMatch[0]);
            const ivaDetail = cell.row.original.iva_details?.find((i: any) => Number(i.porcentaje) === rate);
            if (columnId.startsWith('base_')) {
                return formatCurrency(ivaDetail?.base_imponible ?? 0);
            }
            if (columnId.startsWith('iva_')) {
                return formatCurrency(ivaDetail?.cuota ?? 0);
            }
        }
    }

    // For other currency columns
    if (typeof value === 'number') {
        return formatCurrency(value);
    }

    if (value === null || value === undefined) {
        return '';
    }

    return String(value ?? '');
};

const getHeaderName = (col: Column<any, unknown>): string => {
    const headerDef = col.columnDef.header;
    if (typeof headerDef === 'string') return headerDef;

    const readableId = col.id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    return readableId.charAt(0).toUpperCase() + readableId.slice(1);
};

export function ExportButton({ columns, data, filename }: ExportButtonProps) {

    const handleExport = (format: 'excel' | 'csv' | 'txt') => {
        const exportableColumns = columns.filter(col => col.id !== 'select' && col.id !== 'actions');

        const headers = exportableColumns.map(column => getHeaderName(column));

        // Inicializar totales
        const totals: Record<string, number> = {};
        exportableColumns.forEach(col => {
            totals[col.id] = 0;
        });

        const rows = data.map(row => {
            const rowData: { [key: string]: any } = {};

            exportableColumns.forEach(cellCol => {
                const visibleCells = row.getVisibleCells();
                const cell = visibleCells.find(c => c.column.id === cellCol.id);

                // Si no hay celda visible correspondiente (puede pasar si las columnas varían), saltar
                if (!cell) return;

                const header = getHeaderName(cell.column);
                rowData[header] = getCellString(cell);

                // --- CALCULAR TOTALES ---
                const columnId = cell.column.id;
                let numericValue = 0;

                // 1. Columnas de impuestos (Base XX% / IVA XX%)
                if (columnId.startsWith('base_') || columnId.startsWith('iva_')) {
                    const rateMatch = columnId.match(/\d+/);
                    if (rateMatch) {
                        const rate = Number(rateMatch[0]);
                        const ivaDetail = row.original.iva_details?.find((i: any) => Number(i.porcentaje) === rate);
                        if (columnId.startsWith('base_')) {
                            numericValue = Number(ivaDetail?.base_imponible) || 0;
                        } else if (columnId.startsWith('iva_')) {
                            numericValue = Number(ivaDetail?.cuota) || 0;
                        }
                    }
                }
                // 2. Otras columnas numéricas (usando el valor crudo)
                else {
                    // Intentar obtener valor crudo
                    const rawValue = row.getValue(columnId);
                    if (typeof rawValue === 'number') {
                        numericValue = rawValue;
                    } else if (typeof rawValue === 'string') {
                        // Intentar parsear si parece número (cuidado con fechas o IDs que parecen números)
                        // Para este caso, solo sumamos lo que explícitamente es número en el modelo o campos conocidos
                        if (['base', 'iva', 'retencion', 'total', 'base_imponible'].includes(columnId)) {
                            numericValue = Number(rawValue) || 0;
                        }
                    }
                }

                if (!isNaN(numericValue)) {
                    totals[columnId] = (totals[columnId] || 0) + numericValue;
                }
            });
            return rowData;
        });

        if (rows.length === 0) {
            console.warn("No data to export.");
            return;
        }

        // --- CREAR FILA DE TOTALES ---
        const totalRowData: { [key: string]: any } = {};
        // Usar la primera columna para poner el label "TOTALES"
        const firstHeader = getHeaderName(exportableColumns[0]);
        totalRowData[firstHeader] = "TOTALES:";

        exportableColumns.forEach((col, index) => {
            if (index === 0) return; // Ya pusimos el label

            const header = getHeaderName(col);
            // Solo mostrar total si la suma es distinta de 0 (o si es una columna típicamente numérica)
            // Esto evita poner '0,00' en columnas de texto como 'Empresa' o 'Fecha' si accidentalmente parseó algo.
            // Para mayor seguridad, filtramos por IDs conocidos o si el acumulado es significativo

            const isNumericCol = ['base', 'iva', 'retencion', 'total', 'base_imponible'].includes(col.id)
                || col.id.startsWith('base_')
                || col.id.startsWith('iva_');

            if (isNumericCol) {
                totalRowData[header] = formatCurrency(totals[col.id] || 0);
            } else {
                totalRowData[header] = "";
            }
        });

        // Agregar fila de totales al final
        rows.push(totalRowData);

        const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });

        if (format === 'excel') {
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Datos');
            XLSX.writeFile(workbook, `${filename}.xlsx`);
            return;
        }

        let fileContent = '';
        const sheetAsCsv = XLSX.utils.sheet_to_csv(worksheet);

        if (format === 'csv') {
            fileContent = sheetAsCsv;
            downloadFile(fileContent, `${filename}.csv`, 'text/csv;charset=utf-8;');
        } else if (format === 'txt') {
            const rowsAsTxt = sheetAsCsv.split('\n').map(row => row.split(',').join('\t')).join('\n');
            fileContent = rowsAsTxt;
            downloadFile(fileContent, `${filename}.txt`, 'text/plain;charset=utf-8;');
        }
    };

    const downloadFile = (content: string, filename: string, mimeType: string) => {
        const blob = new Blob([`\uFEFF${content}`], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

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
            <DropdownMenuContent align="end" className="w-44 sm:w-48">
                <DropdownMenuItem
                    onClick={() => handleExport('excel')}
                    className="text-xs sm:text-sm gap-2 cursor-pointer"
                >
                    <FileSpreadsheet className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                    <span>Excel (.xlsx)</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => handleExport('csv')}
                    className="text-xs sm:text-sm gap-2 cursor-pointer"
                >
                    <FileType className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                    <span>CSV (.csv)</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => handleExport('txt')}
                    className="text-xs sm:text-sm gap-2 cursor-pointer"
                >
                    <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                    <span>Texto (.txt)</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}