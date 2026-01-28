'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Edit2, Check, X, Plus, Trash2 } from 'lucide-react';
import { Document } from '@/lib/types';
import { DocumentsTable } from './documents-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';

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

  const handleDeleteFolder = (tipo: string) => {
    const newTypes = customTypes.filter(t => t !== tipo);
    saveCustomTypes(newTypes);
  };

  const startEditing = (current: string) => {
    setIsEditing(current);
    setEditValue(current);
  };

  const handleSaveEdit = () => {
    if (!isEditing) return;
    const newTypes = customTypes.map(t => t === isEditing ? editValue.trim() : t);
    saveCustomTypes(newTypes);
    setIsEditing(null);
  };

  const documentsByType = useMemo(() => {
    const grouped = new Map<string, Document[]>();
    const documentedTypes = new Set<string>();
    documents.forEach(doc => { if (doc.tipo_documento) documentedTypes.add(doc.tipo_documento); });
    const allUniqueTypes = Array.from(new Set([...customTypes, ...Array.from(documentedTypes)]));
    allUniqueTypes.forEach(t => grouped.set(t, []));
    grouped.set(UNCLASSIFIED, []);
    documents.forEach(doc => {
      const tipo = doc.tipo_documento || 'Sin categoría';
      const matchedType = allUniqueTypes.find(ct => ct.toLowerCase() === tipo.toLowerCase());
      if (matchedType) grouped.get(matchedType)!.push(doc);
      else grouped.get(UNCLASSIFIED)!.push(doc);
    });
    return Array.from(grouped.entries())
      .filter(([t, d]) => d.length > 0 || customTypes.includes(t))
      .sort((a, b) => {
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
                  <span className={`font-semibold ${classes.text} flex-1 text-left text-xs sm:text-sm lg:text-base truncate mr-16`}>{tipo}</span>
                )}

                <span className={`px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium ${classes.badge} whitespace-nowrap shrink-0`}>
                  {docs.length} <span className="hidden xs:inline ml-1">{docs.length === 1 ? 'doc' : 'docs'}</span>
                </span>
                <div className={`${classes.text} shrink-0 ml-1`}>{isExpanded ? <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}</div>
              </button>

              {/* Botones de acción absolutamente posicionados PARA QUE NO AFECTEN EL ANCHO */}
              <div className="absolute right-[3.5rem] flex gap-1 opacity-0 group-hover/folder:opacity-100 transition-all duration-300 translate-x-4 group-hover/folder:translate-x-0 z-20 pointer-events-none group-hover/folder:pointer-events-auto">
                {isCustomType && !isEditing && (
                  <Button variant="secondary" size="icon" className="h-8 w-8 shadow-lg border border-border/50 backdrop-blur-md bg-background/80 hover:bg-background" title="Editar carpeta" onClick={(e) => { e.stopPropagation(); startEditing(tipo); }}>
                    <Edit2 className="h-3.5 w-3.5 text-foreground" />
                  </Button>
                )}
                {isCustomType && !isEditing && (
                  <Button variant="destructive" size="icon" className="h-8 w-8 shadow-lg border border-red-500/20" title="Eliminar carpeta" onClick={(e) => { e.stopPropagation(); handleDeleteFolder(tipo); }}>
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
    </div>
  );
}