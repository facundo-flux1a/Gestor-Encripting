'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface CleanDuplicatesButtonProps {
  empresaId?: number | null;
  onComplete?: () => void;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
}

export function CleanDuplicatesButton({ 
  empresaId = null, 
  onComplete,
  variant = 'outline',
  size = 'sm'
}: CleanDuplicatesButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  const handleCleanDuplicates = async () => {
    setIsLoading(true);

    try {
      console.log('🧹 [CleanDuplicates] Iniciando limpieza...');
      
      const response = await fetch('/api/documents/auto-clean-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresaId }),
      });

      if (!response.ok) {
        throw new Error('Error al limpiar duplicados');
      }

      const data = await response.json();

      if (data.deleted === 0) {
        toast({
          title: '✅ Sin Duplicados',
          description: 'No se encontraron facturas duplicadas',
        });
      } else {
        toast({
          title: '🧹 Duplicados Eliminados',
          description: `Se eliminaron ${data.deleted} documento(s) duplicado(s). Se mantuvieron ${data.kept} documento(s) únicos.`,
        });
      }

      setIsOpen(false);
      if (onComplete) {
        onComplete();
      }

    } catch (error) {
      console.error('❌ Error limpiando duplicados:', error);
      toast({
        title: '❌ Error',
        description: 'No se pudieron eliminar los duplicados',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant={variant}
          size={size}
          disabled={isLoading}
          className="gap-2 group transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-violet-500/20"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <span className="hidden sm:inline">Limpiando...</span>
            </>
          ) : (
            <>
              <Trash2 className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:scale-110" />
              <span className="hidden sm:inline">Limpiar Duplicados</span>
              <span className="sm:hidden">Duplicados</span>
            </>
          )}
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-violet-500" />
            ¿Limpiar duplicados automáticamente?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 pt-2 text-sm text-muted-foreground">
              <div>
                Esta acción buscará facturas con el <strong>mismo número de documento</strong> y:
              </div>
              
              <div className="bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 rounded-lg p-3 space-y-2">
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-green-600 dark:text-green-400 font-bold shrink-0">✅</span>
                  <span>
                    <strong>Mantendrá</strong> el documento más <strong>reciente</strong> (por fecha de carga)
                  </span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-red-600 dark:text-red-400 font-bold shrink-0">❌</span>
                  <span>
                    <strong>Eliminará</strong> todos los demás documentos duplicados
                  </span>
                </div>
              </div>

              <div className="text-xs">
                <strong>Nota:</strong> Esta acción no se puede deshacer. Se eliminarán los documentos duplicados y sus archivos asociados de forma permanente.
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleCleanDuplicates}
            disabled={isLoading}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Limpiando...
              </span>
            ) : (
              'Sí, Limpiar Duplicados'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}