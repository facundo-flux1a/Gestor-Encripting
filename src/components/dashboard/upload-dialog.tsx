'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, X, AlertCircle } from 'lucide-react';
import { enqueueClientUploadBatch } from '@/lib/client-upload-queue';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

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
  const [companyError, setCompanyError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
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
    'application/x-zip-compressed',
  ];
  const acceptedExts = new Set([
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'zip', 'rar',
  ]);

  const isAcceptedFile = (file: File) => {
    const ext = file.name.includes('.')
      ? file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase()
      : '';
    return acceptedTypes.includes(file.type) || acceptedExts.has(ext);
  };

  /** Lee archivos de un drop, incluyendo carpetas (webkitGetAsEntry). */
  const collectFilesFromDataTransfer = async (dataTransfer: DataTransfer): Promise<File[]> => {
    const items = dataTransfer.items;
    if (!items?.length) {
      return Array.from(dataTransfer.files);
    }

    const readEntry = async (entry: FileSystemEntry): Promise<File[]> => {
      if (entry.isFile) {
        const file = await new Promise<File>((resolve, reject) => {
          (entry as FileSystemFileEntry).file(resolve, reject);
        });
        return [file];
      }
      if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        const entries: FileSystemEntry[] = [];
        const readBatch = (): Promise<void> =>
          new Promise((resolve, reject) => {
            reader.readEntries(async (batch) => {
              try {
                if (batch.length === 0) {
                  resolve();
                  return;
                }
                entries.push(...batch);
                await readBatch();
                resolve();
              } catch (err) {
                reject(err);
              }
            }, reject);
          });
        await readBatch();
        const nested = await Promise.all(entries.map(readEntry));
        return nested.flat();
      }
      return [];
    };

    const collected: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const entry = item.webkitGetAsEntry?.();
      if (entry) {
        collected.push(...(await readEntry(entry)));
      } else if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) collected.push(file);
      }
    }

    if (collected.length === 0) {
      return Array.from(dataTransfer.files);
    }
    return collected;
  };

  const processDroppedFiles = useCallback((droppedFiles: File[]) => {
    const candidates = droppedFiles.filter((file) => file.size > 0 || file.name.includes('.'));

    const validFiles = candidates.filter(file => {
      const isValidType = isAcceptedFile(file);
      const isValidSize = validateFileSize(file);
      return isValidType && isValidSize;
    });

    if (validFiles.length > 0) {
      setFiles(prevFiles => [...prevFiles, ...validFiles]);
    }

    const invalidTypeFiles = candidates.filter(file => !isAcceptedFile(file));
    if (invalidTypeFiles.length > 0) {
      const names = invalidTypeFiles.map(f => f.name).slice(0, 5).join(', ');
      const more = invalidTypeFiles.length > 5 ? ` (+${invalidTypeFiles.length - 5} más)` : '';
      toast({
        title: "⚠️ Archivos no válidos",
        description: `Ignorados: ${names}${more}`,
        variant: "destructive",
      });
    } else if (droppedFiles.length > 0 && validFiles.length === 0) {
      toast({
        title: "⚠️ No se encontraron archivos",
        description: "Si soltaste una carpeta, prueba de nuevo o selecciona los PDF con el botón.",
        variant: "destructive",
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  const resetDragState = () => {
    dragCounterRef.current = 0;
    setIsDragging(false);
  };

  const handleZoneDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer?.types?.includes?.('Files') || Array.from(e.dataTransfer?.types || []).includes('Files')) {
      setIsDragging(true);
    }
  };

  const handleZoneDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  };

  const handleZoneDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleZoneDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resetDragState();
    const dropped = await collectFilesFromDataTransfer(e.dataTransfer);
    processDroppedFiles(dropped);
  };

  // Listeners globales mientras el modal está abierto (cubre todo el viewport / overlay)
  useEffect(() => {
    if (!isOpen) {
      resetDragState();
      return;
    }

    let windowDragCounter = 0;

    const hasFiles = (dt: DataTransfer | null) =>
      !!dt && (dt.types.includes('Files') || Array.from(dt.types).includes('Files'));

    const handleWindowDragEnter = (e: DragEvent) => {
      e.preventDefault();
      if (!hasFiles(e.dataTransfer)) return;
      windowDragCounter += 1;
      setIsDragging(true);
    };

    const handleWindowDragLeave = (e: DragEvent) => {
      e.preventDefault();
      windowDragCounter -= 1;
      if (windowDragCounter <= 0) {
        windowDragCounter = 0;
        setIsDragging(false);
      }
    };

    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };

    const handleWindowDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      windowDragCounter = 0;
      setIsDragging(false);
      if (e.dataTransfer) {
        const dropped = await collectFilesFromDataTransfer(e.dataTransfer);
        processDroppedFiles(dropped);
      }
    };

    window.addEventListener('dragenter', handleWindowDragEnter);
    window.addEventListener('dragleave', handleWindowDragLeave);
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('drop', handleWindowDrop);

    return () => {
      window.removeEventListener('dragenter', handleWindowDragEnter);
      window.removeEventListener('dragleave', handleWindowDragLeave);
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, [isOpen, processDroppedFiles]);

  const handleCompanyChange = (value: string) => {
    setSelectedCompanyId(value);
    setCompanyError(false);
  };

  const handleUpload = () => {
    if (!selectedCompanyId) {
      setCompanyError(true);
      return;
    }

    if (files.length === 0) {
      toast({
        title: "⚠️ Sin archivos",
        description: "Agregá al menos un archivo para subir",
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

    const filesToUpload = [...files];
    const companyId = selectedCompanyId;

    onClose();
    setFiles([]);
    setSelectedCompanyId('');
    setCompanyError(false);
    setIsUploading(false);

    toast({
      title: '⏳ Carga en curso',
      description: `${filesToUpload.length} archivo(s). Podés navegar; si recargás, se reanuda sola.`,
    });

    (async () => {
      try {
        const summary = await enqueueClientUploadBatch({
          empresaId: companyId,
          files: filesToUpload,
        });

        const parts = [
          `${summary.successCount} encolado(s)`,
          summary.duplicateCount > 0 ? `${summary.duplicateCount} duplicado(s)` : null,
          summary.errorCount > 0 ? `${summary.errorCount} error(es)` : null,
        ].filter(Boolean);

        toast({
          title:
            summary.errorCount > 0 && summary.successCount === 0 && summary.duplicateCount === 0
              ? '❌ Error en el lote'
              : '✅ Lote enviado',
          description:
            parts.join(' · ') + (summary.errorDetails[0] ? `. ${summary.errorDetails[0]}` : ''),
          variant:
            summary.errorCount > 0 && summary.successCount === 0 ? 'destructive' : 'default',
        });

        if (summary.successCount > 0 || summary.duplicateCount > 0) {
          window.dispatchEvent(new Event('documentUploaded'));
          onUploadComplete?.();
        }
      } catch (err: any) {
        console.error('❌ [UploadDialog] Fallo en cola persistente:', err);
        toast({
          title: '❌ No se pudo iniciar el lote',
          description: err?.message || 'Error al registrar / guardar la cola local.',
          variant: 'destructive',
        });
      }
    })();
  };

  const handleClose = () => {
    setFiles([]);
    setSelectedCompanyId('');
    setCompanyError(false);
    setIsUploading(false);
    resetDragState();
    onClose();
  };

  const handleRemoveFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleSelectFilesClick = () => {
    fileInputRef.current?.click();
  };

  const hasOversizedFiles = files.some(file => file.size > MAX_FILE_SIZE);
  const hasCompany = !!selectedCompanyId;
  const canSubmit = hasCompany && files.length > 0 && !hasOversizedFiles && !isUploading;

  return (
    <>
      {/* Overlay de arrastre: captura drops en toda el área (incluido el modal) */}
      {isDragging && isOpen && (
        <div
          className="fixed inset-0 z-[100] bg-violet-500/10 backdrop-blur-sm border-4 border-dashed border-violet-500 flex items-center justify-center transition-all duration-200"
          onDragEnter={handleZoneDragEnter}
          onDragOver={handleZoneDragOver}
          onDragLeave={handleZoneDragLeave}
          onDrop={handleZoneDrop}
        >
          <div className="bg-white/90 dark:bg-gray-900/90 rounded-2xl shadow-2xl p-10 flex flex-col items-center pointer-events-none transform scale-105 transition-transform duration-200">
            <div className="bg-violet-100 dark:bg-violet-900/50 p-6 rounded-full mb-6">
              <Upload className="w-16 h-16 text-violet-600 dark:text-violet-400 animate-bounce" />
            </div>
            <p className="text-3xl font-bold text-violet-700 dark:text-violet-400 mb-2">Suelta tus archivos aquí</p>
            <p className="text-gray-500 dark:text-gray-400">PDF, ZIP o imágenes (máx 10MB)</p>
          </div>
        </div>
      )}

      <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open && !isUploading) {
          handleClose();
        }
      }}>
        <DialogContent
          data-tutorial="upload-modal"
          className="max-w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto"
          onDragEnter={handleZoneDragEnter}
          onDragOver={handleZoneDragOver}
          onDragLeave={handleZoneDragLeave}
          onDrop={handleZoneDrop}
        >
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
            <Select value={selectedCompanyId} onValueChange={handleCompanyChange}>
              <SelectTrigger
                className={cn(
                  "h-8 sm:h-9 text-xs sm:text-sm",
                  companyError && "border-destructive ring-1 ring-destructive/40"
                )}
              >
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
            {companyError && (
              <p className="mt-1.5 text-xs text-destructive flex items-center gap-1" role="alert">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Debés elegir una empresa para poder subir
              </p>
            )}
          </div>

          {/* Drop zone — toda el área del modal también acepta drops */}
          <div
            onDragEnter={handleZoneDragEnter}
            onDragOver={handleZoneDragOver}
            onDragLeave={handleZoneDragLeave}
            onDrop={handleZoneDrop}
            className={cn(
              'border-2 border-dashed rounded-lg p-4 sm:p-6 lg:p-8 text-center transition-colors',
              isDragging
                ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/20'
                : 'border-gray-300 dark:border-gray-700'
            )}
          >
            <Upload className={cn(
              'mx-auto h-8 w-8 sm:h-10 sm:w-10 lg:h-12 lg:w-12 mb-2 sm:mb-3 lg:mb-4 transition-colors',
              isDragging ? 'text-violet-500' : 'text-gray-400'
            )} />
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
              accept=".pdf,.PDF,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.zip,.rar,application/pdf"
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
                      key={`${file.name}-${file.size}-${index}`}
                      className={cn(
                        'flex items-center justify-between p-1.5 sm:p-2 rounded',
                        isOversized
                          ? 'bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800'
                          : 'bg-gray-50 dark:bg-gray-800'
                      )}
                    >
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
                        {isOversized && (
                          <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <span className={cn(
                            'text-xs sm:text-sm truncate block',
                            isOversized && 'text-red-800 dark:text-red-200 font-medium'
                          )} title={file.name}>
                            {file.name}
                          </span>
                          <span className={cn(
                            'text-[10px] sm:text-xs',
                            isOversized
                              ? 'text-red-600 dark:text-red-400 font-medium'
                              : 'text-gray-500'
                          )}>
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

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isUploading}
              className="w-full sm:w-auto h-8 sm:h-9 text-xs sm:text-sm"
            >
              Cancelar
            </Button>
            {/* Sin empresa: se ve deshabilitado pero sigue clickeable para mostrar validador */}
            <Button
              onClick={handleUpload}
              disabled={isUploading || hasOversizedFiles || (hasCompany && files.length === 0)}
              aria-disabled={!canSubmit}
              className={cn(
                'w-full sm:w-auto h-8 sm:h-9 text-xs sm:text-sm',
                !hasCompany && 'opacity-50'
              )}
            >
              {isUploading ? 'Subiendo...' : `Subir ${files.length} archivo(s)`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
