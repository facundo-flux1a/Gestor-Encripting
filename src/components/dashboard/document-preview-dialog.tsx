
'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink } from "lucide-react";

interface DocumentPreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  documentUrl: string | null;
  documentName: string;
}

export function DocumentPreviewDialog({ isOpen, onClose, documentUrl, documentName }: DocumentPreviewDialogProps) {
  if (!documentUrl) {
    return null;
  }
  
  const googleDocsViewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(documentUrl)}&embedded=true`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="truncate pr-8">Previsualización: {documentName}</DialogTitle>
        </DialogHeader>
        <div className="flex-grow rounded-md overflow-hidden px-6 pb-6">
          <iframe
            src={googleDocsViewerUrl}
            className="w-full h-full border rounded-md"
            aria-label={`Preview of ${documentName}`}
          >
             <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground bg-muted/50 rounded-md p-4">
                <p className="font-semibold">La previsualización no está disponible.</p>
                <p className="text-sm mt-2">
                    Tu navegador no puede mostrar este PDF. Puedes descargarlo o abrirlo en una nueva pestaña.
                </p>
            </div>
          </iframe>
        </div>
        <DialogFooter className="p-6 pt-2 sm:justify-between flex-wrap gap-2 border-t bg-background rounded-b-lg">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Cerrar
            </Button>
          </DialogClose>
          <div className="flex items-center gap-2">
            <Button asChild>
              <a href={documentUrl} download={documentName}>
                <Download className="mr-2 h-4 w-4" />
                Descargar
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={documentUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                Abrir en nueva pestaña
              </a>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
