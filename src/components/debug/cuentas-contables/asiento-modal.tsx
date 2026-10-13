'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, Scale, Check } from 'lucide-react';
import type { DocumentAccountingDebug } from '@/services/cuentas-contables-debug-service';

interface AsientoModalProps {
  document: DocumentAccountingDebug | null;
  isOpen: boolean;
  onClose: () => void;
  onApproveDoc?: (docId: number) => Promise<void>;
}

export function AsientoModal({ document, isOpen, onClose, onApproveDoc }: AsientoModalProps) {
  const [approving, setApproving] = React.useState(false);

  if (!document) return null;

  const handleApprove = async () => {
    if (!onApproveDoc) return;
    try {
      setApproving(true);
      await onApproveDoc(document.id_documento);
      onClose();
    } finally {
      setApproving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-card text-card-foreground border-border shadow-lg">
        <DialogHeader className="border-b border-border pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <DialogTitle className="text-base font-semibold flex items-center gap-2">
                <span>Asiento Contable</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {document.numero_documento}
                </span>
                {document.is_issued ? (
                  <Badge variant="outline" className="text-[10px] bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20">
                    Emitida
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                    Recibida
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground text-xs mt-1">
                {document.proveedor} • {document.cif} • {document.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
              </DialogDescription>
            </div>
            {document.cuadrado ? (
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs">
                <Scale className="w-3.5 h-3.5 mr-1" />
                Cuadrado (0,00 €)
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-xs">
                <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                Descuadre ({document.diferencia.toFixed(2)} €)
              </Badge>
            )}
          </div>
        </DialogHeader>

        {/* Tabla Asiento Contable */}
        <div className="my-3 overflow-hidden rounded-lg border border-border bg-background">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-muted-foreground font-medium text-[11px]">
                <th className="py-2 px-3">Cuenta</th>
                <th className="py-2 px-3">Concepto</th>
                <th className="py-2 px-3 text-right">Debe</th>
                <th className="py-2 px-3 text-right">Haber</th>
                <th className="py-2 px-3 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {document.asiento.map((item, idx) => {
                const isSuggestion = item.is_suggested;
                return (
                  <tr key={idx} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2 px-3 font-mono font-medium text-foreground">
                      <span className="px-1.5 py-0.5 rounded bg-muted text-foreground border border-border/60">
                        {item.codigo}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <div className="font-normal text-foreground">{item.nombre}</div>
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-foreground">
                      {item.debe > 0 ? item.debe.toFixed(2) + ' €' : '—'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-foreground">
                      {item.haber > 0 ? item.haber.toFixed(2) + ' €' : '—'}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {isSuggestion ? (
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          Sugerida
                        </span>
                      ) : (
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          Confirmada
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/40 font-semibold text-foreground text-xs">
                <td colSpan={2} className="py-2 px-3 text-muted-foreground">
                  Sumas
                </td>
                <td className="py-2 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                  {document.total_debe.toFixed(2)} €
                </td>
                <td className="py-2 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                  {document.total_haber.toFixed(2)} €
                </td>
                <td className="py-2 px-3 text-center">
                  {document.cuadrado ? (
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">✓ Correcto</span>
                  ) : (
                    <span className="text-[11px] text-destructive font-medium">Descuadre</span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <DialogFooter className="border-t border-border pt-3 flex items-center justify-between sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {document.sugerencias_pendientes > 0 ? (
              <span>{document.sugerencias_pendientes} cuenta(s) por confirmar</span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400">Asiento cuadrado y confirmado</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} className="text-xs h-8">
              Cerrar
            </Button>
            {document.sugerencias_pendientes > 0 && onApproveDoc && (
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={approving}
                className="text-xs h-8 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Check className="w-3.5 h-3.5 mr-1" />
                {approving ? 'Guardando...' : 'Confirmar asiento'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
