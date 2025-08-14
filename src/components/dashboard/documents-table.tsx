
'use client';

import { useState, useMemo, KeyboardEvent } from 'react';
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
import { type Document } from '@/lib/types';
import { SummarizeDialog } from './summarize-dialog';
import { Card, CardContent } from "@/components/ui/card";
import { 
    ArrowUpDown, 
    MoreHorizontal, 
    CheckCircle2, 
    AlertCircle,
    Search, 
    X,
    CalendarIcon
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { IvaBadge } from './iva-badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { type DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { usePathname } from 'next/navigation';

type SortConfig = {
  key: keyof Document | 'estado' | 'concepto' | 'impuestos' | 'incidencia_razon' | null;
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
  
  const [filters, setFilters] = useState<string[]>([]);
  const [currentSearch, setCurrentSearch] = useState('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'fecha_emision', direction: 'descending' });

  const pathname = usePathname();
  const isIncidentsPage = pathname === '/incidents';

  const handleSummarizeClick = (doc: Document) => {
    setSelectedDoc(doc);
    setIsSummarizeOpen(true);
  };

  const handleSort = (key: SortConfig['key']) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };
  
  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && currentSearch.trim() !== '') {
      setFilters([...filters, currentSearch.trim()]);
      setCurrentSearch('');
    }
  };

  const removeFilter = (filterToRemove: string) => {
    setFilters(filters.filter(f => f !== filterToRemove));
  };
  
  const clearFilters = () => {
    setFilters([]);
    setCurrentSearch('');
    setDateRange(undefined);
  };

  const filteredAndSortedDocuments = useMemo(() => {
    let filteredData = [...documents];

    // Global text filters
    if (filters.length > 0) {
        filteredData = filteredData.filter(doc => {
            return filters.every(filter => {
                const lowercasedFilter = filter.toLowerCase();
                return (
                    doc.numero_factura?.toLowerCase().includes(lowercasedFilter) ||
                    doc.proveedor?.toLowerCase().includes(lowercasedFilter) ||
                    doc.cif?.toLowerCase().includes(lowercasedFilter) ||
                    doc.observaciones?.toLowerCase().includes(lowercasedFilter)
                );
            });
        });
    }
    
    // Date range filter
    if (dateRange?.from) {
        filteredData = filteredData.filter(doc => {
            const docDate = new Date(doc.fecha_emision);
            if (dateRange.to) {
                return docDate >= dateRange.from! && docDate <= dateRange.to;
            }
            return docDate >= dateRange.from!;
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
        } else if (sortConfig.key === 'impuestos') {
             aValue = a.iva;
             bValue = b.iva;
        } else if (sortConfig.key === 'incidencia_razon') {
            aValue = a.incidencia_razon;
            bValue = b.incidencia_razon;
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
  }, [documents, filters, sortConfig, dateRange]);

  const columns: { key: SortConfig['key'], label: string, isNumeric?: boolean, incidentOnly?: boolean }[] = [
      { key: 'numero_factura', label: 'Nº Factura' },
      { key: 'fecha_emision', label: 'Fecha' },
      { key: 'proveedor', label: 'Proveedor/Cliente' },
      { key: 'concepto', label: 'Concepto' },
      { key: 'incidencia_razon', label: 'Razón Incidencia', incidentOnly: true },
      { key: 'base_imponible', label: 'Base', isNumeric: true },
      { key: 'impuestos', label: 'Impuestos', isNumeric: true },
      { key: 'total', label: 'Total', isNumeric: true },
      { key: 'estado', label: 'Estado' }
  ];

  const visibleColumns = columns.filter(col => !col.incidentOnly || isIncidentsPage);

  const isFiltered = filters.length > 0 || dateRange;

  return (
    <>
    <TooltipProvider delayDuration={200}>
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                 <div className="relative w-full md:w-auto md:flex-grow md:max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                        placeholder="Buscar y presionar Enter..."
                        value={currentSearch}
                        onChange={(e) => setCurrentSearch(e.target.value)}
                        onKeyDown={handleSearchKeyDown}
                        className="h-11 pl-10"
                    />
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto">
                    <Popover>
                        <PopoverTrigger asChild>
                        <Button
                            id="date"
                            variant={"outline"}
                            className="w-full md:w-auto justify-start text-left font-normal h-11"
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dateRange?.from ? (
                            dateRange.to ? (
                                <>
                                {format(dateRange.from, "LLL dd, y")} -{" "}
                                {format(dateRange.to, "LLL dd, y")}
                                </>
                            ) : (
                                format(dateRange.from, "LLL dd, y")
                            )
                            ) : (
                            <span>Seleccionar fecha</span>
                            )}
                        </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                        <Calendar
                            initialFocus
                            mode="range"
                            defaultMonth={dateRange?.from}
                            selected={dateRange}
                            onSelect={setDateRange}
                            numberOfMonths={2}
                        />
                        </PopoverContent>
                    </Popover>
                    {isFiltered && (
                        <Button variant="ghost" onClick={clearFilters} className="h-11">
                            <X className="mr-2 h-4 w-4" />
                            Limpiar
                        </Button>
                    )}
                </div>
            </div>

            {filters.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">Filtros aplicados:</span>
                    {filters.map((filter) => (
                        <Badge key={filter} variant="secondary" className="pl-2">
                            {filter}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="ml-1 h-5 w-5 p-0"
                                onClick={() => removeFilter(filter)}
                            >
                                <X className="h-3 w-3" />
                                <span className="sr-only">Remover filtro</span>
                            </Button>
                        </Badge>
                    ))}
                </div>
            )}

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {visibleColumns.map(col => (
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
                        {isIncidentsPage && (
                             <TableCell>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                    <span className="truncate max-w-[250px] block text-destructive/80">{doc.incidencia_razon || 'N/A'}</span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                    <p className="max-w-xs">{doc.incidencia_razon}</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TableCell>
                        )}
                        <TableCell className="text-right">
                           {formatCurrency(doc.base_imponible)}
                        </TableCell>
                         <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                                {doc.iva_details.map((iva, index) => (
                                    <IvaBadge key={index} iva={iva} />
                                ))}
                            </div>
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
    