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

export function DocumentPreviewDialog({ 
  isOpen, 
  onClose, 
  documentUrl, 
  documentName 
}: DocumentPreviewDialogProps) {
  if (!documentUrl) {
    return null;
  }
  
  const googleDocsViewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(documentUrl)}&embedded=true`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      {/* 📱 DIALOG RESPONSIVE - OCUPA CASI TODA LA PANTALLA */}
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[95vw] lg:max-w-7xl h-[95vh] sm:h-[90vh] flex flex-col p-0 gap-0">
        
        {/* 📱 HEADER FIJO */}
        <DialogHeader className="px-3 py-3 sm:px-4 lg:px-6 sm:py-4 border-b flex-shrink-0">
          <DialogTitle className="text-sm sm:text-base lg:text-lg truncate pr-8" title={documentName}>
            Previsualización: {documentName}
          </DialogTitle>
        </DialogHeader>
        
        {/* 📱 IFRAME CONTAINER - CRECE PARA LLENAR ESPACIO */}
        <div className="flex-1 overflow-hidden min-h-0 w-full">
          <iframe
            src={googleDocsViewerUrl}
            className="w-full h-full border-0"
            aria-label={`Preview of ${documentName}`}
            title={`Preview of ${documentName}`}
          >
            {/* 📱 FALLBACK RESPONSIVE CUANDO IFRAME NO CARGA */}
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground bg-muted/50 rounded-md p-3 sm:p-4">
              <p className="font-semibold text-sm sm:text-base">La previsualización no está disponible.</p>
              <p className="text-xs sm:text-sm mt-2">
                Tu navegador no puede mostrar este PDF. Puedes descargarlo o abrirlo en una nueva pestaña.
              </p>
            </div>
          </iframe>
        </div>
        
        {/* 📱 FOOTER FIJO CON BOTONES RESPONSIVE */}
        <DialogFooter className="px-3 py-2.5 sm:px-4 lg:px-6 sm:py-3 border-t bg-background flex-shrink-0">
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-0 w-full">
            {/* Botón Cerrar - izquierda en desktop */}
            <DialogClose asChild>
              <Button 
                type="button" 
                variant="secondary"
                className="w-full sm:w-auto h-9 sm:h-10 text-xs sm:text-sm order-3 sm:order-1"
              >
                Cerrar
              </Button>
            </DialogClose>
            
            {/* Botones de acción - derecha en desktop, arriba en mobile */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 order-1 sm:order-2">
              <Button 
                asChild
                className="w-full sm:w-auto h-9 sm:h-10 text-xs sm:text-sm"
              >
                <a href={documentUrl} download={documentName}>
                  <Download className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                  <span>Descargar</span>
                </a>
              </Button>
              <Button 
                variant="outline" 
                asChild
                className="w-full sm:w-auto h-9 sm:h-10 text-xs sm:text-sm"
              >
                <a href={documentUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                  <span className="hidden sm:inline">Abrir en nueva pestaña</span>
                  <span className="sm:hidden">Abrir</span>
                </a>
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}