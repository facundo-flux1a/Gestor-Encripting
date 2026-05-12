'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  XCircle,
  AlertCircle,
  FileText,
  Building2,
  Calendar,
  RotateCw,
  X
} from 'lucide-react';
import { Activity } from '@/lib/types';


interface ActivityErrorModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  activity: Activity | null;
  onRetry: (activity: Activity) => void;
  isRetrying: boolean;
}

export function ActivityErrorModal({
  isOpen,
  onOpenChange,
  activity,
  onRetry,
  isRetrying,
}: ActivityErrorModalProps) {
  if (!activity) return null;

  const isInterrupted = activity.status.toLowerCase() === 'interrumpido';
  const statusColor = isInterrupted ? 'amber' : 'red';

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-gradient-to-br from-violet-950 via-violet-900 to-violet-950 border-violet-700/50 text-violet-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-xl">
            {isInterrupted ? (
              <AlertCircle className={`w-6 h-6 text-${statusColor}-400`} />
            ) : (
              <XCircle className={`w-6 h-6 text-${statusColor}-400`} />
            )}
            <span>
              {isInterrupted ? 'Proceso Interrumpido' : 'Error en el Procesamiento'}
            </span>
          </DialogTitle>
          <DialogDescription className="text-violet-300">
            Detalles del problema encontrado durante el procesamiento
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Documento */}
          <div className="flex items-start gap-3 p-3 bg-violet-800/30 rounded-lg border border-violet-700/30">
            <FileText className="w-5 h-5 text-violet-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-violet-400 uppercase tracking-wide mb-1">Documento</p>
              <p className="text-sm font-medium text-violet-100 truncate">
                {activity.documento_nombre}
              </p>
              {activity.documento_tipo && (
                <p className="text-xs text-violet-300 mt-0.5">{activity.documento_tipo}</p>
              )}
            </div>
          </div>

          {/* Empresa */}
          <div className="flex items-start gap-3 p-3 bg-violet-800/30 rounded-lg border border-violet-700/30">
            <Building2 className="w-5 h-5 text-violet-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-violet-400 uppercase tracking-wide mb-1">Empresa</p>
              <p className="text-sm font-medium text-violet-100">{activity.nombre_de_empresa}</p>
              <p className="text-xs text-violet-300 mt-0.5">CIF: {activity.CIF}</p>
            </div>
          </div>

          {/* Estado y Paso */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-violet-800/30 rounded-lg border border-violet-700/30">
              <p className="text-xs text-violet-400 uppercase tracking-wide mb-1">Estado</p>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-${statusColor}-500/30 text-${statusColor}-200`}>
                {activity.status}
              </span>
            </div>
            <div className="p-3 bg-violet-800/30 rounded-lg border border-violet-700/30">
              <p className="text-xs text-violet-400 uppercase tracking-wide mb-1">Progreso</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-violet-900/50 rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-${statusColor}-400 rounded-full`}
                    style={{ width: `${activity.progress}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-violet-200">{activity.progress}%</span>
              </div>
            </div>
          </div>

          {/* Último paso */}
          <div className="p-3 bg-violet-800/30 rounded-lg border border-violet-700/30">
            <p className="text-xs text-violet-400 uppercase tracking-wide mb-1">Último paso</p>
            <p className="text-sm text-violet-200">{activity.step}</p>
          </div>

          {/* Mensaje */}
          {activity.mensaje && (
            <div className="p-3 bg-violet-800/30 rounded-lg border border-violet-700/30">
              <p className="text-xs text-violet-400 uppercase tracking-wide mb-1">Mensaje</p>
              <p className="text-sm text-violet-200">{activity.mensaje}</p>
            </div>
          )}

          {/* Error detallado */}
          {activity.error_detalle && (
            <div className={`p-3 bg-${statusColor}-900/30 rounded-lg border border-${statusColor}-700/30`}>
              <p className={`text-xs text-${statusColor}-400 uppercase tracking-wide mb-1 flex items-center gap-1`}>
                <AlertCircle className="w-3 h-3" />
                Detalle del error
              </p>
              <p className={`text-sm text-${statusColor}-200 font-medium whitespace-pre-wrap`}>
                {activity.error_detalle}
              </p>
            </div>
          )}

          {/* Fecha */}
          <div className="flex items-center gap-2 text-xs text-violet-400">
            <Calendar className="w-4 h-4" />
            <span>Iniciado: {formatDate(activity.created_at)}</span>
            {activity.updated_at !== activity.created_at && (
              <>
                <span className="mx-1">•</span>
                <span>Actualizado: {formatDate(activity.updated_at)}</span>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-violet-600 text-violet-200 hover:bg-violet-800/50"
          >
            <X className="w-4 h-4 mr-2" />
            Cerrar
          </Button>
          <Button
            onClick={() => onRetry(activity)}
            disabled={isRetrying}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            <RotateCw className={`w-4 h-4 mr-2 ${isRetrying ? 'animate-spin' : ''}`} />
            {isRetrying ? 'Reintentando...' : 'Reintentar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}