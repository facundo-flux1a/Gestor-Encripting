'use client';

import * as React from 'react';
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Download, FileText, FileSpreadsheet, FileType } from "lucide-react";
import { type Column, type Row } from '@tanstack/react-table';
import { generateAdvancedExport } from '@/lib/export-utils';

interface ExportButtonProps {
    columns: Column<any, unknown>[];
    data: Row<any>[];
    filename: string;
}

const getHeaderName = (col: Column<any, unknown>): string => {
    const headerDef = col.columnDef.header;
    if (typeof headerDef === 'string') return headerDef;

    const readableId = col.id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    return readableId.charAt(0).toUpperCase() + readableId.slice(1);
};

export function ExportButton({ columns, data, filename }: ExportButtonProps) {

    const handleExport = (format: 'excel' | 'csv' | 'txt') => {
        const exportableColumns = columns.filter(col => col.id !== 'select' && col.id !== 'actions');

        // Prepare columns for util
        const utilColumns = exportableColumns.map(col => ({
            id: col.id,
            header: getHeaderName(col)
        }));

        generateAdvancedExport(data, utilColumns, {
            filename,
            format,
            includeSummary: true // Enable by default
        });
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