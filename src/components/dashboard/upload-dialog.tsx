'use client';

import { useState, useCallback } from 'react';
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

interface UploadDocumentDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onUploadSuccess: () => void;
}

type FileStatus = 'pending' | 'uploading' | 'success' | 'error';

interface UploadableFile {
    file: File;
    status: FileStatus;
    message?: string;
}

export function UploadDocumentDialog({ isOpen, setIsOpen, onUploadSuccess }: UploadDocumentDialogProps) {
  const [uploadableFiles, setUploadableFiles] = useState<UploadableFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const onDrop = useCallback((acceptedFiles: File[], fileRejections: FileRejection[]) => {
    const newFiles: UploadableFile[] = acceptedFiles.map(file => ({
      file,
      status: 'pending',
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
    try {
      updateFileStatus(file.name, 'uploading', 'Subiendo archivo...');
      
      const formData = new FormData();
      formData.append('file', file);

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
    await Promise.allSettled(promises);
    
    const successCount = uploadableFiles.filter(f => f.status === 'success').length;

    setIsProcessing(false);

    toast({
      title: 'Proceso Finalizado',
      description: `${successCount} de ${uploadableFiles.length} archivos subidos exitosamente.`,
    });

    if (successCount > 0) {
      onUploadSuccess();
    }
    
    if (successCount === uploadableFiles.length) {
       setTimeout(() => {
        setUploadableFiles([]);
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
            Selecciona uno o más archivos para subir. Serán procesados por el sistema.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
          <div
            {...getRootProps()}
            className={`flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
              isDragActive ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
            } ${isProcessing ? 'pointer-events-none opacity-50' : ''}`}
          >
            <input {...getInputProps()} disabled={isProcessing} />
            <FileUp className="h-10 w-10 text-muted-foreground mb-2" />
            {isDragActive ? (
              <p>Suelta los archivos aquí...</p>
            ) : (
              <p className="text-center">Arrastra y suelta archivos aquí, o haz clic para seleccionar</p>
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
            disabled={uploadableFiles.length === 0 || isProcessing} 
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
