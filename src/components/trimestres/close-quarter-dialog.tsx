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
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-red-500" />
            Cerrar Trimestre T{trimestre.trimestre} {trimestre.año}
          </DialogTitle>
          <DialogDescription>
            Esta acción bloqueará permanentemente los documentos del trimestre.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Advertencia */}
          <div className="flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <p className="font-semibold">⚠️ Acción irreversible</p>
              <p className="mt-1">
                Una vez cerrado, NO podrás editar ni eliminar los documentos de este trimestre.
              </p>
            </div>
          </div>

          {/* Alcance del cierre */}
          <div className="space-y-3">
            <Label>¿Qué deseas cerrar?</Label>
            <RadioGroup value={scope} onValueChange={(v) => setScope(v as any)}>
              {trimestre.empresa_id && (
                <div className="flex items-center space-x-2 rounded-lg border p-3">
                  <RadioGroupItem value="empresa" id="empresa" />
                  <Label htmlFor="empresa" className="cursor-pointer flex-1">
                    <div className="font-medium">Solo {trimestre.empresa_nombre}</div>
                    <div className="text-sm text-muted-foreground">
                      Cerrar {trimestre.total_documentos} documento(s) de esta empresa
                    </div>
                  </Label>
                </div>
              )}

              <div className="flex items-center space-x-2 rounded-lg border p-3">
                <RadioGroupItem value="global" id="global" />
                <Label htmlFor="global" className="cursor-pointer flex-1">
                  <div className="font-medium">Todas las empresas</div>
                  <div className="text-sm text-muted-foreground">
                    Cerrar TODOS los documentos del T{trimestre.trimestre} {trimestre.año}
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Resumen */}
          <div className="rounded-lg bg-muted p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Documentos:</span>
              <span className="font-medium">{trimestre.total_documentos}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ingresos:</span>
              <span className="font-medium">€{trimestre.total_ingresos.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Gastos:</span>
              <span className="font-medium">€{trimestre.total_gastos.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Cerrando...' : 'Cerrar Trimestre'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}