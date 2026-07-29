'use client';

import Link from 'next/link';
import { MoreHorizontal, Trash2, CheckCircle, Eye, Folder, Lock, Rows3, Table2 } from 'lucide-react';
import type { ColumnDef, Row, Table as TanstackTable } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { type Document, type IvaDetail } from '@/lib/types';
import { SummarizeDialog } from './summarize-dialog';
import { DocumentPreviewDialog } from './document-preview-dialog';
import { CleanDuplicatesButton } from './clean-duplicates-button';
import { ClienteFilter, ProveedorFilter } from './column-filters';
import { DocumentsStackedList } from './documents-stacked-list';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useRouter } from 'next/navigation';
import { confirmDocument } from '@/services/document-client-service';
import { useDuplicateDetection } from '@/hooks/use-duplicate-detection';
import { deleteDocument } from '@/services/document-service';

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

const UNCLASSIFIED = 'No clasificado';

const getColumns = (
  onUpdate: (docId: number, field: string, value: any, table: TanstackTable<Document>, rowIndex: number) => void,
  onSummarize: (doc: Document) => void,
  onDelete: (doc: Document) => void,
  onConfirm: (doc: Document) => void,
  onPreview: (doc: Document) => void,
  onValidateIncident: (doc: Document) => void,
  onValidateSingleIncident: (incidentId: number) => void,
  showConfirmButton: boolean = false,
  isIncidentsPage: boolean = false,
  duplicates: Set<number> = new Set(),
  customTypes: string[] = [],
  onMove?: (docIds: number[], targetTipo: string) => void,
  footerValues?: { // 🆕 Optional custom footer values
    base: number;
    iva: number;
    total: number;
    label?: string;
    breakdown?: {
      ingresos: { base: number; iva: number; total: number; retencion?: number; recargo?: number };
      gastos: { base: number; iva: number; total: number; retencion?: number; recargo?: number };
    };
  }
): ColumnDef<Document>[] => {
  const columns: ColumnDef<Document>[] = [
    {
      id: 'actions',
      header: 'Acciones',
      cell: ({ row }) => {
        const doc = row.original;
        const hasFile = doc.archivos && doc.archivos.length > 0 && doc.archivos[0]?.ruta_archivo;

        // Calcular si tiene incidencias activas
        const hasIncidents = doc.incidencias && doc.incidencias.some(i => !i.validado);
        const hasLegacyIncident = !hasIncidents && doc.incidencia && doc.incidencia_razon;
        const showValidate = isIncidentsPage && (hasIncidents || hasLegacyIncident);

        return (
          <div className="flex items-center gap-2 relative z-10">
            {showValidate && (
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-8 w-8 p-0 text-amber-600 hover:text-green-600 hover:bg-green-100 dark:text-amber-500 dark:hover:text-green-400 dark:hover:bg-green-950 relative z-20 transition-all duration-300 hover:scale-110 hover:shadow-lg hover:shadow-green-500/20"
                    onClick={(e) => {
                      e.stopPropagation();
                      onValidateIncident(doc);
                    }}
                  >
                    <span className="sr-only">Validar</span>
                    <CheckCircle className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="z-[99999]">
                  <p>Validar Incidencias</p>
                </TooltipContent>
              </Tooltip>
            )}

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
                <span>
                  <Button
                    variant="ghost"
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 relative z-20 transition-all duration-300 hover:scale-110 hover:shadow-lg hover:shadow-destructive/20 disabled:opacity-30 disabled:hover:scale-100 disabled:cursor-not-allowed"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(doc);
                    }}
                    disabled={doc.trimestre_cerrado === 1}
                  >
                    <span className="sr-only">Eliminar</span>
                    {doc.trimestre_cerrado === 1 ? (
                      <Lock className="h-4 w-4 text-muted-foreground/50" />
                    ) : (
                      <Trash2 className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
                    )}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent
                side={doc.trimestre_cerrado === 1 ? "top" : "bottom"}
                sideOffset={5}
                className={doc.trimestre_cerrado === 1 ? "z-[99999] bg-destructive text-destructive-foreground border-none" : "z-[99999]"}
                avoidCollisions={true}
                collisionPadding={10}
              >
                <p>{doc.trimestre_cerrado === 1 ? `No se puede eliminar: Trimestre ${doc.año_trimestre}Q${doc.num_trimestre} cerrado` : 'Eliminar documento'}</p>
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

                {customTypes.length > 0 && onMove && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="cursor-pointer">
                        Mover a...
                      </DropdownMenuSubTrigger>
                      <DropdownMenuPortal>
                        <DropdownMenuSubContent className="z-[100000]">
                          {customTypes.map((tipo) => (
                            <DropdownMenuItem
                              key={tipo}
                              onClick={() => onMove([doc.id_documento], tipo)}
                              className="cursor-pointer"
                            >
                              <Folder className="mr-2 h-4 w-4" />
                              {tipo}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuItem
                            onClick={() => onMove([doc.id_documento], 'No clasificado')}
                            className="cursor-pointer"
                          >
                            <Folder className="mr-2 h-4 w-4" />
                            No clasificado
                          </DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuPortal>
                    </DropdownMenuSub>
                  </>
                )}
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

    {
      id: 'empresa_factura',
      accessorFn: (row) => {
        const cliente = row.entidades?.find(e => e.rol === 'cliente' || e.rol === 'receptor');
        return cliente?.nombre || 'Sin cliente';
      },
      header: ({ column, table }) => (
        <div className="flex items-center gap-2">
          <span>Cliente</span>
          <ClienteFilter column={column} table={table} />
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
        if (!value || (Array.isArray(value) && value.length === 0)) return true;

        const cliente = row.original.entidades?.find((e: any) => e.rol === 'cliente' || e.rol === 'receptor');
        const nombre = cliente?.nombre || 'Sin cliente';
        // El valor del filtro ahora es el hash o CIF raw del cliente
        const rowKey = (cliente as any)?.identificador_fiscal_hash
          || cliente?.identificador_fiscal
          || nombre;

        // Si es array (Filtro de faceta - Dropdown: valores = hashes)
        if (Array.isArray(value)) {
          return value.includes(rowKey);
        }

        // Si es string (Input de texto manual: buscar por nombre)
        if (typeof value === 'string') {
          return nombre.toLowerCase().includes(value.toLowerCase());
        }

        return true;
      },
      footer: () => null,
    },

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
    {
      accessorKey: 'fecha_vencimiento',
      header: 'Fecha Vencimiento',
      cell: ({ row, table }) => {
        return (
          <EditableCell
            docId={row.original.id_documento}
            initialValue={row.getValue('fecha_vencimiento')}
            fieldName="fecha_vencimiento"
            onUpdate={onUpdate}
            inputType="date"
            table={table}
            rowIndex={row.index}
            trimestre_cerrado={row.original.trimestre_cerrado}
          />
        );
      }
    },

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
          year: 'numeric',
          timeZone: 'Europe/Madrid'
        });
        const horaStr = date.toLocaleTimeString('es-ES', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Europe/Madrid'
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

    {
      id: 'proveedor',
      accessorFn: (row) => row.proveedor,
      header: ({ column, table }) => (
        <div className="flex items-center gap-2">
          <span>Proveedor</span>
          <ProveedorFilter column={column} table={table} />
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
        if (!value || (Array.isArray(value) && value.length === 0)) return true;

        const nombre = row.original.proveedor;
        const emisor = row.original.entidades?.find((e: any) => e.rol === 'proveedor' || e.rol === 'emisor');
        // El valor del filtro ahora es el hash o CIF raw del emisor
        const rowKey = (emisor as any)?.identificador_fiscal_hash
          || emisor?.identificador_fiscal
          || nombre;

        // Si es array (Filtro de faceta - Dropdown: valores = hashes)
        if (Array.isArray(value)) {
          return value.includes(rowKey);
        }

        // Si es string (Input de texto manual: buscar por nombre)
        if (typeof value === 'string') {
          return nombre?.toLowerCase().includes(value.toLowerCase());
        }

        return true;
      },
    },

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

    {
      id: 'incidencia_motivo',
      header: 'Incidencias',
      cell: ({ row }) => {
        const doc = row.original;

        // Calcular incidencias activas (unificando array nuevo y campo legacy)
        const incidenciasActivas = doc.incidencias
          ? doc.incidencias.filter(i => !i.validado)
          : [];

        // Si no hay array pero sí el flag legacy
        const hasLegacyIncident = !incidenciasActivas.length && doc.incidencia && doc.incidencia_razon;

        if (incidenciasActivas.length === 0 && !hasLegacyIncident) {
          return (
            <div className="flex items-center gap-2 text-muted-foreground transition-all duration-300 hover:text-green-600">
              <span className="inline-flex h-2 w-2 rounded-full bg-green-500 shrink-0 transition-transform duration-300 hover:scale-125"></span>
              <span className="text-xs">OK</span>
            </div>
          );
        }

        // CASO MÚLTIPLES INCIDENCIAS
        if (incidenciasActivas.length > 0) {
          return (
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 max-w-[300px] cursor-help transition-all duration-300 hover:scale-105">
                  <span className="inline-flex h-2 w-2 rounded-full bg-red-500 animate-pulse shrink-0"></span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate text-red-600 dark:text-red-400">
                      {incidenciasActivas.length > 1
                        ? `${incidenciasActivas.length} Incidencias`
                        : incidenciasActivas[0].descripcion}
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
                <div className="space-y-3 p-1">
                  <div className="space-y-1">
                    <p className="font-semibold text-sm">Incidencias ({incidenciasActivas.length}):</p>
                    <ul className="list-disc pl-4 space-y-1">
                      {incidenciasActivas.map(i => (
                        <li key={i.id} className="text-sm text-red-600 dark:text-red-400 flex items-center justify-between gap-2 group/item">
                          <span>#{i.id}: {i.descripcion}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 rounded-full p-0 opacity-0 group-hover/item:opacity-100 transition-all hover:bg-green-100 hover:text-green-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              onValidateSingleIncident(i.id);
                            }}
                            title="Validar esta incidencia"
                          >
                            <CheckCircle className="h-3 w-3" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-7 text-xs border-green-200 hover:bg-green-50 text-green-700 dark:border-green-800 dark:hover:bg-green-900/30 dark:text-green-400 gap-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      onValidateIncident(doc);
                    }}
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    Validar Incidencias
                  </Button>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        }

        // FALLBACK LEGACY (Solo 1)
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
    }, ...[21, 10, 4, 0].flatMap(rate => ([
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
        footer: ({ table }: { table: TanstackTable<Document> }) => {
          const total = table.getFilteredRowModel().rows.reduce((sum: number, row: Row<Document>) => {
            const detail = row.original.iva_details.find((d: IvaDetail) => Number(d.porcentaje) === rate);
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
        footer: ({ table }: { table: TanstackTable<Document> }) => {
          const total = table.getFilteredRowModel().rows.reduce((sum: number, row: Row<Document>) => {
            const detail = row.original.iva_details.find((d: IvaDetail) => Number(d.porcentaje) === rate);
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
      footer: ({ table }: { table: TanstackTable<Document> }) => {
        const total = table.getFilteredRowModel().rows.reduce((sum: number, row: Row<Document>) => {
          const detail = row.original.iva_details.find((d: IvaDetail) => d.tipo_impuesto?.toLowerCase() === 'retencion');
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

    {
      accessorKey: 'recargo',
      header: 'R. Equiv.',
      cell: ({ row }: { row: Row<Document> }) => {
        const recargoDetails = row.original.iva_details.filter(i =>
          i.tipo_impuesto?.toLowerCase().includes('recargo') ||
          i.tipo_impuesto?.toLowerCase().includes('equivalencia')
        );

        const recargoSum = recargoDetails.reduce((acc, curr) => acc + (Number(curr.cuota) || 0), 0);

        if (recargoSum === 0) return <div className="text-right text-muted-foreground">-</div>;

        const formatted = formatCurrency(recargoSum);
        return (
          <div className="text-right font-medium transition-colors duration-300">
            {formatted}
          </div>
        );
      },
      footer: ({ table }: { table: TanstackTable<Document> }) => {
        const total = table.getFilteredRowModel().rows.reduce((sum: number, row: Row<Document>) => {
          const detailSum = row.original.iva_details
            .filter(d =>
              d.tipo_impuesto?.toLowerCase().includes('recargo') ||
              d.tipo_impuesto?.toLowerCase().includes('equivalencia')
            )
            .reduce((acc, curr) => acc + (Number(curr.cuota) || 0), 0);
          return sum + detailSum;
        }, 0);

        if (total === 0) return null;

        const formatted = formatCurrency(total);
        return (
          <div className="text-right font-bold text-sm bg-muted/50 px-2 py-1 rounded transition-colors duration-300 hover:bg-muted">
            {formatted}
          </div>
        );
      }
    },

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
      footer: ({ table }: { table: TanstackTable<Document> }) => {
        const total = table.getFilteredRowModel().rows.reduce((sum: number, row: Row<Document>) => sum + (Number(row.original.base_imponible) || 0), 0);
        return (
          <div className="text-right font-bold text-sm bg-muted/50 px-2 py-1 rounded transition-colors duration-300 hover:bg-muted inline-block">
            {formatCurrency(total)}
          </div>
        );
      }
    },

    {
      id: 'iva_only',
      header: 'IVA',
      cell: ({ row }) => {
        const totalImpuestos = Number(row.original.iva) || 0;
        const recargoSum = row.original.iva_details
          .filter(i =>
            i.tipo_impuesto?.toLowerCase().includes('recargo') ||
            i.tipo_impuesto?.toLowerCase().includes('equivalencia')
          )
          .reduce((acc, curr) => acc + (Number(curr.cuota) || 0), 0);

        const ivaOnly = totalImpuestos - recargoSum;
        const formatted = formatCurrency(ivaOnly);
        return (
          <div className="text-right font-semibold transition-colors duration-300 hover:text-primary">
            {formatted}
          </div>
        );
      },
      footer: ({ table }: { table: TanstackTable<Document> }) => {
        const total = table.getFilteredRowModel().rows.reduce((sum: number, row: Row<Document>) => {
          const totalImpuestos = Number(row.original.iva) || 0;
          const recargoSum = row.original.iva_details
            .filter((i: IvaDetail) =>
              i.tipo_impuesto?.toLowerCase().includes('recargo') ||
              i.tipo_impuesto?.toLowerCase().includes('equivalencia')
            )
            .reduce((acc: number, curr: IvaDetail) => acc + (Number(curr.cuota) || 0), 0);
          return sum + (totalImpuestos - recargoSum);
        }, 0);
        return (
          <div className="text-right font-bold text-sm bg-muted/50 px-2 py-1 rounded transition-colors duration-300 hover:bg-muted inline-block">
            {formatCurrency(total)}
          </div>
        );
      }
    },



    {
      accessorKey: 'total',
      header: 'Total',
      cell: ({ row }: { row: any }) => {
        const value = Number(row.original.total) || 0;
        const formatted = formatCurrency(value);
        return (
          <div className="text-right font-bold transition-colors duration-300 hover:text-primary">
            {formatted}
          </div>
        );
      },
      footer: ({ table }: { table: TanstackTable<Document> }) => {
        const total = table.getFilteredRowModel().rows.reduce((sum: number, row: Row<Document>) => sum + (Number(row.original.total) || 0), 0);
        return (
          <div className="text-right font-bold text-base bg-muted/50 px-3 py-1.5 rounded-lg transition-colors duration-300 hover:bg-muted inline-block">
            {formatCurrency(total)}
          </div>
        );
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
  viewId,
  enableColumnPersistence = true,
  onDocumentChanged,
  customTypes = [],
  onMove,
  onDragStart,
  exportContext = 'documentos',
  footerValues,
}: {
  documents: Document[],
  hiddenColumns?: string[],
  isIncidentsPage?: boolean,
  filename?: string,
  showConfirmButton?: boolean,
  viewId?: string,
  enableColumnPersistence?: boolean,
  onDocumentChanged?: () => void,
  customTypes?: string[],
  onMove?: (docIds: number[], targetTipo: string) => void,
  onDragStart?: (selectedIds: number[]) => void,
  exportContext?: 'trimestres' | 'documentos' | 'documentos_emitidas' | 'documentos_recibidas' | 'otros',
  footerValues?: {
    base: number;
    iva: number;
    recargo: number;
    total: number;
    label?: string;
    breakdown?: {
      ingresos: { base: number; iva: number; total: number; retencion?: number; recargo?: number };
      gastos: { base: number; iva: number; total: number; retencion?: number; recargo?: number };
    };
  };
}) {
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
  const [viewMode, setViewMode] = useState<'table' | 'stacked'>(
    isIncidentsPage ? 'stacked' : 'table'
  );
  const router = useRouter();
  const { toast } = useToast();

  const { selectedCompanyIds } = useCompanyContext();

  const { checkDuplicates, duplicates, duplicateGroups } = useDuplicateDetection();
  const [isDuplicateDetailsOpen, setIsDuplicateDetailsOpen] = useState(false);

  console.log('🎯 [DocumentsTable] Duplicados actuales:', Array.from(duplicates));

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

  // 🆕 ESTADO y LÓGICA PARA SELECCIÓN MÚLTIPLE
  const [rowSelection, setRowSelection] = useState({});
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkValidating, setIsBulkValidating] = useState(false); // 🆕 Estado para validación masiva
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);

  // Calcular IDs seleccionados - Asumiendo que rowSelection keys son índices de 'documents'
  const selectedIds = useMemo(() => {
    return Object.keys(rowSelection)
      .map(key => documents[parseInt(key)]?.id_documento)
      .filter(id => id !== undefined);
  }, [rowSelection, documents]);

  // ✅ Detectar si hay documentos bloqueados en la selección
  const hasLockedSelected = useMemo(() => {
    return Object.keys(rowSelection).some(key => {
      const doc = documents[parseInt(key)];
      return doc && doc.trimestre_cerrado === 1;
    });
  }, [rowSelection, documents]);

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    setIsBulkDeleteDialogOpen(true);
  };

  const handleConfirmBulkDelete = async () => {
    setIsBulkDeleting(true);

    try {
      console.log('🗑️ [BulkDelete] Iniciando eliminación iterativa...', selectedIds);

      // Función helper para procesar en lotes (concurrencia controlada)
      const CONCURRENCY_LIMIT = 5;
      const results: { id: number; success: boolean; error?: string }[] = [];

      // Procesar IDs en chunks para no saturar
      for (let i = 0; i < selectedIds.length; i += CONCURRENCY_LIMIT) {
        const chunk = selectedIds.slice(i, i + CONCURRENCY_LIMIT);

        const chunkPromises = chunk.map(id =>
          fetch(`/api/documents/${id}`, { method: 'DELETE' })
            .then(async (res) => {
              if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Error');
              }
              return { id, success: true };
            })
            .catch(err => ({ id, success: false, error: err.message }))
        );

        const chunkResults = await Promise.all(chunkPromises);
        results.push(...chunkResults);
      }

      const failures = results.filter(r => !r.success);
      const successCount = results.length - failures.length;

      if (failures.length > 0) {
        console.error('❌ Errores en borrado masivo:', failures);
        toast({
          title: 'Eliminación parcial',
          description: `Se eliminaron ${successCount} documentos. Fallaron ${failures.length}.`,
          variant: 'destructive'
        });
      } else {
        toast({
          title: '✅ Eliminación completada',
          description: `Se eliminaron ${successCount} documentos correctamente.`,
        });
      }

      setRowSelection({}); // Limpiar selección
      if (onDocumentChanged) onDocumentChanged();

      // ✅ NUEVO: Disparar evento para refetch en "Otros"
      window.dispatchEvent(new CustomEvent('documentUploaded'));
      console.log('📡 [BulkDelete] Evento documentUploaded disparado');

    } catch (error) {
      console.error('Error bulk delete', error);
      toast({
        title: 'Error crítico',
        description: error instanceof Error ? error.message : 'Fallo inesperado',
        variant: 'destructive'
      });
    } finally {
      setIsBulkDeleting(false);
      setIsBulkDeleteDialogOpen(false);
    }
  };

  const handleValidateIncident = useCallback(async (doc: Document) => {
    try {
      toast({
        title: 'Validando incidencias...',
        description: `Procesando documento #${doc.id_documento}`,
      });

      const response = await fetch(`/api/documents/${doc.id_documento}/validate`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Error al validar');

      toast({
        title: '✅ Incidencias validadas',
        description: 'El documento se ha marcado como correcto.',
      });

      if (onDocumentChanged) onDocumentChanged();
    } catch (error) {
      console.error('Error validating incident:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron validar las incidencias.',
        variant: 'destructive',
      });
    }
  }, [onDocumentChanged, toast]);

  const handleBulkValidate = async () => {
    if (selectedIds.length === 0) return;
    setIsBulkValidating(true);

    try {
      console.log('✅ [BulkValidate] Iniciando validación iterativa...', selectedIds);

      const CONCURRENCY_LIMIT = 5;
      const results: { id: number; success: boolean }[] = [];

      for (let i = 0; i < selectedIds.length; i += CONCURRENCY_LIMIT) {
        const chunk = selectedIds.slice(i, i + CONCURRENCY_LIMIT);
        const chunkPromises = chunk.map(id =>
          fetch(`/api/documents/${id}/validate`, { method: 'POST' })
            .then(res => ({ id, success: res.ok }))
            .catch(() => ({ id, success: false }))
        );
        results.push(...await Promise.all(chunkPromises));
      }

      const successCount = results.filter(r => r.success).length;

      toast({
        title: '✅ Validación masiva completada',
        description: `Se validaron ${successCount} documentos correctamente.`,
      });

      setRowSelection({});
      if (onDocumentChanged) onDocumentChanged();

    } catch (error) {
      console.error('Error bulk validate', error);
      toast({ title: 'Error', description: 'Fallo en validación masiva', variant: 'destructive' });
    } finally {
      setIsBulkValidating(false);
    }
  };

  const handleValidateSingleIncident = useCallback(async (incidentId: number) => {
    try {
      const response = await fetch(`/api/incidents/${incidentId}/validate`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Error al validar incidencia individual');

      toast({
        title: '✅ Incidencia validada',
        description: `La incidencia #${incidentId} ha sido marcada como resuelta.`,
      });

      if (onDocumentChanged) onDocumentChanged();
    } catch (error) {
      console.error('Error validating single incident:', error);
      toast({
        title: 'Error',
        description: 'No se pudo validar la incidencia.',
        variant: 'destructive',
      });
    }
  }, [onDocumentChanged, toast]);



  const columns = useMemo(() => {
    const cols = getColumns(
      handleUpdate as any,
      handleSummarize,
      handleDeleteClick,
      handleConfirmClick,
      handlePreviewClick,
      handleValidateIncident,
      handleValidateSingleIncident,
      showConfirmButton,
      isIncidentsPage,
      duplicates,
      customTypes,
      onMove,
      footerValues
    );
    // 🔧 FIX Z-INDEX: Ajustar columna de acciones
    if (cols.length > 0 && cols[0].id === 'actions') {
      const originalCell = cols[0].cell as any;
      cols[0].cell = (props) => (
        <div className="relative z-[100] flex justify-center w-full">
          {originalCell(props)}
        </div>
      );
    }
    return cols;
  }, [handleUpdate, showConfirmButton, duplicates]);

  const previewUrl = docToPreview?.archivos?.[0]?.ruta_archivo;
  const previewName = docToPreview?.archivos?.[0]?.nombre_archivo || `documento_${docToPreview?.id_documento}.pdf`;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {documents.length} documento(s)
            </span>
            {duplicates.size > 0 && (
              <button 
                onClick={() => setIsDuplicateDetailsOpen(true)}
                className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 hover:bg-amber-100 dark:hover:bg-amber-900/30 px-2 py-1 rounded-md transition-colors cursor-pointer"
              >
                <span className="inline-block w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
                {duplicates.size} duplicado(s)
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-md border bg-muted/40 p-0.5">
              <Button
                type="button"
                variant={viewMode === 'stacked' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2 gap-1.5"
                onClick={() => setViewMode('stacked')}
                title="Vista en 2–3 líneas"
              >
                <Rows3 className="h-3.5 w-3.5" />
                <span className="text-xs hidden sm:inline">Líneas</span>
              </Button>
              <Button
                type="button"
                variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2 gap-1.5"
                onClick={() => setViewMode('table')}
                title="Vista tabla"
              >
                <Table2 className="h-3.5 w-3.5" />
                <span className="text-xs hidden sm:inline">Tabla</span>
              </Button>
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
        </div>

        <div className="relative w-full group" data-tutorial="documents-table">
          {viewMode === 'stacked' ? (
            <DocumentsStackedList
              documents={documents}
              isIncidentsPage={isIncidentsPage}
              showConfirmButton={showConfirmButton}
              duplicates={duplicates}
              onValidateIncident={handleValidateIncident}
              onConfirm={handleConfirmClick}
              onPreview={handlePreviewClick}
              onDelete={handleDeleteClick}
            />
          ) : (
          <div className="w-full rounded-lg border border-border/50 shadow-sm transition-all duration-300 hover:shadow-md hover:border-border overflow-hidden">
            <DataTable
              columns={columns}
              data={documents}
              hiddenColumns={hiddenColumns}
              filename={filename}
              onRowClick={handleRowClick}
              viewId={viewId}
              enableColumnPersistence={enableColumnPersistence}
              // Pasar props de selección
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              // Drag entre tabs
              onDragStart={onDragStart}
              // Exportación con Resumen IVA
              exportContext={exportContext}
              includeSummary={true}
            />
          </div>
          )}

          {viewMode === 'table' && (
          <div className="text-center text-xs text-muted-foreground mt-2 py-1 flex items-center justify-center gap-2 opacity-70">
            <span className="font-medium">
              Scroll horizontal disponible arriba y abajo de la tabla
            </span>
          </div>
          )}
        </div>

        {/* 🆕 FLOATING BULK ACTIONS BAR */}
        {selectedIds.length > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-4 fade-in duration-300 pointer-events-none">
            <div className="glass-panel pointer-events-auto rounded-full px-6 py-3 shadow-2xl flex items-center gap-4 border border-primary/20 bg-background/80 backdrop-blur-xl">
              <span className="text-sm font-medium text-foreground whitespace-nowrap">
                <span className="font-bold text-primary">{selectedIds.length}</span> seleccionados
              </span>
              <div className="h-4 w-px bg-border"></div>

              <Button
                variant="outline"
                size="sm"
                className="rounded-full h-9 px-5 shadow-sm hover:shadow-md transition-all border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-900/30"
                onClick={handleBulkValidate}
                disabled={isBulkValidating || isBulkDeleting}
              >
                {isBulkValidating ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    Validando...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Validar
                  </span>
                )}
              </Button>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleBulkDelete}
                      disabled={isBulkDeleting || isBulkValidating || hasLockedSelected}
                      className="rounded-full h-9 px-5 shadow-sm hover:shadow-md transition-all disabled:opacity-50"
                    >
                      {isBulkDeleting ? (
                        <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                      ) : (
                        <Trash2 className="h-4 w-4 mr-2" />
                      )}
                      Eliminar {selectedIds.length > 1 ? `(${selectedIds.length})` : ''}
                    </Button>
                  </div>
                </TooltipTrigger>
                {hasLockedSelected && (
                  <TooltipContent side="top" className="bg-destructive text-destructive-foreground border-none">
                    <p className="flex items-center gap-2 text-xs font-bold">
                      <Lock className="h-3 w-3" />
                      No se puede eliminar: Selección contiene trimestres cerrados
                    </p>
                  </TooltipContent>
                )}
              </Tooltip>

              {customTypes.length > 0 && onMove && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full h-9 px-4 shadow-sm hover:shadow-md transition-all border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-900/30"
                    >
                      <MoreHorizontal className="h-4 w-4 mr-2" />
                      Mover
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" className="z-[100000] rounded-xl p-2 shadow-2xl border-primary/20">
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Mover {selectedIds.length} documentos a...
                    </div>
                    {customTypes.map((tipo) => (
                      <DropdownMenuItem
                        key={tipo}
                        onClick={() => {
                          onMove(selectedIds, tipo);
                          setRowSelection({});
                        }}
                        className="cursor-pointer rounded-lg mb-1 last:mb-0"
                      >
                        <Folder className="mr-2 h-4 w-4 text-primary" />
                        {tipo}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        onMove(selectedIds, UNCLASSIFIED || 'No clasificado');
                        setRowSelection({});
                      }}
                      className="cursor-pointer rounded-lg"
                    >
                      <Folder className="mr-2 h-4 w-4 text-muted-foreground" />
                      No clasificado
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setRowSelection({})}
                className="rounded-full h-8 w-8 ml-1 p-0 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <span className="sr-only">Cancelar</span>
                <div className="h-4 w-4 font-bold">✕</div>
              </Button>
            </div>
          </div>
        )}
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

      <AlertDialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
        <AlertDialogContent className="max-w-lg transition-all duration-300 animate-in fade-in zoom-in-95">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-lg">
              <Trash2 className="h-5 w-5 text-destructive" />
              ¿Eliminar {selectedIds.length} documentos?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm space-y-2 pt-2">
              <p>
                Esta acción <span className="font-semibold text-destructive">no se puede deshacer</span>.
                Estás a punto de eliminar permanentemente <span className="font-bold text-foreground">{selectedIds.length} documentos</span> seleccionados.
              </p>

              {/* Warning si se eliminan todos los documentos (vacía carpeta) */}
              {documents.length === selectedIds.length && (
                <div className="bg-amber-500/10 p-3 rounded-md border border-amber-500/20 text-amber-600 dark:text-amber-400 text-sm font-medium mt-2">
                  ⚠️ Advertencia: Al eliminar todos los documentos, <span className="font-bold">esta carpeta también se eliminará</span> automáticamente.
                </div>
              )}

              <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 space-y-1">
                <p className="text-xs font-medium text-destructive flex items-center gap-2">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-destructive animate-pulse"></span>
                  Consecuencias:
                </p>
                <ul className="text-xs text-muted-foreground space-y-0.5 pl-3.5">
                  <li>• Se eliminarán los {selectedIds.length} documentos y sus archivos.</li>
                  <li>• Se perderán datos de IVA, líneas y empresas asociadas.</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel disabled={isBulkDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmBulkDelete}
              disabled={isBulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-destructive/30"
            >
              {isBulkDeleting ? 'Eliminando...' : `Eliminar ${selectedIds.length} documentos`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ALERT DIALOGS EXISTENTES... */}
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
      </AlertDialog><AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
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

      {/* 🆕 MODAL DE DETALLES DE DUPLICADOS */}
      <Dialog open={isDuplicateDetailsOpen} onOpenChange={setIsDuplicateDetailsOpen}>
        <DialogContent className="max-w-xl transition-all duration-300">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 bg-amber-500 rounded-full animate-pulse"></span>
              Detalle de Documentos Duplicados
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4 max-h-[60vh] overflow-y-auto">
            {duplicateGroups && duplicateGroups.length > 0 ? (
              duplicateGroups.map((group, idx) => (
                <div key={idx} className="bg-muted/30 p-3 rounded-lg border border-border">
                  <div className="font-semibold text-sm mb-2 text-foreground">
                    Factura N°: <span className="font-mono text-amber-600 dark:text-amber-400">{group.numero}</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {(group.docs && group.docs.length > 0 ? group.docs : group.ids.map(id => ({ id, tipo: 'Desconocido', seccion: 'Desconocido' }))).map(doc => (
                      <div key={doc.id} className="flex items-center gap-3">
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="h-7 text-xs shrink-0"
                          onClick={() => {
                            setIsDuplicateDetailsOpen(false);
                            router.push(`/documento/${doc.id}`);
                          }}
                        >
                          Ir a doc #{doc.id}
                        </Button>
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center">
                          <span className="text-[10px] sm:text-xs text-muted-foreground bg-muted px-2 py-0.5 sm:py-1 rounded-md capitalize border border-border">
                            {doc.tipo.toLowerCase().replace(' (sin confirmar)', '')}
                          </span>
                          {doc.empresa_nombre && (
                            <span className="text-[10px] sm:text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 sm:py-1 rounded-md border border-blue-200 dark:border-blue-800 truncate max-w-[150px]" title={doc.empresa_nombre}>
                              🏢 {doc.empresa_nombre}
                            </span>
                          )}
                          {doc.seccion && (
                            <span className="text-[10px] sm:text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 sm:py-1 rounded-md border border-amber-200 dark:border-amber-800">
                              📍 En: {doc.seccion}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No hay información detallada de grupos.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDuplicateDetailsOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}