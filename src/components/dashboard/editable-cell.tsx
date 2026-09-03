'use client';

import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { DatePicker, toIsoDateString } from '@/components/ui/date-picker';
import { parseFechaLocal } from '@/lib/client-utils';
import { useToast } from '@/hooks/use-toast';
import { updateDocumentField } from '@/services/document-service';
import { cn } from '@/lib/utils';
import { Loader2, Lock, AlertTriangle } from 'lucide-react';
import type { Table } from '@tanstack/react-table';
import type { Document } from '@/lib/types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface EditableCellProps {
  initialValue: any;
  docId: number;
  fieldName: string;
  onUpdate: (docId: number, fieldName: string, value: any, table: Table<Document>, rowIndex: number) => void;
  inputType?: 'text' | 'number' | 'date';
  isCurrency?: boolean;
  table: Table<Document>;
  rowIndex: number;
  trimestre_cerrado?: number;
  isDuplicate?: boolean;
  isApiIssued?: boolean;
}

const formatCurrency = (amount: number | null | undefined, currency = 'EUR') => {
  if (amount === null || amount === undefined || isNaN(amount)) return 'N/A';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
  }).format(amount);
};

const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return 'N/A';
  try {
    const d = new Date(dateString);
    const utcDate = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return new Intl.DateTimeFormat('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'Europe/Madrid'
    }).format(utcDate);
  } catch {
    return dateString;
  }
};

