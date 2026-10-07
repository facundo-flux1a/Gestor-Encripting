'use client'

import * as React from 'react'
import { ExternalLink, Users, CheckSquare, Square, Loader2, X, UserCheck, FileQuestion } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface CandidatoDoc {
  id: number
  fecha_emision: string | null
  proveedor_nombre: string
  total: number | null
  tipo_documento: string | null
  coincide_nombre: boolean
}

interface CifBatchDrawerProps {
  open: boolean
  onClose: () => void
  docId: number          // doc desde el que se dispara
  empresaId: number
  cifNuevo: string       // el CIF que el user acaba de guardar
  onSuccess?: (count: number) => void
}

function DocRow({
  c,
  selected,
  onToggle,
}: {
  c: CandidatoDoc
  selected: boolean
  onToggle: () => void
}) {
  return (
    <div
      className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors duration-150 ${
        selected
          ? 'border-violet-500/40 bg-violet-500/10'
          : 'border-border/30 hover:border-border/60 hover:bg-muted/30'
      }`}
      onClick={onToggle}
    >
      {/* Checkbox visual */}
      <div className="shrink-0 text-violet-400">
        {selected
          ? <CheckSquare className="h-4 w-4" />
          : <Square className="h-4 w-4 text-muted-foreground" />
        }
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{c.proveedor_nombre}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {c.fecha_emision && (
            <span className="text-[10px] text-muted-foreground">{c.fecha_emision}</span>
          )}
          {c.tipo_documento && (
            <Badge variant="secondary" className="text-[9px] py-0 h-4 bg-muted/50">
              {c.tipo_documento}
            </Badge>
          )}
        </div>
      </div>

      {/* Total */}
      {c.total != null && (
        <span className="text-xs font-mono font-semibold shrink-0">
          {Number(c.total).toFixed(2)} €
        </span>
      )}

      {/* Link externo */}
      <a
        href={`/documento/${c.id}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        title="Ver documento"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  )
}

function SectionHeader({
  icon,
  label,
  count,
  accent,
  onSelectAll,
  onClearAll,
}: {
  icon: React.ReactNode
  label: string
  count: number
  accent: string
  onSelectAll: () => void
  onClearAll: () => void
}) {
  return (
    <div className={`flex items-center justify-between px-2.5 py-1.5 rounded-md mb-2 ${accent}`}>
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[11px] font-semibold">{label}</span>
        <span className="text-[10px] opacity-60">({count})</span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onSelectAll}
          className="text-[10px] underline opacity-70 hover:opacity-100 transition-opacity"
        >
          todos
        </button>
        <span className="opacity-40">·</span>
        <button
          onClick={onClearAll}
          className="text-[10px] underline opacity-70 hover:opacity-100 transition-opacity"
        >
          ninguno
        </button>
      </div>
    </div>
  )
}

