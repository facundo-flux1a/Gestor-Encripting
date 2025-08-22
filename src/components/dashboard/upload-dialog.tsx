
'use client';

import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileUp, FileText, X } from 'lucide-react';
import { uploadDocument } from '@/services/upload-service';
import { Progress } from '../ui/progress';
import { extractTextFromPdf } from '@/utils/pdf-worker-setup';
import * as pdfjsLib from 'pdfjs-dist';

interface UploadDocumentDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onUploadSuccess: () => void;
}


export function UploadDocumentDialog({ isOpen, setIsOpen, onUploadSuccess }: UploadDocumentDialogProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [currentFileProgress, setCurrentFileProgress] = useState<string>('');
  const [isWorkerReady, setIsWorkerReady] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
      // Configurar el worker de PDF.js solo en el lado del cliente
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
      setIsWorkerReady(true);
      console.log('✅ Worker PDF.js configurado en el cliente');
  }, []);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles(prevFiles => [...prevFiles, ...acceptedFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: true,
  });
  
  const removeFile = (fileName: string) => {
    setFiles(files.filter(file => file.name !== fileName));
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      toast({
        title: 'Error',
        description: 'Por favor, selecciona al menos un archivo PDF para subir.',
        variant: 'destructive',
      });
      return;
    }

    if (!isWorkerReady) {
      toast({
        title: 'Error',
        description: 'El procesador de PDF aún no está listo. Intenta nuevamente.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    setUploadProgress({ current: 0, total: files.length });

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setCurrentFileProgress(`Extrayendo texto: ${file.name}`);
        setUploadProgress({ current: i + 1, total: files.length });
        
        try {
            // Extraer todo el texto del PDF usando la función mejorada
            console.log(`🔄 Extrayendo texto de ${file.name}...`);
            const extractedText = await extractTextFromPdf(file);
            
            console.log(`📝 Texto extraído exitosamente: ${extractedText.length} caracteres`);
            setCurrentFileProgress(`Enviando: ${file.name}`);
            
            // Crear FormData con el archivo y el texto extraído
            const formData = new FormData();
            formData.append('file', file);
            formData.append('text', extractedText);
            formData.append('fileName', file.name);

            // Enviar al servicio de upload
            const result = await uploadDocument(formData);
            
            successCount++;
            toast({
              title: `✅ Éxito: ${file.name}`,
              description: result.message,
            });
            
        } catch (error: any) {
            errorCount++;
            console.error(`❌ Error procesando ${file.name}:`, error);
            toast({
              title: `❌ Error: ${file.name}`,
              description: error.message || 'Ocurrió un problema al procesar o subir el archivo.',
              variant: 'destructive',
            });
        }
    }

    setIsLoading(false);
    setFiles([]); 
    setUploadProgress({ current: 0, total: 0 });
    setCurrentFileProgress('');
    
    // Toast de resumen final
    toast({
        title: '📋 Proceso Finalizado',
        description: `${successCount} archivos subidos exitosamente. ${errorCount} errores.`,
    });
    
    if (successCount > 0) {
        onUploadSuccess();
    }
    setIsOpen(false);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !isLoading) {
      setFiles([]);
      setUploadProgress({ current: 0, total: 0 });
      setCurrentFileProgress('');
    }
    if (!isLoading) {
      setIsOpen(open);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Subir Nuevos Documentos</DialogTitle>
          <DialogDescription>
            Selecciona uno o más archivos PDF. Se extraerá todo el contenido de texto automáticamente.
            {!isWorkerReady && (
              <div className="mt-2 text-orange-600 text-sm">
                ⚠️ Configurando procesador de PDF...
              </div>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div
            {...getRootProps()}
            className={`flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
              isDragActive ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
            } ${isLoading || !isWorkerReady ? 'pointer-events-none opacity-50' : ''}`}
          >
            <input {...getInputProps()} disabled={isLoading} />
            <FileUp className="h-10 w-10 text-muted-foreground mb-2" />
            {isDragActive ? (
              <p>Suelta los archivos aquí...</p>
            ) : (
              <p className="text-center">Arrastra y suelta PDFs aquí, o haz clic para seleccionar</p>
            )}
          </div>
          
          {files.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                <h4 className="text-sm font-medium">Archivos seleccionados ({files.length}):</h4>
                {files.map(file => (
                     <div key={file.name} className="flex items-center justify-between p-2 bg-muted rounded-md">
                        <div className="flex items-center gap-2 min-w-0">
                            <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                            <div className="min-w-0">
                                <span className="text-sm font-medium truncate block">{file.name}</span>
                                <span className="text-xs text-muted-foreground">
                                    {(file.size / 1024 / 1024).toFixed(2)} MB
                                </span>
                            </div>
                        </div>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 flex-shrink-0" 
                            onClick={() => removeFile(file.name)} 
                            disabled={isLoading}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                ))}
            </div>
          )}
          
          {isLoading && (
            <div className="space-y-3">
                <Progress value={(uploadProgress.current / uploadProgress.total) * 100} className="w-full" />
                <div className="text-center">
                    <p className="text-sm text-muted-foreground">
                        Procesando {uploadProgress.current} de {uploadProgress.total} archivos...
                    </p>
                    {currentFileProgress && (
                        <p className="text-xs text-muted-foreground mt-1">
                            {currentFileProgress}
                        </p>
                    )}
                </div>
            </div>
          )}
        </div>
        <DialogFooter className="flex-col-reverse sm:flex-row">
            <Button 
                variant="outline" 
                onClick={() => setIsOpen(false)} 
                disabled={isLoading} 
                className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
          <Button 
            onClick={handleUpload} 
            disabled={files.length === 0 || isLoading || !isWorkerReady} 
            className="w-full sm:w-auto"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Procesando...
              </>
            ) : !isWorkerReady ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Inicializando PDF...
              </>
            ) : (
             `Subir ${files.length} Archivo${files.length > 1 ? 's' : ''}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
