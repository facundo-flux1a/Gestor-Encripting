'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Building, ChevronLeft, ChevronRight, Pencil, Save, AlertCircle } from 'lucide-react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';

import { Button } from '@/components/ui/button';
import { type ProviderWithStats } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

// 🎯 FUNCIÓN DE FORMATO MANUAL
const formatCurrency = (amount: number | string | null | undefined): string => {
  if (amount === null || amount === undefined) return 'N/A';

  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return 'N/A';

  const fixed = num.toFixed(2);
  const parts = fixed.split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1];

  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return `${formattedInteger},${decimalPart} €`;
};

// 🆕 Modal de edición de proveedor
function EditProviderModal({
  provider,
  open,
  onOpenChange,
  onSave,
  companyId,
}: {
  provider: ProviderWithStats | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
  companyId?: number;
}) {
  const { toast } = useToast();
  const [formData, setFormData] = React.useState({
    nombre: '',
    identificador_fiscal: '',
    direccion: '',
    telefono: '',
    email: '',
  });
  const [isSaving, setIsSaving] = React.useState(false);
  const [showWarningModal, setShowWarningModal] = React.useState(false);
  const [cuentaCompra, setCuentaCompra] = React.useState('');

  React.useEffect(() => {
    if (provider) {
      setFormData({
        nombre: provider.nombre || '',
        identificador_fiscal: provider.identificador_fiscal || '',
        direccion: provider.direccion || '',
        telefono: provider.telefono || '',
        email: provider.email || '',
      });
      setCuentaCompra(provider.cuenta_compra || '');
    }
  }, [provider]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provider) return;

    // ✅ Si el CIF cambió, mostrar modal de advertencia
    if (formData.identificador_fiscal !== provider.identificador_fiscal) {
      setShowWarningModal(true);
      return;
    }

    // Si no cambió el CIF, actualizar directamente
    await performUpdate();
  };

  const performUpdate = async () => {
    if (!provider) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/proveedores/${encodeURIComponent(provider.identificador_fiscal)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          oldFiscalId: provider.identificador_fiscal,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al actualizar el proveedor');
      }

      const result = await response.json();

      if (companyId) {
        // Enviar también configuración contable DELSOL
        try {
          const configRes = await fetch('/api/entidades-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              empresaId: companyId,
              identificadorFiscal: formData.identificador_fiscal,
              nombreReferencia: formData.nombre,
              cuentaCompra: cuentaCompra === '' ? null : cuentaCompra,
              cuentaVenta: null
            })
          });

          if (!configRes.ok) {
            console.error("Error al guardar config contable:", await configRes.text());
          }
        } catch (e) {
          console.error("Excepción al guardar config contable:", e);
        }
      }

      toast({
        title: result.merged ? "Proveedores fusionados" : "Proveedor actualizado",
        description: result.merged
          ? `Se han fusionado ambos proveedores. ${result.affectedRows} documentos actualizados.`
          : "Los cambios se han guardado correctamente",
      });
      onSave();
      onOpenChange(false);
    } catch (error) {
      console.error('Error:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo actualizar el proveedor",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!provider) return null;

  return (
    <>
      {/* Modal principal de edición */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-violet-500" />
              Editar Proveedor
            </DialogTitle>
            <DialogDescription>
              Modifica los datos del proveedor. Cambiar el CIF actualizará todas las referencias.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input
                id="nombre"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cif">CIF/NIF *</Label>
              <Input
                id="cif"
                value={formData.identificador_fiscal}
                onChange={(e) => setFormData({ ...formData, identificador_fiscal: e.target.value })}
                required
              />
              <p className="text-xs text-muted-foreground">
                Cambiar el CIF actualizará todas las referencias a este proveedor
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="direccion">Dirección</Label>
              <Input
                id="direccion"
                value={formData.direccion}
                onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="telefono">Teléfono</Label>
                <Input
                  id="telefono"
                  type="tel"
                  value={formData.telefono}
                  onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="text"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="Email o N/A"
                />
              </div>
            </div>

            {companyId && (
              <div className="pt-4 border-t">
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Building className="w-4 h-4 text-violet-500" />
                  Configuración Contable
                </h4>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="cuenta_compra" className="flex justify-between items-center">
                      <span>Cuenta Proveedor (Compras)</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs px-2 text-muted-foreground hover:text-destructive"
                            onClick={() => setCuentaCompra('')}
                            disabled={!cuentaCompra}
                          >
                            Limpiar cuenta
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          <p>Haz clic en "Guardar Cambios" después de limpiar para confirmar</p>
                        </TooltipContent>
                      </Tooltip>
                    </Label>
                    <Input
                      id="cuenta_compra"
                      value={cuentaCompra}
                      onChange={(e) => setCuentaCompra(e.target.value.trim())}
                      placeholder="Ej: 400..."
                      title="Debe ser un número de 3 a 6 dígitos"
                    />
                  </div>
                </div>
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving} className="gap-2">
                <Save className="h-4 w-4" />
                {isSaving ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de advertencia de cambio de CIF */}
      <AlertDialog open={showWarningModal} onOpenChange={setShowWarningModal}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-violet-500" />
              ⚠️ ADVERTENCIA: Cambio de CIF
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2 text-sm text-muted-foreground">
                <div>
                  Estás cambiando el CIF de <strong className="text-foreground">"{provider.identificador_fiscal}"</strong> a <strong className="text-foreground">"{formData.identificador_fiscal}"</strong>.
                </div>

                <div className="bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 rounded-lg p-3 space-y-2">
                  <div className="flex items-start gap-2 text-sm">
                    <span className="text-violet-600 dark:text-violet-400 font-bold shrink-0">⚠️</span>
                    <span>
                      Si ya existe un proveedor con el CIF <strong className="text-foreground">"{formData.identificador_fiscal}"</strong>, <strong>ambos se fusionarán en uno solo</strong>.
                    </span>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <span className="text-violet-600 dark:text-violet-400 font-bold shrink-0">📋</span>
                    <span>
                      Cambiar el CIF actualizará <strong>todas las referencias</strong> a este proveedor en tus documentos.
                    </span>
                  </div>
                </div>

                <div className="text-xs">
                  <strong>Nota:</strong> Esta acción actualizará permanentemente todos los documentos asociados con este proveedor.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowWarningModal(false);
                performUpdate();
              }}
              disabled={isSaving}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              Sí, Cambiar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export const createColumns = (
  showCompanyColumn: boolean,
  onEdit: (provider: ProviderWithStats) => void
): ColumnDef<ProviderWithStats>[] => [
    {
      accessorKey: 'nombre',
      header: 'Proveedor',
      cell: ({ row }) => {
        const provider = row.original;
        const typeQuery = (provider.rol === 'cliente' || provider.rol === 'receptor') ? '?type=cliente' : '?type=proveedor';
        return (
          <Link
            href={`/proveedores/${encodeURIComponent(provider.identificador_fiscal!)}${typeQuery}`}
            className="font-medium text-primary hover:underline flex items-center gap-1.5 sm:gap-2 group"
          >
            <Building className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
            <div className="flex flex-col min-w-0">
              <span className="text-xs sm:text-sm truncate transition-colors duration-200" title={provider.nombre}>
                {provider.nombre}
              </span>
              {showCompanyColumn && provider.empresaNombre && (
                <span className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 truncate" title={provider.empresaNombre}>
                  {provider.empresaNombre}
                </span>
              )}
            </div>
          </Link>
        );
      },
      size: 200,
      minSize: 150,
    },
    {
      accessorKey: 'identificador_fiscal',
      header: 'CIF/NIF',
      cell: ({ row }) => {
        const value = row.getValue('identificador_fiscal') as string;
        return (
          <span className="font-mono text-xs sm:text-sm break-all transition-colors duration-200 hover:text-primary" title={value}>
            {value || 'N/A'}
          </span>
        );
      },
      size: 110,
      minSize: 90,
    },
    {
      accessorKey: 'direccion',
      header: 'Dirección',
      cell: ({ row }) => {
        const value = row.getValue('direccion') as string;
        if (!value || value === 'N/A' || value === 'null') return <span className="text-muted-foreground text-[10px]">N/A</span>;
        return (
          <span className="text-xs truncate max-w-[150px] block" title={value}>
            {value}
          </span>
        );
      },
      size: 150,
      minSize: 100,
    },
    {
      accessorKey: 'telefono',
      header: 'Teléfono',
      cell: ({ row }) => {
        const value = row.getValue('telefono') as string;
        if (!value || value === 'N/A' || value === 'null') return <span className="text-muted-foreground text-[10px]">N/A</span>;
        return (
          <span className="text-xs tabular-nums" title={value}>
            {value}
          </span>
        );
      },
      size: 110,
      minSize: 80,
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => {
        const value = row.getValue('email') as string;
        if (!value || value === 'N/A' || value === 'null') return <span className="text-muted-foreground text-[10px]">N/A</span>;
        return (
          <span className="text-xs truncate max-w-[150px] block" title={value}>
            {value}
          </span>
        );
      },
      size: 150,
      minSize: 100,
    },
    {
      accessorKey: 'totalSpent',
      header: 'Gasto Total',
      cell: ({ row }) => (
        <div className="text-right font-mono text-xs sm:text-sm tabular-nums transition-colors duration-200 hover:text-primary">
          {formatCurrency(row.getValue('totalSpent'))}
        </div>
      ),
      size: 120,
      minSize: 100,
    },
    {
      accessorKey: 'cuenta_compra',
      header: 'Cta. Compra',
      cell: ({ row }) => {
        const value = row.getValue('cuenta_compra') as string;
        if (!showCompanyColumn && value) {
          return <span className="font-mono text-xs sm:text-sm">{value}</span>;
        }
        return <span className="text-xs text-muted-foreground">-</span>;
      },
      size: 100,
      minSize: 80,
    },
    {
      accessorKey: 'totalDocuments',
      header: 'Documentos',
      cell: ({ row }) => {
        const value = row.getValue('totalDocuments') as number;
        return (
          <div className="text-center text-xs sm:text-sm tabular-nums transition-colors duration-200 hover:text-primary">
            {value || 0}
          </div>
        );
      },
      size: 100,
      minSize: 80,
    },
    {
      accessorKey: 'uniqueProducts',
      header: 'Productos Únicos',
      cell: ({ row }) => {
        const value = row.getValue('uniqueProducts') as number;
        return (
          <div className="text-center text-xs sm:text-sm tabular-nums transition-colors duration-200 hover:text-primary">
            {value || 0}
          </div>
        );
      },
      size: 120,
      minSize: 100,
    },
    {
      id: 'actions',
      header: 'Acciones',
      cell: ({ row }) => {
        const provider = row.original;
        return (
          <div className="flex items-center justify-center gap-1 sm:gap-2">
            {/* Botón Editar */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(provider)}
              className="h-7 sm:h-8 gap-1 sm:gap-1.5 text-xs sm:text-sm transition-all duration-200 hover:scale-105 group"
            >
              <Pencil className="h-3 w-3 sm:h-4 sm:w-4 shrink-0 transition-transform duration-200 group-hover:rotate-12" />
              <span className="hidden sm:inline">Editar</span>
            </Button>

            {/* Botón Ver Detalles */}
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="h-7 sm:h-8 gap-1 sm:gap-1.5 text-xs sm:text-sm transition-all duration-200 hover:scale-105 group"
            >
              <Link href={`/proveedores/${encodeURIComponent(provider.identificador_fiscal!)}${(provider.rol === 'cliente' || provider.rol === 'receptor') ? '?type=cliente' : '?type=proveedor'}`}>
                <span className="hidden xs:inline">Ver</span>
                <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
            </Button>
          </div>
        );
      },
      size: 160,
      minSize: 120,
    },
  ];

export function ProvidersTable({
  providers,
  showCompanyColumn = false,
  onProviderUpdated,
  companyId
}: {
  providers: ProviderWithStats[];
  showCompanyColumn?: boolean;
  onProviderUpdated?: () => void;
  companyId?: number;
}) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [editingProvider, setEditingProvider] = React.useState<ProviderWithStats | null>(null);
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  const handleEdit = (provider: ProviderWithStats) => {
    setEditingProvider(provider);
    setIsModalOpen(true);
  };

  const handleSave = () => {
    // Recargar la lista de proveedores
    if (onProviderUpdated) {
      onProviderUpdated();
    }
  };

  const columns = React.useMemo(
    () => createColumns(showCompanyColumn, handleEdit),
    [showCompanyColumn]
  );

  const table = useReactTable({
    data: providers,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <TooltipProvider>
      <div className="space-y-3 sm:space-y-4">
        {/* Search */}
        <div className="flex items-center justify-between">
          <Input
            placeholder="Buscar proveedor..."
            value={globalFilter ?? ''}
            onChange={(event) => setGlobalFilter(event.target.value)}
            className="max-w-full sm:max-w-sm h-8 sm:h-9 text-xs sm:text-sm transition-all duration-200 focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Table with horizontal scroll on mobile */}
        <div className="w-full overflow-x-auto rounded-md border transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
          <div className="min-w-[900px]">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map(headerGroup => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map(header => (
                      <TableHead
                        key={header.id}
                        className="text-xs sm:text-sm"
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length ? (
                  table.getRowModel().rows.map((row, index) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && 'selected'}
                      className="text-xs sm:text-sm transition-all duration-200 hover:bg-muted/50 animate-fade-in"
                      style={{ animationDelay: `${index * 30}ms` }}
                    >
                      {row.getVisibleCells().map(cell => (
                        <TableCell key={cell.id} className="transition-colors duration-200">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-20 sm:h-24 text-center text-xs sm:text-sm text-muted-foreground"
                    >
                      No hay resultados.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Scroll indicator for mobile */}
        <div className="sm:hidden bg-muted/30 px-3 py-2 text-center border-t rounded-b-md">
          <p className="text-[10px] text-muted-foreground">
            ← Desliza para ver más columnas →
          </p>
        </div>

        {/* Pagination */}
        <div className="flex flex-col xs:flex-row items-center justify-between gap-2 py-2 sm:py-4">
          <div className="text-xs sm:text-sm text-muted-foreground order-2 xs:order-1">
            Página {table.getState().pagination.pageIndex + 1} de{' '}
            {table.getPageCount()}
          </div>
          <div className="flex items-center gap-2 order-1 xs:order-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="h-7 sm:h-8 gap-1 text-xs sm:text-sm transition-all duration-200 hover:scale-105 disabled:hover:scale-100"
            >
              <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
              <span className="hidden xs:inline">Anterior</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="h-7 sm:h-8 gap-1 text-xs sm:text-sm transition-all duration-200 hover:scale-105 disabled:hover:scale-100"
            >
              <span className="hidden xs:inline">Siguiente</span>
              <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
            </Button>
          </div>
        </div>
      </div>

      {/* Modal de edición */}
      <EditProviderModal
        provider={editingProvider}
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onSave={handleSave}
        companyId={companyId}
      />

      {/* Estilos de animación */}
      <style jsx global>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(5px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.3s ease-out forwards;
          opacity: 0;
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-fade-in {
            animation: none;
            opacity: 1;
            transform: none;
          }
          
          .transition-all,
          .transition-colors,
          .transition-transform {
            transition: none !important;
          }
          
          .hover\:scale-105:hover,
          .hover\:scale-110:hover,
          .hover\:translate-x-1:hover,
          .hover\:rotate-12:hover {
            transform: none !important;
          }
        }
      `}</style>
    </TooltipProvider>
  );
}