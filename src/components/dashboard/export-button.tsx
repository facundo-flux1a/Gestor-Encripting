

'use client';

import * as React from 'react';
import * as XLSX from 'xlsx';
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Download, FileText, FileSpreadsheet, FileType } from "lucide-react";
import { flexRender, type Column, type Row } from '@tanstack/react-table';


interface ExportButtonProps {
    columns: Column<any, unknown>[];
    data: Row<any>[];
    filename: string;
}

const formatCurrency = (amount: number, minimumFractionDigits = 2) => {
    if(isNaN(amount)) return '0,00';
    return new Intl.NumberFormat('es-ES', { style: 'decimal', minimumFractionDigits, maximumFractionDigits: 2 }).format(amount);
}

const getCellString = (cell: any): string => {
    const value = cell.getValue();
    const columnId = cell.column.id;
    const isCurrencyColumn = columnId.toLowerCase().includes('total') || 
                           columnId.toLowerCase().includes('precio') || 
                           columnId.toLowerCase().includes('importe') ||
                           columnId.toLowerCase().includes('iva') ||
                           columnId.toLowerCase().includes('base_imponible') ||
                           columnId.toLowerCase().includes('base') ||
                           columnId.toLowerCase().includes('retencion');

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
    
    if (value instanceof Date) {
        return value.toLocaleDateString('es-ES');
    }
    if (typeof value === 'boolean') {
        return value ? 'Sí' : 'No';
    }
    if (typeof value === 'number') {
        return isCurrencyColumn ? formatCurrency(value) : value.toString();
    }
    if (value === null || value === undefined) {
        return '';
    }

    const rendered = flexRender(cell.column.columnDef.cell, cell.getContext());
    if (React.isValidElement(rendered) && rendered.props.initialValue !== undefined) {
        const initialValue = rendered.props.initialValue;
        if(typeof initialValue === 'number' && (rendered.props.isCurrency || isCurrencyColumn)) {
            return formatCurrency(initialValue);
        }
        if (initialValue instanceof Date) {
            return initialValue.toLocaleDateString('es-ES');
        }
        return String(initialValue);
    }
    
    if (React.isValidElement(rendered)) {
         if (typeof rendered.props.children === 'string' || typeof rendered.props.children === 'number') {
            return String(rendered.props.children);
        }
        if (Array.isArray(rendered.props.children)) {
             const textChild = rendered.props.children.find((c: any) => typeof c === 'string' || typeof c === 'number');
             if(textChild) return String(textChild);
        }
    }
    
    return String(value ?? '');
}

const getHeaderName = (col: Column<any, unknown>): string => {
    const headerDef = col.columnDef.header;
    if (typeof headerDef === 'string') return headerDef;

    // This part is tricky as flexRender needs a component context. 
    // We will simplify it to read from id if it's not a simple string.
    const readableId = col.id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    return readableId.charAt(0).toUpperCase() + readableId.slice(1);
}


export function ExportButton({ columns, data, filename }: ExportButtonProps) {
    
    const handleExport = (format: 'excel' | 'csv' | 'txt') => {
        const headers = columns.map(column => getHeaderName(column));
        
        const rows = data.map(row => {
            const rowData: { [key: string]: any } = {};
            row.getVisibleCells().forEach(cell => {
                 const header = getHeaderName(cell.column);
                 rowData[header] = getCellString(cell);
            });
            return rowData;
        });


        if (rows.length === 0) {
            console.warn("No data to export.");
            return;
        }

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
        const blob = new Blob([`\uFEFF${content}`], { type: mimeType }); // Add BOM for Excel UTF-8 compatibility
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
                <Button variant="outline">
                    <Download className="mr-2 h-4 w-4" />
                    Exportar
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleExport('excel')}>
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    <span>Excel (.xlsx)</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('csv')}>
                    <FileType className="mr-2 h-4 w-4" />
                    <span>CSV (.csv)</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('txt')}>
                    <FileText className="mr-2 h-4 w-4" />
                    <span>Texto (.txt)</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
