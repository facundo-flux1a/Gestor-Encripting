'use client';

import * as React from 'react';
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  getFacetedRowModel,
  getFacetedUniqueValues,
  type Row,
  type Header as TableHeaderType,
  type Column,
  getFacetedMinMaxValues,
  Table as TanstackTable,
  type RowSelectionState, // Import RowSelectionState
  type OnChangeFn, // Import OnChangeFn type
} from '@tanstack/react-table';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
  PointerSensor,
} from '@dnd-kit/core';
import { restrictToHorizontalAxis, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { arrayMove, SortableContext, horizontalListSortingStrategy, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ChevronDown, GripVertical, ArrowUpDown, Search, ChevronLeft, ChevronRight, RotateCcw, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ExportButton } from '@/components/dashboard/export-button';
import { Skeleton } from './skeleton';
import { useColumnOrder } from '@/hooks/use-column-order'; // 🆕 NUEVO


interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  hiddenColumns?: string[];
  filename: string;
  onRowClick?: (row: TData) => void;
  // 🆕 NUEVAS PROPS PARA PERSISTENCIA
  viewId?: string; // Identificador único de la vista (ej: "documentos-sin-confirmar")
  enableColumnPersistence?: boolean; // Activar/desactivar persistencia
  // 🆕 PROPS PARA SELECCIÓN EXTERNA
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  // 🆕 CALLBACK PARA DRAG ENTRE TABS
  onDragStart?: (selectedIds: number[]) => void;
  // 🆕 PROPS PARA EXPORTACIÓN CON RESUMEN IVA
  exportContext?: 'trimestres' | 'documentos' | 'documentos_emitidas' | 'documentos_recibidas' | 'otros';
  includeSummary?: boolean;
}


function Filter<TData, TValue>({
  column,
  table,
}: {
  column: Column<TData, TValue>
  table: TanstackTable<TData>
}) {
  const firstValue = table
    .getPreFilteredRowModel()
    .flatRows[0]?.getValue(column.id)

  const columnFilterValue = column.getFilterValue()

  return typeof firstValue === 'number' ? (
    <div className="flex space-x-2">
      <Input
        type="number"
        value={(columnFilterValue as [number, number])?.[0] ?? ''}
        onChange={e =>
          column.setFilterValue((old: [number, number]) => [
            e.target.value,
            old?.[1],
          ])
        }
        placeholder={`Min`}
        className="h-8 border-dashed"
      />
      <Input
        type="number"
        value={(columnFilterValue as [number, number])?.[1] ?? ''}
        onChange={e =>
          column.setFilterValue((old: [number, number]) => [
            old?.[0],
            e.target.value,
          ])
        }
        placeholder={`Max`}
        className="h-8 border-dashed"
      />
    </div>
  ) : (
    <Input
      value={Array.isArray(columnFilterValue) ? '' : (columnFilterValue ?? '') as string}
      onChange={e => column.setFilterValue(e.target.value)}
      placeholder={Array.isArray(columnFilterValue) ? 'Filtrado por grupo...' : 'Filtrar...'}
      className="h-8 border-dashed"
    />
  )
}


// Draggable Header Cell Component
const DraggableTableHeader = <TData, TValue>({
  header,
}: {
  header: TableHeaderType<TData, TValue>;
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id: `column-${header.column.id}`,
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition: 'width 250ms ease-in-out',
    width: header.getSize(),
    opacity: isDragging ? 0.5 : 1,
  };

  const isSortable = header.column.getCanSort();

  return (
    <TableHead
      ref={setNodeRef}
      style={style}
      colSpan={header.colSpan}
      className={cn("p-0 whitespace-nowrap group relative bg-muted/50")}
    >
      {header.isPlaceholder ? null : (
        <div className="flex flex-col h-full">
          <div className="flex items-center h-full">
            <Button
              variant="ghost"
              size="sm"
              {...attributes}
              {...listeners}
              className="cursor-grab p-2 h-full touch-none"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </Button>
            <div
              className={cn(
                "flex items-center text-left w-full h-full px-2 py-3",
                isSortable ? 'cursor-pointer select-none' : ''
              )}
              onClick={header.column.getToggleSortingHandler()}
            >
              <span className="font-bold text-xs">
                {flexRender(header.column.columnDef.header, header.getContext())}
              </span>
              {isSortable && (
                <ArrowUpDown className={cn(
                  "ml-2 h-3 w-3 transition-opacity duration-300",
                  header.column.getIsSorted() ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )} />
              )}
            </div>
          </div>
          {header.column.getCanFilter() ? (
            <div className="p-2 pt-0">
              <Filter column={header.column} table={header.getContext().table} />
            </div>
          ) : null}
        </div>
      )}
    </TableHead>
  );
};


