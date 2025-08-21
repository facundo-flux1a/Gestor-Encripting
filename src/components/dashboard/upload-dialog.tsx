'use client';

import { useState, useCallback } from 'react';
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
import { Loader2, FileUp, FileCheck, X, FileText } from 'lucide-react';
import { uploadDocument } from '@/services/upload-service';
import { Progress } from '../ui/progress';

interface UploadDocumentDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onUploadSuccess: () => void;
}

export function UploadDocumentDialog({ isOpen, setIsOpen, onUploadSuccess }: UploadDocumentDialogProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const { toast } = useToast();

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

    setIsLoading(true);
    setUploadProgress({ current: 0, total: files.length });

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress({ current: i + 1, total: files.length });
        
        const formData = new FormData();
        formData.append('file', file);

        try {
            const result = await uploadDocument(formData);
            
            toast({
              title: `Éxito: ${file.name}`,
              description: result.message,
            });
        } catch (error: any) {
            toast({
              title: `Error al subir ${file.name}`,
              description: error.message || 'Ocurrió un problema al procesar o subir el archivo.',
              variant: 'destructive',
            });
        }
    }

    setIsLoading(false);
    setFiles([]); 
    setUploadProgress({ current: 0, total: 0 });
    toast({
        title: 'Proceso Finalizado',
        description: 'Se ha completado la subida de todos los archivos seleccionados.',
    });
    onUploadSuccess();
    setIsOpen(false);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setFiles([]);
      setIsLoading(false);
      setUploadProgress({ current: 0, total: 0 });
    }
    setIsOpen(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Subir Nuevos Documentos</DialogTitle>
          <DialogDescription>
            Selecciona uno o más archivos PDF. Se analizarán para procesar su contenido.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div
            {...getRootProps()}
            className={`flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
              isDragActive ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
            }`}
          >
            <input {...getInputProps()} />
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
                            <span className="text-sm font-medium truncate">{file.name}</span>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => removeFile(file.name)} disabled={isLoading}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                ))}
            </div>
          )}
           {isLoading && (
            <div className="space-y-2">
                 <Progress value={(uploadProgress.current / uploadProgress.total) * 100} className="w-full" />
                 <p className="text-sm text-center text-muted-foreground">
                    Procesando {uploadProgress.current} de {uploadProgress.total} archivos...
                 </p>
            </div>
          )}
        </div>
        <DialogFooter className="flex-col-reverse sm:flex-row">
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isLoading} className="w-full sm:w-auto">
              Cancelar
            </Button>
          <Button onClick={handleUpload} disabled={files.length === 0 || isLoading} className="w-full sm:w-auto">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Procesando...
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
