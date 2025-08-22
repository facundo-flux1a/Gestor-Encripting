'use client';

import { useState, useCallback, useEffect } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileUp, FileText, X, CheckCircle, AlertCircle } from 'lucide-react';
import { uploadDocument } from '@/services/upload-service';
import { extractTextFromPdf } from '@/utils/pdf-worker-setup';
import * as pdfjsLib from 'pdfjs-dist';

interface UploadDocumentDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onUploadSuccess: () => void;
}

type FileStatus = 'pending' | 'extracting' | 'uploading' | 'success' | 'error';

interface UploadableFile {
    file: File;
    status: FileStatus;
    progress: number;
    message?: string;
}

export function UploadDocumentDialog({ isOpen, setIsOpen, onUploadSuccess }: UploadDocumentDialogProps) {
  const [uploadableFiles, setUploadableFiles] = useState<UploadableFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isWorkerReady, setIsWorkerReady] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // We just need to set the worker source. The actual setup is now in the utility file.
    // This ensures pdf.js knows where to find its worker script.
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
    setIsWorkerReady(true);
  }, []);

  const onDrop = useCallback((acceptedFiles: File[], fileRejections: FileRejection[]) => {
    const newFiles: UploadableFile[] = acceptedFiles.map(file => ({
      file,
      status: 'pending',
      progress: 0,
    }));
    setUploadableFiles(prev => [...prev, ...newFiles]);

    if (fileRejections.length > 0) {
      toast({
        title: 'Algunos archivos no fueron aceptados',
        description: `${fileRejections.length} archivo(s) no se pudieron agregar.`,
        variant: 'destructive',
      });
    }
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
  });

  const removeFile = (fileName: string) => {
    setUploadableFiles(files => files.filter(f => f.file.name !== fileName));
  };

  const updateFileStatus = (fileName: string, status: FileStatus, message?: string) => {
    setUploadableFiles(prev => prev.map(uf => 
      uf.file.name === fileName ? { ...uf, status, message } : uf
    ));
  };
  
  const processFile = async (uploadableFile: UploadableFile): Promise<boolean> => {
    const { file } = uploadableFile;
    let extractedText = '';

    try {
      // Step 1: Extract text if it's a PDF
      if (file.type === 'application/pdf') {
        updateFileStatus(file.name, 'extracting', 'Extrayendo texto...');
        extractedText = await extractTextFromPdf(file);
      } else {
        extractedText = `Archivo no-PDF: ${file.name}, Tamaño: ${file.size} bytes.`;
      }
      
      // Step 2: Upload
      updateFileStatus(file.name, 'uploading', 'Enviando a n8n y subiendo...');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('text', extractedText);
      formData.append('fileName', file.name);

      const result = await uploadDocument(formData);
      
      updateFileStatus(file.name, 'success', result.message);
      return true;

    } catch (error: any) {
      console.error(`Error procesando ${file.name}:`, error);
      updateFileStatus(file.name, 'error', error.message || 'Error desconocido');
      return false;
    }
  };

  const handleUpload = async () => {
    if (uploadableFiles.length === 0) return;

    setIsProcessing(true);

    const promises = uploadableFiles.map(processFile);
    const results = await Promise.allSettled(promises);
    
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;

    setIsProcessing(false);

    toast({
      title: 'Proceso Finalizado',
      description: `${successCount} de ${uploadableFiles.length} archivos subidos exitosamente.`,
    });

    if (successCount > 0) {
      onUploadSuccess();
    }
    // Clear all files after processing is done to allow for a new batch
    setUploadableFiles([]);
    if (successCount === uploadableFiles.length) {
       setTimeout(() => {
        setIsOpen(false);
      }, 1000);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (isProcessing) return;
    if (!open) {
      setUploadableFiles([]);
    }
    setIsOpen(open);
  };
  
  const getStatusIcon = (status: FileStatus) => {
      switch (status) {
          case 'pending': return <FileText className="h-5 w-5 text-muted-foreground" />;
          case 'extracting':
          case 'uploading': return <Loader2 className="h-5 w-5 text-primary animate-spin" />;
          case 'success': return <CheckCircle className="h-5 w-5 text-green-500" />;
          case 'error': return <AlertCircle className="h-5 w-5 text-destructive" />;
      }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Subir Nuevos Documentos</DialogTitle>
          <DialogDescription>
            Selecciona uno o más archivos. El texto de los PDFs se extraerá y enviará para su procesamiento.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
          <div
            {...getRootProps()}
            className={`flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
              isDragActive ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
            } ${isProcessing || !isWorkerReady ? 'pointer-events-none opacity-50' : ''}`}
          >
            <input {...getInputProps()} disabled={isProcessing || !isWorkerReady} />
            <FileUp className="h-10 w-10 text-muted-foreground mb-2" />
            {isDragActive ? (
              <p>Suelta los archivos aquí...</p>
            ) : (
              <p className="text-center">Arrastra y suelta archivos aquí, o haz clic para seleccionar</p>
            )}
             {!isWorkerReady && (
              <p className="text-xs text-orange-500 mt-2">Inicializando procesador de PDF...</p>
            )}
          </div>
          
          {uploadableFiles.length > 0 && (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                <h4 className="text-sm font-medium">Archivos en cola ({uploadableFiles.length}):</h4>
                {uploadableFiles.map(({file, status, message}) => (
                     <div key={file.name} className="flex items-center justify-between p-2 bg-muted rounded-md gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                           {getStatusIcon(status)}
                            <div className="min-w-0">
                                <p className="text-sm font-medium truncate block" title={file.name}>{file.name}</p>
                                <p className="text-xs text-muted-foreground truncate" title={message}>
                                    {status === 'pending' ? `${(file.size / 1024).toFixed(1)} KB` : message || status}
                                </p>
                            </div>
                        </div>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 flex-shrink-0" 
                            onClick={() => removeFile(file.name)} 
                            disabled={isProcessing}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                ))}
            </div>
          )}
        </div>
        
        <DialogFooter>
          <DialogClose asChild>
              <Button variant="outline" disabled={isProcessing}>
                Cancelar
              </Button>
          </DialogClose>
          <Button 
            onClick={handleUpload} 
            disabled={uploadableFiles.length === 0 || isProcessing || !isWorkerReady} 
          >
            {isProcessing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
                <FileUp className="mr-2 h-4 w-4" />
            )}
            <span>
                {isProcessing ? 'Procesando...' : `Subir ${uploadableFiles.length} archivo${uploadableFiles.length !== 1 ? 's' : ''}`}
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
