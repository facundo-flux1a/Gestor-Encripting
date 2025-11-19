'use client';

import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, X } from 'lucide-react';
import { uploadDocument } from '@/services/upload-service';
import { useToast } from '@/hooks/use-toast';

interface UploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  companies: Array<{ id: number; nombre: string }>;
  onUploadComplete?: () => void;
}

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  // Handlers para drag & drop
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
    
    // Tipos de archivo aceptados
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
    
    // Filtrar solo archivos aceptados
    const validFiles = droppedFiles.filter(file => {
      return acceptedTypes.includes(file.type);
    });

    if (validFiles.length > 0) {
      setFiles(prevFiles => [...prevFiles, ...validFiles]);
    }

    if (droppedFiles.length > validFiles.length) {
      toast({
        title: "Archivos no válidos",
        description: "Algunos archivos no tienen un formato válido y fueron ignorados",
        variant: "destructive",
      });
    }
  };

  const handleUpload = async () => {
    if (!selectedCompanyId || files.length === 0) {
      toast({
        title: "Datos incompletos",
        description: "Por favor selecciona una empresa y al menos un archivo",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      // Procesar cada archivo
      for (const file of files) {
        try {
          // Generar uploadId único
          const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          console.log('📤 [UploadDialog] Subiendo:', file.name, 'uploadId:', uploadId);
          
          // Agregar al UploadProgressManager
          if ((window as any).__uploadProgressManager) {
            (window as any).__uploadProgressManager.addUpload(uploadId, file.name);
          }
          
          // Preparar FormData
          const formData = new FormData();
          formData.append('file', file);
          formData.append('empresaId', selectedCompanyId);
          formData.append('uploadId', uploadId);

          // Subir el archivo (esto dispara el flujo de n8n)
          await uploadDocument(formData);
          successCount++;
          
        } catch (error: any) {
          console.error('❌ [UploadDialog] Error subiendo:', file.name, error);
          errorCount++;
          
          // Mostrar toast en lugar de alert
          const errorMessage = error.message?.includes('413') || error.message?.includes('Body exceeded')
            ? `El archivo "${file.name}" es demasiado grande. Límite: 10MB`
            : `Error al subir "${file.name}"`;

          toast({
            title: "Error al subir archivo",
            description: errorMessage,
            variant: "destructive",
          });
        }
      }

      // Mostrar resumen si hubo éxitos
      if (successCount > 0) {
        toast({
          title: "Archivos enviados",
          description: `${successCount} archivo(s) en procesamiento${errorCount > 0 ? `, ${errorCount} fallaron` : ''}`,
        });
      }
    } finally {
      // Limpiar estado y cerrar SIEMPRE (incluso si hubo errores)
      setFiles([]);
      setSelectedCompanyId('');
      setIsUploading(false);
      
      // Cerrar el modal primero
      onClose();
      
      // Luego notificar (para que el progress dialog se muestre encima)
      setTimeout(() => {
        onUploadComplete?.();
      }, 100);
    }
  };

  const handleClose = () => {
    // Siempre limpiar estado y cerrar (incluso si está uploading)
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        handleClose();
      }
    }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Subir Nuevos Documentos</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Selector de empresa */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              Empresa destino <span className="text-red-500">*</span>
            </label>
            <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona una empresa" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id.toString()}>
                    {company.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Drop zone con drag & drop funcional */}
          <div
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging
                ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/20'
                : 'border-gray-300 dark:border-gray-700'
            }`}
          >
            <Upload className={`mx-auto h-12 w-12 mb-4 transition-colors ${
              isDragging ? 'text-violet-500' : 'text-gray-400'
            }`} />
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
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
              className="cursor-pointer" 
              onClick={handleSelectFilesClick}
              type="button"
            >
              Seleccionar archivos
            </Button>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
              PDF - ZIP
            </p>
          </div>

          {/* Lista de archivos seleccionados */}
          {files.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Archivos seleccionados ({files.length})
              </p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {files.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 p-2 rounded"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-sm truncate block">{file.name}</span>
                      <span className="text-xs text-gray-500">
                        {(file.size / 1024).toFixed(2)} KB
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 flex-shrink-0"
                      onClick={() => handleRemoveFile(index)}
                      disabled={isUploading}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Botones de acción */}
          <div className="flex justify-end gap-2">
            <Button 
              variant="outline" 
              onClick={handleClose} 
              disabled={isUploading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!selectedCompanyId || files.length === 0 || isUploading}
            >
              {isUploading ? 'Subiendo...' : `Subir ${files.length} archivo(s)`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}