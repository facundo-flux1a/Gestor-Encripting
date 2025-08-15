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
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileUp, FileCheck, X } from 'lucide-react';
import { uploadDocument } from '@/services/upload-service';

interface UploadDocumentDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onUploadSuccess: () => void;
}

export function UploadDocumentDialog({ isOpen, setIsOpen, onUploadSuccess }: UploadDocumentDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
  });

  const handleUpload = async () => {
    if (!file) {
      toast({
        title: 'Error',
        description: 'Por favor, selecciona un archivo PDF para subir.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const result = await uploadDocument(formData);
      toast({
        title: 'Éxito',
        description: result.message,
      });
      onUploadSuccess();
    } catch (error: any) {
      toast({
        title: 'Error al subir',
        description: error.message || 'Ocurrió un problema al subir el archivo.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setFile(null); // Reset file after upload attempt
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setFile(null);
      setIsLoading(false);
    }
    setIsOpen(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Subir Nuevo Documento</DialogTitle>
          <DialogDescription>
            Selecciona un archivo PDF para enviarlo a tu flujo de trabajo de n8n.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div
            {...getRootProps()}
            className={`flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
              isDragActive ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
            }`}
          >
            <input {...getInputProps()} />
            <FileUp className="h-10 w-10 text-muted-foreground mb-2" />
            {isDragActive ? (
              <p>Suelta el archivo aquí...</p>
            ) : (
              <p className="text-center">Arrastra y suelta un PDF aquí, o haz clic para seleccionar</p>
            )}
          </div>
          {file && (
            <div className="mt-4 flex items-center justify-between p-2 bg-muted rounded-md">
              <div className="flex items-center gap-2 min-w-0">
                <FileCheck className="h-5 w-5 text-green-500 flex-shrink-0" />
                <span className="text-sm font-medium truncate">{file.name}</span>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => setFile(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isLoading} className="w-full sm:w-auto">
              Cancelar
            </Button>
          <Button onClick={handleUpload} disabled={!file || isLoading} className="w-full sm:w-auto">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Subiendo...
              </>
            ) : (
              'Subir y Procesar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
