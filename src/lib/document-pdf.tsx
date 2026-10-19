/**
 * src/lib/document-pdf.tsx
 *
 * Genera un PDF que replica la vista de reconstrucción del gestor,
 * para documentos que no tienen archivo original adjunto en MinIO.
 * Usa @react-pdf/renderer (server-safe, sin navegador headless).
 */
import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';

// ─── Estilos ────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    backgroundColor: '#0f1117',
    color: '#e2e8f0',
    fontFamily: 'Helvetica',
    fontSize: 9,
    padding: 28,
  },
  banner: {
    backgroundColor: '#1c2a1c',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#166534',
    borderStyle: 'solid',
    padding: '6 10',
    marginBottom: 12,
  },
  bannerText: {
    color: '#86efac',
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
  },
  // Cabecera: tipo doc + metadatos
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  tipoBadge: {
    backgroundColor: '#7c3aed',
    borderRadius: 4,
    padding: '4 10',
    marginBottom: 4,
  },
  tipoBadgeText: {
    color: '#fff',
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  idText: {
    color: '#94a3b8',
    fontSize: 8,
  },
  metaBlock: {
    alignItems: 'flex-end',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 2,
  },
  metaLabel: {
    color: '#64748b',
    fontSize: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: 'Helvetica-Bold',
  },
  metaValue: {
    color: '#e2e8f0',
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
  },
  metaValueAccent: {
    color: '#a78bfa',
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    borderBottomStyle: 'solid',
    marginBottom: 12,
  },
  // Bloque entidades 2 columnas
  entidadesRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  entidadCard: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1e293b',
    borderStyle: 'solid',
    padding: '8 10',
  },
  entidadRol: {
    color: '#64748b',
    fontSize: 7,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  entidadNombre: {
    color: '#f1f5f9',
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  entidadCif: {
    color: '#94a3b8',
    fontSize: 8,
  },
  // Sección label
  sectionLabel: {
    color: '#94a3b8',
    fontSize: 7,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 6,
  },
  // Tabla
  table: {
    borderWidth: 1,
    borderColor: '#1e293b',
    borderStyle: 'solid',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 14,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#0f1723',
    padding: '5 8',
  },
  tableHeaderCell: {
    color: '#64748b',
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    borderTopStyle: 'solid',
    padding: '5 8',
  },
  tableRowAlt: {
    backgroundColor: '#0a0f1a',
  },
  tableCell: {
    color: '#e2e8f0',
    fontSize: 8,
  },
  // Anchos columna lineas
  colDesc: { flex: 4 },
  colCant: { flex: 1, textAlign: 'right' },
  colUnit: { flex: 1.5, textAlign: 'right' },
  colImp: { flex: 1.5, textAlign: 'right' },
  // Anchos columna impuestos
  colTipo: { flex: 3 },
  colPct: { flex: 1, textAlign: 'right' },
  colBase: { flex: 2, textAlign: 'right' },
  colCuota: { flex: 2, textAlign: 'right' },
  // Totales
  totalesBox: {
    backgroundColor: '#111827',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1e293b',
    borderStyle: 'solid',
    padding: '10 14',
    alignSelf: 'flex-end',
    width: 200,
    marginBottom: 14,
  },
  totalesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  totalesLabel: {
    color: '#94a3b8',
    fontSize: 8,
  },
  totalesValue: {
    color: '#e2e8f0',
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
  },
  totalesDivider: {
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    borderTopStyle: 'solid',
    marginTop: 4,
    marginBottom: 6,
  },
  totalLabel: {
    color: '#94a3b8',
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
  },
  totalValue: {
    color: '#22c55e',
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
  },
  // Footer
  footer: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    borderTopStyle: 'solid',
    paddingTop: 6,
  },
  footerText: {
    color: '#475569',
    fontSize: 7,
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtEur = (n: number | null | undefined, moneda = 'EUR'): string => {
  if (n == null || isNaN(Number(n))) return '—';
  const sym = moneda === 'USD' ? '$' : moneda === 'GBP' ? '£' : '€';
  return `${Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${sym}`;
};

const fmtDate = (d: string | null | undefined): string => {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return d; }
};

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface DocPdfData {
  id: number | string;
  tipo_documento: string;
  numero_documento: string;
  fecha_emision: string | null;
  fecha_vencimiento?: string | null;
  num_trimestre?: number | null;
  año_trimestre?: number | null;
  importe_total: number;
  importe_sin_impuestos: number;
  moneda?: string;
  estado?: string;
  canal?: string;
  emisor?: { nombre?: string; cif?: string };
  cliente?: { nombre?: string; cif?: string };
  lineas?: Array<{
    descripcion?: string;
    cantidad?: number | null;
    precio_unitario?: number | null;
    importe_linea?: number | null;
  }>;
  impuestos?: Array<{
    tipo_impuesto?: string;
    porcentaje?: number | null;
    base_imponible?: number | null;
    cuota?: number | null;
  }>;
}

// ─── Componente ──────────────────────────────────────────────────────────────

export function DocumentPDF({ doc }: { doc: DocPdfData }) {
  const moneda = doc.moneda || 'EUR';
  const trimLabel = doc.num_trimestre && doc.año_trimestre
    ? `${doc.año_trimestre} – T${doc.num_trimestre}`
    : '—';

  const lineas = doc.lineas || [];
  const impuestos = doc.impuestos || [];

  // Calcular base imponible de los impuestos (excluyendo ISP espejo)
  const baseImponible = Number(doc.importe_sin_impuestos) || 0;

  return (
    <Document>
      <Page size="A4" style={S.page}>

        {/* Banner reconstrucción */}
        <View style={S.banner}>
          <Text style={S.bannerText}>
            ⚠ Reconstrucción gráfica de datos — Sin archivo original adjunto
          </Text>
        </View>

        {/* Cabecera: tipo + metadatos */}
        <View style={S.headerRow}>
          <View>
            <View style={S.tipoBadge}>
              <Text style={S.tipoBadgeText}>{doc.tipo_documento}</Text>
            </View>
            <Text style={S.idText}>Nº de Registro: ID #{doc.id}</Text>
          </View>
          <View style={S.metaBlock}>
            <View style={S.metaRow}>
              <Text style={S.metaLabel}>Nº FACTURA / SERIE:</Text>
              <Text style={S.metaValue}>{doc.numero_documento}</Text>
            </View>
            <View style={S.metaRow}>
              <Text style={S.metaLabel}>FECHA EMISIÓN:</Text>
              <Text style={S.metaValue}>{fmtDate(doc.fecha_emision)}</Text>
            </View>
            {doc.fecha_vencimiento && (
              <View style={S.metaRow}>
                <Text style={S.metaLabel}>VENCIMIENTO:</Text>
                <Text style={S.metaValue}>{fmtDate(doc.fecha_vencimiento)}</Text>
              </View>
            )}
            <View style={S.metaRow}>
              <Text style={S.metaLabel}>TRIMESTRE FISCAL:</Text>
              <Text style={S.metaValueAccent}>{trimLabel}</Text>
            </View>
          </View>
        </View>

        <View style={S.divider} />

        {/* Entidades */}
        <View style={S.entidadesRow}>
          <View style={S.entidadCard}>
            <Text style={S.entidadRol}>📋  Emisor / Proveedor</Text>
            <Text style={S.entidadNombre}>{doc.emisor?.nombre || '—'}</Text>
            <Text style={S.entidadCif}>CIF/NIF: {doc.emisor?.cif || '—'}</Text>
          </View>
          <View style={S.entidadCard}>
            <Text style={S.entidadRol}>👤  Cliente / Receptor</Text>
            <Text style={S.entidadNombre}>{doc.cliente?.nombre || '—'}</Text>
            <Text style={S.entidadCif}>CIF/NIF: {doc.cliente?.cif || '—'}</Text>
          </View>
        </View>

        {/* Tabla líneas */}
        {lineas.length > 0 && (
          <View style={{ marginBottom: 4 }}>
            <Text style={S.sectionLabel}>Conceptos y líneas de detalle</Text>
            <View style={S.table}>
              <View style={S.tableHeader}>
                <Text style={[S.tableHeaderCell, S.colDesc]}>Descripción</Text>
                <Text style={[S.tableHeaderCell, S.colCant]}>Cant.</Text>
                <Text style={[S.tableHeaderCell, S.colUnit]}>Precio Unit.</Text>
                <Text style={[S.tableHeaderCell, S.colImp]}>Importe</Text>
              </View>
              {lineas.map((l, i) => (
                <View key={i} style={[S.tableRow, i % 2 === 1 ? S.tableRowAlt : {}]}>
                  <Text style={[S.tableCell, S.colDesc]}>{l.descripcion || '—'}</Text>
                  <Text style={[S.tableCell, S.colCant]}>{l.cantidad ?? '—'}</Text>
                  <Text style={[S.tableCell, S.colUnit]}>{fmtEur(l.precio_unitario, moneda)}</Text>
                  <Text style={[S.tableCell, S.colImp]}>{fmtEur(l.importe_linea, moneda)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Tabla impuestos */}
        {impuestos.length > 0 && (
          <View style={{ marginBottom: 4 }}>
            <Text style={S.sectionLabel}>Desglose de impuestos (IVA / Retenciones)</Text>
            <View style={S.table}>
              <View style={S.tableHeader}>
                <Text style={[S.tableHeaderCell, S.colTipo]}>Tipo Impuesto</Text>
                <Text style={[S.tableHeaderCell, S.colPct]}>% IVA</Text>
                <Text style={[S.tableHeaderCell, S.colBase]}>Base Imponible</Text>
                <Text style={[S.tableHeaderCell, S.colCuota]}>Cuota IVA</Text>
              </View>
              {impuestos.map((imp, i) => (
                <View key={i} style={[S.tableRow, i % 2 === 1 ? S.tableRowAlt : {}]}>
                  <Text style={[S.tableCell, S.colTipo]}>{imp.tipo_impuesto || '—'}</Text>
                  <Text style={[S.tableCell, S.colPct]}>{imp.porcentaje != null ? `${imp.porcentaje}%` : '—'}</Text>
                  <Text style={[S.tableCell, S.colBase]}>{fmtEur(imp.base_imponible, moneda)}</Text>
                  <Text style={[S.tableCell, S.colCuota]}>{fmtEur(imp.cuota, moneda)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Totales */}
        <View style={S.totalesBox}>
          <View style={S.totalesRow}>
            <Text style={S.totalesLabel}>Base Imponible:</Text>
            <Text style={S.totalesValue}>{fmtEur(baseImponible, moneda)}</Text>
          </View>
          <View style={S.totalesDivider} />
          <View style={S.totalesRow}>
            <Text style={S.totalLabel}>TOTAL FACTURA:</Text>
            <Text style={S.totalValue}>{fmtEur(doc.importe_total, moneda)}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={S.footer}>
          <Text style={S.footerText}>
            Moneda: {moneda}  ·  Estado: {doc.estado || 'Registrado'}
          </Text>
          <Text style={S.footerText}>
            Canal: {doc.canal || 'dashboard'}  ·  Generado por Gestor Encripting
          </Text>
        </View>

      </Page>
    </Document>
  );
}
