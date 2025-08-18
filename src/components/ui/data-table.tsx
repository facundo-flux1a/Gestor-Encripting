
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
  Table as ReactTable,
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
} from '@dnd-kit/core';
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import { arrayMove, SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
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
import { ChevronDown, GripVertical, ArrowUpDown, X, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
}

// Draggable Header Cell Component
const DraggableTableHeader = <TData, TValue>({
  header,
  table,
}: {
  header: any;
  table: ReactTable<TData>;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: header.column.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: header.getSize(),
    position: 'relative',
  };
  
  const { setSelectedColumnId, selectedColumnId } = (table.options.meta as any);

  return (
    <TableHead
      ref={setNodeRef}
      style={style}
      className="p-2 whitespace-nowrap group"
      onClick={() => setSelectedColumnId(header.column.id)}
    >
      <div className="flex items-center gap-1">
        <Button
            variant="ghost"
            size="sm"
            {...attributes}
            {...listeners}
            className="cursor-grab p-1 h-auto"
            >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
        </Button>
         <Button
            variant="ghost"
            onClick={() => header.column.toggleSorting(header.column.getIsSorted() === 'asc')}
            className={`p-1 h-auto font-bold text-xs ${selectedColumnId === header.column.id ? 'ring-2 ring-primary rounded' : ''}`}
        >
            {flexRender(header.column.columnDef.header, header.getContext())}
            <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      </div>
    </TableHead>
  );
};

export function DataTable<TData, TValue>({
  columns,
  data,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [columnOrder, setColumnOrder] = React.useState<string[]>(
    columns.map((c) => (c as any).accessorKey || c.id!).filter(Boolean)
  );

  const [globalFilter, setGlobalFilter] = React.useState('');
  const [selectedColumnId, setSelectedColumnId] = React.useState<string | null>(null);
  const [filterInput, setFilterInput] = React.useState('');


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
    meta: {
      selectedColumnId,
      setSelectedColumnId
    }
  });

  const handleFilterKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && filterInput.trim() !== '') {
        if (selectedColumnId) {
            table.getColumn(selectedColumnId)?.setFilterValue(filterInput);
        } else {
            setGlobalFilter(filterInput);
        }
    }
  };

  const removeFilter = (columnId: string) => {
    table.getColumn(columnId)?.setFilterValue(undefined);
    if (columnId === 'global') {
        setGlobalFilter('');
    }
  }
  
  const getHeaderName = (columnId: string) => {
    const col = columns.find(c => (c as any).accessorKey === columnId || c.id === columnId);
    if (typeof col?.header === 'string') return col.header;
    return columnId;
  }

  React.useEffect(() => {
    // When a column is selected, clear the global filter and vice versa
    if(selectedColumnId) {
        setGlobalFilter('');
    }
  }, [selectedColumnId]);


  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setColumnOrder((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over!.id as string);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  );
  
  const activeFilters = columnFilters.filter(f => f.value);
  const hasGlobalFilter = globalFilter.trim() !== '';

  return (
    <div className="space-y-4">
      {/* Controls: Filter input and column visibility */}
      <div className='flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row'>
        <div className="flex-1 w-full sm:w-auto">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                 <Input
                    placeholder={
                        selectedColumnId 
                        ? `Buscar en "${getHeaderName(selectedColumnId)}"... (Presiona Enter)`
                        : 'Buscar en todas las columnas... (Presiona Enter)'
                    }
                    value={filterInput}
                    onChange={(e) => setFilterInput(e.target.value)}
                    onKeyDown={handleFilterKeyDown}
                    className="h-10 pl-10 w-full max-w-sm"
                />
            </div>
            {(activeFilters.length > 0 || hasGlobalFilter) && (
                 <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-sm font-medium">Filtros:</span>
                    {hasGlobalFilter && (
                         <Badge variant="secondary" className="pl-2">
                           Global: "{globalFilter}"
                            <Button variant="ghost" size="icon" className="ml-1 h-5 w-5 p-0" onClick={() => { setGlobalFilter(''); setFilterInput(''); }}>
                                <X className="h-3 w-3" /><span className="sr-only">Remover</span>
                            </Button>
                        </Badge>
                    )}
                    {activeFilters.map(({ id, value }) => (
                        <Badge key={id} variant="secondary" className="pl-2">
                           {getHeaderName(id)}: "{value as string}"
                            <Button variant="ghost" size="icon" className="ml-1 h-5 w-5 p-0" onClick={() => removeFilter(id)}>
                                <X className="h-3 w-3" /><span className="sr-only">Remover</span>
                            </Button>
                        </Badge>
                    ))}
                    <Button variant="link" size="sm" className="h-auto p-0" onClick={() => { table.resetColumnFilters(); setGlobalFilter(''); }}>
                        Limpiar todo
                    </Button>
                 </div>
            )}
        </div>
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
            <Button variant="outline" className="ml-auto">
                Columnas <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
            {table.getAllColumns().filter((column) => column.getCanHide()).map((column) => {
                const header = typeof column.columnDef.header === 'string' 
                    ? column.columnDef.header 
                    : (column.id.includes('_') ? column.id.replace('_', ' ') : column.id);

                return (
                <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                >
                    {header}
                </DropdownMenuCheckboxItem>
                );
            })}
            </DropdownMenuContent>
        </DropdownMenu>
      </div>


      {/* Table */}
       <DndContext
            collisionDetection={closestCenter}
            modifiers={[restrictToHorizontalAxis]}
            onDragEnd={handleDragEnd}
            sensors={sensors}
        >
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                    <SortableContext
                        items={columnOrder}
                        strategy={horizontalListSortingStrategy}
                    >
                        {headerGroup.headers.map((header) => (
                         <DraggableTableHeader key={header.id} header={header} table={table} />
                        ))}
                    </SortableContext>
                    </TableRow>
                ))}
                </TableHeader>
                <TableBody>
                {table.getRowModel().rows?.length ? (
                    table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                        {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} style={{ width: cell.column.getSize() }} className="whitespace-nowrap">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                        ))}
                    </TableRow>
                    ))
                ) : (
                    <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                        No hay resultados.
                    </TableCell>
                    </TableRow>
                )}
                </TableBody>
            </Table>
        </div>
      </DndContext>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="flex-1 text-sm text-muted-foreground">
          {table.getFilteredRowModel().rows.length} fila(s).
        </div>
        <div className="flex items-center space-x-2">
            <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
            >
                Anterior
            </Button>
            <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
            >
                Siguiente
            </Button>
        </div>
      </div>
    </div>
  );
}
