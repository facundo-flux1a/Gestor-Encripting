'use client';

import React, { useMemo } from 'react';
import { Table as TanstackTable } from '@tanstack/react-table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Search,
  ChevronDown,
  X,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { type Document } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { ExportButton } from './export-button';

export interface DocumentsQuickFilterBarProps {
  table: TanstackTable<Document>;
  documents: Document[];
  filteredDocuments: Document[];
  filename?: string;
  // Estados de filtro multi-selección
  globalSearch: string;
  onSearchChange: (search: string) => void;
  selectedYears: number[];
  onToggleYear: (year: number) => void;
  onToggleAllYears: () => void;
  availableYears: number[];
  selectedTrimestres: number[];
  onToggleTrimestre: (q: number) => void;
  onToggleAllTrimestres: () => void;
  isMesActual: boolean;
  onToggleMesActual: () => void;
  dateFrom: string;
  onDateFromChange: (val: string) => void;
  dateTo: string;
  onDateToChange: (val: string) => void;
  onClearAll: () => void;
  mailDeCarga?: string | null;
  empresaNombre?: string;
}

const formatCurrency = (amount: number | string): string => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0,00 €';

  const fixed = Math.abs(num).toFixed(2);
  const parts = fixed.split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1];

  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${num < 0 ? '-' : ''}${formattedInteger},${decimalPart} €`;
};

export function DocumentsQuickFilterBar({
  table,
  documents,
  filteredDocuments,
  filename = 'facturas',
  globalSearch,
  onSearchChange,
  selectedYears,
  onToggleYear,
  onToggleAllYears,
  availableYears,
  selectedTrimestres,
  onToggleTrimestre,
  onToggleAllTrimestres,
  isMesActual,
  onToggleMesActual,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  onClearAll,
  mailDeCarga,
  empresaNombre,
}: DocumentsQuickFilterBarProps) {
  const { toast } = useToast();

  const handleClearDates = () => {
    onDateFromChange('');
    onDateToChange('');
  };

  // Totales en vivo calculados directamente sobre las filas filtradas
  const totals = useMemo(() => {
    let base = 0;
    let iva = 0;
    let total = 0;

    filteredDocuments.forEach((d) => {
      base += Number(d.base_imponible || 0);
      iva += Number(d.iva || 0);
      total += Number(d.total || 0);
    });

    return {
      count: filteredDocuments.length,
      base,
      iva,
      total,
    };
  }, [filteredDocuments]);

  // Label del período para nombre de archivo en exportaciones
  const periodLabel = useMemo(() => {
    const yrStr = selectedYears.length === 0 || selectedYears.length === availableYears.length
      ? 'Todos'
      : selectedYears.join('_');
    const trimStr = selectedTrimestres.length === 0
      ? ''
      : `_Q${selectedTrimestres.join('-')}`;
    const mesStr = isMesActual ? '_MesActual' : '';
    if (dateFrom || dateTo) return `${dateFrom || 'inicio'}_a_${dateTo || 'fin'}`;
    return `${yrStr}${trimStr}${mesStr}`;
  }, [selectedYears, availableYears, selectedTrimestres, isMesActual, dateFrom, dateTo]);

  // ─── ACCIÓN DE EXPORTACIÓN PDF ───────────────────────────────────────────────
  const handleExportPdf = async () => {
    if (filteredDocuments.length === 0) {
      toast({
        title: 'Sin datos',
        description: 'No hay facturas filtradas para generar el PDF.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const now = new Date().toLocaleDateString('es-ES');

      // Encabezado
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(`Listado de Facturas — ${periodLabel}`, 14, 15);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Generado: ${now} | Total documentos: ${filteredDocuments.length}`, 14, 21);

      // Línea separadora
      doc.setDrawColor(200, 200, 200);
      doc.line(14, 24, 280, 24);

      // Cabeceras de tabla
      let y = 30;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('Nº FACTURA', 14, y);
      doc.text('FECHA', 45, y);
      doc.text('CLIENTE / PROVEEDOR', 70, y);
      doc.text('NIF', 135, y);
      doc.text('TIPO', 160, y);
      doc.text('BASE (€)', 190, y, { align: 'right' });
      doc.text('IVA (€)', 225, y, { align: 'right' });
      doc.text('TOTAL (€)', 265, y, { align: 'right' });

      y += 2;
      doc.line(14, y, 280, y);
      y += 5;

      doc.setFont('helvetica', 'normal');
      filteredDocuments.forEach((d) => {
        if (y > 190) {
          doc.addPage();
          y = 15;
        }

        const num = d.numero_documento || '-';
        const f = d.fecha_emision ? new Date(d.fecha_emision).toLocaleDateString('es-ES') : '-';
        const prov = (d.proveedor || '-').substring(0, 32);
        const cif = d.cif || '-';
        const tipo = (d.tipo_documento || '-').substring(0, 16);
        const b = formatCurrency(d.base_imponible || 0);
        const i = formatCurrency(d.iva || 0);
        const t = formatCurrency(d.total || 0);

        doc.text(num, 14, y);
        doc.text(f, 45, y);
        doc.text(prov, 70, y);
        doc.text(cif, 135, y);
        doc.text(tipo, 160, y);
        doc.text(b, 190, y, { align: 'right' });
        doc.text(i, 225, y, { align: 'right' });
        doc.text(t, 265, y, { align: 'right' });

        y += 5;
      });

      // Totales
      y += 2;
      doc.line(14, y, 280, y);
      y += 6;
      doc.setFont('helvetica', 'bold');
      doc.text(`Suma (${filteredDocuments.length} facturas)`, 14, y);
      doc.text(formatCurrency(totals.base), 190, y, { align: 'right' });
      doc.text(formatCurrency(totals.iva), 225, y, { align: 'right' });
      doc.text(formatCurrency(totals.total), 265, y, { align: 'right' });

      const pdfFilename = `Facturas_${periodLabel}.pdf`;
      doc.save(pdfFilename);
      toast({
        title: '✅ PDF generado',
        description: `Descargando ${pdfFilename}`,
      });
    } catch (err: any) {
      console.error('Error al exportar PDF:', err);
      toast({
        title: 'Error al exportar PDF',
        description: err.message,
        variant: 'destructive',
      });
    }
  };

  // Helper para nombre de columna en dropdown de visibilidad
  const getHeaderName = (col: any): string => {
    const headerDef = col.columnDef.header;
    if (typeof headerDef === 'string') return headerDef;
    const readableId = col.id.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
    return readableId.charAt(0).toUpperCase() + readableId.slice(1);
  };

  const isAllYearsSelected =
    availableYears.length > 0 &&
    (selectedYears.length === 0 || selectedYears.length === availableYears.length);

  const yearButtonLabel = useMemo(() => {
    if (isAllYearsSelected) return 'Todos los años';
    if (selectedYears.length === 0) return 'Sin año';
    if (selectedYears.length === 1) return String(selectedYears[0]);
    if (selectedYears.length === 2) return selectedYears.join(', ');
    return `${selectedYears.slice(0, 2).join(', ')} (+${selectedYears.length - 2})`;
  }, [isAllYearsSelected, selectedYears]);

  return (
    <div className="space-y-3 pb-2 pt-1">
      {/* ─── FILA 1: BÚSQUEDA GENERAL, COLUMNAS Y LIMPIAR ───── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* Input Buscador */}
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por número, cliente o NIF..."
              value={globalSearch}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-9 pl-9 pr-8 text-xs rounded-lg border-border/70 bg-background/90"
            />
            {globalSearch && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Botón Columnas */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5 border-border/70">
                <span>☷ Columnas</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48 max-h-72 overflow-y-auto">
              {table
                .getAllColumns()
                .filter((col) => col.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="text-xs capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(val) => column.toggleVisibility(!!val)}
                  >
                    {getHeaderName(column)}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Botón Limpiar filtros */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="h-9 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            Limpiar filtros
          </Button>
        </div>
      </div>

      {/* ─── FILA 2: FILTRO TEMPORAL RÁPIDO CON CHECKBOXES Y MULTI-SELECCIÓN ───── */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {/* Selector de Años con Popover Multi-check */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs font-semibold gap-1.5 px-2.5 bg-muted/40 hover:bg-muted border-border/70 cursor-pointer"
            >
              <span>{yearButtonLabel}</span>
              <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-48 p-2 space-y-1 text-xs shadow-lg border-border/80">
            <div
              className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded cursor-pointer select-none font-medium text-xs transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onToggleAllYears();
              }}
            >
              <Checkbox
                checked={isAllYearsSelected}
                className="pointer-events-none"
              />
              <span>Todos los años</span>
            </div>
            <div className="h-px bg-border my-1" />
            {availableYears.map((y) => {
              const isChecked = isAllYearsSelected || selectedYears.includes(y);
              return (
                <div
                  key={y}
                  className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded cursor-pointer select-none text-xs transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleYear(y);
                  }}
                >
                  <Checkbox
                    checked={isChecked}
                    className="pointer-events-none"
                  />
                  <span>{y}</span>
                </div>
              );
            })}
          </PopoverContent>
        </Popover>

        {/* Píldoras de Trimestres (1T, 2T, 3T, 4T) - Multi-selección con clic */}
        {([1, 2, 3, 4] as const).map((q) => {
          const isSelected = selectedTrimestres.includes(q);
          return (
            <button
              key={q}
              type="button"
              onClick={() => onToggleTrimestre(q)}
              className={cn(
                'px-2.5 py-1 rounded-md font-medium transition-all duration-150 cursor-pointer text-xs border active:scale-95',
                isSelected
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-bold shadow-xs'
                  : 'bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60 border-border/50'
              )}
            >
              {q}T
            </button>
          );
        })}

        {/* Píldora Año (selecciona los 4 trimestres o los apaga) */}
        <button
          type="button"
          onClick={onToggleAllTrimestres}
          className={cn(
            'px-2.5 py-1 rounded-md font-medium transition-all duration-150 cursor-pointer text-xs border active:scale-95',
            selectedTrimestres.length === 4
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-bold shadow-xs'
              : 'bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60 border-border/50'
          )}
        >
          Año
        </button>

        {/* Píldora Mes actual */}
        <button
          type="button"
          onClick={onToggleMesActual}
          className={cn(
            'px-2.5 py-1 rounded-md font-medium transition-all duration-150 cursor-pointer text-xs border active:scale-95',
            isMesActual
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-bold shadow-xs'
              : 'bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60 border-border/50'
          )}
        >
          Mes actual
        </button>

        {/* Separador sutil */}
        <span className="text-muted-foreground/40 mx-1">|</span>

        {/* Rango de Fechas manual (desde / hasta sobre Fecha Contable) */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>desde</span>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            className="h-7 w-32 text-[11px] px-2 rounded border-border/60 bg-background"
          />
          <span>hasta</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            className="h-7 w-32 text-[11px] px-2 rounded border-border/60 bg-background"
          />
          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={handleClearDates}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60"
              title="Limpiar rango de fechas"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* ─── FILA 3: ACCIONES DE SALIDA (EXCEL COMPLETO CON ENVÍO / PDF / TOTALES) ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-border/40">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">
            Sacar listado:
          </span>

          {/* Menú Excel completo con opciones avanzadas, MinIO y envío por Correo */}
          <ExportButton
            columns={table.getVisibleFlatColumns() as any}
            data={
              table.getFilteredSelectedRowModel().rows.length > 0
                ? (table.getFilteredSelectedRowModel().rows as any)
                : (table.getFilteredRowModel().rows as any)
            }
            filename={filename}
            exportContext="documentos"
            includeSummary={true}
            directPopover={true}
            mailDeCarga={mailDeCarga}
            empresaNombre={empresaNombre}
            customTrigger={
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs gap-1.5 font-medium border-border/70 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/30 transition-all cursor-pointer"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500" />
                <span>Excel / Enviar</span>
                <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
              </Button>
            }
          />

          {/* Botón PDF directo */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPdf}
            className="h-8 px-3 text-xs gap-1.5 font-medium border-border/70 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/30 transition-all cursor-pointer"
          >
            <FileText className="h-3.5 w-3.5 text-rose-400" />
            <span>PDF</span>
          </Button>
        </div>

        {/* Resumen de totales */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="text-muted-foreground font-sans">
            Suma de las <strong className="text-foreground">{totals.count}</strong> filas filtradas
          </span>
          <span>
            Base: <strong className="text-foreground">{formatCurrency(totals.base)}</strong>
          </span>
          <span>
            IVA: <strong className="text-foreground">{formatCurrency(totals.iva)}</strong>
          </span>
          <span>
            Total: <strong className="text-emerald-400 font-bold">{formatCurrency(totals.total)}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}
