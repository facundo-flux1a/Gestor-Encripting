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
  Table as TanstackTable
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
import { ChevronDown, GripVertical, ArrowUpDown, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ExportButton } from '@/components/dashboard/export-button';
import { Skeleton } from './skeleton';


interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  hiddenColumns?: string[];
  filename: string;
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
      value={(columnFilterValue ?? '') as string}
      onChange={e => column.setFilterValue(e.target.value)}
      placeholder={`Filtrar...`}
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


// 🔥 Draggable Table Row for Documents - MODIFICADO PARA DRAG A EMPRESAS
const DraggableTableRow = <TData extends { id_documento: number; empresa_id?: number | null; numero_documento: string }>({
    row,
}: {
    row: Row<TData>,
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
        zIndex: isDragging ? 1 : 0,
    };

    // 🔥 Manejar drag hacia empresas (NUEVO)
    const handleDragStart = (e: React.DragEvent) => {
        const doc = row.original;
        e.dataTransfer.setData('application/json', JSON.stringify({
            documentId: doc.id_documento,
            empresaId: doc.empresa_id,
            numeroDocumento: doc.numero_documento,
        }));
        e.dataTransfer.effectAllowed = 'move';
        console.log('🎯 [Drag Start] Documento:', doc.id_documento, 'Empresa:', doc.empresa_id);
    };

    const handleDragEnd = (e: React.DragEvent) => {
        console.log('🏁 [Drag End]');
    };

    return (
        <TableRow
            ref={setNodeRef}
            style={style}
            data-state={row.getIsSelected() && 'selected'}
            className="bg-background even:bg-muted/50 hover:bg-muted/75 cursor-move"
            draggable={true}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
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


export function DataTable<TData, TValue>({
  columns,
  data: initialData,
  hiddenColumns = [],
  filename
}: DataTableProps<TData, TValue>) {
  const [isMounted, setIsMounted] = React.useState(false);
  const [data, setData] = React.useState(initialData);

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');

  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});

  const [columnOrder, setColumnOrder] = React.useState<string[]>(() =>
    columns.map((c) => (c as any).accessorKey || c.id!).filter(Boolean)
  );
  
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
      columnOrder,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
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
  
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
        if(active.id.toString().startsWith('column-')) {
            const oldId = active.id.toString().replace('column-', '');
            const newId = over.id.toString().replace('column-', '');
            setColumnOrder((items) => {
                const oldIndex = items.indexOf(oldId);
                const newIndex = items.indexOf(newId);
                return arrayMove(items, oldIndex, newIndex);
            });
        } else if(active.id.toString().startsWith('row-')) {
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
    if(hasIdDocumento) {
        return <DraggableTableRow key={(row.original as any).id_documento} row={row as Row<TData & { id_documento: number; empresa_id?: number | null; numero_documento: string }>} />;
    }
    return <StandardTableRow key={row.id} row={row} />;
  }
  
  const tableContent = (
     <DndContext
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        sensors={sensors}
    >
        <div className="rounded-md border overflow-auto">
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
                data={table.getRowModel().rows} 
                filename={filename} 
            />
        </div>
    </div>

    {isMounted ? tableContent : skeletonContent}

    {/* Pagination */}
    <div className="flex items-center justify-between pt-4">
        <div className="flex-1 text-sm text-muted-foreground">
        {table.getFilteredSelectedRowModel().rows.length} de{" "}
        {table.getFilteredRowModel().rows.length} fila(s) seleccionadas.
        </div>
        <div className="flex items-center space-x-6">
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
                        {[10, 20, 30, 40, 50].map((pageSize) => (
                        <SelectItem key={pageSize} value={`${pageSize}`}>
                            {pageSize}
                        </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
             <div className="flex w-[100px] items-center justify-center text-sm font-medium">
                Página {table.getState().pagination.pageIndex + 1} de{" "}
                {table.getPageCount()}
            </div>
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
    </div>
  );
}