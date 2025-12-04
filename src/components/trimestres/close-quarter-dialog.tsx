'use client';

import * as React from 'react';
import { Lock, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import type { Trimestre } from '@/lib/types';

interface CloseQuarterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trimestre: Trimestre | null;
  onConfirm: (empresaId: number | null) => Promise<void>;
}

export function CloseQuarterDialog({
  open,
  onOpenChange,
  trimestre,
  onConfirm,
}: CloseQuarterDialogProps) {
  const [scope, setScope] = React.useState<'empresa' | 'global'>('empresa');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const { toast } = useToast();

  if (!trimestre) return null;

  const handleConfirm = async () => {
    try {
      setIsSubmitting(true);
      
      const empresaId = scope === 'empresa' ? trimestre.empresa_id : null;
      await onConfirm(empresaId);

      toast({
        title: '✅ Trimestre cerrado',
        description: `T${trimestre.trimestre} ${trimestre.año} ha sido cerrado exitosamente.`,
        className: "bg-gradient-to-br from-green-500 to-emerald-600 text-white",
      });

      onOpenChange(false);
    } catch (error) {
      console.error('Error al cerrar trimestre:', error);
      toast({
        title: '❌ Error',
        description: 'No se pudo cerrar el trimestre. Intenta nuevamente.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 📱 DIALOG RESPONSIVE CON ANIMACIÓN */}
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[500px] max-h-[90vh] overflow-y-auto animate-fade-in">
        <DialogHeader>
          {/* 📱 TÍTULO RESPONSIVE CON GRADIENTE */}
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg pr-6">
            <div className="p-1.5 bg-red-500/20 rounded-lg shrink-0 transition-transform duration-300 hover:scale-110">
              <Lock className="h-4 w-4 sm:h-5 sm:w-5 text-red-500" />
            </div>
            <span className="truncate bg-gradient-to-r from-red-600 to-red-500 bg-clip-text text-transparent">
              Cerrar Trimestre T{trimestre.trimestre} {trimestre.año}
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm animate-fade-in" style={{ animationDelay: '50ms' }}>
            Esta acción bloqueará permanentemente los documentos del trimestre.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 sm:space-y-4 py-3 sm:py-4">
          {/* 📱 ADVERTENCIA RESPONSIVE CON ANIMACIÓN */}
          <div className="flex items-start gap-2 sm:gap-3 rounded-lg border border-yellow-200 bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-950/20 dark:to-amber-950/20 dark:border-yellow-900 p-2.5 sm:p-3 animate-fade-in transition-all duration-300 hover:shadow-md hover:scale-[1.01]" style={{ animationDelay: '100ms' }}>
            <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-600 dark:text-yellow-500 mt-0.5 shrink-0 animate-pulse" />
            <div className="text-xs sm:text-sm text-yellow-800 dark:text-yellow-200 min-w-0">
              <p className="font-semibold">⚠️ Acción irreversible</p>
              <p className="mt-1">
                Una vez cerrado, NO podrás editar ni eliminar los documentos de este trimestre.
              </p>
            </div>
          </div>

          {/* 📱 ALCANCE DEL CIERRE RESPONSIVE CON HOVER */}
          <div className="space-y-2 sm:space-y-3 animate-fade-in" style={{ animationDelay: '150ms' }}>
            <Label className="text-xs sm:text-sm font-medium bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
              ¿Qué deseas cerrar?
            </Label>
            <RadioGroup value={scope} onValueChange={(v) => setScope(v as any)}>
              {trimestre.empresa_id && (
                <div className="flex items-start space-x-2 rounded-lg border p-2.5 sm:p-3 hover:bg-accent/50 hover:border-primary/50 hover:shadow-md transition-all duration-200 cursor-pointer group">
                  <RadioGroupItem value="empresa" id="empresa" className="mt-0.5 shrink-0" />
                  <Label htmlFor="empresa" className="cursor-pointer flex-1 min-w-0">
                    <div className="font-medium text-xs sm:text-sm truncate group-hover:text-primary transition-colors duration-200">
                      Solo {trimestre.empresa_nombre}
                    </div>
                    <div className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 group-hover:text-foreground/70 transition-colors duration-200">
                      Cerrar {trimestre.total_documentos} documento(s) de esta empresa
                    </div>
                  </Label>
                </div>
              )}

              <div className="flex items-start space-x-2 rounded-lg border p-2.5 sm:p-3 hover:bg-accent/50 hover:border-primary/50 hover:shadow-md transition-all duration-200 cursor-pointer group">
                <RadioGroupItem value="global" id="global" className="mt-0.5 shrink-0" />
                <Label htmlFor="global" className="cursor-pointer flex-1 min-w-0">
                  <div className="font-medium text-xs sm:text-sm group-hover:text-primary transition-colors duration-200">
                    Todas las empresas
                  </div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 group-hover:text-foreground/70 transition-colors duration-200">
                    Cerrar TODOS los documentos del T{trimestre.trimestre} {trimestre.año}
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* 📱 RESUMEN RESPONSIVE CON GRADIENTE */}
          <div className="rounded-lg bg-gradient-to-br from-muted to-muted/50 p-2.5 sm:p-3 space-y-1.5 sm:space-y-2 animate-fade-in hover:shadow-md transition-all duration-300" style={{ animationDelay: '200ms' }}>
            <div className="flex justify-between items-center text-xs sm:text-sm group">
              <span className="text-muted-foreground group-hover:text-foreground transition-colors duration-200">
                Documentos:
              </span>
              <span className="font-medium tabular-nums group-hover:scale-105 transition-transform duration-200">
                {trimestre.total_documentos}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs sm:text-sm group">
              <span className="text-muted-foreground group-hover:text-foreground transition-colors duration-200">
                Ingresos:
              </span>
              <span className="font-medium tabular-nums text-green-600 dark:text-green-500 group-hover:scale-105 transition-transform duration-200">
                €{trimestre.total_ingresos.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs sm:text-sm group">
              <span className="text-muted-foreground group-hover:text-foreground transition-colors duration-200">
                Gastos:
              </span>
              <span className="font-medium tabular-nums text-red-600 dark:text-red-500 group-hover:scale-105 transition-transform duration-200">
                €{trimestre.total_gastos.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* 📱 FOOTER RESPONSIVE CON ANIMACIONES */}
        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 animate-fade-in" style={{ animationDelay: '250ms' }}>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="w-full sm:w-auto order-2 sm:order-1 hover:bg-accent transition-all duration-200 hover:scale-105"
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="w-full sm:w-auto order-1 sm:order-2 transition-all duration-200 hover:scale-105 hover:shadow-lg disabled:cursor-not-allowed group"
          >
            {isSubmitting ? (
              <>
                <Lock className="mr-2 h-4 w-4 animate-spin" />
                Cerrando...
              </>
            ) : (
              <>
                <Lock className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform duration-200" />
                Cerrar Trimestre
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