// 🔥 Draggable Table Row for Documents - CON CLICK
const DraggableTableRow = <TData extends { id_documento: number; empresa_id?: number | null; numero_documento: string }>({
  row,
  onRowClick,
  rowSelection,
  data,
  onDragStartCallback,
}: {
  row: Row<TData>,
  onRowClick?: (row: TData) => void,
  rowSelection?: RowSelectionState,
  data?: TData[],
  onDragStartCallback?: (selectedIds: number[]) => void,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `row-${row.original.id_documento}`,
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 1 : undefined, // Dejar que CSS controle el z-index cuando no se arrastra
  };

  const handleDragStart = (e: React.DragEvent) => {
    const doc = row.original;
    e.dataTransfer.setData('application/json', JSON.stringify({
      id_documento: doc.id_documento,
      empresa_id: doc.empresa_id,
      numero_documento: doc.numero_documento,
    }));
    e.dataTransfer.effectAllowed = 'move';
    console.log('🚀 [Drag Start] Documento:', doc.id_documento);

    // ✅ Crear un elemento custom para el drag preview
    const dragPreview = document.createElement('div');
    dragPreview.className = 'flex items-center gap-2 bg-violet-500/90 backdrop-blur-sm text-white px-4 py-3 rounded-lg shadow-2xl border-2 border-violet-400';
    dragPreview.style.position = 'absolute';
    dragPreview.style.top = '-9999px';
    dragPreview.style.zIndex = '9999';

    // Determinar cuántos documentos se están arrastrando y el texto a mostrar
    let count = 1;
    let displayText = '';

    if (rowSelection && data && Object.keys(rowSelection).length > 0) {
      count = Object.keys(rowSelection).length;
      displayText = `${count} elementos`;
    } else {
      // Para un solo documento, mostrar su tipo
      const tipoDoc = (doc as any).tipo_documento || 'Documento';
      displayText = tipoDoc;
    }

    // Crear el contenido del preview
    dragPreview.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="16" y1="13" x2="8" y2="13"></line>
        <line x1="16" y1="17" x2="8" y2="17"></line>
        <polyline points="10 9 9 9 8 9"></polyline>
      </svg>
      <span class="font-semibold">${displayText}</span>
    `;

    document.body.appendChild(dragPreview);

    // Establecer el preview en el centro del icono
    e.dataTransfer.setDragImage(dragPreview, 60, 20);

    // Limpiar el elemento después de un momento
    setTimeout(() => {
      document.body.removeChild(dragPreview);
    }, 0);

    if (onDragStartCallback) {
      let selectedIds = [];

      // Si hay selección múltiple, usar esos IDs
      if (rowSelection && data && Object.keys(rowSelection).length > 0) {
        selectedIds = Object.keys(rowSelection)
          .map(key => data[parseInt(key)]?.id_documento)
          .filter(id => id !== undefined);
        console.log('📤 [DraggableTableRow] Arrastrando selección múltiple:', selectedIds);
      }
      // Si no hay selección, usar solo el documento actual
      else {
        selectedIds = [doc.id_documento];
        console.log('📤 [DraggableTableRow] Arrastrando documento individual:', doc.id_documento);
      }

      if (selectedIds.length > 0) {
        onDragStartCallback(selectedIds);
      }
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    console.log('🏁 [Drag End]');
  };

  const handleRowClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    const isInteractive = target.closest(
      'button, a, input, textarea, select, ' +
      '[role="button"], [role="checkbox"], ' +
      '[contenteditable="true"], ' +
      '.editable-cell, ' +
      '[data-editable="true"]'
    );

    const isEditableElement =
      target.isContentEditable ||
      target.hasAttribute('contenteditable') ||
      target.classList.contains('editable-cell') ||
      target.hasAttribute('data-editable');

    if (!isInteractive && !isEditableElement && onRowClick) {
      onRowClick(row.original);
    }
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      data-state={row.getIsSelected() && 'selected'}
      className="bg-background even:bg-muted/50 hover:bg-muted/75 cursor-pointer relative hover:z-50 transition-all duration-200"
      draggable={true}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleRowClick}
    >
      {row.getVisibleCells().map(cell => (
        <TableCell key={cell.id} style={{ width: cell.column.getSize() }} className="whitespace-nowrap p-2">
          <div className="flex items-center">
            {cell.column.id === 'select' && (
              <Button
                variant="ghost"
                size="icon"
                {...attributes}
                {...listeners}
                className="cursor-grab p-2 h-8 w-8 touch-none flex-shrink-0"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}
            <div className="flex-grow">
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </div>
          </div>
        </TableCell>
      ))}
    </TableRow>
  );
};

// Standard Table Row for other data types
const StandardTableRow = <TData,>({
  row,
}: {
  row: Row<TData>,
}) => {
  return (
    <TableRow
      data-state={row.getIsSelected() && 'selected'}
      className="bg-background even:bg-muted/50 hover:bg-muted/75"
    >
      {row.getVisibleCells().map(cell => (
        <TableCell key={cell.id} style={{ width: cell.column.getSize() }} className="whitespace-nowrap p-4">
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      ))}
    </TableRow>
  );
};


export function DataTable<TData extends object, TValue>({
  columns,
  data: initialData,
  hiddenColumns = [],
  filename,
  onRowClick,
  viewId, // 🆕 NUEVO
  enableColumnPersistence = false, // 🆕 NUEVO
  rowSelection: externalRowSelection, // 🆕 SELECCIÓN EXTERNA
  onRowSelectionChange: setExternalRowSelection, // 🆕 CALLBACK EXTERNO
  onDragStart, // 🎯 NUEVO - Drag callback
  exportContext, // 🆕 EXPORTACIÓN CON CONTEXTO
  includeSummary, // 🆕 EXPORTACIÓN CON RESUMEN
}: DataTableProps<TData, TValue>) {
  const [isMounted, setIsMounted] = React.useState(false);
  const [data, setData] = React.useState(initialData);

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  // 🆕 PAGINACIÓN CONTROLADA para forzar 100 por defecto
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 100,
  });

  // 🚨 FORCE RESET: Asegurar que siempre inicie en 100, ignorando caché
  React.useEffect(() => {
    console.log('🔄 [DataTable] Forzando inicio en 100 filas');
    setPagination(prev => ({ ...prev, pageSize: 100 }));
  }, []);

  console.log('📊 [DataTable] Pagination state:', pagination);

  // Estado local para selección si no se provee externo
  const [internalRowSelection, setInternalRowSelection] = React.useState<RowSelectionState>({});

  const rowSelection = externalRowSelection ?? internalRowSelection;
  const setRowSelection = setExternalRowSelection ?? setInternalRowSelection;

  // 🆕 NUEVO: Orden por defecto de las columnas
  const defaultColumnOrder = React.useMemo(
    () => columns.map((c) => (c as any).accessorKey || c.id!).filter(Boolean),
    [columns]
  );

  // 🆕 NUEVO: Hook para persistencia de columnas
  const {
    columnOrder: savedColumnOrder,
    setColumnOrder: saveColumnOrder,
    isLoading: isLoadingColumnOrder,
    resetOrder,
  } = useColumnOrder(
    viewId || 'default',
    defaultColumnOrder
  );

  // 🆕 NUEVO: Estado local de columnOrder
  const [columnOrder, setColumnOrder] = React.useState<string[]>(defaultColumnOrder);

  // 🆕 NUEVO: Sincronizar orden guardado con estado local
  React.useEffect(() => {
    if (enableColumnPersistence && savedColumnOrder.length > 0 && !isLoadingColumnOrder) {
      console.log('🔄 [DataTable] Aplicando orden guardado:', savedColumnOrder);
      setColumnOrder(savedColumnOrder);
    }
  }, [savedColumnOrder, enableColumnPersistence, isLoadingColumnOrder]);

  React.useEffect(() => {
    setData(initialData);
  }, [initialData]);

  React.useEffect(() => {
    setIsMounted(true);
    const initialVisibility: VisibilityState = {};
    hiddenColumns.forEach(col => {
      initialVisibility[col] = false;
    });
    setColumnVisibility(initialVisibility);
  }, [hiddenColumns]);


  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      columnOrder, // 🆕 AGREGADO
      globalFilter,
      rowSelection, // 🆕 ESTADO DE SELECCIÓN
      pagination, // 🆕 PAGINACIÓN CONTROLADA
    },
    enableRowSelection: true, // Habilitar selección
    onRowSelectionChange: setRowSelection, // 🆕 HANDLER DE SELECCIÓN
    onPaginationChange: setPagination, // 🆕 HANDLER DE PAGINACIÓN
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: (updater) => {
      // 🆕 NUEVO: Callback mejorado para guardar en Redis
      const newOrder = typeof updater === 'function'
        ? updater(columnOrder)
        : updater;

      console.log('📝 [DataTable] Orden actualizado:', newOrder);
      setColumnOrder(newOrder);

      // Guardar en Redis si está habilitado
      if (enableColumnPersistence) {
        saveColumnOrder(newOrder);
      }
    },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFacetedMinMaxValues: getFacetedMinMaxValues(),
    meta: {
      updateData: (rowIndex: number, columnId: string, value: any) => {
        setData(old =>
          old.map((row, index) => {
            if (index === rowIndex) {
              return {
                ...old[rowIndex]!,
                [columnId]: value,
              }
            }
            return row
          })
        )
      },
    },
  });

  const rowIds = React.useMemo(() => data.map(item => (item as any).id_documento), [data]);

  const getHeaderName = (col: Column<TData, unknown>): string => {
    const headerDef = col.columnDef.header;
    if (typeof headerDef === 'string') {
      return headerDef;
    }
    return col.id;
  };

  // 🆕 MODIFICADO: Guardar en Redis cuando se arrastra
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      if (active.id.toString().startsWith('column-')) {
        const oldId = active.id.toString().replace('column-', '');
        const newId = over.id.toString().replace('column-', '');

        const newColumnOrder = arrayMove(
          columnOrder,
          columnOrder.indexOf(oldId),
          columnOrder.indexOf(newId)
        );

        console.log('🎯 [DataTable] Columna arrastrada:', { oldId, newId, newOrder: newColumnOrder });
        setColumnOrder(newColumnOrder);

        // Guardar en Redis si está habilitado
        if (enableColumnPersistence) {
          saveColumnOrder(newColumnOrder);
        }
      } else if (active.id.toString().startsWith('row-')) {
        setData((items) => {
          const oldIndex = items.findIndex(item => (item as any).id_documento === rowIds[active.data.current!.sortable.index]);
          const newIndex = items.findIndex(item => (item as any).id_documento === rowIds[over.data.current!.sortable.index]);
          return arrayMove(items, oldIndex, newIndex);
        });
      }
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(MouseSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor)
  );

  const defaultRenderRow = (row: Row<TData>) => {
    const hasIdDocumento = 'id_documento' in row.original;
    if (hasIdDocumento) {
      return <DraggableTableRow
        key={(row.original as any).id_documento}
        row={row as Row<TData & { id_documento: number; empresa_id?: number | null; numero_documento: string }>}
        onRowClick={onRowClick}
        rowSelection={rowSelection}
        data={data}
        onDragStartCallback={onDragStart}
      />;
    }
    return <StandardTableRow key={row.id} row={row} />;
  }

  const tableContent = (
    <DndContext
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      sensors={sensors}
    >
      <div className="rounded-md border overflow-auto custom-scrollbar">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                <SortableContext
                  items={columnOrder.map(id => `column-${id}`)}
                  strategy={horizontalListSortingStrategy}
                >
                  {headerGroup.headers.map((header) => (
                    <DraggableTableHeader key={header.id} header={header} />
                  ))}
                </SortableContext>
              </TableRow>
            ))}
            {table.getFooterGroups().map(footerGroup => (
              <TableRow key={footerGroup.id} className="bg-secondary/80 font-medium">
                {footerGroup.headers.map(header => (
                  <TableHead key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                        header.column.columnDef.footer,
                        header.getContext()
                      )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            <SortableContext
              items={rowIds.map(id => `row-${id}`)}
              strategy={verticalListSortingStrategy}
            >
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  defaultRenderRow(row)
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length + 1} className="h-24 text-center">
                    No hay resultados.
                  </TableCell>
                </TableRow>
              )}
            </SortableContext>
          </TableBody>
        </Table>
      </div>
    </DndContext>
  )

  const skeletonContent = (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {Array.from({ length: 6 }).map((_, i) => (
                <TableHead key={i}><Skeleton className="h-5 w-24" /></TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 10 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 6 }).map((_, j) => (
                  <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Controls: Filter input and column visibility */}
      <div className='flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row'>
        <div className="flex-1 w-full sm:w-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder='Buscar en todas las columnas...'
              value={globalFilter ?? ''}
              onChange={(event) => setGlobalFilter(event.target.value)}
              className="h-10 pl-10 w-full max-w-sm"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* 🆕 NUEVO: Botón para resetear columnas */}
          {enableColumnPersistence && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                console.log('🔄 [DataTable] Reseteando columnas...');
                resetOrder();
              }}
              className="h-10"
              title="Resetear orden de columnas"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Resetear
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="ml-auto">
                Columnas <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table.getAllColumns().filter((column) => column.getCanHide()).map((column) => {
                const headerName = getHeaderName(column);

                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {headerName}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <ExportButton
            columns={table.getVisibleFlatColumns()}
            data={table.getFilteredSelectedRowModel().rows.length > 0
              ? table.getFilteredSelectedRowModel().rows
              : table.getFilteredRowModel().rows}
            filename={filename}
            exportContext={exportContext}
            includeSummary={includeSummary}
          />
        </div>
      </div>

      {isMounted ? tableContent : skeletonContent}

      {/* Pagination */}
      <div className="flex items-center justify-start gap-6 pt-4">
        {/* Filas por página */}
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium">Filas por página</p>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(value) => {
              table.setPageSize(Number(value))
            }}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 30, 40, 50, 100].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Número de página */}
        <div className="flex items-center justify-center text-sm font-medium">
          Página {table.getState().pagination.pageIndex + 1} de{" "}
          {table.getPageCount()}
        </div>

        {/* Botones de navegación */}
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Ir a la primera página</span>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Ir a la página anterior</span>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Ir a la página siguiente</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Ir a la última página</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>


  );
}