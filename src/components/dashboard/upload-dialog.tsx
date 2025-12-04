'use client';

import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, X, AlertCircle } from 'lucide-react';
import { uploadDocument } from '@/services/upload-service';
import { useToast } from '@/hooks/use-toast';

interface UploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  companies: Array<{ id: number; nombre: string }>;
  onUploadComplete?: () => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export function UploadDialog({ 
  isOpen, 
  onClose, 
  companies,
  onUploadComplete 
}: UploadDialogProps) {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const validateFileSize = (file: File): boolean => {
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "❌ Archivo demasiado grande",
        description: `"${file.name}" excede el límite de 10 MB (tamaño: ${(file.size / 1024 / 1024).toFixed(2)} MB)`,
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      const validFiles = selectedFiles.filter(file => validateFileSize(file));
      
      if (validFiles.length > 0) {
        setFiles(prevFiles => [...prevFiles, ...validFiles]);
      }
    }
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    
    const acceptedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'application/zip',
      'application/x-rar-compressed',
      'application/vnd.rar',
    ];
    
    const validFiles = droppedFiles.filter(file => {
      const isValidType = acceptedTypes.includes(file.type);
      const isValidSize = validateFileSize(file);
      
      if (!isValidType) {
        return false;
      }
      
      return isValidSize;
    });

    if (validFiles.length > 0) {
      setFiles(prevFiles => [...prevFiles, ...validFiles]);
    }

    const invalidTypeFiles = droppedFiles.filter(file => !acceptedTypes.includes(file.type));
    if (invalidTypeFiles.length > 0) {
      toast({
        title: "⚠️ Archivos no válidos",
        description: "Algunos archivos no tienen un formato válido y fueron ignorados",
        variant: "destructive",
      });
    }
  };

  const handleUpload = async () => {
    if (!selectedCompanyId || files.length === 0) {
      toast({
        title: "⚠️ Datos incompletos",
        description: "Por favor selecciona una empresa y al menos un archivo",
        variant: "destructive",
      });
      return;
    }

    const oversizedFiles = files.filter(file => file.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      toast({
        title: "❌ Archivos demasiado grandes",
        description: `${oversizedFiles.length} archivo(s) exceden el límite de 10 MB. Por favor, elimínalos antes de continuar.`,
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const file of files) {
        try {
          const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          console.log('📤 [UploadDialog] Subiendo:', file.name, 'uploadId:', uploadId);
          
          if ((window as any).__uploadProgressManager) {
            (window as any).__uploadProgressManager.addUpload(uploadId, file.name);
          }
          
          const formData = new FormData();
          formData.append('file', file);
          formData.append('empresaId', selectedCompanyId);
          formData.append('uploadId', uploadId);

          await uploadDocument(formData);
          successCount++;
          
        } catch (error: any) {
          console.error('❌ [UploadDialog] Error subiendo:', file.name, error);
          errorCount++;
          
          const errorMessage = error.message?.includes('413') || error.message?.includes('Body exceeded')
            ? `El archivo "${file.name}" es demasiado grande. Límite: 10MB`
            : `Error al subir "${file.name}": ${error.message || 'Error desconocido'}`;

          toast({
            title: "❌ Error al subir archivo",
            description: errorMessage,
            variant: "destructive",
          });
        }
      }

      if (successCount > 0) {
        toast({
          title: "✅ Archivos enviados",
          description: `${successCount} archivo(s) en procesamiento${errorCount > 0 ? `, ${errorCount} fallaron` : ''}`,
        });
      }
    } finally {
      setFiles([]);
      setSelectedCompanyId('');
      setIsUploading(false);
      
      onClose();
      
      setTimeout(() => {
        onUploadComplete?.();
      }, 100);
    }
  };

  const handleClose = () => {
    setFiles([]);
    setSelectedCompanyId('');
    setIsUploading(false);
    onClose();
  };

  const handleRemoveFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleSelectFilesClick = () => {
    fileInputRef.current?.click();
  };

  const hasOversizedFiles = files.some(file => file.size > MAX_FILE_SIZE);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        handleClose();
      }
    }}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="px-3 sm:px-6 py-3 sm:py-6">
          <DialogTitle className="text-base sm:text-lg">
            Subir Nuevos Documentos
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 sm:space-y-4 px-3 sm:px-6 pb-3 sm:pb-6">
          {/* Selector de empresa */}
          <div>
            <label className="text-xs sm:text-sm font-medium mb-1.5 sm:mb-2 block">
              Empresa destino <span className="text-red-500">*</span>
            </label>
            <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
              <SelectTrigger className="h-8 sm:h-9 text-xs sm:text-sm">
                <SelectValue placeholder="Selecciona una empresa" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((company) => (
                  <SelectItem 
                    key={company.id} 
                    value={company.id.toString()}
                    className="text-xs sm:text-sm"
                  >
                    {company.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Drop zone */}
          <div
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-4 sm:p-6 lg:p-8 text-center transition-colors ${
              isDragging
                ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/20'
                : 'border-gray-300 dark:border-gray-700'
            }`}
          >
            <Upload className={`mx-auto h-8 w-8 sm:h-10 sm:w-10 lg:h-12 lg:w-12 mb-2 sm:mb-3 lg:mb-4 transition-colors ${
              isDragging ? 'text-violet-500' : 'text-gray-400'
            }`} />
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-2 px-2">
              {isDragging
                ? 'Suelta los archivos aquí'
                : 'Arrastra y suelta archivos aquí, o haz clic para seleccionar'}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileChange}
              className="hidden"
              id="file-upload"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.zip,.rar"
            />
            <Button 
              variant="outline" 
              className="cursor-pointer h-7 sm:h-8 text-xs sm:text-sm" 
              onClick={handleSelectFilesClick}
              type="button"
            >
              Seleccionar archivos
            </Button>
            <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-500 mt-1.5 sm:mt-2">
              PDF - ZIP (máx. 10 MB por archivo)
            </p>
          </div>

          {/* Alerta de archivos grandes */}
          {hasOversizedFiles && (
            <div className="flex items-start gap-2 sm:gap-3 p-2 sm:p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-medium text-red-800 dark:text-red-200">
                  Archivos demasiado grandes detectados
                </p>
                <p className="text-[10px] sm:text-xs text-red-600 dark:text-red-300 mt-0.5 sm:mt-1">
                  Algunos archivos exceden el límite de 10 MB. Por favor, elimínalos antes de continuar.
                </p>
              </div>
            </div>
          )}

          {/* Lista de archivos */}
          {files.length > 0 && (
            <div className="space-y-1.5 sm:space-y-2">
              <p className="text-xs sm:text-sm font-medium">
                Archivos seleccionados ({files.length})
              </p>
              <div className="max-h-32 sm:max-h-40 overflow-y-auto space-y-1">
                {files.map((file, index) => {
                  const isOversized = file.size > MAX_FILE_SIZE;
                  return (
                    <div
                      key={index}
                      className={`flex items-center justify-between p-1.5 sm:p-2 rounded ${
                        isOversized 
                          ? 'bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800' 
                          : 'bg-gray-50 dark:bg-gray-800'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
                        {isOversized && (
                          <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <span className={`text-xs sm:text-sm truncate block ${
                            isOversized ? 'text-red-800 dark:text-red-200 font-medium' : ''
                          }`} title={file.name}>
                            {file.name}
                          </span>
                          <span className={`text-[10px] sm:text-xs ${
                            isOversized 
                              ? 'text-red-600 dark:text-red-400 font-medium' 
                              : 'text-gray-500'
                          }`}>
                            {(file.size / 1024 / 1024).toFixed(2)} MB
                            {isOversized && ' - Excede 10 MB'}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0"
                        onClick={() => handleRemoveFile(index)}
                        disabled={isUploading}
                      >
                        <X className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Botones */}
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
            <Button 
              variant="outline" 
              onClick={handleClose} 
              disabled={isUploading}
              className="w-full sm:w-auto h-8 sm:h-9 text-xs sm:text-sm"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!selectedCompanyId || files.length === 0 || isUploading || hasOversizedFiles}
              className="w-full sm:w-auto h-8 sm:h-9 text-xs sm:text-sm"
            >
              {isUploading ? 'Subiendo...' : `Subir ${files.length} archivo(s)`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}