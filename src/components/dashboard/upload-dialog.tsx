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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileUp, FileText, X, CheckCircle, AlertCircle, Rocket } from 'lucide-react';
import { uploadDocument } from '@/services/upload-service';
import { useCompanyContext } from '@/context/CompanyProvider';

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
  const [selectedCompanyForUpload, setSelectedCompanyForUpload] = useState<number | null>(null);
  const { toast } = useToast();
  const { companies } = useCompanyContext();

  console.log('🔍 [UploadDialog] Estado:', {
    empresasTotal: companies.length,
    empresaSeleccionada: selectedCompanyForUpload,
    archivosEnCola: uploadableFiles.length
  });

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
    if (uploadableFile.status !== 'pending') return true;

    const { file } = uploadableFile;
    try {
      updateFileStatus(file.name, 'uploading', 'Subiendo archivo...');
      
      const formData = new FormData();
      formData.append('file', file);
      
      if (selectedCompanyForUpload) {
        formData.append('empresaId', selectedCompanyForUpload.toString());
        console.log('📤 [UploadDialog] Enviando archivo con empresaId:', selectedCompanyForUpload);
      } else {
        throw new Error('No hay empresa seleccionada');
      }

      await uploadDocument(formData);
      
      updateFileStatus(file.name, 'success', 'Archivo enviado para análisis.');
      return true;

    } catch (error: any) {
      console.error(`Error procesando ${file.name}:`, error);
      updateFileStatus(file.name, 'error', error.message || 'Error desconocido al subir.');
      return false;
    }
  };

  const handleUpload = async () => {
    // Validar empresa seleccionada
    if (!selectedCompanyForUpload) {
      toast({
        title: 'Empresa no seleccionada',
        description: 'Por favor selecciona una empresa antes de subir los documentos.',
        variant: 'destructive',
      });
      return;
    }

    const filesToUpload = uploadableFiles.filter(f => f.status === 'pending');
    if (filesToUpload.length === 0) {
      toast({
        title: 'Sin archivos',
        description: 'No hay archivos pendientes para subir.',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);
    setIsOpen(false); 

    const { id: toastId, update } = toast({
      title: "Iniciando subida...",
      description: `Enviando ${filesToUpload.length} archivo(s) en paralelo.`,
    });

    const uploadPromises = filesToUpload.map(file => processFile(file));

    await Promise.all(uploadPromises);
    
    setIsProcessing(false);
    
    const currentFiles = uploadableFiles;
    const successCount = currentFiles.filter(f => f.status === 'success').length;
    const errorCount = currentFiles.filter(f => f.status === 'error').length;
    
    update({
      id: toastId,
      title: "Proceso de subida finalizado",
      description: `${successCount} archivo(s) enviados. ${errorCount > 0 ? `${errorCount} con error.` : ''}`,
      variant: errorCount > 0 ? "destructive" : "default",
    });
    
    if(successCount > 0) {
      onUploadSuccess();
    }
    
    setUploadableFiles([]);
    setSelectedCompanyForUpload(null);
  };

  const handleOpenChange = (open: boolean) => {
    if (isProcessing) return;
    if (!open) {
      setUploadableFiles([]);
      setSelectedCompanyForUpload(null);
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

  const filesPending = uploadableFiles.some(f => f.status === 'pending');
  const hasCompanies = companies.length > 0;
  const canUpload = filesPending && selectedCompanyForUpload && !isProcessing;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Subir Nuevos Documentos</DialogTitle>
          <DialogDescription>
            {!hasCompanies 
              ? '⚠️ No tienes empresas creadas. Crea una empresa primero desde el selector lateral.'
              : 'Selecciona la empresa destino y arrastra los documentos a subir.'
            }
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
          {/* Selector de empresa - SIEMPRE VISIBLE */}
          <div className="space-y-2">
            <Label htmlFor="company">
              Empresa destino <span className="text-red-500">*</span>
            </Label>
            <Select
              value={selectedCompanyForUpload?.toString() || ''}
              onValueChange={(value) => {
                const id = parseInt(value, 10);
                setSelectedCompanyForUpload(id);
                console.log('✅ [UploadDialog] Empresa seleccionada:', id);
              }}
              disabled={!hasCompanies}
            >
              <SelectTrigger id="company">
                <SelectValue placeholder={hasCompanies ? "Selecciona una empresa" : "No hay empresas disponibles"} />
              </SelectTrigger>
              <SelectContent>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id.toString()}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!hasCompanies && (
              <p className="text-xs text-muted-foreground">
                💡 Tip: Crea una empresa usando el botón "+ Nueva" en el selector lateral
              </p>
            )}
          </div>

          {/* Dropzone */}
          <div
            {...getRootProps()}
            className={`flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
              isDragActive ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
            } ${!hasCompanies || isProcessing ? 'pointer-events-none opacity-50' : ''}`}
          >
            <input {...getInputProps()} disabled={!hasCompanies || isProcessing} />
            <FileUp className="h-10 w-10 text-muted-foreground mb-2" />
            {isDragActive ? (
              <p>Suelta los archivos aquí...</p>
            ) : (
              <p className="text-center">
                {!hasCompanies
                  ? 'Crea una empresa primero'
                  : 'Arrastra y suelta archivos aquí, o haz clic para seleccionar'
                }
              </p>
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
                            disabled={isProcessing || status !== 'pending'}
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
            disabled={!canUpload}
          >
            {isProcessing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
                <Rocket className="mr-2 h-4 w-4" />
            )}
            <span>
                {isProcessing ? 'Procesando...' : `Subir ${uploadableFiles.filter(f=>f.status === 'pending').length} archivo(s)`}
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}