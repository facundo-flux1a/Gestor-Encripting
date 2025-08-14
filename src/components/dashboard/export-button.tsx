
'use client';

import * as XLSX from 'xlsx';
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Download, FileText, FileSpreadsheet, FileType } from "lucide-react";

interface ExportButtonProps {
    data: any[];
    filename: string;
}

const flattenObject = (obj: any, parentKey = '', res: { [key: string]: any } = {}): { [key: string]: any } => {
    for (let key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const propName = parentKey ? `${parentKey}_${key}` : key;
            if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                flattenObject(obj[key], propName, res);
            } else if (Array.isArray(obj[key])) {
                res[propName] = JSON.stringify(obj[key]);
            } else {
                res[propName] = obj[key];
            }
        }
    }
    return res;
};

const convertToCsv = (data: any[]): string => {
    if (data.length === 0) return '';
    const flattenedData = data.map(row => flattenObject(row));
    const headers = Object.keys(flattenedData[0]);
    const csvRows = [
        headers.join(','),
        ...flattenedData.map(row => headers.map(header => JSON.stringify(row[header])).join(','))
    ];
    return csvRows.join('\n');
};

const convertToTxt = (data: any[]): string => {
    return data.map(item => JSON.stringify(flattenObject(item), null, 2)).join('\n\n' + '-'.repeat(80) + '\n\n');
};

const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

export function ExportButton({ data, filename }: ExportButtonProps) {
    
    const handleExport = (format: 'excel' | 'csv' | 'txt') => {
        if (!data || data.length === 0) {
            console.warn("No data to export.");
            // Optionally, show a toast notification to the user.
            return;
        }

        const flattenedData = data.map(row => flattenObject(row));

        switch (format) {
            case 'excel':
                const worksheet = XLSX.utils.json_to_sheet(flattenedData);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, 'Datos');
                XLSX.writeFile(workbook, `${filename}.xlsx`);
                break;
            case 'csv':
                const csvContent = convertToCsv(data);
                downloadFile(csvContent, `${filename}.csv`, 'text/csv;charset=utf-8;');
                break;
            case 'txt':
                const txtContent = convertToTxt(data);
                downloadFile(txtContent, `${filename}.txt`, 'text/plain;charset=utf-8;');
                break;
        }
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
