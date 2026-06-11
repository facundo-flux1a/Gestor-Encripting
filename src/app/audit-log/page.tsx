'use client';

import { useState, useEffect, useCallback } from 'react';

type TableName = 'documentos_auditoria' | 'eventos_sistema';

interface AuditRow {
  id: string | number;
  [key: string]: any;
}

export default function AuditLogPage() {
  const [table, setTable] = useState<TableName>('documentos_auditoria');
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/audit-log?table=${table}&limit=${limit}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRows(data.rows.map((r: any) => ({
        ...r,
        id: r.id?.toString(),
        documento_id: r.documento_id?.toString(),
        id_de_empresa: r.id_de_empresa?.toString(),
      })));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [table, limit]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  const formatCell = (value: any): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'object') return JSON.stringify(value);
    const str = String(value);
    // Try to pretty-print JSON detalle/metadata
    try {
      const parsed = JSON.parse(str);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return str;
    }
  };

  const isLongField = (key: string) => ['detalle', 'metadata', 'usuario'].includes(key);

  return (
    <div style={{ fontFamily: 'monospace', padding: '24px', background: '#0f0f0f', minHeight: '100vh', color: '#e0e0e0' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ color: '#a78bfa', fontSize: '20px', marginBottom: '4px' }}>
          🔐 Audit Log Viewer <span style={{ color: '#6b7280', fontSize: '14px' }}>(interno — no linkear)</span>
        </h1>
        <p style={{ color: '#6b7280', fontSize: '13px' }}>
          Los campos encriptados se muestran desencriptados via Prisma.
        </p>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <select
          value={table}
          onChange={e => setTable(e.target.value as TableName)}
          style={{ background: '#1c1c1c', color: '#e0e0e0', border: '1px solid #333', borderRadius: '6px', padding: '8px 12px', fontSize: '14px' }}
        >
          <option value="documentos_auditoria">documentos_auditoria</option>
          <option value="eventos_sistema">eventos_sistema</option>
        </select>

        <select
          value={limit}
          onChange={e => setLimit(Number(e.target.value))}
          style={{ background: '#1c1c1c', color: '#e0e0e0', border: '1px solid #333', borderRadius: '6px', padding: '8px 12px', fontSize: '14px' }}
        >
          <option value={20}>Últimos 20</option>
          <option value={50}>Últimos 50</option>
          <option value={100}>Últimos 100</option>
          <option value={200}>Últimos 200</option>
        </select>

        <button
          onClick={fetchData}
          disabled={loading}
          style={{ background: '#7c3aed', color: 'white', border: 'none', borderRadius: '6px', padding: '8px 20px', cursor: 'pointer', fontSize: '14px' }}
        >
          {loading ? '⏳ Cargando...' : '🔄 Recargar'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#3b0764', color: '#f87171', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '13px' }}>
          ❌ Error: {error}
        </div>
      )}

      {/* Stats */}
      <div style={{ color: '#6b7280', fontSize: '12px', marginBottom: '12px' }}>
        {rows.length} filas encontradas
      </div>

      {/* Table */}
      {rows.length === 0 && !loading ? (
        <div style={{ color: '#6b7280', padding: '40px', textAlign: 'center' }}>
          Sin registros en esta tabla.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          {rows.map((row, i) => (
            <div key={i} style={{
              background: i % 2 === 0 ? '#141414' : '#1a1a1a',
              border: '1px solid #2a2a2a',
              borderRadius: '8px',
              padding: '14px 18px',
              marginBottom: '10px'
            }}>
              {columns.map(col => (
                <div key={col} style={{ display: 'flex', gap: '12px', marginBottom: '6px', alignItems: isLongField(col) ? 'flex-start' : 'center' }}>
                  <span style={{ color: '#7c3aed', minWidth: '140px', fontSize: '12px', fontWeight: 'bold', flexShrink: 0 }}>
                    {col}
                  </span>
                  <span style={{
                    color: col === 'accion' || col === 'tipo_evento' ? '#34d399' : '#d1d5db',
                    fontSize: '12px',
                    whiteSpace: isLongField(col) ? 'pre-wrap' : 'normal',
                    wordBreak: 'break-all',
                    background: isLongField(col) ? '#0d0d0d' : 'transparent',
                    padding: isLongField(col) ? '6px 8px' : '0',
                    borderRadius: isLongField(col) ? '4px' : '0',
                    flex: 1
                  }}>
                    {formatCell(row[col])}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
