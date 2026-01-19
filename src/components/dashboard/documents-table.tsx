'use client';

import Link from 'next/link';
import { MoreHorizontal, Trash2, CheckCircle, Eye } from 'lucide-react';
import type { ColumnDef, Row, Table as TanstackTable } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { type Document } from '@/lib/types';
import { SummarizeDialog } from './summarize-dialog';
import { DocumentPreviewDialog } from './document-preview-dialog';
import { CleanDuplicatesButton } from './clean-duplicates-button';
import { ClienteFilter, ProveedorFilter } from './column-filters';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { DataTable } from '@/components/ui/data-table';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { Checkbox } from '../ui/checkbox';
import { EditableCell } from './editable-cell';
import { useToast } from '@/hooks/use-toast';
import { useCompanyContext } from '@/context/CompanyProvider';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRouter } from 'next/navigation';
import { confirmDocument } from '@/services/document-client-service';
import { useDuplicateDetection } from '@/hooks/use-duplicate-detection';
import { deleteDocument } from '@/services/document-service';

// 🎯 FUNCIONES DE FORMATO MANUAL
const formatNumber = (num: number | string): string => {
  const value = typeof num === 'string' ? parseFloat(num) : num;
  if (isNaN(value)) return '0';
  
  const parts = value.toString().split('.');
  const integerPart = parts[0];
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  
  return formattedInteger;
};

const formatCurrency = (amount: number | string): string => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0,00 €';
  
  const fixed = num.toFixed(2);
  const parts = fixed.split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1];
  
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  
  return `${formattedInteger},${decimalPart} €`;
};

