/**
 * Siembra en la DB de testing los docs del smoke Espai.
 * NO escribe en MinIO: solo referencia keys ya existentes (GET-only).
 *
 * npx tsx --env-file=.env scripts/seed-smoke-docs.ts
 */
import 'dotenv/config';
import crypto from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { prisma } from '../src/lib/prisma';
import { calcularTrimestreExtendido, obtenerSiguienteTrimestreAbierto } from '../src/lib/trimestre-utils';
import {
  FiscalStatus,
  FISCAL_GUARD_VERSION,
  FISCAL_GUARD_VERSION_KEY,
  FISCAL_STATUS_KEY,
} from '../src/lib/document-fiscal-status';

const EMPRESA_ID = 1n;
const MINIO_BASE = (
  process.env.MINIO_PUBLIC_ENDPOINT ||
  process.env.MINIO_ENDPOINT ||
  'https://minio.allbase.com.ar'
).replace(/\/$/, '');
const BUCKET = process.env.MINIO_BUCKET_NAME || 'gestor-documental';

function sha256(text: string | null | undefined): string | null {
  if (!text) return null;
  return crypto.createHash('sha256').update(text.toLowerCase().trim()).digest('hex');
}

function publicUrl(key: string) {
  return `${MINIO_BASE}/${BUCKET}/${key}`;
}

type SmokeRow = {
  file: string;
  error?: string;
  rawNormalized?: any;
  guards?: { ok: boolean };
};

const KEY_BY_FILE: Record<string, string> = {
  'pdf_digital_small__Factura-5310678875.PDF': 'archivos/Factura-5310678875.PDF',
  'pdf_digital_small__Factura_5310788021.PDF': 'archivos/Factura 5310788021.PDF',
  'pdf_digital_small__Factura-5410752373_2026_07_17_13_55_52.PDF':
    'archivos/Factura-5410752373_2026_07_17_13_55_52.PDF',
};

