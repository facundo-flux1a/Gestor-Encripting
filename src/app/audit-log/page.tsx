'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Search, RefreshCw, Lock, Eye, FileText, ArrowRight, CheckCircle2, ShieldCheck, Filter } from 'lucide-react';

type TableName = 'documentos_auditoria' | 'eventos_sistema';

interface AuditRow {
  id: string | number;
  documento_id?: string | number | null;
  id_de_empresa?: string | number | null;
  empresa_nombre?: string;
  accion?: string;
  tipo_evento?: string;
  usuario?: string;
  fecha_accion?: string;
  fecha?: string;
  detalle?: any;
  metadata?: any;
  [key: string]: any;
}

export default function AuditLogPage() {
  const [table, setTable] = useState<TableName>('documentos_auditoria');
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(100);
  const [search, setSearch] = useState('');
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/audit-log?table=${table}&limit=${limit}`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Error al obtener auditoría');
      setRows(data.rows || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [table, limit]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleExpand = (rowId: string | number) => {
    const key = String(rowId);
    setExpandedRows(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const query = search.toLowerCase().trim();
    return rows.filter(r => {
      const docId = String(r.documento_id || '');
      const empId = String(r.id_de_empresa || '');
      const empName = String(r.empresa_nombre || '').toLowerCase();
      const user = String(r.usuario || '').toLowerCase();
      const action = String(r.accion || r.tipo_evento || '').toLowerCase();
      const detailsStr = JSON.stringify(r.detalle || r.metadata || '').toLowerCase();

      return (
        docId.includes(query) ||
        empId.includes(query) ||
        empName.includes(query) ||
        user.includes(query) ||
        action.includes(query) ||
        detailsStr.includes(query)
      );
    });
  }, [rows, search]);

  const getBadgeStyle = (action?: string) => {
    const act = (action || '').toUpperCase();
    if (act.includes('UPDATE') || act.includes('EDICION')) {
      return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    }
    if (act.includes('VALIDACION') || act.includes('CHECK')) {
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    }
    if (act.includes('ELIMINACION') || act.includes('DELETE')) {
      return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
    }
    if (act.includes('VISTO') || act.includes('READ')) {
      return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
    }
    return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-6 md:p-10">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                  Visor de Auditoría (Caja Negra)
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono border border-slate-700">
                    DEBUG - RUTA DIRECTA
                  </span>
                </h1>
                <p className="text-sm text-slate-400 mt-1">
                  Registros cronológicos de la tabla <code className="text-purple-300 bg-purple-950/40 px-1.5 py-0.5 rounded">documentos_auditoria</code> desencriptados en tiempo real.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-medium transition-all shadow-lg shadow-purple-600/20 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Cargando...' : 'Recargar'}
            </button>
          </div>
        </div>

        {/* Filters bar */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar por ID, usuario, acción..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>

          <select
            value={table}
            onChange={e => setTable(e.target.value as TableName)}
            className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-purple-500 transition-colors"
          >
            <option value="documentos_auditoria">documentos_auditoria</option>
            <option value="eventos_sistema">eventos_sistema</option>
          </select>

          <select
            value={limit}
            onChange={e => setLimit(Number(e.target.value))}
            className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-purple-500 transition-colors"
          >
            <option value={50}>Últimos 50 registros</option>
            <option value={100}>Últimos 100 registros</option>
            <option value={200}>Últimos 200 registros</option>
            <option value={500}>Últimos 500 registros</option>
          </select>

          <div className="flex items-center justify-end px-3 py-2 text-xs text-slate-400 bg-slate-900/60 border border-slate-800/80 rounded-lg font-mono">
            Mostrando {filteredRows.length} de {rows.length} registros
          </div>
        </div>

        {error && (
          <div className="mt-4 p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-center gap-2">
            ❌ Error: {error}
          </div>
        )}
      </div>

      {/* Main List */}
      <div className="max-w-7xl mx-auto space-y-3">
        {filteredRows.length === 0 && !loading ? (
          <div className="text-center py-16 bg-slate-900/40 border border-slate-800 rounded-xl">
            <ShieldCheck className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-sm font-medium">No se encontraron registros de auditoría.</p>
          </div>
        ) : (
          filteredRows.map(row => {
            const rowId = String(row.id);
            const isExpanded = !!expandedRows[rowId];
            const actionName = row.accion || row.tipo_evento || 'ACCION';
            const dateStr = formatDate(row.fecha_accion || row.fecha);
            const details = row.detalle || row.metadata;
            const hasDetails = details && (typeof details === 'object' ? Object.keys(details).length > 0 : true);

            return (
              <div
                key={rowId}
                className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-5 hover:border-slate-700/80 transition-all"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left info */}
                  <div className="flex items-start gap-4">
                    <span className={`px-3 py-1 rounded-md text-xs font-bold tracking-wide border uppercase font-mono ${getBadgeStyle(actionName)}`}>
                      {actionName}
                    </span>

                    <div>
                      <div className="flex items-center gap-3 flex-wrap">
                        {row.documento_id && (
                          <Link
                            href={`/documento/${row.documento_id}`}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-400 hover:text-purple-300 bg-purple-950/40 hover:bg-purple-900/50 px-2.5 py-1 rounded border border-purple-800/50 transition-colors"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            Doc #{row.documento_id}
                          </Link>
                        )}
                        <span className="text-xs text-slate-300 font-medium">
                          {row.empresa_nombre}
                        </span>
                        <span className="text-xs text-slate-500 font-mono">
                          ID Auditoría: {rowId}
                        </span>
                      </div>

                      <div className="mt-1 text-xs text-slate-400 flex items-center gap-2">
                        <span>Usuario: <strong className="text-slate-300">{row.usuario || 'Sistema'}</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Right info */}
                  <div className="flex items-center justify-between lg:justify-end gap-4 border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-800">
                    <span className="text-xs font-mono text-slate-400 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
                      {dateStr}
                    </span>

                    {hasDetails && (
                      <button
                        onClick={() => toggleExpand(rowId)}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5 text-purple-400" />
                        {isExpanded ? 'Ocultar Caja Negra' : 'Ver Detalles'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Details / Diff Viewer */}
                {isExpanded && hasDetails && (
                  <div className="mt-4 pt-4 border-t border-slate-800/80">
                    {details.previo && details.actual ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-slate-950 p-4 rounded-lg border border-rose-900/30">
                          <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            ◀ Estado Previo (Snapshot)
                          </h4>
                          <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap overflow-x-auto max-h-80 p-2">
                            {JSON.stringify(details.previo, null, 2)}
                          </pre>
                        </div>

                        <div className="bg-slate-950 p-4 rounded-lg border border-emerald-900/30">
                          <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            ▶ Estado Actual (Guardado)
                          </h4>
                          <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap overflow-x-auto max-h-80 p-2">
                            {JSON.stringify(details.actual, null, 2)}
                          </pre>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                        <h4 className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-2 font-mono">
                          Detalle Completo (JSON Desencriptado)
                        </h4>
                        <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap overflow-x-auto max-h-96">
                          {JSON.stringify(details, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
