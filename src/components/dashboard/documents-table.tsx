'use client';

import Link from 'next/link';
import { MoreHorizontal, Trash2, CheckCircle } from 'lucide-react';
import type { ColumnDef, Row, Table as TanstackTable } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { type Document, calcularTrimestre } from '@/lib/types';
import { SummarizeDialog } from './summarize-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { DataTable } from '@/components/ui/data-table';
import { useState, useMemo, useCallback } from 'react';
import { Checkbox } from '../ui/checkbox';
import { EditableCell } from './editable-cell';
import { useToast } from '@/hooks/use-toast';
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
import { deleteDocument } from '@/services/document-service';
import { confirmDocument } from '@/services/document-client-service';

const getColumns = (
    onUpdate: (docId: number, field: string, value: any, table: TanstackTable<Document>, rowIndex: number) => void,
    onSummarize: (doc: Document) => void,
    onDelete: (doc: Document) => void,
    onConfirm: (doc: Document) => void,
    showConfirmButton: boolean = false
): ColumnDef<Document>[] => {
  const columns: ColumnDef<Document>[] = [
    {
      id: 'actions',
      header: 'Acciones',
      cell: ({ row }) => {
        const doc = row.original;
        return (
          <div className="flex items-center gap-2 relative z-10">
            {/* ✅ BOTÓN CONFIRMAR - Solo visible si showConfirmButton es true */}
            {showConfirmButton && (
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-950 relative z-20"
                    onClick={(e) => {
                      e.stopPropagation();
                      onConfirm(doc);
                    }}
                  >
                    <span className="sr-only">Confirmar</span>
                    <CheckCircle className="h-4 w-4" />
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
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 relative z-20"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(doc);
                  }}
                >
                  <span className="sr-only">Eliminar</span>
                  <Trash2 className="h-4 w-4" />
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
                <Button variant="ghost" className="h-8 w-8 p-0 relative z-20">
                  <span className="sr-only">Ver más</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[99999]">
                <DropdownMenuItem onClick={() => onSummarize(doc)}>
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
    {
      id: 'select',
      header: ({ table }) => {
        const checkboxContent = (
          <>
            <Checkbox
              checked={table.getIsAllPageRowsSelected()}
              onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
              aria-label="Select all"
            />
            <span>ID</span>
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
            />
            <div className="flex items-center gap-2">
              <span>{doc.id_documento}</span>
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
      footer: () => 'Totales',
    },
    {
      id: 'empresa_factura',
      header: 'Cliente',
      cell: ({ row }) => {
        const cliente = row.original.entidades?.find(e => e.rol === 'cliente' || e.rol === 'receptor');
        const nombre = cliente?.nombre || 'Sin cliente';
        return <div className="font-medium text-sm">{nombre}</div>;
      },
      footer: () => null,
    },
    {
      id: 'empresa_sistema',
      header: 'Empresa (Sistema)',
      cell: ({ row }) => {
        const nombre = row.original.empresa_nombre || 'Sin empresa';
        return <div className="text-sm text-muted-foreground">{nombre}</div>;
      },
      footer: () => null,
    },
    {
      accessorKey: 'numero_documento',
      header: 'Nº Factura',
      cell: ({ row }) => {
        const value = row.getValue('numero_documento') || '-';
        return <div className="text-sm">{value}</div>;
      }
    },
    {
      accessorKey: 'fecha_emision',
      header: 'Fecha Contable',
      cell: ({ row }) => {
        const fecha = row.getValue('fecha_emision');
        if (!fecha) return <span>-</span>;
        const date = new Date(fecha as string);
        const fechaStr = date.toLocaleDateString('es-ES', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
        return <div className="text-sm">{fechaStr}</div>;
      }
    },
    {
      accessorKey: 'fecha_creacion',
      header: 'Fecha de Carga',
      cell: ({ row }) => {
        const fecha = row.getValue('fecha_creacion');
        if (!fecha) {
          return <span>-</span>;
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
          <div className="text-sm whitespace-nowrap">
            <div>{fechaStr}</div>
            <div className="text-xs text-muted-foreground">{horaStr}</div>
          </div>
        );
      },
      footer: () => null,
    },
    {
      id: 'trimestre',
      header: 'Trimestre',
      cell: ({ row }) => {
        const fecha = row.getValue('fecha_creacion');
        if (!fecha) {
          return <span className="text-muted-foreground text-xs">Sin fecha</span>;
        }
        
        const date = new Date(fecha as string);
        const trimestre = calcularTrimestre(date);
        const anio = date.getFullYear();
        
        const colorClasses = {
          1: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
          2: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
          3: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
          4: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
        };
        
        const colorClass = colorClasses[trimestre as keyof typeof colorClasses] || 'bg-gray-100 text-gray-800';
        
        return (
          <div className="text-sm">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${colorClass}`}>
              Q{trimestre} {anio}
            </span>
          </div>
        );
      },
      footer: () => null,
    },
    {
      accessorKey: 'proveedor',
      header: 'Proveedor',
      cell: ({ row }) => {
        const value = row.getValue('proveedor') || '-';
        return <div className="text-sm">{value}</div>;
      }
    },
    {
      accessorKey: 'cif',
      header: 'CIF',
      cell: ({ row }) => {
        const value = row.getValue('cif') || '-';
        return <div className="text-sm">{value}</div>;
      }
    },
    {
      accessorKey: 'observaciones',
      header: 'Concepto',
      cell: ({ row }) => {
        const value = row.getValue('observaciones') || '-';
        return <div className="text-sm">{value}</div>;
      }
    },
    {
  id: 'incidencia_motivo',
  header: 'Motivo Incidencia',
  cell: ({ row }) => {
    const doc = row.original;
    
    // Si no hay incidencia, mostrar "Sin incidencias"
    if (!doc.incidencia || !doc.incidencia_razon) {
      return (
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <span className="inline-flex h-2 w-2 rounded-full bg-green-500"></span>
          Sin incidencias
        </div>
      );
    }
    
    // Si hay incidencia, mostrar el motivo
    return (
      <div className="flex items-center gap-2 max-w-md">
        <span className="inline-flex h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>
        <div className="flex-1">
          <div 
            className="text-sm font-medium line-clamp-2 text-red-600 dark:text-red-400 cursor-help" 
            title={doc.incidencia_razon}
          >
            {doc.incidencia_razon}
          </div>
        </div>
      </div>
    );
  },
  footer: () => null,
},
    {
      accessorKey: 'tipo_documento',
      header: 'Tipo Documento',
      cell: ({ row, table }) => {
        return <EditableCell docId={row.original.id_documento} initialValue={row.getValue('tipo_documento')} fieldName="tipo_documento" onUpdate={onUpdate} table={table} rowIndex={row.index} />;
      }
    },
    ...[21, 10, 4, 0].flatMap(rate => ([
      {
        id: `base_${rate}`,
        header: `Base ${rate}%`,
        cell: ({ row }: { row: Row<Document> }) => {
          const ivaDetail = row.original.iva_details.find(i => Number(i.porcentaje) === rate);
          const value = ivaDetail?.base_imponible ?? 0;
          const formatted = Number(value).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
          return <div className="text-right">{formatted}</div>;
        },
        footer: ({ table }) => {
          const total = table.getFilteredRowModel().rows.reduce((sum, row) => {
            const detail = row.original.iva_details.find(d => Number(d.porcentaje) === rate);
            return sum + (Number(detail?.base_imponible) || 0);
          }, 0);
          const formatted = total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
          return <div className="text-right font-bold">{formatted}</div>;
        }
      },
      {
        id: `iva_${rate}`,
        header: `IVA ${rate}%`,
        cell: ({ row }: { row: Row<Document> }) => {
          const ivaDetail = row.original.iva_details.find(i => Number(i.porcentaje) === rate);
          const value = ivaDetail?.cuota ?? 0;
          const formatted = Number(value).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
          return <div className="text-right">{formatted}</div>;
        },
        footer: ({ table }) => {
          const total = table.getFilteredRowModel().rows.reduce((sum, row) => {
            const detail = row.original.iva_details.find(d => Number(d.porcentaje) === rate);
            return sum + (Number(detail?.cuota) || 0);
          }, 0);
          const formatted = total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
          return <div className="text-right font-bold">{formatted}</div>;
        }
      }
    ])),
    {
      accessorKey: 'retencion',
      header: 'Retención',
      cell: ({ row }: { row: Row<Document> }) => {
        const ivaDetail = row.original.iva_details.find(i => i.tipo_impuesto?.toLowerCase() === 'retencion');
        const value = ivaDetail?.cuota ?? 0;
        const formatted = Number(value).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
        return <div className="text-right">{formatted}</div>;
      },
      footer: ({ table }) => {
        const total = table.getFilteredRowModel().rows.reduce((sum, row) => {
          const detail = row.original.iva_details.find(d => d.tipo_impuesto?.toLowerCase() === 'retencion');
          return sum + (Number(detail?.cuota) || 0);
        }, 0);
        const formatted = total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
        return <div className="text-right font-bold">{formatted}</div>;
      }
    },
    {
      accessorKey: 'base_imponible',
      header: 'Total Base',
      cell: ({ row }) => {
        const value = row.getValue('base_imponible');
        const formatted = Number(value).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
        return <div className="text-right">{formatted}</div>;
      },
      footer: ({ table }) => {
        const total = table.getFilteredRowModel().rows.reduce((sum, row) => sum + (Number(row.original.base_imponible) || 0), 0);
        const formatted = total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
        return <div className="text-right font-bold">{formatted}</div>;
      }
    },
    {
      accessorKey: 'iva',
      header: 'Total IVA',
      cell: ({ row }) => {
        const value = row.getValue('iva');
        const formatted = Number(value).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
        return <div className="text-right">{formatted}</div>;
      },
      footer: ({ table }) => {
        const total = table.getFilteredRowModel().rows.reduce((sum, row) => sum + (Number(row.original.iva) || 0), 0);
        const formatted = total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
        return <div className="text-right font-bold">{formatted}</div>;
      }
    },
    {
      accessorKey: 'total',
      header: 'Total',
      cell: ({ row }) => {
        const value = row.getValue('total');
        const formatted = Number(value).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
        return <div className="text-right">{formatted}</div>;
      },
      footer: ({ table }) => {
        const total = table.getFilteredRowModel().rows.reduce((sum, row) => sum + (Number(row.original.total) || 0), 0);
        const formatted = total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
        return <div className="text-right font-bold">{formatted}</div>;
      }
    },
  ];

  return columns;
}

export function DocumentsTable({ 
  documents, 
  hiddenColumns = [], 
  isIncidentsPage = false, 
  filename = 'documentos',
  showConfirmButton = false,
  viewId, // 🆕 NUEVO: Identificador de la vista
  enableColumnPersistence = true, // 🆕 NUEVO: Activar persistencia por defecto
}: { 
  documents: Document[], 
  hiddenColumns?: string[], 
  isIncidentsPage?: boolean, 
  filename?: string,
  showConfirmButton?: boolean,
  viewId?: string, // 🆕 NUEVO
  enableColumnPersistence?: boolean, // 🆕 NUEVO
}) {
  const [isSummarizeOpen, setIsSummarizeOpen] = useState(false);
  const [selectedDocForSummary, setSelectedDocForSummary] = useState<Document | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [docToDelete, setDocToDelete] = useState<Document | null>(null);
  const [docToConfirm, setDocToConfirm] = useState<Document | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  console.log('🔍 [DocumentsTable] Documentos con is_new:', documents.filter(d => d.is_new === 1).map(d => ({
    id: d.id_documento,
    numero: d.numero_documento,
    is_new: d.is_new
  })));

  const handleUpdate = useCallback((docId: number, fieldName: string, value: any) => {
    // This function is now primarily for optimistic updates if needed
  }, []);
  
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

  const handleConfirmDocument = async () => {
    if (!docToConfirm) return;

    setIsConfirming(true);
    try {
      console.log('✅ Intentando confirmar documento:', docToConfirm.id_documento);
      
      const result = await confirmDocument(docToConfirm.id_documento);

      if (!result.success) {
        throw new Error(result.error || 'Error al confirmar el documento');
      }

      toast({
        title: 'Documento confirmado',
        description: `El documento #${docToConfirm.numero_documento || docToConfirm.id_documento} ha sido confirmado. Tipo actualizado: "${result.tipo_nuevo}"`,
      });

      router.refresh();
    } catch (error) {
      console.error('❌ Error al confirmar:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'No se pudo confirmar el documento. Por favor, inténtalo de nuevo.',
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
      console.log('🗑️ Intentando eliminar documento:', docToDelete.id_documento);
      
      const result = await deleteDocument(docToDelete.id_documento);

      if (!result.success) {
        throw new Error(result.error || 'Error al eliminar el documento');
      }

      toast({
        title: 'Documento eliminado',
        description: `El documento #${docToDelete.numero_documento || docToDelete.id_documento} ha sido eliminado correctamente.`,
      });

      router.refresh();
    } catch (error) {
      console.error('❌ Error al eliminar:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'No se pudo eliminar el documento. Por favor, inténtalo de nuevo.',
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
      console.log('👁️ [handleMarkAsRead] Marcando documento como leído:', documentId);
      
      const response = await fetch(`/api/documents/${documentId}/mark-read`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Error al marcar como leído');
      }

      const result = await response.json();
      console.log('✅ Documento marcado como leído:', result);
      
      router.refresh();
    } catch (error) {
      console.error('❌ Error al marcar como leído:', error);
    }
  }, [router]);

  const handleRowClick = useCallback((doc: Document) => {
    console.log('🖱️ [handleRowClick] Click en documento:', { id: doc.id_documento, is_new: doc.is_new });
    
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
    showConfirmButton
  ), [handleUpdate, showConfirmButton]);

  return (
    <>
      <TooltipProvider>
        <DataTable 
          columns={columns} 
          data={documents} 
          hiddenColumns={hiddenColumns} 
          filename={filename}
          onRowClick={handleRowClick}
          viewId={viewId} // 🆕 NUEVO: Pasar viewId
          enableColumnPersistence={enableColumnPersistence} // 🆕 NUEVO: Pasar enableColumnPersistence
        />
      </TooltipProvider>
      
      <SummarizeDialog 
        doc={selectedDocForSummary}
        isOpen={isSummarizeOpen}
        setIsOpen={setIsSummarizeOpen}
      />

      {/* Dialog para CONFIRMAR documento */}
      <AlertDialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmar documento?</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a confirmar el documento
              {docToConfirm?.numero_documento && ` #${docToConfirm.numero_documento}`} (ID: {docToConfirm?.id_documento}).
              <br /><br />
              Tipo actual: <strong>{docToConfirm?.tipo_documento}</strong>
              <br />
              Tipo después de confirmar: <strong>{docToConfirm?.tipo_documento?.replace(/\s*\(SIN CONFIRMAR\)\s*/gi, '').trim()}</strong>
              <br /><br />
              Esta acción moverá el documento de "Sin Confirmar" a su categoría correspondiente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isConfirming}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDocument}
              disabled={isConfirming}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              {isConfirming ? 'Confirmando...' : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog para ELIMINAR documento */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente el documento
              {docToDelete?.numero_documento && ` #${docToDelete.numero_documento}`} (ID: {docToDelete?.id_documento})
              y todos sus datos asociados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}