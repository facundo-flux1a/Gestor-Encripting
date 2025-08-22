

'use client';

import * as React from 'react';
import * as XLSX from 'xlsx';
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Download, FileText, FileSpreadsheet, FileType } from "lucide-react";
import { flexRender, type Table as TanstackTable, type Cell, type Column, type Row } from '@tanstack/react-table';


interface ExportButtonProps {
    table: TanstackTable<any>;
    filename: string;
}

const formatCurrency = (amount: number, minimumFractionDigits = 2) => {
    if(isNaN(amount)) return '0,00';
    return new Intl.NumberFormat('es-ES', { style: 'decimal', minimumFractionDigits, maximumFractionDigits: 2 }).format(amount);
}

const getCellString = (cell: Cell<any, unknown>): string => {
    const value = cell.getValue();
    const columnId = cell.column.id;

    // Handle dynamic VAT columns specifically
    if (columnId.startsWith('base_') || columnId.startsWith('iva_')) {
        const rateMatch = columnId.match(/\d+(\.\d+)?/);
        if (rateMatch) {
            const rate = parseFloat(rateMatch[0]);
            const ivaDetail = cell.row.original.iva_details?.find((i: any) => i.porcentaje === rate);
            if (columnId.startsWith('base_')) {
                return formatCurrency(ivaDetail?.base_imponible ?? 0);
            }
            if (columnId.startsWith('iva_')) {
                return formatCurrency(ivaDetail?.cuota ?? 0);
            }
        }
    }
    
    // Original logic for other cells
    if (value instanceof Date) {
        return value.toLocaleDateString('es-ES');
    }
    if (typeof value === 'boolean') {
        return value ? 'Sí' : 'No';
    }
    if (typeof value === 'number') {
        const isCurrency = columnId.toLowerCase().includes('total') || 
                           columnId.toLowerCase().includes('precio') || 
                           columnId.toLowerCase().includes('importe') ||
                           columnId.toLowerCase().includes('iva') ||
                           columnId.toLowerCase().includes('base_imponible');
        return isCurrency ? formatCurrency(value) : value.toString();
    }
    if (value === null || value === undefined) {
        return '';
    }

    // Fallback for complex components by accessing initialValue if possible
    const rendered = flexRender(cell.column.columnDef.cell, cell.getContext());
    if (React.isValidElement(rendered) && rendered.props.initialValue !== undefined) {
        const initialValue = rendered.props.initialValue;
        if(typeof initialValue === 'number' && rendered.props.isCurrency) {
            return formatCurrency(initialValue);
        }
        if (initialValue instanceof Date) {
            return initialValue.toLocaleDateString('es-ES');
        }
        return String(initialValue);
    }
    
    // Fallback for simple values
    const simpleValue = cell.row.original[columnId];
    if (simpleValue !== undefined && simpleValue !== null) {
        return String(simpleValue);
    }
    
    return String(value ?? '');
}


const getHeaderName = (col: Column<any, unknown>, table: TanstackTable<any>): string => {
    const headerDef = col.columnDef.header;
    if (typeof headerDef === 'string') return headerDef;

    if (headerDef) {
       const context = {
         table: table,
         header: { column: col } as any,
       };
       const renderedHeader = flexRender(headerDef, context);
       if (typeof renderedHeader === 'string') return renderedHeader;
        if (React.isValidElement(renderedHeader)) {
            // This is a common pattern for simple headers with an icon and text
            const children = React.Children.toArray(renderedHeader.props.children);
            const textChild = children.find(child => typeof child === 'string' || (typeof child === 'object' && child?.type === 'span'));
            if(textChild && typeof textChild === 'object' && textChild.props.children) {
                 return textChild.props.children;
            }
             if(typeof textChild === 'string') {
                return textChild;
            }
        }
    }
    return col.id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}


export function ExportButton({ table, filename }: ExportButtonProps) {
    
    const handleExport = (format: 'excel' | 'csv' | 'txt') => {
        const visibleColumns = table.getVisibleFlatColumns();
        const headers = visibleColumns.map(column => getHeaderName(column, table));
        
        const rows = table.getRowModel().rows.map(row => {
            const rowData: { [key: string]: any } = {};
            row.getVisibleCells().forEach(cell => {
                 const header = getHeaderName(cell.column, table);
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
