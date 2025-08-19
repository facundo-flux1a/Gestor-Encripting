
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="truncate pr-8">Previsualización: {documentName}</DialogTitle>
        </DialogHeader>
        <div className="flex-grow rounded-md overflow-hidden px-6">
          <iframe
            src={documentUrl}
            className="w-full h-full border rounded-md"
            title={`Preview of ${documentName}`}
          />
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
