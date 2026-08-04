'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { parseFechaLocal } from '@/lib/client-utils';

function parsePickerValue(value: string | Date | null | undefined): Date | undefined {
  if (!value) return undefined;
  try {
    const date = value instanceof Date ? value : parseFechaLocal(String(value));
    return Number.isNaN(date.getTime()) ? undefined : date;
  } catch {
    return undefined;
  }
}

function toIsoDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface DatePickerProps {
  value?: string | Date | null;
  onChange?: (value: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  compact?: boolean;
}

export function DatePicker({
  value,
  onChange,
  disabled = false,
  placeholder = 'Seleccionar fecha',
  className,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  compact = false,
}: DatePickerProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const selected = parsePickerValue(value);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const label = selected
    ? format(selected, 'dd/MM/yyyy', { locale: es })
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'justify-start text-left font-normal transition-all duration-200',
            'hover:border-primary/40 hover:shadow-sm',
            compact ? 'h-7 sm:h-8 px-2 text-xs sm:text-sm w-full' : 'h-9 px-3 text-sm w-full',
            !selected && 'text-muted-foreground',
            className
          )}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <CalendarIcon className={cn('shrink-0 text-muted-foreground', compact ? 'h-3 w-3' : 'h-4 w-4')} />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 border shadow-lg"
        align="start"
        sideOffset={6}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Calendar
          mode="single"
          locale={es}
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            onChange?.(date ? toIsoDateString(date) : null);
            setOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

export { parsePickerValue, toIsoDateString };
