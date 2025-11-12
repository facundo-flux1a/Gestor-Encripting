'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, X } from 'lucide-react';
import { uploadDocument } from '@/services/upload-service';

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

    // Procesar cada archivo
    for (const file of files) {
      try {
        // Generar uploadId único
        const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        console.log('📤 [UploadDialog] Subiendo:', file.name, 'uploadId:', uploadId);
        
        // 👇 Agregar al UploadProgressManager
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
        
      } catch (error) {
        console.error('❌ [UploadDialog] Error subiendo:', file.name, error);
      }
    }

    // Limpiar y cerrar
    setFiles([]);
    setSelectedCompanyId('');
    setIsUploading(false);
    onClose();
    
    // Notificar que se completaron los uploads
    onUploadComplete?.();
  };

  const handleClose = () => {
    setFiles([]);
    setSelectedCompanyId('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
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
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
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
                    className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 p-2 rounded"
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
            <Button variant="outline" onClick={handleClose} disabled={isUploading}>
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