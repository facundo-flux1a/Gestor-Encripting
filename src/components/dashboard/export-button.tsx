

'use client';

import * as XLSX from 'xlsx';
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Download, FileText, FileSpreadsheet, FileType } from "lucide-react";
import type { Table as TanstackTable, flexRender, Cell } from '@tanstack/react-table';

interface ExportButtonProps {
    table: TanstackTable<any>;
    filename: string;
}

const getCellString = (cell: Cell<any, unknown>) => {
    const value = cell.getValue();

    if (value instanceof Date) {
        return value.toLocaleDateString('es-ES');
    }
    if (typeof value === 'boolean') {
        return value ? 'Sí' : 'No';
    }
     if (typeof value === 'number') {
        const columnId = cell.column.id.toLowerCase();
        if (columnId.includes('total') || columnId.includes('base') || columnId.includes('iva') || columnId.includes('precio') || columnId.includes('importe')) {
             return new Intl.NumberFormat('es-ES', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
        }
        return value.toString();
    }
    if(value === null || value === undefined) {
        return '';
    }
    
    // For complex cells (like our EditableCell), we might need to look at the rendered content.
    // This is a simple fallback. A more robust solution might need a custom `meta` prop on columns.
    const rendered = flexRender(cell.column.columnDef.cell, cell.getContext());
    if (typeof rendered === 'string' || typeof rendered === 'number') {
        return String(rendered);
    }
    
    return String(value ?? '');
}

const getHeaderName = (table: TanstackTable<any>, columnId: string): string => {
     const col = table.getColumn(columnId);
    if (!col) return columnId;

    const headerDef = col.columnDef.header;
    if (typeof headerDef === 'string') return headerDef;

    if (headerDef) {
       const context = {
         table,
         header: { column: col } as any,
       };
       const renderedHeader = flexRender(headerDef, context);
       if (typeof renderedHeader === 'string') return renderedHeader;
        if (React.isValidElement(renderedHeader) && typeof renderedHeader.props.children === 'string') {
          return renderedHeader.props.children;
       }
    }
    return columnId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}


export function ExportButton({ table, filename }: ExportButtonProps) {
    
    const handleExport = (format: 'excel' | 'csv' | 'txt') => {
        const headers = table.getVisibleFlatColumns().map(column => getHeaderName(table, column.id));
        const rows = table.getRowModel().rows.map(row => {
            const rowData: { [key: string]: any } = {};
            row.getVisibleCells().forEach(cell => {
                 const header = getHeaderName(table, cell.column.id);
                 rowData[header] = getCellString(cell);
            });
            return rowData;
        });


        if (rows.length === 0) {
            console.warn("No data to export.");
            return;
        }

        switch (format) {
            case 'excel':
                const worksheet = XLSX.utils.json_to_sheet(rows);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, 'Datos');
                XLSX.writeFile(workbook, `${filename}.xlsx`);
                break;
            case 'csv': {
                const csvContent = [
                    headers.join(','),
                    ...rows.map(row => headers.map(header => JSON.stringify(row[header] ?? '')).join(','))
                ].join('\n');
                downloadFile(csvContent, `${filename}.csv`, 'text/csv;charset=utf-8;');
                break;
            }
            case 'txt': {
                 const txtContent = rows.map(row => 
                    headers.map(header => `${header}: ${row[header] ?? ''}`).join('\n')
                 ).join('\n\n' + '-'.repeat(40) + '\n\n');
                downloadFile(txtContent, `${filename}.txt`, 'text/plain;charset=utf-8;');
                break;
            }
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
                <Button>
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

