'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { summarizeDocument, type SummarizeDocumentOutput } from '@/ai/flows/summarize-document';
import { type Document } from '@/lib/types';
import { Loader2, Sparkles } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function SummarizeDialog({ 
  doc, 
  isOpen, 
  setIsOpen 
}: { 
  doc: Document | null; 
  isOpen: boolean; 
  setIsOpen: (open: boolean) => void;
}) {
  const [summaryResult, setSummaryResult] = useState<SummarizeDocumentOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSummarize = async () => {
    if (!doc) {
      setError("No hay un documento para resumir.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setSummaryResult(null);
    try {
      const result = await summarizeDocument({ document: doc });
      setSummaryResult(result);
    } catch (e) {
      setError('Ha ocurrido un error al generar el resumen.');
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSummaryResult(null);
      setError(null);
      setIsLoading(false);
    }
    setIsOpen(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[625px] max-h-[90vh] flex flex-col">
        <DialogHeader className="px-3 sm:px-6 py-3 sm:py-6 pb-2 sm:pb-4">
          <DialogTitle className="text-base sm:text-lg">
            Resumen del Documento con IA
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Genera un resumen conciso de los datos del documento usando IA.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-3 sm:gap-4 py-2 sm:py-4 px-3 sm:px-6 overflow-y-auto flex-1">
          {doc && (
            <div className="space-y-1.5 sm:space-y-2">
              <h4 className="font-semibold text-xs sm:text-sm">
                Documento a resumir
              </h4>
              <p className="text-xs sm:text-sm text-muted-foreground rounded-md border p-2 break-words">
                {doc.tipo_documento}: {doc.numero_factura}
              </p>
            </div>
          )}

          {isLoading && (
            <div className="flex items-center justify-center p-6 sm:p-8">
              <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-primary" />
            </div>
          )}

          {error && (
             <Alert variant="destructive">
                <AlertTitle className="text-xs sm:text-sm">Error</AlertTitle>
                <AlertDescription className="text-xs sm:text-sm">
                  {error}
                </AlertDescription>
            </Alert>
          )}

          {summaryResult && (
            <div className="space-y-1.5 sm:space-y-2">
              <h4 className="font-semibold text-xs sm:text-sm">Resumen</h4>
              <div className="rounded-md border p-3 sm:p-4 space-y-2 sm:space-y-3">
                <p className="text-xs sm:text-sm text-foreground whitespace-pre-wrap break-words">
                  {summaryResult.summary}
                </p>
              </div>
            </div>
          )}
        </div>
        
        <DialogFooter className="px-3 sm:px-6 pb-3 sm:pb-6 pt-2 sm:pt-4 border-t">
          <Button 
            onClick={handleSummarize} 
            disabled={isLoading || !doc}
            className="w-full sm:w-auto h-8 sm:h-9 text-xs sm:text-sm gap-1.5 sm:gap-2"
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            )}
            Generar Resumen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}