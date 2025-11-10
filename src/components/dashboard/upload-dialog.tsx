'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, X } from 'lucide-react';
import { uploadDocument } from '@/services/upload-service';
import { UploadProgressCard } from '@/components/upload/upload-progress-card';

interface UploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  companies: Array<{ id: number; nombre: string }>;
  onUploadComplete?: () => void;
}

interface UploadingFile {
  uploadId: string;
  fileName: string;
  file: File;
}

export function UploadDialog({ 
  isOpen, 
  onClose, 
  companies,
  onUploadComplete 
}: UploadDialogProps) {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleUpload = async () => {
    if (!selectedCompanyId || files.length === 0) {
      alert('Por favor selecciona una empresa y al menos un archivo');
      return;
    }

    setIsUploading(true);

    // Preparar los archivos para subir
    const filesToUpload: UploadingFile[] = files.map(file => ({
      uploadId: `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      fileName: file.name,
      file: file
    }));

    setUploadingFiles(filesToUpload);

    // Procesar cada archivo
    for (const fileData of filesToUpload) {
      try {
        console.log('📤 [UploadDialog] Subiendo:', fileData.fileName, 'uploadId:', fileData.uploadId);
        
        const formData = new FormData();
        formData.append('file', fileData.file);
        formData.append('empresaId', selectedCompanyId);
        formData.append('uploadId', fileData.uploadId);

        // Subir el archivo (esto dispara el flujo de n8n)
        await uploadDocument(formData);
        
      } catch (error) {
        console.error('❌ [UploadDialog] Error subiendo:', fileData.fileName, error);
      }
    }

    // Limpiar selección de archivos
    setFiles([]);
    setIsUploading(false);
  };

  const handleProgressComplete = (uploadId: string) => {
    console.log('✅ [UploadDialog] Archivo completado:', uploadId);
    
    // Remover de la lista de uploads activos
    setUploadingFiles(prev => prev.filter(f => f.uploadId !== uploadId));
    
    // Si ya no hay archivos subiendo, actualizar la lista de documentos
    if (uploadingFiles.length === 1) {
      onUploadComplete?.();
    }
  };

  const handleProgressError = (uploadId: string, error: string) => {
    console.error('❌ [UploadDialog] Error en archivo:', uploadId, error);
    
    // Remover de la lista de uploads activos
    setUploadingFiles(prev => prev.filter(f => f.uploadId !== uploadId));
  };

  const handleClose = () => {
    // Solo permitir cerrar si no hay uploads activos
    if (uploadingFiles.length === 0) {
      setFiles([]);
      setSelectedCompanyId('');
      onClose();
    }
  };

  return (
    <>
      {/* Dialog principal para seleccionar archivos */}
      <Dialog open={isOpen && uploadingFiles.length === 0} onOpenChange={handleClose}>
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

            {/* Drop zone */}
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-sm text-gray-600 mb-2">
                Arrastra y suelta archivos aquí, o haz clic para seleccionar
              </p>
              <input
                type="file"
                multiple
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload">
                <Button variant="outline" className="cursor-pointer" asChild>
                  <span>Seleccionar archivos</span>
                </Button>
              </label>
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
                      className="flex items-center justify-between bg-gray-50 p-2 rounded"
                    >
                      <span className="text-sm truncate">{file.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setFiles(files.filter((_, i) => i !== index))}
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
              <Button variant="outline" onClick={handleClose}>
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

      {/* Cards de progreso flotantes */}
      {uploadingFiles.length > 0 && (
        <div className="fixed bottom-4 right-4 space-y-2 z-50 max-h-[80vh] overflow-y-auto">
          {uploadingFiles.map((fileData) => (
            <UploadProgressCard
              key={fileData.uploadId}
              uploadId={fileData.uploadId}
              fileName={fileData.fileName}
              onComplete={() => handleProgressComplete(fileData.uploadId)}
              onError={(error) => handleProgressError(fileData.uploadId, error)}
              onClose={() => handleProgressComplete(fileData.uploadId)}
            />
          ))}
        </div>
      )}
    </>
  );
}