
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

export function SummarizeDialog({ doc, isOpen, setIsOpen }: { doc: Document | null; isOpen: boolean; setIsOpen: (open: boolean) => void }) {
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
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[625px]">
        <DialogHeader>
          <DialogTitle>Resumen del Documento con IA</DialogTitle>
          <DialogDescription>
            Genera un resumen conciso de los datos del documento usando IA.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {doc && (
            <div className="space-y-2">
              <h4 className="font-semibold">Documento a resumir</h4>
              <p className="text-sm text-muted-foreground rounded-md border p-2">
                {doc.tipo_documento}: {doc.numero_factura}
              </p>
            </div>
          )}

          {isLoading && (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {error && (
             <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {summaryResult && (
            <div className="space-y-2">
              <h4 className="font-semibold">Resumen</h4>
              <div className="rounded-md border p-4 space-y-3">
                <p className="text-sm text-foreground whitespace-pre-wrap">{summaryResult.summary}</p>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={handleSummarize} disabled={isLoading || !doc}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Generar Resumen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
