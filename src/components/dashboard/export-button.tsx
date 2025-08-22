
'use client';

import * as XLSX from 'xlsx';
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Download, FileText, FileSpreadsheet, FileType } from "lucide-react";
import type { Table as TanstackTable, flexRender } from '@tanstack/react-table';

interface ExportButtonProps {
    table: TanstackTable<any>;
    filename: string;
}

const getCellString = (cell: any) => {
    const value = cell.getValue();
    if (value instanceof Date) {
        return value.toLocaleDateString('es-ES');
    }
    if (typeof value === 'boolean') {
        return value ? 'Sí' : 'No';
    }
    if (typeof value === 'number') {
        // Attempt to format as currency if it looks like one
        if (cell.column.id.toLowerCase().includes('total') || cell.column.id.toLowerCase().includes('base') || cell.column.id.toLowerCase().includes('iva')) {
             return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
        }
        return value.toString();
    }
    return String(value ?? '');
}


export function ExportButton({ table, filename }: ExportButtonProps) {
    
    const handleExport = (format: 'excel' | 'csv' | 'txt') => {
        const headers = table.getVisibleFlatColumns()
            .map(column => {
                const headerDef = column.columnDef.header;
                if (typeof headerDef === 'string') return headerDef;
                // Simplified text extraction for non-string headers
                return column.id;
            });
            
        const rows = table.getRowModel().rows.map(row => {
            const rowData: { [key: string]: any } = {};
            row.getVisibleCells().forEach(cell => {
                const header = headers[cell.column.getIndex()];
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