async function seedOne(row: SmokeRow) {
  if (row.error || !row.rawNormalized) {
    console.log('skip', row.file, row.error || 'sin raw');
    return;
  }
  const key = KEY_BY_FILE[row.file];
  if (!key) {
    console.log('skip sin key MinIO', row.file);
    return;
  }

  const ai = row.rawNormalized;
  const tipoDocumento = String(ai.tipo_documento || 'SIN CLASIFICAR').toUpperCase();
  const docInfo = ai.documento || {};
  // smoke ya trae signos correctos (abono negativo). No re-multiplicar.
  const importeTotal = Number(docInfo.importe_total ?? ai.importe_total ?? 0);
  const importeSinIva = Number(docInfo.importe_sin_iva ?? ai.importe_sin_impuestos ?? 0);
  const numeroDocumento = docInfo.numero_documento || `seed-${Date.now()}`;
  const fechaEmision = docInfo.fecha_emision ? new Date(docInfo.fecha_emision) : new Date();
  const fechaVencimiento = docInfo.fecha_vencimiento ? new Date(docInfo.fecha_vencimiento) : null;
  const formaPago = docInfo.forma_pago || '';

  const emisor = ai.empresa_emisora || {};
  const receptor = ai.cliente || ai.empresa_receptora || {};
  const esEmitida = tipoDocumento.includes('EMITIDA') || tipoDocumento.includes('EMITIDO');
  const esRecibida = tipoDocumento.includes('RECIBIDA') || tipoDocumento.includes('RECIBIDO');
  const isSinConfirmar = !esEmitida && !esRecibida;
  const rolEmisor = esEmitida || isSinConfirmar ? 'emisor' : 'proveedor';
  const rolReceptor = esEmitida || isSinConfirmar ? 'cliente' : 'receptor';
  const cifDocumento = (esEmitida || isSinConfirmar ? receptor.cif : emisor.cif) || '';

  const fileHash = crypto
    .createHash('sha256')
    .update(`seed|${key}|${numeroDocumento}|${EMPRESA_ID}`)
    .digest('hex');

  const existing = await prisma.documentos.findFirst({
    where: { file_hash: fileHash, id_de_empresa: EMPRESA_ID },
  });
  if (existing) {
    console.log('ya existe', numeroDocumento, 'id=', String(existing.id));
    return;
  }

  const trimestreDataRaw = calcularTrimestreExtendido(fechaEmision);
  const trimestreData = await obtenerSiguienteTrimestreAbierto(
    trimestreDataRaw.año,
    trimestreDataRaw.trimestre,
    Number(EMPRESA_ID),
    null
  );

  const fiscalStatus = row.guards?.ok === false ? FiscalStatus.REVISION : FiscalStatus.VALIDADO;

  const doc = await prisma.$transaction(
    async (tx) => {
      const created = await tx.documentos.create({
        data: {
          file_hash: fileHash,
          tipo_documento: tipoDocumento,
          numero_documento: numeroDocumento,
          fecha_emision: fechaEmision,
          fecha_vencimiento: fechaVencimiento,
          importe_total: importeTotal,
          importe_sin_impuestos: importeSinIva,
          moneda: 'EUR',
          id_de_empresa: EMPRESA_ID,
          is_new: 1,
          trimestre_cerrado: false,
          enviado_sii: false,
          año_trimestre: trimestreData.año,
          num_trimestre: trimestreData.trimestre,
          dashboard_correo: 'dashboard',
          datos_extra: {
            categoria: ai.categoria_principal || '',
            subcategoria: ai.subcategoria || '',
            forma_pago: formaPago,
            cif: cifDocumento,
            [FISCAL_STATUS_KEY]: fiscalStatus,
            [FISCAL_GUARD_VERSION_KEY]: FISCAL_GUARD_VERSION,
            seeded_from: 'smoke-readonly-minio',
          },
        },
      });

      await tx.archivos_documento.create({
        data: {
          documento_id: created.id,
          nombre_archivo: path.basename(key),
          ruta_archivo: publicUrl(key),
          tipo_archivo: 'pdf',
          id_de_empresa: EMPRESA_ID,
          hash_archivo: fileHash.slice(0, 64),
        },
      });

      if (emisor.nombre) {
        await tx.entidades_documento.create({
          data: {
            documento_id: created.id,
            id_de_empresa: EMPRESA_ID,
            rol: rolEmisor,
            nombre: emisor.nombre || '',
            identificador_fiscal: emisor.cif || '',
            direccion: emisor.direccion || null,
            telefono: emisor.telefono || null,
            email: emisor.email || null,
            nombre_hash: sha256(emisor.nombre),
            identificador_fiscal_hash: sha256(emisor.cif),
          },
        });
      }
      if (receptor.nombre) {
        await tx.entidades_documento.create({
          data: {
            documento_id: created.id,
            id_de_empresa: EMPRESA_ID,
            rol: rolReceptor,
            nombre: receptor.nombre || '',
            identificador_fiscal: receptor.cif || '',
            direccion: receptor.direccion || null,
            telefono: receptor.telefono || null,
            email: receptor.email || null,
            nombre_hash: sha256(receptor.nombre),
            identificador_fiscal_hash: sha256(receptor.cif),
          },
        });
      }

      const lineasToInsert: any[] = [];
      for (const grupo of ai.lineas || []) {
        for (const art of grupo.articulos || []) {
          const cant = Number(art.cantidad) || 0;
          const precioNeto = Number(art.precio_neto ?? art.precio_unitario) || 0;
          const importeLin = Number(art.importe_linea) || cant * precioNeto;
          lineasToInsert.push({
            documento_id: created.id,
            id_de_empresa: EMPRESA_ID,
            codigo: art.codigo || null,
            descripcion: art.descripcion || 'Sin descripción',
            cantidad: cant,
            precio_unitario: Number(art.precio_unitario) || 0,
            descuento_porcentaje: Number(art.descuento_porcentaje) || 0,
            precio_neto: precioNeto,
            importe_linea: importeLin,
            datos_extra: grupo.albaran ? { albaran: grupo.albaran } : undefined,
          });
        }
      }
      if (lineasToInsert.length) {
        await tx.lineas_documento.createMany({ data: lineasToInsert });
      }

      const impuestosToInsert = (ai.totales_por_impuesto || ai.desglose_iva || []).map((imp: any) => {
        const tipo = String(imp.tipo_iva || 'IVA').toUpperCase();
        const esRet = tipo.includes('RET');
        const base = Number(imp.base_imponible) || 0;
        const cuota = esRet ? -Math.abs(Number(imp.cuota_iva) || 0) : Number(imp.cuota_iva) || 0;
        return {
          documento_id: created.id,
          id_de_empresa: EMPRESA_ID,
          tipo_impuesto: tipo,
          porcentaje: Number(imp.porcentaje ?? imp.porcentaje_iva) || 0,
          base_imponible: base,
          cuota,
          total_con_impuesto: base + cuota,
        };
      });
      if (impuestosToInsert.length) {
        await tx.impuestos_documento.createMany({ data: impuestosToInsert });
      }

      return created;
    },
    { maxWait: 15000, timeout: 30000 }
  );

  console.log('OK', numeroDocumento, tipoDocumento, importeTotal, 'id=', String(doc.id));
}

async function main() {
  const smokePath = path.resolve('tests/fixtures/documents/eval-out/smoke-1784404562896.json');
  const rows = JSON.parse(readFileSync(smokePath, 'utf8')) as SmokeRow[];
  console.log('Sembrando en empresa', String(EMPRESA_ID), '| MinIO solo referencia (no Put)');
  for (const row of rows) {
    await seedOne(row);
  }
  const count = await prisma.documentos.count({ where: { id_de_empresa: EMPRESA_ID } });
  console.log('Total docs empresa 1:', count);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
