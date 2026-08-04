/**
 * Plantilla de sincronización Gestor Documental → Contabilidad.
 *
 * Uso:
 *   API_KEY=flux_xxx EMPRESA_ID=1 npx tsx scripts/sync-contabilidad-template.ts
 *   API_KEY=flux_xxx BASE_URL=https://gestor.example.com TRIMESTRE=3 AÑO=2026 npx tsx scripts/sync-contabilidad-template.ts
 */
import { extractRetencionFromImpuestos } from '../src/lib/tax-helpers';

const API_KEY = process.env.API_KEY || '';
const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const EMPRESA_ID = process.env.EMPRESA_ID;
const TRIMESTRE = process.env.TRIMESTRE;
const AÑO = process.env.AÑO || String(new Date().getFullYear());

interface ApiDocument {
  id: number;
  numero_documento: string;
  fecha_emision: string;
  importe_total: number;
  importe_sin_impuestos: number;
  retencion: number;
  trimestre: number;
  año: number;
  is_issued: boolean;
  impuestos: Array<{ tipo_impuesto: string; cuota: number; base_imponible: number; porcentaje: number }>;
  entidades: Record<string, { nombre?: string; cif?: string }>;
}

async function fetchDocuments(): Promise<ApiDocument[]> {
  if (!API_KEY) throw new Error('Define API_KEY (header X-Api-Key)');

  const params = new URLSearchParams({ año: AÑO });
  if (TRIMESTRE) params.set('trimestre', TRIMESTRE);

  const res = await fetch(`${BASE_URL}/api/v1/documents/full?${params}`, {
    headers: { 'X-Api-Key': API_KEY },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }

  const json = await res.json();
  return json.data || json;
}

/** Mapeo a asiento contable — adaptar según el ERP destino */
function mapToAsiento(doc: ApiDocument) {
  const retencion = doc.retencion ?? extractRetencionFromImpuestos(doc.impuestos);
  const tercero = doc.is_issued
    ? doc.entidades.cliente || doc.entidades.receptor
    : doc.entidades.proveedor || doc.entidades.emisor;

  return {
    documento_id: doc.id,
    numero: doc.numero_documento,
    fecha: doc.fecha_emision,
    trimestre: doc.trimestre,
    año: doc.año,
    tipo: doc.is_issued ? 'EMITIDA' : 'RECIBIDA',
    tercero_nombre: tercero?.nombre || '',
    tercero_cif: tercero?.cif || '',
    base_imponible: doc.importe_sin_impuestos,
    importe_total: doc.importe_total,
    retencion,
    impuestos: doc.impuestos,
  };
}

async function main() {
  console.log(`🔗 Sincronizando desde ${BASE_URL} (año ${AÑO}${TRIMESTRE ? `, T${TRIMESTRE}` : ''})...`);

  const docs = await fetchDocuments();
  console.log(`📄 Documentos recibidos: ${docs.length}`);

  const asientos = docs.map(mapToAsiento);
  const conRetencion = asientos.filter((a) => a.retencion > 0);

  console.log(`💰 Con retención: ${conRetencion.length}`);
  conRetencion.slice(0, 5).forEach((a) => {
    console.log(`  - #${a.numero}: retención ${a.retencion.toFixed(2)} € (${a.tercero_nombre})`);
  });

  // TODO: enviar `asientos` al ERP/contabilidad (REST, cola, fichero...)
  console.log('\n✅ Plantilla lista. Conecta mapToAsiento() con tu sistema contable.');
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
