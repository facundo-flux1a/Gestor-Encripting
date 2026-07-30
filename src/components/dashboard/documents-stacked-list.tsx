'use client';

import { CheckCircle, Eye, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Document, IvaDetail } from '@/lib/types';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const formatCurrency = (amount: number | string): string => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0,00 €';

  const fixed = num.toFixed(2);
  const [integerPart, decimalPart] = fixed.split('.');
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formattedInteger},${decimalPart} €`;
};

const formatDate = (value: string | null | undefined): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Madrid',
  });
};

const getIva = (details: IvaDetail[] | undefined, rate: number) => {
  const detail = details?.find((i) => Number(i.porcentaje) === rate);
  return {
    base: detail?.base_imponible ?? 0,
    cuota: detail?.cuota ?? 0,
  };
};

const getRetencion = (details: IvaDetail[] | undefined) => {
  const detail = details?.find((i) => i.tipo_impuesto?.toLowerCase() === 'retencion');
  return detail?.cuota ?? 0;
};

const getRecargo = (details: IvaDetail[] | undefined) => {
  return (details ?? [])
    .filter((i) => {
      const tipo = i.tipo_impuesto?.toLowerCase() ?? '';
      return tipo.includes('recargo') || tipo === 're';
    })
    .reduce((sum, i) => sum + (Number(i.cuota) || 0), 0);
};

const trimestreClass: Record<number, string> = {
  1: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  2: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  3: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  4: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
};

function MoneyChip({
  label,
  value,
  emphasize = false,
  hideZero = false,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
  hideZero?: boolean;
}) {
  if (hideZero && !value && !emphasize) return null;
  return (
    <span className={`inline-flex items-baseline gap-1 whitespace-nowrap ${emphasize ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
      <span className="text-[10px] uppercase tracking-wide opacity-70">{label}</span>
      <span className="text-xs tabular-nums text-foreground">{formatCurrency(value)}</span>
    </span>
  );
}

