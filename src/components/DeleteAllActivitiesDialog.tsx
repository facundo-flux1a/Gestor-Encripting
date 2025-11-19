'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DeleteAllActivitiesDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  activityCount: number;
  isDeleting?: boolean;
}

export function DeleteAllActivitiesDialog({
  isOpen,
  onOpenChange,
  onConfirm,
  activityCount,
  isDeleting = false
}: DeleteAllActivitiesDialogProps) {
  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <span className="text-destructive">⚠️</span>
            ¿Eliminar TODAS las actividades?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              Estás a punto de eliminar <span className="font-bold text-foreground">{activityCount}</span> actividad{activityCount !== 1 ? 'es' : ''}.
            </p>
            <div className="bg-destructive/10 border border-destructive/50 rounded-md p-3">
              <p className="text-destructive font-semibold text-sm">
                ⚠️ ADVERTENCIA: Esta acción es irreversible
              </p>
              <p className="text-destructive/90 text-sm mt-1">
                Se eliminarán todos los registros de actividad permanentemente.
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Los documentos asociados NO serán eliminados, solo el historial de actividad.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Eliminando...
              </>
            ) : (
              'Sí, eliminar todas'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}