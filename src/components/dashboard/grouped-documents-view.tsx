'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Edit2, Check, X, Plus, Trash2 } from 'lucide-react';
import { Document } from '@/lib/types';
import { DocumentsTable } from './documents-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface GroupedDocumentsViewProps {
  documents: Document[];
  filename?: string;
  hiddenColumns?: string[];
}

const UNCLASSIFIED = 'No clasificado';

const getColorForType = (tipo: string): string => {
  const lower = tipo.toLowerCase();
  if (lower === UNCLASSIFIED.toLowerCase()) return 'gray';
  if (lower.includes('certificado')) return 'violet';
  if (lower.includes('nómina') || lower.includes('nomina')) return 'blue';
  if (lower.includes('declaración') || lower.includes('declaracion') || lower.includes('irpf')) return 'amber';
  if (lower.includes('contrato')) return 'green';
  if (lower.includes('factura')) return 'rose';
  return 'indigo';
};

const colorClasses = {
  violet: { bg: 'bg-violet-500/10', border: 'border-violet-500/30', text: 'text-violet-400', hover: 'hover:bg-violet-500/20', badge: 'bg-violet-500/20 text-violet-300' },
  blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', hover: 'hover:bg-blue-500/20', badge: 'bg-blue-500/20 text-blue-300' },
  amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', hover: 'hover:bg-amber-500/20', badge: 'bg-amber-500/20 text-amber-300' },
  green: { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400', hover: 'hover:bg-green-500/20', badge: 'bg-green-500/20 text-green-300' },
  rose: { bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-400', hover: 'hover:bg-rose-500/20', badge: 'bg-rose-500/20 text-rose-300' },
  gray: { bg: 'bg-gray-500/10', border: 'border-gray-500/30', text: 'text-gray-400', hover: 'hover:bg-gray-500/20', badge: 'bg-gray-500/20 text-gray-300' },
  indigo: { bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', text: 'text-indigo-400', hover: 'hover:bg-indigo-500/20', badge: 'bg-indigo-500/20 text-indigo-300' }
};

export function GroupedDocumentsView({
  documents,
  filename = 'otros_documentos',
  hiddenColumns = []
}: GroupedDocumentsViewProps) {
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const [customTypes, setCustomTypes] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [dragOverType, setDragOverType] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');

  // Cargar configuración
  useEffect(() => {
    async function fetchConfig() {
      try {
        const res = await fetch('/api/user/config-otros');
        const data = await res.json();
        if (data.tipos && Array.isArray(data.tipos)) {
          setCustomTypes(data.tipos.filter((t: string) => !/^Tipo \d+$/.test(t)));
        }
      } catch (e) { console.error('Error fetching config:', e); }
      finally { setIsLoadingConfig(false); }
    }
    fetchConfig();
  }, []);

  // ✅ NUEVO: Listener para refetch cuando se eliminan documentos
  useEffect(() => {
    const handleRefetch = () => {
      console.log('🔄 [GroupedView] Refetching after document change');
      window.location.reload(); // Forzar recarga para actualizar la vista
    };

    window.addEventListener('documentUploaded', handleRefetch);
    return () => window.removeEventListener('documentUploaded', handleRefetch);
  }, []);

  // Scroll durante drag
  useEffect(() => {
    let scrollInterval: NodeJS.Timeout | null = null;
    const handleGlobalDragOver = (e: DragEvent) => {
      e.preventDefault();
      const threshold = 150;
      const maxSpeed = 35;
      if (scrollInterval) clearInterval(scrollInterval);
      if (e.clientY < threshold) {
        const speed = Math.max(10, maxSpeed * (1 - e.clientY / threshold));
        scrollInterval = setInterval(() => window.scrollBy(0, -speed), 16);
      } else if (window.innerHeight - e.clientY < threshold) {
        const dist = window.innerHeight - e.clientY;
        const speed = Math.max(10, maxSpeed * (1 - dist / threshold));
        scrollInterval = setInterval(() => window.scrollBy(0, speed), 16);
      } else { scrollInterval = null; }
    };
    const stopScrolling = () => { if (scrollInterval) { clearInterval(scrollInterval); scrollInterval = null; } };
    const handleWheel = (e: WheelEvent) => { window.scrollBy(0, e.deltaY); };
    window.addEventListener('dragover', handleGlobalDragOver);
    window.addEventListener('drop', stopScrolling);
    window.addEventListener('dragend', stopScrolling);
    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => {
      window.removeEventListener('dragover', handleGlobalDragOver);
      window.removeEventListener('drop', stopScrolling);
      window.removeEventListener('dragend', stopScrolling);
      window.removeEventListener('wheel', handleWheel);
      stopScrolling();
    };
  }, []);

  const saveCustomTypes = async (newTypes: string[]) => {
    try {
      const res = await fetch('/api/user/config-otros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipos: newTypes })
      });
      if (res.ok) {
        setCustomTypes(newTypes);
        toast({ title: 'Carpetas actualizadas' });
      }
    } catch (e) { console.error(e); }
  };

  const handleMove = useCallback(async (docIds: number[], targetTipo: string) => {
    try {
      const res = await fetch('/api/documents/bulk-update-field', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: docIds, fieldName: 'tipo_documento', value: targetTipo })
      });
      if (res.ok) {
        toast({ title: 'Documentos movidos', description: `Se han movido ${docIds.length} documentos a "${targetTipo}".` });
        window.dispatchEvent(new CustomEvent('documentUploaded'));
      }
    } catch (err) { console.error(err); }
  }, []);

  const handleAddFolder = () => {
    const trimmed = newTypeName.trim();
    if (!trimmed) return;
    if (customTypes.includes(trimmed)) {
      toast({ title: 'Error', description: 'Esta carpeta ya existe', variant: 'destructive' });
      return;
    }
    const newTypes = [...customTypes, trimmed];
    saveCustomTypes(newTypes);
    setNewTypeName('');
    setIsAdding(false);
  };

  const [folderToDelete, setFolderToDelete] = useState<{ tipo: string, count: number } | null>(null);

  const confirmDeleteFolder = (tipo: string) => {
    const docsInFolder = Array.from(documentsByType).find(([t]) => t === tipo)?.[1] || [];
    setFolderToDelete({ tipo, count: docsInFolder.length });
  };

  const handleExecuteDeleteFolder = async () => {
    if (!folderToDelete) return;
    const { tipo, count } = folderToDelete;

    const docsInFolder = Array.from(documentsByType).find(([t]) => t === tipo)?.[1] || [];
    const ids = docsInFolder.map(d => d.id_documento);

    // Mover documentos a "Indefinido"
    if (ids.length > 0) {
      await fetch('/api/documents/bulk-update-field', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, fieldName: 'tipo_documento', value: 'Indefinido' })
      });
    }

    const newTypes = customTypes.filter(t => t !== tipo);
    await saveCustomTypes(newTypes);

    toast({ title: 'Carpeta eliminada', description: `${ids.length} documentos movidos a "Indefinido"` });
    window.dispatchEvent(new CustomEvent('documentUploaded'));
    setFolderToDelete(null);
  };

  const startEditing = (current: string) => {
    setIsEditing(current);
    setEditValue(current);
  };

  const handleSaveEdit = async () => {
    if (!isEditing) return;
    const oldName = isEditing;
    const newName = editValue.trim();

    if (oldName === newName) {
      setIsEditing(null);
      return;
    }

    // ✅ Actualizar todos los documentos con este tipo
    try {
      const docsToUpdate = Array.from(documentsByType).find(([tipo]) => tipo === oldName)?.[1] || [];
      const ids = docsToUpdate.map(d => d.id_documento);

      if (ids.length > 0) {
        await fetch('/api/documents/bulk-update-field', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids, fieldName: 'tipo_documento', value: newName })
        });
      }

      // Actualizar la lista de tipos custom
      const allTypes = Array.from(new Set([...customTypes.filter(t => t !== oldName), newName]));
      await saveCustomTypes(allTypes);

      toast({ title: 'Carpeta renombrada', description: `"${oldName}" → "${newName}"` });
      window.dispatchEvent(new CustomEvent('documentUploaded'));
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'No se pudo renombrar la carpeta', variant: 'destructive' });
    }

    setIsEditing(null);
  };

  const documentsByType = useMemo(() => {
    const MAX_FOLDERS = 5;
    const INDEFINIDO = 'Indefinido';

    // ✅ Obtener tipos únicos de los documentos
    const documentedTypes = new Set<string>();
    documents.forEach(doc => {
      if (doc.tipo_documento && doc.tipo_documento !== INDEFINIDO) {
        documentedTypes.add(doc.tipo_documento);
      }
    });

    // ✅ Priorizar customTypes + los más frecuentes
    const typeCounts = new Map<string, number>();
    documents.forEach(doc => {
      if (doc.tipo_documento && doc.tipo_documento !== INDEFINIDO) {
        typeCounts.set(doc.tipo_documento, (typeCounts.get(doc.tipo_documento) || 0) + 1);
      }
    });

    // Ordenar por: 1) custom types primero, 2) cantidad de docs
    const sortedTypes = Array.from(documentedTypes).sort((a, b) => {
      const aIsCustom = customTypes.includes(a);
      const bIsCustom = customTypes.includes(b);
      if (aIsCustom && !bIsCustom) return -1;
      if (!aIsCustom && bIsCustom) return 1;
      return (typeCounts.get(b) || 0) - (typeCounts.get(a) || 0);
    });

    // ✅ Tomar solo los primeros MAX_FOLDERS
    const allowedTypes = new Set(sortedTypes.slice(0, MAX_FOLDERS));

    // ✅ Agrupar documentos
    const grouped = new Map<string, Document[]>();
    allowedTypes.forEach(t => grouped.set(t, []));
    grouped.set(INDEFINIDO, []);
    grouped.set(UNCLASSIFIED, []);

    documents.forEach(doc => {
      let tipo = doc.tipo_documento || 'Sin categoría';

      // 🔄 LOGIC: Reclassify Albaranes
      const isAlbaran = tipo.toLowerCase().includes('albarán') || tipo.toLowerCase().includes('albaran');
      if (isAlbaran) {
        const hasCliente = doc.entidades?.some(e => e.rol === 'cliente' || e.rol === 'receptor');
        tipo = hasCliente ? 'Factura Emitida' : 'Factura Recibida';
      }

      // ✅ Si el tipo está permitido, asignarlo, sino va a Indefinido
      if (allowedTypes.has(tipo)) {
        grouped.get(tipo)!.push(doc);
      } else if (!tipo || tipo === 'Sin categoría') {
        grouped.get(UNCLASSIFIED)!.push(doc);
      } else {
        grouped.get(INDEFINIDO)!.push(doc);
      }
    });

    return Array.from(grouped.entries())
      .filter(([t, d]) => d.length > 0)
      .sort((a, b) => {
        if (a[0] === INDEFINIDO) return 1;
        if (b[0] === INDEFINIDO) return -1;
        if (a[0] === UNCLASSIFIED) return 1;
        if (b[0] === UNCLASSIFIED) return -1;
        return a[0].localeCompare(b[0]);
      });
  }, [documents, customTypes]);

  const toggleType = (tipo: string) => {
    setExpandedTypes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tipo)) newSet.delete(tipo);
      else newSet.add(tipo);
      return newSet;
    });
  };

  const handleDragOver = (e: React.DragEvent, tipo: string) => {
    e.preventDefault();
    if (dragOverType !== tipo) setDragOverType(tipo);
  };

  const handleDrop = async (e: React.DragEvent, targetTipo: string) => {
    e.preventDefault();
    setDragOverType(null);
    try {
      const data = e.dataTransfer.getData('application/json');
      if (!data) return;
      const { id_documento } = JSON.parse(data);
      if (id_documento) handleMove([id_documento], targetTipo);
    } catch (err) { console.error(err); }
  };

  if (isLoadingConfig && documents.length > 0) return <div className="text-center py-8">Cargando carpetas...</div>;

  return (
    <div className="space-y-3 sm:space-y-4 pb-32">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Gestión de carpetas</h3>
        {isAdding ? (
          <div className="flex gap-2 items-center bg-background p-1.5 rounded-full border shadow-sm animate-in fade-in slide-in-from-right-2">
            <Input value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} placeholder="Nueva carpeta..." className="h-8 w-40 sm:w-56 border-none focus-visible:ring-0" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleAddFolder(); if (e.key === 'Escape') setIsAdding(false); }} />
            <Button size="sm" onClick={handleAddFolder} className="h-8 rounded-full"><Plus className="h-4 w-4 mr-1" /> Añadir</Button>
            <Button size="icon" variant="ghost" onClick={() => setIsAdding(false)} className="h-8 w-8 rounded-full"><X className="h-4 w-4" /></Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setIsAdding(true)} className="rounded-full shadow-sm hover:shadow-md transition-all border-primary/20 hover:border-primary/40 hover:bg-primary/5">
            <Plus className="h-4 w-4 mr-2" /> Nueva Carpeta
          </Button>
        )}
      </div>

      {documentsByType.map(([tipo, docs]) => {
        const isExpanded = expandedTypes.has(tipo);
        const color = getColorForType(tipo);
        const classes = colorClasses[color as keyof typeof colorClasses] || colorClasses.indigo;
        const isCustomType = customTypes.includes(tipo);
        const isDraggingOver = dragOverType === tipo;


        return (
          <div key={tipo} className="space-y-2 group/folder relative w-full">
            <div className="flex w-full items-center relative">
              <button
                onClick={() => toggleType(tipo)}
                onDragOver={(e) => handleDragOver(e, tipo)}
                onDragLeave={() => setDragOverType(null)}
                onDrop={(e) => handleDrop(e, tipo)}
                className={`w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg border shadow-sm ${classes.bg} ${classes.border} ${classes.hover} transition-all duration-200 relative overflow-hidden ${isDraggingOver ? 'scale-[1.02] border-primary border-2 brightness-110 shadow-lg' : ''}`}
              >
                <div className={`${classes.text} shrink-0`}>
                  {isExpanded ? <FolderOpen className="h-4 w-4 sm:h-5 sm:w-5" /> : <Folder className="h-4 w-4 sm:h-5 sm:w-5" />}
                </div>

                {isEditing === tipo ? (
                  <div className="flex-1 flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} className="h-8 text-xs sm:text-sm bg-background border-primary" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setIsEditing(null); }} />
                    <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-green-500/20" onClick={handleSaveEdit}><Check className="h-4 w-4 text-green-500" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-red-500/20" onClick={() => setIsEditing(null)}><X className="h-4 w-4 text-red-500" /></Button>
                  </div>
                ) : (
                  <span className={`font-semibold ${classes.text} flex-1 text-left text-xs sm:text-sm lg:text-base truncate mr-24`}>{tipo}</span>
                )}

                <span className={`px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium ${classes.badge} whitespace-nowrap shrink-0`}>
                  {docs.length} <span className="hidden xs:inline ml-1">{docs.length === 1 ? 'doc' : 'docs'}</span>
                </span>
                <div className={`${classes.text} shrink-0 ml-1`}>{isExpanded ? <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}</div>
              </button>

              {/* Botones de acción - Siempre visibles para TODAS las carpetas */}
              <div className="absolute right-[5rem] flex gap-1 transition-all duration-300 z-20 opacity-100">
                {!isEditing && (
                  <Button variant="secondary" size="icon" className="h-8 w-8 shadow-lg border border-border/50 backdrop-blur-md bg-background/80 hover:bg-background" title="Editar carpeta" onClick={(e) => { e.stopPropagation(); startEditing(tipo); }}>
                    <Edit2 className="h-3.5 w-3.5 text-foreground" />
                  </Button>
                )}
                {!isEditing && (
                  <Button variant="destructive" size="icon" className="h-8 w-8 shadow-lg border border-red-500/20" title="Eliminar carpeta" onClick={(e) => { e.stopPropagation(); confirmDeleteFolder(tipo); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>

            {isExpanded && (
              <div className="pl-2 sm:pl-4 animate-in slide-in-from-top-2 duration-200">
                {docs.length > 0 ? (
                  <DocumentsTable
                    documents={docs}
                    filename={`${filename}_${tipo.toLowerCase().replace(/\s+/g, '_')}`}
                    hiddenColumns={hiddenColumns}
                    customTypes={customTypes}
                    onMove={handleMove}
                  />
                ) : (
                  <div className="py-8 text-center text-xs text-muted-foreground border border-dashed rounded-lg bg-muted/20">No hay documentos de este tipo. Arrastra documentos aquí para clasificarlos.</div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <AlertDialog open={!!folderToDelete} onOpenChange={(open) => !open && setFolderToDelete(null)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              ¿Eliminar carpeta "{folderToDelete?.tipo}"?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 pt-2">
              <p>
                Estás a punto de eliminar esta carpeta.
              </p>
              {folderToDelete && folderToDelete.count > 0 && (
                <div className="bg-destructive/10 p-3 rounded-md border border-destructive/20 text-destructive text-sm font-medium">
                  ⚠️ Atención: Esta carpeta contiene <span className="font-bold">{folderToDelete.count} documentos</span>.

                  <ul className="list-disc pl-5 mt-2 font-normal text-xs opacity-90">
                    <li>Los documentos <strong>NO</strong> se eliminarán.</li>
                    <li>Serán movidos automáticamente a la carpeta <strong>"Indefinido"</strong>.</li>
                    <li>Podrás clasificarlos de nuevo más tarde.</li>
                  </ul>
                </div>
              )}
              {folderToDelete && folderToDelete.count === 0 && (
                <p className="text-sm text-muted-foreground">La carpeta está vacía y se eliminará permanentemente.</p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleExecuteDeleteFolder} className="bg-destructive hover:bg-destructive/90">
              Confirmar eliminación
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}