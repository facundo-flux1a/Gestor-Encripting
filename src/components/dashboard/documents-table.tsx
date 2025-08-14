
'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { type Document } from '@/lib/types';
import { SummarizeDialog } from './summarize-dialog';
import { Card, CardContent } from "@/components/ui/card";
import { 
    ArrowUpDown, 
    MoreHorizontal, 
    CheckCircle2, 
    AlertCircle,
    Search, 
    X
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type SortConfig = {
  key: keyof Document | 'estado' | 'concepto' | null;
  direction: 'ascending' | 'descending';
};

const formatCurrency = (amount: number | null) => {
    if (amount === null || amount === undefined) return 'N/A';
  return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
  }).format(amount);
};

export function DocumentsTable({ documents }: { documents: Document[] }) {
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [isSummarizeOpen, setIsSummarizeOpen] = useState(false);
  
  const [globalFilter, setGlobalFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'fecha_emision', direction: 'descending' });

  const handleSummarizeClick = (doc: Document) => {
    setSelectedDoc(doc);
    setIsSummarizeOpen(true);
  };

  const handleSort = (key: keyof Document | 'estado' | 'concepto') => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };
  
  const clearFilters = () => {
    setGlobalFilter('');
    setStatusFilter(null);
  };

  const filteredAndSortedDocuments = useMemo(() => {
    let filteredData = [...documents];

    // Global text filter
    if (globalFilter) {
        const lowercasedFilter = globalFilter.toLowerCase();
        filteredData = filteredData.filter(doc => {
            return (
                doc.numero_factura?.toLowerCase().includes(lowercasedFilter) ||
                doc.proveedor?.toLowerCase().includes(lowercasedFilter) ||
                doc.cif?.toLowerCase().includes(lowercasedFilter) ||
                doc.observaciones?.toLowerCase().includes(lowercasedFilter)
            );
        });
    }

    // Status filter
    if (statusFilter) {
        filteredData = filteredData.filter(doc => {
            const estado = doc.verificado ? 'verificado' : 'pendiente';
            return estado === statusFilter;
        });
    }

    // Sorting
    if (sortConfig.key) {
      filteredData.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        if (sortConfig.key === 'estado') {
            aValue = a.verificado;
            bValue = b.verificado;
        } else if (sortConfig.key === 'concepto') {
            aValue = a.observaciones;
            bValue = b.observaciones;
        } else {
            aValue = a[sortConfig.key as keyof Document];
            bValue = b[sortConfig.key as keyof Document];
        }

        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;
        
        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }

    return filteredData;
  }, [documents, globalFilter, statusFilter, sortConfig]);

  const columns: { key: keyof Document | 'estado' | 'concepto', label: string, isNumeric?: boolean }[] = [
      { key: 'numero_factura', label: 'Nº Factura' },
      { key: 'fecha_emision', label: 'Fecha' },
      { key: 'proveedor', label: 'Proveedor/Cliente' },
      { key: 'concepto', label: 'Concepto' },
      { key: 'base_imponible', label: 'Base', isNumeric: true },
      { key: 'total', label: 'Total', isNumeric: true },
      { key: 'estado', label: 'Estado' }
  ]

  const isFiltered = globalFilter || statusFilter;

  return (
    <>
    <TooltipProvider delayDuration={200}>
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
                <div className="relative w-full max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por factura, proveedor, CIF, concepto..."
                        value={globalFilter}
                        onChange={(e) => setGlobalFilter(e.target.value)}
                        className="h-11 pl-10"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="h-11">
                                Estado: {statusFilter ? (statusFilter === 'verificado' ? 'Verificado' : 'Pendiente') : 'Todos'}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Filtrar por estado</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuCheckboxItem
                                checked={!statusFilter}
                                onCheckedChange={() => setStatusFilter(null)}
                            >
                                Todos
                            </DropdownMenuCheckboxItem>
                            <DropdownMenuCheckboxItem
                                checked={statusFilter === 'verificado'}
                                onCheckedChange={() => setStatusFilter('verificado')}
                            >
                                Verificado
                            </DropdownMenuCheckboxItem>
                             <DropdownMenuCheckboxItem
                                checked={statusFilter === 'pendiente'}
                                onCheckedChange={() => setStatusFilter('pendiente')}
                            >
                                Pendiente
                            </DropdownMenuCheckboxItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    {isFiltered && (
                        <Button variant="ghost" onClick={clearFilters} className="h-11">
                            <X className="mr-2 h-4 w-4" />
                            Limpiar
                        </Button>
                    )}
                </div>
            </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {columns.map(col => (
                        <TableHead key={col.key} className={col.isNumeric ? 'text-right' : ''}>
                           <Button
                              variant="ghost"
                              onClick={() => handleSort(col.key)}
                              className="px-2 hover:bg-transparent -ml-2"
                            >
                              {col.label}
                              <ArrowUpDown className="ml-2 h-4 w-4" />
                            </Button>
                        </TableHead>
                      ))}
                      <TableHead>
                         <span className="sr-only">Acciones</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAndSortedDocuments.map((doc) => (
                      <TableRow key={doc.id_documento}>
                        <TableCell className="font-medium">{doc.numero_factura}</TableCell>
                        <TableCell>{new Date(doc.fecha_emision).toLocaleDateString('es-ES', { timeZone: 'UTC' })}</TableCell>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="truncate max-w-[200px] block">{doc.proveedor}</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{doc.proveedor}</p>
                              <p className="text-muted-foreground">{doc.cif}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                           <Tooltip>
                                <TooltipTrigger asChild>
                                <span className="truncate max-w-[250px] block text-muted-foreground">{doc.observaciones || 'N/A'}</span>
                                </TooltipTrigger>
                                <TooltipContent>
                                <p className="max-w-xs">{doc.observaciones}</p>
                                </TooltipContent>
                            </Tooltip>
                        </TableCell>
                        <TableCell className="text-right">
                            {formatCurrency(doc.base_imponible)}
                        </TableCell>
                        <TableCell className="text-right font-bold">{formatCurrency(doc.total)}</TableCell>
                        <TableCell>
                             {doc.verificado ? (
                                 <Badge variant="secondary" className="flex items-center gap-2 bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">
                                     <CheckCircle2 className="h-4 w-4" /> Verificado
                                 </Badge>
                             ) : (
                                 <Badge variant="destructive" className="flex items-center gap-2">
                                     <AlertCircle className="h-4 w-4" /> Pendiente
                                 </Badge>
                             )}
                        </TableCell>
                        <TableCell className="px-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={`/documento/${doc.id_documento}`}>
                                    Ver más detalles
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleSummarizeClick(doc)}>
                                Resumir con IA
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                 {filteredAndSortedDocuments.length === 0 && (
                    <div className="text-center p-8 text-muted-foreground">
                        No se encontraron documentos con los filtros actuales.
                    </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </TooltipProvider>
      <SummarizeDialog doc={selectedDoc} isOpen={isSummarizeOpen} setIsOpen={setIsSummarizeOpen} />
    </>
  );
}
