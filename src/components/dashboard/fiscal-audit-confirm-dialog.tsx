'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ShieldAlert, CheckCircle2, Edit3, AlertTriangle } from 'lucide-react';

interface FiscalAuditConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onEdit?: () => void;
  documentNumber?: string;
  motivo?: string;
  checkType?: string;
  isConfirming?: boolean;
}

export function FiscalAuditConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  onEdit,
  documentNumber,
  motivo,
  checkType,
  isConfirming = false,
}: FiscalAuditConfirmDialogProps) {
  const displayMotivo = motivo || 'El documento mantiene una observación de revisión fiscal sin resolver.';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[500px] border-amber-500/30 bg-background/95 backdrop-blur-md shadow-2xl">
        <DialogHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                Control Fiscal y Auditoría
              </DialogTitle>
              {documentNumber && (
                <p className="text-xs text-muted-foreground font-mono">
                  Factura #{documentNumber}
                </p>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Box de observación pendiente */}
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3.5 space-y-1.5 text-xs text-amber-600 dark:text-amber-400">
            <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-[10px]">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Observación Pendiente de Resolución
            </div>
            <p className="font-medium text-foreground/90 leading-relaxed text-xs">
              {displayMotivo}
            </p>
          </div>

          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            Confirmar la integración a contabilidad sin subsanar esta observación registrará el documento como <strong className="text-foreground">validado manualmente bajo tu responsabilidad profesional</strong>.
          </DialogDescription>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2 border-t border-border/50">
          {onEdit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onClose();
                onEdit();
              }}
              className="gap-2 text-xs h-9 w-full sm:w-auto"
            >
              <Edit3 className="h-3.5 w-3.5" />
              Revisar y Corregir
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            disabled={isConfirming}
            onClick={onConfirm}
            className="gap-2 text-xs h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold w-full sm:w-auto ml-auto"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {isConfirming ? 'Confirmando...' : 'Confirmar Validación Manual'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