export function DocumentsStackedList({
  documents,
  isIncidentsPage = false,
  showConfirmButton = false,
  duplicates,
  onValidateIncident,
  onConfirm,
  onPreview,
  onDelete,
}: {
  documents: Document[];
  isIncidentsPage?: boolean;
  showConfirmButton?: boolean;
  duplicates: Set<number>;
  onValidateIncident: (doc: Document) => void;
  onConfirm: (doc: Document) => void;
  onPreview: (doc: Document) => void;
  onDelete: (doc: Document) => void;
}) {
  const searchParams = useSearchParams();
  const highlightIdParam = searchParams?.get('highlight');
  const [highlightId, setHighlightId] = useState<string | null>(null);

  useEffect(() => {
    if (highlightIdParam) {
      setHighlightId(highlightIdParam);
      
      // Limpiar la URL sin recargar la pagina para que no vuelva a saltar al recargar o usar el historial
      const url = new URL(window.location.href);
      url.searchParams.delete('highlight');
      window.history.replaceState({}, '', url.toString());

      const timer = setTimeout(() => {
        setHighlightId(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightIdParam]);

  if (documents.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No hay documentos para mostrar.
      </div>
    );
  }

  return (
    <div className="max-h-[min(70vh,calc(100vh-16rem))] overflow-y-auto rounded-lg border border-border/50 divide-y divide-border/60">
      {documents.map((doc) => {
        const hasFile = doc.archivos?.length > 0 && !!doc.archivos[0]?.ruta_archivo;
        const incidenciasActivas = doc.incidencias?.filter((i) => !i.validado) ?? [];
        const hasLegacyIncident = incidenciasActivas.length === 0 && doc.incidencia && doc.incidencia_razon;
        const showValidate = isIncidentsPage && (incidenciasActivas.length > 0 || !!hasLegacyIncident);
        const isDuplicate = duplicates.has(doc.id_documento);
        const isClosed = !!doc.trimestre_cerrado;
        const isHighlighted = highlightId === String(doc.id_documento);

        const iva21 = getIva(doc.iva_details, 21);
        const iva10 = getIva(doc.iva_details, 10);
        const iva4 = getIva(doc.iva_details, 4);
        const iva0 = getIva(doc.iva_details, 0);
        const retencion = getRetencion(doc.iva_details);
        const recargo = getRecargo(doc.iva_details);

        const incidentText =
          incidenciasActivas.length > 1
            ? `${incidenciasActivas.length} incidencias: ${incidenciasActivas.map((i) => i.descripcion).join(' · ')}`
            : incidenciasActivas[0]?.descripcion || doc.incidencia_razon || null;

        return (
          <article
            key={doc.id_documento}
            className={`px-3 py-2.5 space-y-1.5 relative transition-colors duration-1000 ${
              isHighlighted 
                ? 'bg-purple-500/30 z-10' 
                : isDuplicate 
                  ? 'bg-amber-50/60 dark:bg-amber-950/20 hover:bg-muted/40' 
                  : 'hover:bg-muted/40'
            }`}
          >
            {/* Línea 1 — identidad + acciones */}
            <div className="flex items-start gap-2 min-w-0">
              <div className="flex items-center gap-0.5 shrink-0 -ml-1">
                {showValidate && (
                  <Tooltip delayDuration={300}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        className="h-7 w-7 p-0 text-amber-600 hover:text-green-600"
                        onClick={() => onValidateIncident(doc)}
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Validar incidencias</TooltipContent>
                  </Tooltip>
                )}
                {showConfirmButton && (
                  <Tooltip delayDuration={300}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        className="h-7 w-7 p-0 text-green-600"
                        onClick={() => onConfirm(doc)}
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Confirmar documento</TooltipContent>
                  </Tooltip>
                )}
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      className="h-7 w-7 p-0 text-blue-600"
                      onClick={() => onPreview(doc)}
                      disabled={!hasFile}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{hasFile ? 'Ver documento' : 'Sin archivo'}</TooltipContent>
                </Tooltip>
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive"
                      onClick={() => onDelete(doc)}
                      disabled={isClosed}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isClosed ? 'Trimestre cerrado' : 'Eliminar'}</TooltipContent>
                </Tooltip>
              </div>

              <div className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm leading-snug">
                <span className="font-mono text-xs text-muted-foreground">#{doc.id_documento}</span>
                <span className="font-semibold truncate">{doc.numero_documento || 'Sin nº'}</span>
                <span className="text-muted-foreground">·</span>
                <span className="truncate">{doc.tipo_documento || '—'}</span>
                <span className="text-muted-foreground">·</span>
                <span className="font-medium truncate max-w-[14rem]" title={doc.proveedor}>
                  {doc.proveedor || 'Sin proveedor'}
                </span>
                {doc.cif && (
                  <span className="text-xs text-muted-foreground font-mono">{doc.cif}</span>
                )}
                {doc.empresa_nombre && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <span className="truncate text-muted-foreground max-w-[12rem]" title={doc.empresa_nombre}>
                      {doc.empresa_nombre}
                    </span>
                  </>
                )}
                {isDuplicate && (
                  <span className="text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded">
                    Duplicado
                  </span>
                )}
              </div>
            </div>

            {/* Línea 2 — fechas, trimestre, incidencias, concepto */}
            <div className="pl-8 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-snug">
              <span className="text-muted-foreground whitespace-nowrap">
                Contable <span className="text-foreground font-medium">{formatDate(doc.fecha_emision)}</span>
              </span>
              <span className="text-muted-foreground whitespace-nowrap">
                Vence <span className="text-foreground font-medium">{formatDate(doc.fecha_vencimiento)}</span>
              </span>
              <span className="text-muted-foreground whitespace-nowrap">
                Carga <span className="text-foreground font-medium">{formatDate(doc.fecha_creacion)}</span>
              </span>
              {doc.año_trimestre && doc.num_trimestre ? (
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    trimestreClass[doc.num_trimestre] || 'bg-muted text-muted-foreground'
                  }`}
                >
                  Q{doc.num_trimestre} {doc.año_trimestre}
                </span>
              ) : (
                <span className="text-muted-foreground">Sin trimestre</span>
              )}
              {doc.observaciones && (
                <span className="text-muted-foreground truncate max-w-full sm:max-w-[28rem]" title={doc.observaciones}>
                  {doc.observaciones}
                </span>
              )}
              {incidentText && (
                <span
                  className="w-full sm:w-auto text-amber-700 dark:text-amber-300 font-medium truncate max-w-full"
                  title={incidentText}
                >
                  ⚠ {incidentText}
                </span>
              )}
            </div>

            {/* Línea 3 — importes IVA / totales */}
            <div className="pl-8 flex flex-wrap items-center gap-x-3 gap-y-1">
              <MoneyChip label="B21" value={iva21.base} />
              <MoneyChip label="I21" value={iva21.cuota} />
              <MoneyChip label="B10" value={iva10.base} />
              <MoneyChip label="I10" value={iva10.cuota} />
              <MoneyChip label="B4" value={iva4.base} />
              <MoneyChip label="I4" value={iva4.cuota} />
              <MoneyChip label="B0" value={iva0.base} />
              <MoneyChip label="Ret" value={retencion} />
              <MoneyChip label="RE" value={recargo} />
              <span className="hidden sm:inline text-border">|</span>
              <MoneyChip label="Base" value={doc.base_imponible} emphasize />
              <MoneyChip label="IVA" value={doc.iva} emphasize />
              <MoneyChip label="Total" value={doc.total} emphasize />
            </div>
          </article>
        );
      })}
    </div>
  );
}