export function CifBatchDrawer({ open, onClose, docId, empresaId, cifNuevo, onSuccess }: CifBatchDrawerProps) {
  const [candidatos, setCandidatos] = React.useState<CandidatoDoc[]>([])
  const [nombreOrigen, setNombreOrigen] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [applying, setApplying] = React.useState(false)
  const [selected, setSelected] = React.useState<Set<number>>(new Set())
  const [done, setDone] = React.useState(false)
  const [doneCount, setDoneCount] = React.useState(0)

  // Fetch candidatos al abrir
  React.useEffect(() => {
    if (!open || !docId) return
    setLoading(true)
    setSelected(new Set())
    setDone(false)

    fetch(`/api/documents/${docId}/cif-ausente-similares`)
      .then(r => r.json())
      .then(data => {
        const cands: CandidatoDoc[] = data.candidatos || []
        setCandidatos(cands)
        setNombreOrigen(data.nombre_proveedor_origen || null)
        // Pre-seleccionar los que coinciden en nombre (son los más seguros)
        const preSelected = new Set(cands.filter(c => c.coincide_nombre).map(c => c.id))
        setSelected(preSelected)
      })
      .catch(() => setCandidatos([]))
      .finally(() => setLoading(false))
  }, [open, docId])

  const mismoProveedor = candidatos.filter(c => c.coincide_nombre)
  const otrosSinCif    = candidatos.filter(c => !c.coincide_nombre)

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectGroup = (group: CandidatoDoc[]) =>
    setSelected(prev => new Set([...prev, ...group.map(c => c.id)]))

  const clearGroup = (group: CandidatoDoc[]) => {
    const ids = new Set(group.map(c => c.id))
    setSelected(prev => new Set([...prev].filter(id => !ids.has(id))))
  }

  const selectAll = () => setSelected(new Set(candidatos.map(c => c.id)))
  const clearAll  = () => setSelected(new Set())

  const handleApply = async () => {
    if (selected.size === 0) return
    setApplying(true)
    try {
      const res = await fetch('/api/documents/batch-fix-cif', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentoIds: Array.from(selected),
          cif: cifNuevo,
          empresaId,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setDone(true)
        setDoneCount(data.actualizados ?? selected.size)
        onSuccess?.(data.actualizados ?? selected.size)
      }
    } finally {
      setApplying(false)
    }
  }

  if (!open) return null

  return (
    // Overlay
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative z-10 w-full max-w-lg bg-card border border-border/60 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40 bg-violet-500/5">
          <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0">
            <Users className="h-4 w-4 text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Otros docs sin CIF de proveedor</p>
            <p className="text-[11px] text-muted-foreground truncate">
              Seleccioná los que pertenecen al mismo proveedor para aplicar <span className="font-mono text-violet-400">{cifNuevo}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Buscando documentos...</span>
            </div>
          ) : done ? (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">✅</div>
              <p className="font-semibold">CIF aplicado a {doneCount} documento{doneCount !== 1 ? 's' : ''}</p>
              <p className="text-sm text-muted-foreground mt-1">Podés revisarlos individualmente para confirmarlos.</p>
            </div>
          ) : candidatos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">No hay otros documentos con CIF de proveedor ausente en esta empresa.</p>
            </div>
          ) : (
            <>
              {/* Controles globales */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-muted-foreground">
                  {candidatos.length} documento{candidatos.length !== 1 ? 's' : ''} encontrado{candidatos.length !== 1 ? 's' : ''}
                </span>
                <div className="flex gap-2">
                  <button onClick={selectAll} className="text-[11px] text-violet-400 hover:text-violet-300 underline">Seleccionar todos</button>
                  <span className="text-muted-foreground">·</span>
                  <button onClick={clearAll}  className="text-[11px] text-muted-foreground hover:text-foreground underline">Limpiar</button>
                </div>
              </div>

              {/* ── Sección: Mismo proveedor ── */}
              {mismoProveedor.length > 0 && (
                <div className="mb-4">
                  <SectionHeader
                    icon={<UserCheck className="h-3 w-3 text-emerald-400" />}
                    label={`Mismo proveedor${nombreOrigen ? ` · ${nombreOrigen}` : ''}`}
                    count={mismoProveedor.length}
                    accent="bg-emerald-500/8 text-emerald-400"
                    onSelectAll={() => selectGroup(mismoProveedor)}
                    onClearAll={() => clearGroup(mismoProveedor)}
                  />
                  <div className="space-y-1.5">
                    {mismoProveedor.map(c => (
                      <DocRow
                        key={c.id}
                        c={c}
                        selected={selected.has(c.id)}
                        onToggle={() => toggleSelect(c.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* ── Sección: Otros sin CIF ── */}
              {otrosSinCif.length > 0 && (
                <div>
                  {mismoProveedor.length > 0 && (
                    <div className="border-t border-border/30 mb-3" />
                  )}
                  <SectionHeader
                    icon={<FileQuestion className="h-3 w-3 text-amber-400" />}
                    label="Otros sin CIF"
                    count={otrosSinCif.length}
                    accent="bg-amber-500/8 text-amber-400"
                    onSelectAll={() => selectGroup(otrosSinCif)}
                    onClearAll={() => clearGroup(otrosSinCif)}
                  />
                  <div className="space-y-1.5">
                    {otrosSinCif.map(c => (
                      <DocRow
                        key={c.id}
                        c={c}
                        selected={selected.has(c.id)}
                        onToggle={() => toggleSelect(c.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!done && !loading && candidatos.length > 0 && (
          <div className="px-4 py-3 border-t border-border/40 flex items-center justify-between gap-3">
            <button
              onClick={onClose}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cerrar
            </button>
            <button
              onClick={handleApply}
              disabled={selected.size === 0 || applying}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
            >
              {applying && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Aplicar CIF a {selected.size > 0 ? selected.size : ''} seleccionado{selected.size !== 1 ? 's' : ''}
            </button>
          </div>
        )}

        {done && (
          <div className="px-4 py-3 border-t border-border/40 flex justify-end">
            <button onClick={onClose} className="bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors">
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
