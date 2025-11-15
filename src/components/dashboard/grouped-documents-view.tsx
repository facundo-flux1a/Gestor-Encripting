'use client';

import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen } from 'lucide-react';
import { Document } from '@/lib/types';
import { DocumentsTable } from './documents-table';

interface GroupedDocumentsViewProps {
  documents: Document[];
  filename?: string;
  hiddenColumns?: string[];
}

// Colores por tipo de documento
const getColorForType = (tipo: string): string => {
  const lower = tipo.toLowerCase();
  
  if (lower.includes('certificado')) return 'violet';
  if (lower.includes('nómina') || lower.includes('nomina')) return 'blue';
  if (lower.includes('declaración') || lower.includes('declaracion') || lower.includes('irpf')) return 'amber';
  if (lower.includes('contrato')) return 'green';
  if (lower.includes('factura')) return 'rose';
  
  return 'gray';
};

const colorClasses = {
  violet: {
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/30',
    text: 'text-violet-400',
    hover: 'hover:bg-violet-500/20',
    badge: 'bg-violet-500/20 text-violet-300'
  },
  blue: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    text: 'text-blue-400',
    hover: 'hover:bg-blue-500/20',
    badge: 'bg-blue-500/20 text-blue-300'
  },
  amber: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
    hover: 'hover:bg-amber-500/20',
    badge: 'bg-amber-500/20 text-amber-300'
  },
  green: {
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
    text: 'text-green-400',
    hover: 'hover:bg-green-500/20',
    badge: 'bg-green-500/20 text-green-300'
  },
  rose: {
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
    text: 'text-rose-400',
    hover: 'hover:bg-rose-500/20',
    badge: 'bg-rose-500/20 text-rose-300'
  },
  gray: {
    bg: 'bg-gray-500/10',
    border: 'border-gray-500/30',
    text: 'text-gray-400',
    hover: 'hover:bg-gray-500/20',
    badge: 'bg-gray-500/20 text-gray-300'
  }
};

export function GroupedDocumentsView({ documents, filename = 'otros_documentos', hiddenColumns = [] }: GroupedDocumentsViewProps) {
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());

  // Agrupar documentos por tipo
  const documentsByType = useMemo(() => {
    const grouped = new Map<string, Document[]>();
    
    documents.forEach(doc => {
      const tipo = doc.tipo_documento || 'Sin categoría';
      if (!grouped.has(tipo)) {
        grouped.set(tipo, []);
      }
      grouped.get(tipo)!.push(doc);
    });
    
    // Ordenar por cantidad de documentos (más documentos primero)
    return Array.from(grouped.entries())
      .sort((a, b) => b[1].length - a[1].length);
  }, [documents]);

  const toggleType = (tipo: string) => {
    setExpandedTypes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tipo)) {
        newSet.delete(tipo);
      } else {
        newSet.add(tipo);
      }
      return newSet;
    });
  };

  if (documentsByType.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No hay documentos en esta categoría
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {documentsByType.map(([tipo, docs]) => {
        const isExpanded = expandedTypes.has(tipo);
        const color = getColorForType(tipo);
        const classes = colorClasses[color as keyof typeof colorClasses];
        
        return (
          <div key={tipo} className="space-y-2">
            {/* Header de la carpeta */}
            <button
              onClick={() => toggleType(tipo)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border ${classes.bg} ${classes.border} ${classes.hover} transition-all duration-200`}
            >
              {/* Icono de carpeta */}
              <div className={classes.text}>
                {isExpanded ? (
                  <FolderOpen className="h-5 w-5" />
                ) : (
                  <Folder className="h-5 w-5" />
                )}
              </div>

              {/* Nombre del tipo */}
              <span className={`font-semibold ${classes.text} flex-1 text-left`}>
                {tipo}
              </span>

              {/* Badge con contador */}
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${classes.badge}`}>
                {docs.length} {docs.length === 1 ? 'documento' : 'documentos'}
              </span>

              {/* Chevron */}
              <div className={classes.text}>
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </div>
            </button>

            {/* Contenido expandible */}
            {isExpanded && (
              <div className="pl-4 animate-in slide-in-from-top-2 duration-200">
                <DocumentsTable 
                  documents={docs}
                  filename={`${filename}_${tipo.toLowerCase().replace(/\s+/g, '_')}`}
                  hiddenColumns={hiddenColumns}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}