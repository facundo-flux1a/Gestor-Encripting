
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
  Row,
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
import { ChevronDown, GripVertical, ArrowUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';


interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  hiddenColumns?: string[];
}

// Draggable Header Cell Component
const DraggableTableHeader = <TData, TValue>({
  header,
}: {
  header: any;
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
  
  const isSelectColumn = header.column.id === 'select';

  return (
    <TableHead
      ref={setNodeRef}
      style={style}
      className={cn("p-0 whitespace-nowrap group relative bg-muted/50")}
    >
        <div className="flex items-center h-full">
            {!isSelectColumn && (
                 <Button
                    variant="ghost"
                    size="sm"
                    {...attributes}
                    {...listeners}
                    className="cursor-grab p-2 h-full"
                    >
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                </Button>
            )}
            <div
                className={cn(
                    "flex items-center text-left w-full h-full px-2 py-3",
                    isSelectColumn ? "justify-center" : "cursor-pointer"
                )}
                 onClick={header.column.getToggleSortingHandler()}
            >
                <span className="font-bold text-xs">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                </span>
                {!isSelectColumn && <ArrowUpDown className="ml-2 h-3 w-3" />}
            </div>
        </div>
    </TableHead>
  );
};


// Draggable Table Row Component
const DraggableTableRow = <TData,>({
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
    } = useSortable({
        id: row.original.id,
    });
    
    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        position: 'relative',
        zIndex: 1,
    };

    return (
        <TableRow
            ref={setNodeRef}
            style={style}
            data-state={row.getIsSelected() && 'selected'}
        >
            <TableCell className="w-12 sticky left-0 bg-background/95">
                <Button
                    variant="ghost"
                    size="icon"
                    {...attributes}
                    {...listeners}
                    className="cursor-grab p-2 h-8 w-8"
                >
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                </Button>
            </TableCell>
            {row.getVisibleCells().map(cell => (
                <TableCell key={cell.id} style={{ width: cell.column.getSize() }} className="whitespace-nowrap">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
            ))}
        </TableRow>
    );
};


export function DataTable<TData, TValue>({
  columns,
  data,
  hiddenColumns = []
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  
  const [dataState, setDataState] = React.useState(data);

  React.useEffect(() => {
    setDataState(data);
  }, [data]);
  
  const defaultColumnOrder = React.useMemo(() => 
    columns.map((c) => (c as any).accessorKey || c.id!).filter(Boolean),
    [columns]
  );
  const [columnOrder, setColumnOrder] = React.useState<string[]>(defaultColumnOrder);


  const [globalFilter, setGlobalFilter] = React.useState('');

  React.useEffect(() => {
    const initialVisibility: VisibilityState = {};
    hiddenColumns.forEach(col => {
      initialVisibility[col] = false;
    });
    setColumnVisibility(initialVisibility);
  }, [hiddenColumns]);

  const table = useReactTable({
    data: dataState,
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
        updateData: (rowIndex: number, columnId: string, value: unknown) => {
            setDataState(old => old.map((row, index) => {
                if (index === rowIndex) {
                    return {
                        ...old[rowIndex],
                        [columnId]: value,
                    }
                }
                return row;
            }))
        }
    }
  });

  const getHeaderName = (columnId: string) => {
    const col = table.getColumn(columnId);
    if (!col) return columnId;
    const header = col.columnDef.header;
    if (typeof header === 'string') return header;
    const readableId = columnId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    return readableId.charAt(0).toUpperCase() + readableId.slice(1);
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
       if (active.id.toString().startsWith('col-')) {
          setColumnOrder((items) => {
            const oldIndex = items.indexOf(active.id as string);
            const newIndex = items.indexOf(over!.id as string);
            return arrayMove(items, oldIndex, newIndex);
          });
       } else {
            setDataState((items) => {
                const oldIndex = items.findIndex(item => item.id_documento === active.id);
                const newIndex = items.findIndex(item => item.id_documento === over.id);
                return arrayMove(items, oldIndex, newIndex);
            })
       }
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, {})
  );
  
  const rows = table.getRowModel().rows;
  
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
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
            <Button variant="outline" className="ml-auto">
                Columnas <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
            {table.getAllColumns().filter((column) => column.getCanHide()).map((column) => {
                const header = getHeaderName(column.id);

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
            onDragEnd={handleDragEnd}
            sensors={sensors}
        >
        <div className="rounded-md border overflow-auto">
            <Table>
                <TableHeader className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm">
                {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                    <TableHead className="w-12 sticky left-0 bg-muted/50"></TableHead>
                    <SortableContext
                        items={columnOrder}
                        strategy={horizontalListSortingStrategy}
                    >
                        {headerGroup.headers.map((header) => (
                         <DraggableTableHeader key={header.id} header={header} />
                        ))}
                    </SortableContext>
                    </TableRow>
                ))}
                </TableHeader>
                <TableBody>
                  <SortableContext items={dataState.map(d => d.id_documento)} strategy={verticalListSortingStrategy}>
                    {rows.length > 0 ? (
                        rows.map((row) => (
                           <DraggableTableRow key={row.original.id_documento} row={row} />
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

