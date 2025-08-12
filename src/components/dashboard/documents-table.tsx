'use client';

import { useState, useMemo } from 'react';
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
import { ArrowUpDown, MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DocumentDetailsDialog } from './document-details-dialog';

type SortConfig = {
  key: keyof Document | null;
  direction: 'ascending' | 'descending';
};

export function DocumentsTable({ documents }: { documents: Document[] }) {
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [isSummarizeOpen, setIsSummarizeOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [filters, setFilters] = useState<{ [key: string]: string }>({});
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'fecha_subida', direction: 'descending' });

  const handleSummarizeClick = (doc: Document) => {
    setSelectedDoc(doc);
    setIsSummarizeOpen(true);
  };
  
  const handleDetailsClick = (doc: Document) => {
    setSelectedDoc(doc);
    setIsDetailsOpen(true);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'EUR',
    }).format(amount);
  };

  const handleFilterChange = (column: string, value: string) => {
    setFilters(prev => ({ ...prev, [column]: value }));
  };

  const handleSort = (key: keyof Document) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };
  
  const filteredAndSortedDocuments = useMemo(() => {
    let filteredData = [...documents];

    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        filteredData = filteredData.filter(doc => {
            const docValue = (doc as any)[key];
            if (typeof docValue === 'string') {
                return docValue.toLowerCase().includes(value.toLowerCase());
            }
            if (typeof docValue === 'number') {
                return docValue.toString().toLowerCase().includes(value.toLowerCase());
            }
             if (key === 'fecha_subida') {
                const date = new Date(docValue).toLocaleDateString('es-ES', { timeZone: 'UTC' });
                return date.includes(value);
            }
            return false;
        });
      }
    });

    if (sortConfig.key) {
      filteredData.sort((a, b) => {
        const aValue = a[sortConfig.key!];
        const bValue = b[sortConfig.key!];

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
  }, [documents, filters, sortConfig]);

  const columns: { key: keyof Document, label: string, isCurrency?: boolean }[] = [
      { key: 'numero_factura', label: 'Nº Factura' },
      { key: 'fecha_subida', label: 'Fecha' },
      { key: 'proveedor', label: 'Proveedor' },
      { key: 'cif', label: 'CIF' },
      { key: 'tipo_documento', label: 'Tipo' },
      { key: 'contenido', label: 'Concepto' },
      { key: 'base_imponible', label: 'Base', isCurrency: true },
      { key: 'iva_details', label: 'IVA' },
      { key: 'total', label: 'Total', isCurrency: true },
  ]

  return (
    <>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map(col => (
                    <TableHead key={col.key}>
                      <div className="flex flex-col gap-2">
                        <Button
                          variant="ghost"
                          onClick={() => handleSort(col.key as keyof Document)}
                          className="px-0 hover:bg-transparent -ml-0.5"
                        >
                          {col.label}
                          <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                        <Input
                          placeholder={`Buscar ${col.label}...`}
                          value={filters[col.key] || ''}
                          onChange={e => handleFilterChange(col.key, e.target.value)}
                          className="h-8"
                        />
                      </div>
                    </TableHead>
                  ))}
                  <TableHead>
                     <div className="flex flex-col gap-2">
                        <span>Acciones</span>
                        <div className="h-8"></div>
                     </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedDocuments.map((doc) => (
                  <TableRow key={doc.id_documento} className="cursor-pointer">
                    <TableCell className="font-medium">{doc.numero_factura}</TableCell>
                    <TableCell>{new Date(doc.fecha_subida).toLocaleDateString('es-ES', { timeZone: 'UTC' })}</TableCell>
                    <TableCell>{doc.proveedor}</TableCell>
                    <TableCell>{doc.cif}</TableCell>
                    <TableCell>{doc.tipo_documento}</TableCell>
                    <TableCell className="max-w-xs truncate">{doc.contenido}</TableCell>
                    <TableCell className="text-right">{formatCurrency(doc.base_imponible)}</TableCell>
                    <TableCell className="text-right">
                        {doc.iva_details.map((iva, index) => (
                            <div key={index}>{`${iva.tipo_impuesto} ${iva.porcentaje}%: ${formatCurrency(iva.cuota)}`}</div>
                        ))}
                    </TableCell>
                    <TableCell className="text-right font-bold">{formatCurrency(doc.total)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleDetailsClick(doc)}>
                            Ver Detalles
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
          </div>
        </CardContent>
      </Card>
      <SummarizeDialog doc={selectedDoc} isOpen={isSummarizeOpen} setIsOpen={setIsSummarizeOpen} />
      <DocumentDetailsDialog doc={selectedDoc} isOpen={isDetailsOpen} setIsOpen={setIsDetailsOpen} />
    </>
  );
}