const getColumns = (
    onUpdate: (docId: number, field: string, value: any, table: TanstackTable<Document>, rowIndex: number) => void,
    onSummarize: (doc: Document) => void,
    onDelete: (doc: Document) => void,
    onConfirm: (doc: Document) => void,
    onPreview: (doc: Document) => void,
    showConfirmButton: boolean = false,
    duplicates: Set<number> = new Set()
): ColumnDef<Document>[] => {
  const columns: ColumnDef<Document>[] = [
    // 🎯 COLUMNA DE ACCIONES
    {
      id: 'actions',
      header: 'Acciones',
      cell: ({ row }) => {
        const doc = row.original;
        const hasFile = doc.archivos && doc.archivos.length > 0 && doc.archivos[0]?.ruta_archivo;
        
        return (
          <div className="flex items-center gap-2 relative z-10">
            {showConfirmButton && (
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-950 relative z-20 transition-all duration-300 hover:scale-110 hover:shadow-lg hover:shadow-green-500/20"
                    onClick={(e) => {
                      e.stopPropagation();
                      onConfirm(doc);
                    }}
                  >
                    <span className="sr-only">Confirmar</span>
                    <CheckCircle className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent 
                  side="bottom" 
                  sideOffset={5} 
                  className="z-[99999]"
                  avoidCollisions={true}
                  collisionPadding={10}
                >
                  <p>Confirmar documento</p>
                </TooltipContent>
              </Tooltip>
            )}
            
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-950 relative z-20 transition-all duration-300 hover:scale-110 hover:shadow-lg hover:shadow-blue-500/20 disabled:hover:scale-100 disabled:hover:shadow-none"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPreview(doc);
                  }}
                  disabled={!hasFile}
                >
                  <span className="sr-only">Ver documento</span>
                  <Eye className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
                </Button>
              </TooltipTrigger>
              <TooltipContent 
                side="bottom" 
                sideOffset={5} 
                className="z-[99999]"
                avoidCollisions={true}
                collisionPadding={10}
              >
                <p>{hasFile ? 'Ver documento' : 'Sin archivo adjunto'}</p>
              </TooltipContent>
            </Tooltip>
            
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 relative z-20 transition-all duration-300 hover:scale-110 hover:shadow-lg hover:shadow-destructive/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(doc);
                  }}
                >
                  <span className="sr-only">Eliminar</span>
                  <Trash2 className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
                </Button>
              </TooltipTrigger>
              <TooltipContent 
                side="bottom" 
                sideOffset={5} 
                className="z-[99999]"
                avoidCollisions={true}
                collisionPadding={10}
              >
                <p>Eliminar documento</p>
              </TooltipContent>
            </Tooltip>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="h-8 w-8 p-0 relative z-20 transition-all duration-300 hover:scale-110 hover:bg-accent"
                >
                  <span className="sr-only">Ver más</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[99999]">
                <DropdownMenuItem 
                  onClick={() => onSummarize(doc)}
                  className="cursor-pointer transition-colors duration-200"
                >
                  Resumir con IA
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
      footer: () => null,
      enableHiding: false,
    },

    // 🎯 COLUMNA SELECT + ID
    {
      id: 'select',
      header: ({ table }) => {
        const checkboxContent = (
          <>
            <Checkbox
              checked={table.getIsAllPageRowsSelected()}
              onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
              aria-label="Select all"
              className="transition-all duration-300 hover:scale-110"
            />
            <span className="font-medium">ID</span>
          </>
        );
        return <div className="flex items-center gap-2">{checkboxContent}</div>;
      },
      cell: ({ row }) => {
        const doc = row.original;
        const cellContent = (
          <>
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              aria-label="Select row"
              onClick={(e) => e.stopPropagation()}
              className="transition-all duration-300 hover:scale-110"
            />
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{doc.id_documento}</span>
              {doc.is_new === 1 && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/50 animate-pulse">
                  ✨ Nuevo
                </span>
              )}
            </div>
          </>
        );
        return <div className="flex items-center gap-2">{cellContent}</div>;
      },
      enableHiding: false,
      footer: () => <span className="font-bold text-sm">Totales</span>,
    },

    // 🎯 COLUMNA CLIENTE CON FILTRO
    {
      id: 'empresa_factura',
      accessorFn: (row) => {
        const cliente = row.entidades?.find(e => e.rol === 'cliente' || e.rol === 'receptor');
        return cliente?.nombre || 'Sin cliente';
      },
      header: ({ column }) => (
        <div className="flex items-center gap-2">
          <span>Cliente</span>
          <ClienteFilter column={column} />
        </div>
      ),
      cell: ({ row }) => {
        const cliente = row.original.entidades?.find(e => e.rol === 'cliente' || e.rol === 'receptor');
        const nombre = cliente?.nombre || 'Sin cliente';
        return (
          <div className="font-medium text-sm transition-colors duration-300 hover:text-primary">
            {nombre}
          </div>
        );
      },
      filterFn: (row, id, value) => {
        if (!value || value.length === 0) return true;
        const cliente = row.original.entidades?.find(e => e.rol === 'cliente' || e.rol === 'receptor');
        const nombre = cliente?.nombre || 'Sin cliente';
        return value.includes(nombre);
      },
      footer: () => null,
    },// 🎯 COLUMNA EMPRESA SISTEMA
    {
      id: 'empresa_sistema',
      header: 'Empresa (Sistema)',
      cell: ({ row }) => {
        const nombre = row.original.empresa_nombre || 'Sin empresa';
        return (
          <div className="text-sm text-muted-foreground transition-colors duration-300 hover:text-foreground">
            {nombre}
          </div>
        );
      },
      footer: () => null,
    },

    // 🎯 COLUMNA NÚMERO DE FACTURA
    {
      accessorKey: 'numero_documento',
      header: 'Nº Factura',
      cell: ({ row, table }) => {
        const isDuplicate = duplicates.has(row.original.id_documento);
        
        return (
          <EditableCell 
            docId={row.original.id_documento} 
            initialValue={row.getValue('numero_documento')} 
            fieldName="numero_documento" 
            onUpdate={onUpdate} 
            table={table} 
            rowIndex={row.index}
            trimestre_cerrado={row.original.trimestre_cerrado}
            isDuplicate={isDuplicate}
          />
        );
      }
    },

    // 🎯 COLUMNA FECHA CONTABLE
    {
      accessorKey: 'fecha_emision',
      header: 'Fecha Contable',
      cell: ({ row, table }) => {
        return (
          <EditableCell 
            docId={row.original.id_documento} 
            initialValue={row.getValue('fecha_emision')} 
            fieldName="fecha_emision" 
            onUpdate={onUpdate} 
            inputType="date"
            table={table} 
            rowIndex={row.index}
            trimestre_cerrado={row.original.trimestre_cerrado}
          />
        );
      }
    },

    // 🎯 COLUMNA FECHA DE CARGA
    {
      accessorKey: 'fecha_creacion',
      header: 'Fecha de Carga',
      cell: ({ row }) => {
        const fecha = row.getValue('fecha_creacion');
        if (!fecha) {
          return <span className="text-muted-foreground">-</span>;
        }
        
        const date = new Date(fecha as string);
        const fechaStr = date.toLocaleDateString('es-ES', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
        const horaStr = date.toLocaleTimeString('es-ES', {
          hour: '2-digit',
          minute: '2-digit'
        });
        
        return (
          <div className="text-sm whitespace-nowrap transition-colors duration-300 hover:text-primary">
            <div className="font-medium">{fechaStr}</div>
            <div className="text-xs text-muted-foreground">{horaStr}</div>
          </div>
        );
      },
      footer: () => null,
    },

    // 🎯 COLUMNA TRIMESTRE
    {
      id: 'trimestre',
      header: 'Trimestre',
      cell: ({ row }) => {
        const anio = row.original.año_trimestre;
        const trimestre = row.original.num_trimestre;
        
        if (!anio || !trimestre) {
          return <span className="text-muted-foreground text-xs">Sin trimestre</span>;
        }
        
        const colorClasses = {
          1: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-200 dark:hover:bg-green-800',
          2: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-800',
          3: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 hover:bg-orange-200 dark:hover:bg-orange-800',
          4: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 hover:bg-purple-200 dark:hover:bg-purple-800',
        };
        
        const colorClass = colorClasses[trimestre as keyof typeof colorClasses] || 'bg-gray-100 text-gray-800';
        
        return (
          <div className="text-sm">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-300 hover:scale-105 hover:shadow-md ${colorClass}`}>
              Q{trimestre} {anio}
            </span>
          </div>
        );
      },
      footer: () => null,
    },

    // 🎯 COLUMNA PROVEEDOR CON FILTRO
    {
      id: 'proveedor',
      accessorFn: (row) => row.proveedor,
      header: ({ column }) => (
        <div className="flex items-center gap-2">
          <span>Proveedor</span>
          <ProveedorFilter column={column} />
        </div>
      ),
      cell: ({ row, table }) => {
        return (
          <EditableCell 
            docId={row.original.id_documento} 
            initialValue={row.getValue('proveedor')} 
            fieldName="proveedor" 
            onUpdate={onUpdate} 
            table={table} 
            rowIndex={row.index}
            trimestre_cerrado={row.original.trimestre_cerrado}
          />
        );
      },
      filterFn: (row, id, value) => {
        if (!value || value.length === 0) return true;
        return value.includes(row.original.proveedor);
      },
    },

    // 🎯 COLUMNA CIF
    {
      accessorKey: 'cif',
      header: 'CIF',
      cell: ({ row, table }) => {
        return (
          <EditableCell 
            docId={row.original.id_documento} 
            initialValue={row.getValue('cif')} 
            fieldName="cif" 
            onUpdate={onUpdate} 
            table={table} 
            rowIndex={row.index}
            trimestre_cerrado={row.original.trimestre_cerrado}
          />
        );
      }
    },

    // 🎯 COLUMNA CONCEPTO
    {
      accessorKey: 'observaciones',
      header: 'Concepto',
      cell: ({ row, table }) => {
        return (
          <EditableCell 
            docId={row.original.id_documento} 
            initialValue={row.getValue('observaciones')} 
            fieldName="observaciones" 
            onUpdate={onUpdate} 
            table={table} 
            rowIndex={row.index}
            trimestre_cerrado={row.original.trimestre_cerrado}
          />
        );
      }
    },

    // 🎯 COLUMNA INCIDENCIA
    {
      id: 'incidencia_motivo',
      header: 'Motivo Incidencia',
      cell: ({ row }) => {
        const doc = row.original;
        
        if (!doc.incidencia || !doc.incidencia_razon) {
          return (
            <div className="flex items-center gap-2 text-muted-foreground transition-all duration-300 hover:text-green-600">
              <span className="inline-flex h-2 w-2 rounded-full bg-green-500 shrink-0 transition-transform duration-300 hover:scale-125"></span>
              <span className="text-xs">Sin incidencias</span>
            </div>
          );
        }
        
        return (
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 max-w-[300px] cursor-help transition-all duration-300 hover:scale-105">
                <span className="inline-flex h-2 w-2 rounded-full bg-red-500 animate-pulse shrink-0"></span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate text-red-600 dark:text-red-400">
                    {doc.incidencia_razon}
                  </div>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent 
              side="bottom" 
              className="max-w-[400px] z-[99999]"
              avoidCollisions={true}
              collisionPadding={10}
            >
              <div className="space-y-1">
                <p className="font-semibold text-sm">Motivo de Incidencia:</p>
                <p className="text-sm whitespace-pre-wrap">{doc.incidencia_razon}</p>
              </div>
            </TooltipContent>
          </Tooltip>
        );
      },
      footer: () => null,
      size: 250,
      minSize: 200,
    },

    // 🎯 COLUMNA TIPO DOCUMENTO
    {
      accessorKey: 'tipo_documento',
      header: 'Tipo Documento',
      cell: ({ row, table }) => {
        return (
          <EditableCell 
            docId={row.original.id_documento} 
            initialValue={row.getValue('tipo_documento')} 
            fieldName="tipo_documento" 
            onUpdate={onUpdate} 
            table={table} 
            rowIndex={row.index}
            trimestre_cerrado={row.original.trimestre_cerrado}
          />
        );
      }
    },
    // 🎯 COLUMNAS DE IVA - Base e IVA para cada porcentaje (21%, 10%, 4%, 0%)
    ...[21, 10, 4, 0].flatMap(rate => ([
      {
        id: `base_${rate}`,
        header: `Base ${rate}%`,
        cell: ({ row }: { row: Row<Document> }) => {
          const ivaDetail = row.original.iva_details.find(i => Number(i.porcentaje) === rate);
          const value = ivaDetail?.base_imponible ?? 0;
          const formatted = formatCurrency(value);
          return (
            <div className="text-right font-medium transition-colors duration-300 hover:text-primary">
              {formatted}
            </div>
          );
        },
        footer: ({ table }) => {
          const total = table.getFilteredRowModel().rows.reduce((sum, row) => {
            const detail = row.original.iva_details.find(d => Number(d.porcentaje) === rate);
            return sum + (Number(detail?.base_imponible) || 0);
          }, 0);
          const formatted = formatCurrency(total);
          return (
            <div className="text-right font-bold text-sm bg-muted/50 px-2 py-1 rounded transition-colors duration-300 hover:bg-muted">
              {formatted}
            </div>
          );
        }
      },
      {
        id: `iva_${rate}`,
        header: `IVA ${rate}%`,
        cell: ({ row }: { row: Row<Document> }) => {
          const ivaDetail = row.original.iva_details.find(i => Number(i.porcentaje) === rate);
          const value = ivaDetail?.cuota ?? 0;
          const formatted = formatCurrency(value);
          return (
            <div className="text-right font-medium transition-colors duration-300 hover:text-primary">
              {formatted}
            </div>
          );
        },
        footer: ({ table }) => {
          const total = table.getFilteredRowModel().rows.reduce((sum, row) => {
            const detail = row.original.iva_details.find(d => Number(d.porcentaje) === rate);
            return sum + (Number(detail?.cuota) || 0);
          }, 0);
          const formatted = formatCurrency(total);
          return (
            <div className="text-right font-bold text-sm bg-muted/50 px-2 py-1 rounded transition-colors duration-300 hover:bg-muted">
              {formatted}
            </div>
          );
        }
      }
    ])),

    // 🎯 COLUMNA RETENCIÓN
    {
      accessorKey: 'retencion',
      header: 'Retención',
      cell: ({ row }: { row: Row<Document> }) => {
        const ivaDetail = row.original.iva_details.find(i => i.tipo_impuesto?.toLowerCase() === 'retencion');
        const value = ivaDetail?.cuota ?? 0;
        const formatted = formatCurrency(value);
        return (
          <div className="text-right font-medium transition-colors duration-300 hover:text-primary">
            {formatted}
          </div>
        );
      },
      footer: ({ table }) => {
        const total = table.getFilteredRowModel().rows.reduce((sum, row) => {
          const detail = row.original.iva_details.find(d => d.tipo_impuesto?.toLowerCase() === 'retencion');
          return sum + (Number(detail?.cuota) || 0);
        }, 0);
        const formatted = formatCurrency(total);
        return (
          <div className="text-right font-bold text-sm bg-muted/50 px-2 py-1 rounded transition-colors duration-300 hover:bg-muted">
            {formatted}
          </div>
        );
      }
    },

    // 🎯 COLUMNA TOTAL BASE IMPONIBLE
    {
      accessorKey: 'base_imponible',
      header: 'Total Base',
      cell: ({ row }) => {
        const value = row.getValue('base_imponible');
        const formatted = formatCurrency(value);
        return (
          <div className="text-right font-semibold transition-colors duration-300 hover:text-primary">
            {formatted}
          </div>
        );
      },
      footer: ({ table }) => {
        const total = table.getFilteredRowModel().rows.reduce((sum, row) => sum + (Number(row.original.base_imponible) || 0), 0);
        const formatted = formatCurrency(total);
        return (
          <div className="text-right font-bold text-sm bg-muted/50 px-2 py-1 rounded transition-colors duration-300 hover:bg-muted">
            {formatted}
          </div>
        );
      }
    },

    // 🎯 COLUMNA TOTAL IVA
    {
      accessorKey: 'iva',
      header: 'Total IVA',
      cell: ({ row }) => {
        const value = row.getValue('iva');
        const formatted = formatCurrency(value);
        return (
          <div className="text-right font-semibold transition-colors duration-300 hover:text-primary">
            {formatted}
          </div>
        );
      },
      footer: ({ table }) => {
        const total = table.getFilteredRowModel().rows.reduce((sum, row) => sum + (Number(row.original.iva) || 0), 0);
        const formatted = formatCurrency(total);
        return (
          <div className="text-right font-bold text-sm bg-muted/50 px-2 py-1 rounded transition-colors duration-300 hover:bg-muted">
            {formatted}
          </div>
        );
      }
    },

    // 🎯 COLUMNA TOTAL FINAL
    {
      accessorKey: 'total',
      header: 'Total',
      cell: ({ row }) => {
        const value = row.getValue('total');
        const formatted = formatCurrency(value);
        return (
          <div className="text-right font-bold transition-colors duration-300 hover:text-primary">
            {formatted}
          </div>
        );
      },
      footer: ({ table }) => {
        const total = table.getFilteredRowModel().rows.reduce((sum, row) => sum + (Number(row.original.total) || 0), 0);
        const formatted = formatCurrency(total);
        return (
          <div className="text-right font-bold text-base bg-muted/50 px-3 py-1.5 rounded-lg transition-colors duration-300 hover:bg-muted">
            {formatted}
          </div>
        );
      }
    },
  ];

  return columns;
}// 🎯 COMPONENTE PRINCIPAL DocumentsTable
export function DocumentsTable({ 
  documents, 
  hiddenColumns = [], 
  isIncidentsPage = false, 
  filename = 'documentos',
  showConfirmButton = false,
  viewId,
  enableColumnPersistence = true,
  onDocumentChanged,
}: { 
  documents: Document[], 
  hiddenColumns?: string[], 
  isIncidentsPage?: boolean, 
  filename?: string,
  showConfirmButton?: boolean,
  viewId?: string,
  enableColumnPersistence?: boolean,
  onDocumentChanged?: () => void,
}) {
  // 🎨 STATES
  const [isSummarizeOpen, setIsSummarizeOpen] = useState(false);
  const [selectedDocForSummary, setSelectedDocForSummary] = useState<Document | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [docToDelete, setDocToDelete] = useState<Document | null>(null);
  const [docToConfirm, setDocToConfirm] = useState<Document | null>(null);
  const [docToPreview, setDocToPreview] = useState<Document | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const { selectedCompanyIds } = useCompanyContext();

  // Hook de detección de duplicados
  const { checkDuplicates, duplicates } = useDuplicateDetection();
  
  console.log('🎯 [DocumentsTable] Duplicados actuales:', Array.from(duplicates));
  
  // Verificar duplicados cuando cambian los documentos
  useEffect(() => {
    if (documents.length > 0) {
      const timer = setTimeout(async () => {
        console.log('🔍 [DocumentsTable] Verificando duplicados...');
        await checkDuplicates();
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [documents.length, checkDuplicates]);

  useEffect(() => {
    console.log('🎯 [DocumentsTable] Duplicados actuales:', Array.from(duplicates));
    console.log('🎯 [DocumentsTable] Total duplicados:', duplicates.size);
  }, [duplicates]);

  // 🎨 HANDLERS
  const handleUpdate = useCallback(async (docId: number, fieldName: string, value: any) => {
    console.log('📝 [handleUpdate] Actualización:', { docId, fieldName, value });
    
    if (onDocumentChanged) {
      console.log('🔄 [handleUpdate] Refrescando documentos desde el servidor...');
      onDocumentChanged();
    }
    
    if (fieldName === 'numero_documento') {
      setTimeout(async () => {
        console.log('🔍 [handleUpdate] Verificando duplicados después de editar...');
        await checkDuplicates();
      }, 500);
    }
  }, [checkDuplicates, onDocumentChanged]);

  const handleSummarize = (doc: Document) => {
    setSelectedDocForSummary(doc);
    setIsSummarizeOpen(true);
  };

  const handleDeleteClick = (doc: Document) => {
    setDocToDelete(doc);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmClick = (doc: Document) => {
    setDocToConfirm(doc);
    setIsConfirmDialogOpen(true);
  };

  const handlePreviewClick = (doc: Document) => {
    setDocToPreview(doc);
    setIsPreviewOpen(true);
  };

  const handleConfirmDocument = async () => {
    if (!docToConfirm) return;

    setIsConfirming(true);
    try {
      const result = await confirmDocument(docToConfirm.id_documento);

      if (!result.success) {
        throw new Error(result.error || 'Error al confirmar el documento');
      }

      toast({
        title: '✅ Documento confirmado',
        description: `El documento #${docToConfirm.numero_documento || docToConfirm.id_documento} ha sido confirmado. Tipo actualizado: "${result.tipo_nuevo}"`,
      });

      if (onDocumentChanged) {
        onDocumentChanged();
      }
    } catch (error) {
      console.error('❌ Error al confirmar:', error);
      toast({
        title: '❌ Error',
        description: error instanceof Error ? error.message : 'No se pudo confirmar el documento.',
        variant: 'destructive',
      });
    } finally {
      setIsConfirming(false);
      setIsConfirmDialogOpen(false);
      setDocToConfirm(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!docToDelete) return;

    setIsDeleting(true);
    try {
      const result = await deleteDocument(docToDelete.id_documento);

      if (!result.success) {
        throw new Error(result.error || 'Error al eliminar el documento');
      }

      toast({
        title: '✅ Documento eliminado',
        description: `El documento #${docToDelete.numero_documento || docToDelete.id_documento} ha sido eliminado correctamente.`,
      });

      if (onDocumentChanged) {
        onDocumentChanged();
      }
    } catch (error) {
      console.error('❌ Error al eliminar:', error);
      toast({
        title: '❌ Error',
        description: error instanceof Error ? error.message : 'No se pudo eliminar el documento.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
      setDocToDelete(null);
    }
  };

  const handleMarkAsRead = useCallback(async (documentId: number) => {
    try {
      const response = await fetch(`/api/documents/${documentId}/mark-read`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Error al marcar como leído');
      }

      router.refresh();
    } catch (error) {
      console.error('❌ Error al marcar como leído:', error);
    }
  }, [router]);

  const handleRowClick = useCallback((doc: Document) => {
    if (doc.is_new === 1) {
      handleMarkAsRead(doc.id_documento);
    }
    
    router.push(`/documento/${doc.id_documento}`);
  }, [router, handleMarkAsRead]);

  const columns = useMemo(() => getColumns(
    handleUpdate as any, 
    handleSummarize, 
    handleDeleteClick, 
    handleConfirmClick,
    handlePreviewClick,
    showConfirmButton,
    duplicates
  ), [handleUpdate, showConfirmButton, duplicates]);

  const previewUrl = docToPreview?.archivos?.[0]?.ruta_archivo;
  const previewName = docToPreview?.archivos?.[0]?.nombre_archivo || `documento_${docToPreview?.id_documento}.pdf`;
  
  // 🎨 RENDER
  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {documents.length} documento(s)
            </span>
            {duplicates.size > 0 && (
              <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <span className="inline-block w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
                {duplicates.size} duplicado(s)
              </span>
            )}
          </div>
          
          <CleanDuplicatesButton
            empresaId={selectedCompanyIds[0] || null}
            onComplete={() => {
              console.log('✅ Limpieza completada, refrescando...');
              if (onDocumentChanged) {
                onDocumentChanged();
              }
            }}
            variant="outline"
            size="sm"
          />
        </div>
        
        <div className="relative w-full group" data-tutorial="documents-table">
          <div className="w-full overflow-x-auto rounded-lg border border-border/50 shadow-sm transition-all duration-300 hover:shadow-md hover:border-border">
            <DataTable 
              columns={columns} 
              data={documents} 
              hiddenColumns={hiddenColumns} 
              filename={filename}
              onRowClick={handleRowClick}
              viewId={viewId}
              enableColumnPersistence={enableColumnPersistence}
            />
          </div>
          
          <div className="lg:hidden text-center text-xs text-muted-foreground mt-3 py-1.5 flex items-center justify-center gap-2 transition-opacity duration-300 opacity-70 hover:opacity-100">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
            <span className="font-medium">Desliza horizontalmente para ver más</span>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
          </div>
        </div>
      </div>
      
      <SummarizeDialog 
        doc={selectedDocForSummary}
        isOpen={isSummarizeOpen}
        setIsOpen={setIsSummarizeOpen}
      />

      <DocumentPreviewDialog
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        documentUrl={previewUrl ?? null}
        documentName={previewName}
      />

      <AlertDialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <AlertDialogContent className="max-w-lg transition-all duration-300 animate-in fade-in zoom-in-95">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-lg">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              ¿Confirmar documento?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm space-y-2 pt-2">
              <p>
                Vas a confirmar el documento
                {docToConfirm?.numero_documento && (
                  <span className="font-semibold text-foreground"> #{docToConfirm.numero_documento}</span>
                )} 
                <span className="text-muted-foreground"> (ID: {docToConfirm?.id_documento})</span>
              </p>
              
              <div className="bg-muted/50 rounded-lg p-3 space-y-1.5 border border-border/50">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Tipo actual:</span>
                  <span className="font-medium text-amber-600 dark:text-amber-400">
                    {docToConfirm?.tipo_documento}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Tipo después:</span>
                  <span className="font-medium text-green-600 dark:text-green-400">
                    {docToConfirm?.tipo_documento?.replace(/\s*\(SIN CONFIRMAR\)\s*/gi, '').trim()}
                  </span>
                </div>
              </div>
              
              <p className="text-xs text-muted-foreground pt-1">
                Esta acción moverá el documento de "Sin Confirmar" a su categoría correspondiente.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel 
              disabled={isConfirming}
              className="transition-all duration-300 hover:scale-105"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDocument}
              disabled={isConfirming}
              className="bg-green-600 text-white hover:bg-green-700 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-green-500/30"
            >
              {isConfirming ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  Confirmando...
                </span>
              ) : (
                'Confirmar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="max-w-lg transition-all duration-300 animate-in fade-in zoom-in-95">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-lg">
              <Trash2 className="h-5 w-5 text-destructive" />
              ¿Estás seguro?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm space-y-2 pt-2">
              <p>
                Esta acción <span className="font-semibold text-destructive">no se puede deshacer</span>. 
                Se eliminará permanentemente el documento
                {docToDelete?.numero_documento && (
                  <span className="font-semibold text-foreground"> #{docToDelete.numero_documento}</span>
                )} 
                <span className="text-muted-foreground"> (ID: {docToDelete?.id_documento})</span>
              </p>
              
              <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 space-y-1">
                <p className="text-xs font-medium text-destructive flex items-center gap-2">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-destructive animate-pulse"></span>
                  Se eliminará permanentemente:
                </p>
                <ul className="text-xs text-muted-foreground space-y-0.5 pl-3.5">
                  <li>• El documento y su archivo adjunto</li>
                  <li>• Todos los datos asociados</li>
                  <li>• Datos de IVA y totales</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel 
              disabled={isDeleting}
              className="transition-all duration-300 hover:scale-105"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-destructive/30"
            >
              {isDeleting ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  Eliminando...
                </span>
              ) : (
                'Eliminar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}