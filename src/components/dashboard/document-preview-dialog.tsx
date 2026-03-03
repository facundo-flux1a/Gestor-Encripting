'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, Loader2, RotateCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();

  // States for Preview Loading
  const [key, setKey] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // State for Downlaod
  const [isDownloading, setIsDownloading] = useState(false);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setKey(0);
      setRetryCount(0);
      setIsLoading(true);
    }
  }, [isOpen, documentUrl]);

  // Remover lógica de auto-retry
  // (El usuario solicitó quitar la recarga automática)

  const handleIframeLoad = () => {
    setIsLoading(false);
  };

  const handleManualReload = () => {
    setKey(prev => prev + 1);
    setIsLoading(true);
    setRetryCount(0);
  };

  const handleDownload = async () => {
    if (!documentUrl) return;

    console.log("📥 [DocumentPreview] Iniciando flujo de descarga para:", documentName);
    console.log("🔗 [DocumentPreview] URL original:", documentUrl);

    try {
      setIsDownloading(true);
      toast({ title: "Iniciando descarga segura..." });

      // Extraer el nombre del archivo de la URL
      const urlParts = documentUrl.split('/');
      const rawFilename = urlParts[urlParts.length - 1];

      if (!rawFilename) throw new Error("No se pudo extraer el nombre del archivo");

      // Decodificar primero por si ya viene con %20 y luego codificar para la URL de la API
      const filename = decodeURIComponent(rawFilename);
      const proxyUrl = `/api/files/${encodeURIComponent(filename)}`;
      console.log("📡 [DocumentPreview] Usando proxy de descarga:", proxyUrl);

      // Abrir en nueva pestaña para que el navegador gestione la descarga (disparado por Content-Disposition)
      const win = window.open(proxyUrl, '_blank');

      if (!win) {
        console.warn("⚠️ [DocumentPreview] El navegador bloqueó el popup");
        throw new Error("El navegador bloqueó la ventana de descarga");
      }

      toast({ title: "✅ Descarga iniciada", duration: 2000 });
      console.log("✅ [DocumentPreview] Pestaña de descarga abierta exitosamente");

    } catch (error) {
      console.error("❌ [DocumentPreview] Error en descarga segura:", error);

      toast({
        title: "Error en descarga segura",
        description: "Intentando descarga directa (podría mostrar advertencia)...",
        variant: "destructive"
      });

      // Fallback: Abrir link directo de MinIO (como funcionaba antes)
      console.log("🔄 [DocumentPreview] Iniciando fallback a link directo");
      window.open(documentUrl, '_blank');
    } finally {
      setIsDownloading(false);
    }
  };

  if (!documentUrl) {
    return null;
  }

  // Add timestamp to prevent caching
  const googleDocsViewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(documentUrl)}&embedded=true&t=${Date.now()}`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      {/* 📱 DIALOG RESPONSIVE - OCUPA CASI TODA LA PANTALLA */}
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[95vw] lg:max-w-7xl h-[95vh] sm:h-[90vh] flex flex-col p-0 gap-0">

        {/* 📱 HEADER FIJO - CON BOTÓN CENTRADO */}
        <DialogHeader className="px-3 py-3 sm:px-4 lg:px-6 sm:py-4 border-b flex-shrink-0 flex flex-row items-center justify-between space-y-0 relative">
          <DialogTitle className="text-sm sm:text-base lg:text-lg truncate pr-4 max-w-[30%] sm:max-w-[40%]" title={documentName}>
            Previsualización: {documentName}
          </DialogTitle>

          {/* Botón de Recarga Manual CENTRADO y LLAMATIVO */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 bg-background text-primary border-primary/20 hover:bg-primary hover:text-primary-foreground hover:border-primary h-8 font-medium transition-all shadow-sm hover:shadow-md"
              onClick={handleManualReload}
              title="Si no carga la vista, pulsa aquí"
            >
              <RotateCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Recargar Vista</span>
              <span className="sm:hidden">Recargar</span>
            </Button>
          </div>

          {/* Espaciador para equilibrar el header si fuera necesario, pero el layout es justify-between */}
          <div className="w-8"></div>
        </DialogHeader>

        {/* 📱 IFRAME CONTAINER - CRECE PARA LLENAR ESPACIO */}
        <div className="flex-1 overflow-hidden min-h-0 w-full relative bg-muted/10">

          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 z-10 backdrop-blur-sm">
              <Loader2 className="h-10 w-10 animate-spin text-primary mb-3" />
              <p className="text-sm text-muted-foreground font-medium">
                Cargando vista previa...
                {retryCount > 0 && <span className="block text-xs mt-1 opacity-80">(Intento {retryCount}/3)</span>}
              </p>
            </div>
          )}

          <iframe
            key={key} // Force re-render on key change
            src={googleDocsViewerUrl}
            className="w-full h-full border-0"
            aria-label={`Preview of ${documentName}`}
            title={`Preview of ${documentName}`}
            onLoad={handleIframeLoad}
          >
            {/* 📱 FALLBACK RESPONSIVE CUANDO IFRAME NO CARGA (Legacy fallback) */}
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground bg-muted/50 rounded-md p-3 sm:p-4">
              <p className="font-semibold text-sm sm:text-base">La previsualización no está disponible.</p>
              <p className="text-xs sm:text-sm mt-2 mb-4">
                Tu navegador no puede mostrar este PDF aquí.
              </p>
              <Button onClick={handleManualReload} variant="outline" size="sm" className="gap-2">
                <RotateCw className="h-4 w-4" /> Recargar
              </Button>
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
                onClick={handleDownload}
                disabled={isDownloading}
                className="w-full sm:w-auto h-9 sm:h-10 text-xs sm:text-sm"
              >
                {isDownloading ? (
                  <Loader2 className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 animate-spin" />
                ) : (
                  <Download className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                )}
                <span>{isDownloading ? 'Descargando...' : 'Descargar'}</span>
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