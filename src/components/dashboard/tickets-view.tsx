'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Document } from '@/lib/types'
import { Receipt, Download } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { generateAdvancedExport } from '@/lib/export-utils'

interface TicketsViewProps {
  documents: Document[]
  onDocumentChanged?: () => void
}

// Campos candidatos a mostrar, en orden de prioridad
const CANDIDATE_COLUMNS = [
  { key: 'fecha_emision',    label: 'Fecha',    render: (d: any) => d.fecha_emision ? new Date(d.fecha_emision).toLocaleDateString('es-ES') : '—' },
  { key: 'proveedor',        label: 'Comercio', render: (d: any) => d.proveedor || d.cif || '—' },
  { key: 'cif',              label: 'CIF',      render: (d: any) => d.cif || '—' },
  { key: 'numero_documento', label: 'Nº Doc.',  render: (d: any) => d.numero_documento || '—' },
  { key: 'tipo_documento',   label: 'Tipo',     render: (d: any) => d.tipo_documento || '—' },
  { key: 'base_imponible',   label: 'Base',     render: (d: any) => d.base_imponible != null && Number(d.base_imponible) !== 0 ? `${Number(d.base_imponible).toFixed(2)} €` : '—' },
  { key: 'iva',              label: 'IVA',      render: (d: any) => d.iva != null && Number(d.iva) !== 0 ? `${Number(d.iva).toFixed(2)} €` : '—' },
  { key: 'total',            label: 'Total',    render: (d: any) => d.total != null ? `${Number(d.total).toFixed(2)} €` : '—' },
];

function detectActiveColumns(docs: Document[]) {
  return CANDIDATE_COLUMNS.filter(col =>
    docs.some(doc => {
      const v = col.render(doc);
      return v && v !== '—';
    })
  );
}

export function TicketsView({ documents }: TicketsViewProps) {
  const router = useRouter();
  const activeColumns = React.useMemo(() => detectActiveColumns(documents), [documents]);

  const handleExportTickets = (format: 'excel' | 'csv') => {
    generateAdvancedExport(
      documents,
      activeColumns.map(c => ({ id: c.key, header: c.label })),
      {
        filename: 'tickets',
        format,
        exportContext: 'documentos_tickets',
        includeFileUrls: true,
      }
    );
  };

  if (documents.length === 0) {
    return (
      <div className="text-center py-12 px-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4 transition-all duration-300 hover:bg-orange-500/10 hover:shadow-lg hover:shadow-orange-500/20 hover:scale-110">
          <Receipt className="h-6 w-6 text-muted-foreground transition-all duration-300 hover:text-orange-500 hover:scale-110" />
        </div>
        <h3 className="text-base font-semibold mb-2 transition-colors duration-300 hover:text-orange-600">
          No hay tickets
        </h3>
        <p className="text-sm text-muted-foreground">
          Aún no se han registrado tickets en este período
        </p>
      </div>
    );
  }

  const totalImporte = documents.reduce((acc, d) => acc + Number((d as any).total || 0), 0);
  const totalIva     = documents.reduce((acc, d) => acc + Number((d as any).iva || 0), 0);

  return (
    <div className="space-y-3">
      {/* Resumen rápido */}
      <div className="flex flex-wrap items-center gap-3 pb-1">
        <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-1.5">
          <Receipt className="h-3.5 w-3.5 text-orange-500" />
          <span className="text-xs font-medium text-orange-600 dark:text-orange-400">
            {documents.length} ticket{documents.length !== 1 ? 's' : ''}
          </span>
        </div>
        {totalImporte !== 0 && (
          <div className="flex items-center gap-1.5 bg-muted/60 border border-border/50 rounded-lg px-3 py-1.5">
            <span className="text-xs text-muted-foreground">Total:</span>
            <span className="text-xs font-mono font-semibold">{totalImporte.toFixed(2)} €</span>
          </div>
        )}
        {totalIva !== 0 && (
          <div className="flex items-center gap-1.5 bg-muted/60 border border-border/50 rounded-lg px-3 py-1.5">
            <span className="text-xs text-muted-foreground">IVA:</span>
            <span className="text-xs font-mono font-semibold">{totalIva.toFixed(2)} €</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExportTickets('excel')}
            className="h-8 text-xs gap-1.5 hover:border-orange-500/40"
          >
            <Download className="h-3.5 w-3.5 text-orange-500" />
            Exportar Excel
          </Button>
        </div>
      </div>

      {/* Tabla dinámica */}
      <div className="rounded-xl border border-border/50 overflow-hidden bg-card/50 backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                {activeColumns.map(col => (
                  <th key={col.key} className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                    {col.label}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Acc.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {documents.map((doc, idx) => (
                <tr
                  key={(doc as any).id_documento ?? idx}
                  onClick={() => router.push(`/documento/${(doc as any).id_documento}`)}
                  className="hover:bg-orange-500/5 cursor-pointer transition-colors duration-150 group"
                >
                  {activeColumns.map(col => {
                    const value = col.render(doc);
                    const isEmpty = value === '—';
                    return (
                      <td key={col.key} className={`px-3 py-2.5 whitespace-nowrap ${col.key === 'total' || col.key === 'base_imponible' || col.key === 'iva' ? 'font-mono font-semibold' : ''} ${isEmpty ? 'text-muted-foreground/40' : ''}`}>
                        {col.key === 'tipo_documento' ? (
                          <Badge variant="secondary" className="text-[10px] bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20">
                            {value}
                          </Badge>
                        ) : value}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 text-right">
                    <span className="text-[10px] text-muted-foreground group-hover:text-orange-500 transition-colors">Ver →</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