export function EditableCell({
  initialValue,
  docId,
  fieldName,
  onUpdate,
  inputType = 'text',
  isCurrency = false,
  table,
  rowIndex,
  trimestre_cerrado = 0,
  isDuplicate = false,
  isApiIssued = false,
}: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const isBlurring = useRef(false);

  const isTrimesterClosed = trimestre_cerrado === 1 || isApiIssued;

  // Usar un ref para rastrear si estamos editando activamente
  const isEditingRef = useRef(false);

  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  useEffect(() => {
    // Solo actualizar el valor si NO estamos editando activamente
    if (!isEditingRef.current) {
      console.log('🔄 [EditableCell] initialValue cambió (no editando):', { docId, fieldName, initialValue });
      setValue(initialValue);
    } else {
      console.log('⏸️ [EditableCell] initialValue cambió pero ESTAMOS EDITANDO, ignorando:', { docId, fieldName, initialValue });
    }
  }, [initialValue, docId, fieldName]);

  useEffect(() => {
    if (isEditing && inputType !== 'date' && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing, inputType, docId, fieldName]);

  const normalizeDateValue = (raw: any) => {
    if (!raw) return raw;
    try {
      return toIsoDateString(parseFechaLocal(String(raw)));
    } catch {
      return raw;
    }
  };

  const saveValue = async (rawValue: any) => {
    const processedValue =
      inputType === 'number'
        ? parseFloat(rawValue)
        : inputType === 'date'
          ? normalizeDateValue(rawValue)
          : rawValue;

    const baseline =
      inputType === 'date' ? normalizeDateValue(initialValue) : initialValue;

    if (processedValue === baseline) {
      return true;
    }

    setIsLoading(true);

    try {
      const result = await updateDocumentField(docId, fieldName, processedValue);
      if (result.success) {
        table.options.meta?.updateData(rowIndex, fieldName, processedValue);
        onUpdate(docId, fieldName, processedValue, table, rowIndex);
        toast({
          title: 'Campo Actualizado',
          description: 'El campo se ha guardado correctamente.',
        });
        return true;
      }
      throw new Error('La actualización falló en el servidor.');
    } catch (error: any) {
      setValue(initialValue);
      toast({
        title: 'Error al Actualizar',
        description: error.message || 'No se pudo guardar el campo.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleBlur = async (e?: React.FocusEvent) => {
    if (isBlurring.current) return;

    if (e?.relatedTarget && (e.relatedTarget as HTMLElement).closest('.editable-cell-wrapper')) {
      return;
    }

    isBlurring.current = true;
    setIsEditing(false);

    await saveValue(value);
    isBlurring.current = false;
  };

  const handleDateChange = async (isoDate: string | null) => {
    if (!isoDate || isBlurring.current) return;
    isBlurring.current = true;
    setIsEditing(false);
    setValue(isoDate);
    await saveValue(isoDate);
    isBlurring.current = false;
  };

  const displayValue = () => {
    if (value === null || value === undefined) return 'N/A';
    if (inputType === 'date') return formatDate(value);
    if (isCurrency) return formatCurrency(value);
    return value.toString();
  };

  const formattedValueForInput = () => {
    if (value === null || value === undefined) return '';
    if (inputType === 'date' && typeof value === 'string') {
      try {
        return new Date(value).toISOString().split('T')[0];
      } catch (e) {
        return '';
      }
    }
    return value;
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    console.log('🖱️ [EditableCell] Click detectado:', {
      docId,
      fieldName,
      isEditing,
      isLoading,
      isTrimesterClosed
    });

    if (isTrimesterClosed) {
      console.log('🔒 [EditableCell] Documento bloqueado para edición');
      toast({
        title: isApiIssued ? 'Factura Emitida por API' : 'Trimestre Cerrado',
        description: isApiIssued
          ? 'No se pueden editar facturas emitidas ingresadas por API (Verifactu).'
          : 'No se pueden editar documentos de trimestres cerrados.',
        variant: 'destructive',
      });
      return;
    }

    if (!isEditing && !isLoading) {
      console.log('✅ [EditableCell] Activando modo edición');
      setIsEditing(true);
    } else {
      console.log('⚠️ [EditableCell] No se puede activar edición:', { isEditing, isLoading });
    }
  };

  return (
    <TooltipProvider>
      <div
        className={cn(
          "editable-cell-wrapper relative min-h-[20px] sm:min-h-[24px] px-1 sm:px-2",
          isTrimesterClosed && "cursor-not-allowed opacity-60",
          isDuplicate && "bg-amber-50 dark:bg-amber-950/20"
        )}
        onClick={handleClick}
      >
        {/* Loader adaptativo */}
        {isLoading && (
          <Loader2 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
        )}

        {/* Lock icon responsive */}
        {isTrimesterClosed && !isLoading && (
          <Lock className="absolute top-1/2 right-1 sm:right-2 -translate-y-1/2 h-2.5 w-2.5 sm:h-3 sm:w-3 text-muted-foreground shrink-0" />
        )}

        {/* Alerta de duplicado */}
        {isDuplicate && !isLoading && !isTrimesterClosed && (
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <AlertTriangle className="absolute top-1/2 right-1 sm:right-2 -translate-y-1/2 h-3 w-3 sm:h-4 sm:w-4 text-amber-600 dark:text-amber-400 shrink-0 animate-pulse cursor-help" />
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              className="z-[99999] bg-amber-100 dark:bg-amber-900 border-amber-300 dark:border-amber-700"
              avoidCollisions={true}
              collisionPadding={10}
            >
              <p className="text-amber-900 dark:text-amber-100 font-medium">
                ⚠️ Número de factura duplicado
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-200 mt-1">
                Este número ya existe en otro documento
              </p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Display value con text size responsive */}
        {!isEditing && !isLoading && (
          <span
            className={cn(
              "truncate block text-xs sm:text-sm",
              !isTrimesterClosed && "cursor-pointer",
              (isTrimesterClosed || isDuplicate) && "pr-5 sm:pr-6",
              isDuplicate && "font-medium text-amber-800 dark:text-amber-200"
            )}
            title={displayValue()}
          >
            {displayValue()}
          </span>
        )}

        {/* Editor inline */}
        {isEditing && inputType === 'date' && (
          <DatePicker
            value={value}
            compact
            open
            onOpenChange={(open) => {
              if (!open && !isBlurring.current) {
                setValue(initialValue);
                setIsEditing(false);
              }
            }}
            onChange={handleDateChange}
          />
        )}

        {isEditing && inputType !== 'date' && (
          <Input
            ref={inputRef}
            type={inputType}
            value={formattedValueForInput()}
            onChange={(e) => setValue(e.target.value)}
            onBlur={handleBlur}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                handleBlur();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setValue(initialValue);
                setIsEditing(false);
              }
            }}
            className={cn(
              "h-7 sm:h-8 text-xs sm:text-sm",
              isCurrency ? "text-right tabular-nums" : "",
              isDuplicate && "border-amber-400 dark:border-amber-600 focus-visible:ring-amber-500"
            )}
          />
        )}
      </div>
    </TooltipProvider>
  );
}