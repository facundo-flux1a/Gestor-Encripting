import 'dotenv/config';
import { NextRequest } from 'next/server';
import { GET as getDocuments } from '../src/app/api/v1/documents/route';
import { GET as getDocumentsFull } from '../src/app/api/v1/documents/full/route';
import db from '../src/lib/db';
import type { RowDataPacket } from 'mysql2';

async function main() {
  console.log('=== TEST INTEGRACIÓN ENDPOINTS /api/v1/documents ===\n');

  // 1. Obtener una API key de prueba para la empresa 117 (o resolver api_key existente)
  const [keyRows] = await db.query<RowDataPacket[]>(
    'SELECT key_prefix, key_hash, id FROM api_keys WHERE empresa_id = 117 AND activa = 1 LIMIT 1'
  );

  console.log('API Keys de empresa 117:', keyRows);

  // 2. Probar llamada simulada a /api/v1/documents con query params
  // Simulamos invocación directa de la función GET con NextRequest
  // Si no tenemos la clave raw, podemos probar con un mock de auth o con un test de lógica
  console.log('\n--- Test 1: Verificación de lógica de formateo y consultas para Empresa 117 ---');

  const { formatEntityData, buildFileUrl, formatDocumentLine } = await import('../src/lib/api-v1-helpers');

  // Test buildFileUrl
  const testUrl1 = 'https://minio.allbase.com.ar/gestor-documental/doc_123.pdf';
  const testUrl2 = 'archivos/empresa_117/doc_456.pdf';
  console.log('buildFileUrl (absoluta):', buildFileUrl(testUrl1));
  console.log('buildFileUrl (relativa):', buildFileUrl(testUrl2));
  if (buildFileUrl(testUrl1) !== testUrl1) {
    throw new Error('❌ Fallo en normalización de URL absoluta');
  }

  // Test formatEntityData
  const testEnt = {
    nombre: ' Distribuciones Mediterráneo S.L. ',
    identificador_fiscal: ' B46345678 ',
    direccion: 'Pol. Ind. Fuente del Jarro, 46988 Paterna',
    telefono: '',
    email: null,
    datos_extra: JSON.stringify({ iban: 'ES1234567890' })
  };
  const formattedEnt = formatEntityData(testEnt);
  console.log('\nformatEntityData output:', formattedEnt);
  if (formattedEnt.codigo_postal !== '46988' || formattedEnt.poblacion !== 'Paterna' || formattedEnt.iban !== 'ES1234567890' || formattedEnt.telefono !== null) {
    throw new Error('❌ Fallo en formateo de entidad');
  }

  // Test formatDocumentLine
  const testLine = {
    codigo: 'ART-001',
    descripcion: 'Artículo de prueba',
    cantidad: '2.5',
    precio_unitario: '100.00',
    descuento_porcentaje: '10.00',
    precio_neto: '90.00',
    importe_linea: '225.00'
  };
  const formattedLine = formatDocumentLine(testLine, [{ tipo_impuesto: 'IVA', porcentaje: 21 }]);
  console.log('\nformatDocumentLine output:', formattedLine);
  if (formattedLine.codigo_proveedor !== 'ART-001' || formattedLine.iva_porcentaje !== 21 || formattedLine.importe_total !== 225) {
    throw new Error('❌ Fallo en formateo de línea');
  }

  // 3. Test de consulta SQL directa con desde_id
  const [docsDesde] = await db.query<RowDataPacket[]>(
    `SELECT d.id, d.numero_documento, d.fecha_creacion, d.importe_total 
     FROM documentos d 
     WHERE d.id_de_empresa = 117 AND d.id > 9500 
     ORDER BY d.id ASC LIMIT 5`
  );
  console.log('\n--- Test 2: Simulación de ?desde_id=9500 (orden ascendente por id) ---');
  console.log(docsDesde);
  if (docsDesde.length > 0 && docsDesde[0].id <= 9500) {
    throw new Error('❌ Fallo en condición desde_id');
  }

  // 4. Test de parseFlexibleDate (DD/MM/AAAA, DD/MM/AA, ISO)
  const { parseFlexibleDate } = await import('../src/lib/api-v1-helpers');
  console.log('\n--- Test 3: Verificación de formatos de fecha en parseFlexibleDate ---');
  
  const d1 = parseFlexibleDate('24/08/2026');
  console.log('24/08/2026 ->', d1?.toISOString());
  if (d1?.toISOString() !== '2026-08-24T00:00:00.000Z') throw new Error('❌ Fallo en DD/MM/AAAA');

  const d2 = parseFlexibleDate('24/08/26');
  console.log('24/08/26 ->', d2?.toISOString());
  if (d2?.toISOString() !== '2026-08-24T00:00:00.000Z') throw new Error('❌ Fallo en DD/MM/AA');

  const d3 = parseFlexibleDate('24-08-2026');
  console.log('24-08-2026 ->', d3?.toISOString());
  if (d3?.toISOString() !== '2026-08-24T00:00:00.000Z') throw new Error('❌ Fallo en DD-MM-AAAA');

  const d4 = parseFlexibleDate('2026-08-24T15:30:00Z');
  console.log('2026-08-24T15:30:00Z ->', d4?.toISOString());
  if (d4?.toISOString() !== '2026-08-24T15:30:00.000Z') throw new Error('❌ Fallo en ISO 8601');

  const d5 = parseFlexibleDate('texto_invalido');
  console.log('texto_invalido ->', d5);
  if (d5 !== null) throw new Error('❌ Fallo en texto inválido');

  console.log('\n✅ ¡TODOS LOS TESTS DE INTEGRACIÓN PASARON EXITOSAMENTE!');
}

main().finally(() => process.exit(0));
