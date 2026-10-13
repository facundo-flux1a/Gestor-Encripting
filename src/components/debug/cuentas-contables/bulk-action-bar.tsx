'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Download, X, CheckCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface BulkActionBarProps {
  selectedCount: number;
  suggestionsCount: number;
  onApproveAll: () => void;
  onExport: () => void;
  onClearSelection: () => void;
  isProcessing?: boolean;
}

export function BulkActionBar({
  selectedCount,
  suggestionsCount,
  onApproveAll,
  onExport,
  onClearSelection,
  isProcessing = false,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-5 duration-200">
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-card border border-border shadow-xl backdrop-blur-md text-foreground">
        <div className="flex items-center gap-2 pr-3 border-r border-border">
          <span className="flex h-2 w-2 rounded-full bg-primary" />
          <span className="font-medium text-xs text-foreground">
            {selectedCount} {selectedCount === 1 ? 'documento' : 'documentos'}
          </span>
          {suggestionsCount > 0 && (
            <div className="relative inline-flex items-center justify-center ml-1">
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25 text-[11px] font-medium">
                Por revisar
              </Badge>
              <span
                className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-amber-500 text-white text-[9px] font-bold shadow-xs border-2 border-card leading-none"
                title={`${suggestionsCount} sugerencias pendientes`}
              >
                {suggestionsCount}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {suggestionsCount > 0 && (
            <Button
              size="sm"
              onClick={onApproveAll}
              disabled={isProcessing}
              className="text-xs h-7 px-3 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
            >
              <CheckCheck className="w-3.5 h-3.5 mr-1" />
              {isProcessing ? 'Guardando...' : `Aprobar selección (${suggestionsCount})`}
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={onExport}
            className="text-xs h-7 px-2.5 border-border hover:bg-accent hover:text-accent-foreground"
          >
            <Download className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
            Exportar CSV
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={onClearSelection}
            className="text-muted-foreground hover:text-foreground hover:bg-accent text-xs h-7 px-1.5"
            title="Deseleccionar"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
