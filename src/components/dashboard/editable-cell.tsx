'use client';

import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { updateDocumentField } from '@/services/document-service';
import { cn } from '@/lib/utils';
import { Loader2, Lock } from 'lucide-react';
import type { Table } from '@tanstack/react-table';
import type { Document } from '@/lib/types';


interface EditableCellProps {
  initialValue: any;
  docId: number;
  fieldName: string;
  onUpdate: (docId: number, fieldName: string, value: any, table: Table<Document>, rowIndex: number) => void;
  inputType?: 'text' | 'number' | 'date';
  isCurrency?: boolean;
  table: Table<Document>;
  rowIndex: number;
  trimestre_cerrado?: number; // ← NUEVO: Recibir el estado del trimestre
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
            year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC'
        }).format(utcDate);
    } catch {
        return dateString;
    }
}

export function EditableCell({
  initialValue,
  docId,
  fieldName,
  onUpdate,
  inputType = 'text',
  isCurrency = false,
  table,
  rowIndex,
  trimestre_cerrado = 0 // ← NUEVO: Por defecto 0 (no cerrado)
}: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  // ← NUEVO: Verificar si el trimestre está cerrado
  const isTrimesterClosed = trimestre_cerrado === 1;

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleBlur = async () => {
    setIsEditing(false);
    
    const processedValue = inputType === 'number' ? parseFloat(value) : value;

    if (processedValue === initialValue) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await updateDocumentField(docId, fieldName, processedValue);
      if (result.success) {
        table.options.meta?.updateData(rowIndex, fieldName, processedValue);
        toast({
            title: 'Campo Actualizado',
            description: `El campo se ha guardado correctamente.`,
        });
      } else {
        throw new Error('La actualización falló en el servidor.');
      }
    } catch (error: any) {
      console.error('Failed to update field:', error);
      setValue(initialValue);
      toast({
        title: 'Error al Actualizar',
        description: error.message || 'No se pudo guardar el campo.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
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
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // ← NUEVO: Bloquear edición si el trimestre está cerrado
    if (isTrimesterClosed) {
      toast({
        title: 'Trimestre Cerrado',
        description: 'No se pueden editar documentos de trimestres cerrados.',
        variant: 'destructive',
      });
      return;
    }
    
    if (!isEditing && !isLoading) {
      setIsEditing(true);
    }
  };

  return (
    <div 
      className={cn(
        "relative min-h-[24px]",
        isTrimesterClosed && "cursor-not-allowed opacity-60" // ← NUEVO: Estilo visual
      )}
      onClick={handleClick}
    >
      {isLoading && <Loader2 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />}
      
      {/* ← NUEVO: Mostrar ícono de candado si está cerrado */}
      {isTrimesterClosed && !isLoading && (
        <Lock className="absolute top-1/2 right-2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
      )}
      
      {!isEditing && !isLoading && (
        <span className={cn(
          "truncate block",
          !isTrimesterClosed && "cursor-pointer" // ← NUEVO: Solo cursor pointer si NO está cerrado
        )}>
          {displayValue()}
        </span>
      )}

      {isEditing && (
        <Input
          ref={inputRef}
          type={inputType}
          value={formattedValueForInput()}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleBlur();
            if (e.key === 'Escape') {
                setValue(initialValue);
                setIsEditing(false);
            }
          }}
          className={cn(
            "h-8 text-sm",
            isCurrency ? "text-right" : ""
          )}
        />
      )}
    </div>
  );
}