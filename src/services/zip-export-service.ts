/**
 * src/services/zip-export-service.ts
 *
 * Generador de ZIPs para exportación de documentos.
 * Corre in-process dentro de Next.js (fire-and-forget async).
 * Sin BullMQ, sin worker separado. Estado trackeado en Redis.
 *
 * Flujo:
 *  1. Llamador pre-reserva una key en MinIO y llama triggerZipGeneration()
 *  2. La función retorna inmediatamente (el trabajo corre en background)
 *  3. El cliente puede consultar GET /api/export/zip?jobId=xxx para ver el estado
 *  4. Cuando termina: sube el ZIP a la key pre-reservada y (opcional) envía mail
 */

import { randomBytes } from 'crypto';
import AdmZip from 'adm-zip';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { PutObjectCommand } from '@aws-sdk/client-s3';

import { redis } from '@/lib/redis';
import { prisma } from '@/lib/prisma';
import { getFileBuffer, s3, getBucketName, getPresignedUrl } from '@/lib/s3-client';
import { sendEmail } from '@/services/email-service';
import { DocumentPDF, type DocPdfData } from '@/lib/document-pdf';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface ZipJobParams {
  documentIds: number[];
  empresaId: number;
  s3ZipKey: string;       // Key pre-reservada en MinIO
  expiresInSec: number;   // TTL de la presigned URL
  notifyEmail?: string | null;
  empresaNombre?: string;
}

export type ZipJobStatus = 'pending' | 'processing' | 'done' | 'error';

export interface ZipJobState {
  status: ZipJobStatus;
  progress: number;       // 0–100
  zipUrl?: string;
  included?: number;
  fallbacks?: number;
  error?: string;
  createdAt: number;
}

// ─── Redis helpers ────────────────────────────────────────────────────────────

const ZIP_JOB_PREFIX = 'zip-export:job:';
const ZIP_JOB_TTL = 3 * 24 * 3600; // 3 días en Redis

export function generateZipJobId(): string {
  return `zip_${Date.now()}_${randomBytes(4).toString('hex')}`;
}

async function setJobState(jobId: string, state: Partial<ZipJobState>) {
  const key = `${ZIP_JOB_PREFIX}${jobId}`;
  const current = await redis.hgetall(key);
  const merged = {
    ...current,
    ...Object.fromEntries(
      Object.entries(state).map(([k, v]) => [k, String(v ?? '')])
    ),
  };
  await redis.hset(key, merged);
  await redis.expire(key, ZIP_JOB_TTL);
}

export async function getZipJobState(jobId: string): Promise<ZipJobState | null> {
  const key = `${ZIP_JOB_PREFIX}${jobId}`;
  const raw = await redis.hgetall(key);
  if (!raw || !raw.status) return null;
  return {
    status: raw.status as ZipJobStatus,
    progress: Number(raw.progress || 0),
    zipUrl: raw.zipUrl || undefined,
    included: raw.included ? Number(raw.included) : undefined,
    fallbacks: raw.fallbacks ? Number(raw.fallbacks) : undefined,
    error: raw.error || undefined,
    createdAt: Number(raw.createdAt || 0),
  };
}

// ─── Generar PDF de reconstrucción (para docs sin archivo en MinIO) ───────────

async function buildFallbackPdf(docId: number): Promise<Buffer | null> {
  try {
    const doc = await prisma.documentos.findUnique({
      where: { id: BigInt(docId) },
      select: {
        id: true,
        tipo_documento: true,
        numero_documento: true,
        fecha_emision: true,
        fecha_vencimiento: true,
        num_trimestre: true,
        año_trimestre: true,
        importe_total: true,
        importe_sin_impuestos: true,
        moneda: true,
        datos_extra: true,
      },
    });
    if (!doc) return null;

    const entidades = await prisma.entidades_documento.findMany({
      where: { documento_id: BigInt(docId) },
      select: { rol: true, nombre: true, identificador_fiscal: true },
    });
    const emisor = entidades.find((e: { rol: string | null }) => e.rol === 'EMISOR' || e.rol === 'PROVEEDOR');
    const cliente = entidades.find((e: { rol: string | null }) => e.rol === 'CLIENTE' || e.rol === 'RECEPTOR');

    const lineas = await prisma.lineas_documento.findMany({
      where: { documento_id: BigInt(docId) },
      select: { descripcion: true, cantidad: true, precio_unitario: true, importe_linea: true },
    });

    const impuestos = await prisma.impuestos_documento.findMany({
      where: { documento_id: BigInt(docId) },
      select: { tipo_impuesto: true, porcentaje: true, base_imponible: true, cuota: true },
    });

    const datosExtra: any = doc.datos_extra || {};

    const pdfData: DocPdfData = {
      id: Number(doc.id),
      tipo_documento: doc.tipo_documento || 'DOCUMENTO',
      numero_documento: doc.numero_documento || '—',
      fecha_emision: doc.fecha_emision ? String(doc.fecha_emision) : null,
      fecha_vencimiento: doc.fecha_vencimiento ? String(doc.fecha_vencimiento) : null,
      num_trimestre: doc.num_trimestre,
      año_trimestre: doc.año_trimestre,
      importe_total: Number(doc.importe_total) || 0,
      importe_sin_impuestos: Number(doc.importe_sin_impuestos) || 0,
      moneda: doc.moneda || 'EUR',
      estado: 'Registrado',
      canal: datosExtra.canal_origen || 'dashboard',
      emisor: {
        nombre: emisor?.nombre || datosExtra.empresa_emisora?.nombre || '—',
        cif: emisor?.identificador_fiscal || '—',
      },
      cliente: {
        nombre: cliente?.nombre || '—',
        cif: cliente?.identificador_fiscal || '—',
      },
      lineas: lineas.map((l: { descripcion: string | null; cantidad: unknown; precio_unitario: unknown; importe_linea: unknown }) => ({
        descripcion: l.descripcion || undefined,
        cantidad: l.cantidad ? Number(l.cantidad) : null,
        precio_unitario: l.precio_unitario ? Number(l.precio_unitario) : null,
        importe_linea: l.importe_linea ? Number(l.importe_linea) : null,
      })),
      impuestos: impuestos.map((i: { tipo_impuesto: string | null; porcentaje: unknown; base_imponible: unknown; cuota: unknown }) => ({
        tipo_impuesto: i.tipo_impuesto || undefined,
        porcentaje: i.porcentaje ? Number(i.porcentaje) : null,
        base_imponible: i.base_imponible ? Number(i.base_imponible) : null,
        cuota: i.cuota ? Number(i.cuota) : null,
      })),
    };

    // react-pdf renderToBuffer expects a ReactElement — cast to any to satisfy overloaded types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = React.createElement(DocumentPDF, { doc: pdfData }) as any;
    const buffer = await renderToBuffer(element);
    return Buffer.from(buffer);
  } catch (e) {
    console.error(`[ZipExport] No se pudo generar fallback PDF para doc #${docId}:`, e);
    return null;
  }
}

// ─── Lógica principal (corre in-process, async) ───────────────────────────────

async function runZipGeneration(jobId: string, params: ZipJobParams) {
  const { documentIds, empresaId, s3ZipKey, expiresInSec, notifyEmail, empresaNombre } = params;
  const LOG = (msg: string) => console.log(`[ZipExport:${jobId}] ${msg}`);

  try {
    await setJobState(jobId, { status: 'processing', progress: 5 });
    LOG(`Iniciando: ${documentIds.length} docs | key: ${s3ZipKey}`);

    // 1. Cargar rutas de archivos
    const archivos = await prisma.archivos_documento.findMany({
      where: { documento_id: { in: documentIds.map(id => BigInt(id)) } },
      select: { documento_id: true, ruta_archivo: true },
    });
    const archivoByDocId = new Map<number, string>();
    archivos.forEach((a: { documento_id: bigint; ruta_archivo: string | null }) => {
      if (a.ruta_archivo) archivoByDocId.set(Number(a.documento_id), a.ruta_archivo);
    });

    // 2. Obtener numero/tipo de cada doc para nombres en el ZIP
    const docs = await prisma.documentos.findMany({
      where: { id: { in: documentIds.map(id => BigInt(id)) } },
      select: { id: true, numero_documento: true, tipo_documento: true },
    });
    const docInfoById = new Map<number, { numero: string; tipo: string }>();
    docs.forEach((d: { id: bigint; numero_documento: string | null; tipo_documento: string | null }) => docInfoById.set(Number(d.id), {
      numero: (d.numero_documento || `doc_${d.id}`).replace(/[^a-zA-Z0-9_\-]/g, '_'),
      tipo: (d.tipo_documento || 'DOC').replace(/\s+/g, '_').toUpperCase().substring(0, 20),
    }));

    await setJobState(jobId, { progress: 10 });

    // 3. Construir ZIP
    const zip = new AdmZip();
    let included = 0;
    let fallbacks = 0;

    for (let i = 0; i < documentIds.length; i++) {
      const docId = documentIds[i];
      const info = docInfoById.get(docId);
      const baseName = info ? `${info.tipo}_${info.numero}` : `doc_${docId}`;
      const progress = 10 + Math.round((i / documentIds.length) * 75);
      await setJobState(jobId, { progress });

      const rutaArchivo = archivoByDocId.get(docId);
      if (rutaArchivo) {
        try {
          const { buffer } = await getFileBuffer(rutaArchivo);
          const ext = rutaArchivo.split('.').pop()?.toLowerCase() || 'pdf';
          zip.addFile(`${baseName}.${ext}`, buffer);
          included++;
          continue;
        } catch {
          // fallthrough al fallback PDF
        }
      }

      // Sin archivo → PDF de reconstrucción
      const fallbackBuf = await buildFallbackPdf(docId);
      if (fallbackBuf) {
        zip.addFile(`${baseName}_reconstruccion.pdf`, fallbackBuf);
        included++;
        fallbacks++;
      } else {
        LOG(`⚠️ Doc #${docId} omitido (sin datos)`);
      }
    }

    LOG(`ZIP listo: ${included} archivos (${fallbacks} reconstrucciones). Subiendo...`);
    await setJobState(jobId, { progress: 88 });

    // 4. Subir ZIP a MinIO en la key pre-reservada
    const zipBuffer = zip.toBuffer();
    await s3.send(new PutObjectCommand({
      Bucket: getBucketName(),
      Key: s3ZipKey,
      Body: zipBuffer,
      ContentType: 'application/zip',
      ContentDisposition: `attachment; filename="export_${jobId}.zip"`,
    }));

    // 5. Presigned GET URL para el ZIP
    const zipUrl = await getPresignedUrl(s3ZipKey, expiresInSec);
    await setJobState(jobId, { progress: 95, zipUrl, included, fallbacks });
    LOG(`Subido. URL lista.`);

    // 6. Mail si corresponde
    if (notifyEmail) {
      const diasTtl = Math.round(expiresInSec / 86400);
      const html = `
        <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:24px;background:#fff">
          <h2 style="color:#7c3aed;margin-bottom:8px">📦 Tu exportación ZIP está lista</h2>
          <p style="color:#334155">Hola${empresaNombre ? ` (${empresaNombre})` : ''},</p>
          <p style="color:#334155">Tu paquete de <strong>${included} documento${included !== 1 ? 's' : ''}</strong> ha sido generado correctamente.</p>
          <p style="margin:20px 0">
            <a href="${zipUrl}"
               style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px">
              ⬇ Descargar ZIP
            </a>
          </p>
          <p style="color:#94a3b8;font-size:12px;border-top:1px solid #e2e8f0;padding-top:12px;margin-top:20px">
            Enlace válido por <strong>${diasTtl} día${diasTtl !== 1 ? 's' : ''}</strong>.
            ${fallbacks > 0 ? `<br>📝 ${fallbacks} documento(s) incluidos como reconstrucción PDF (sin archivo original).` : ''}
          </p>
        </div>
      `;
      await sendEmail({
        to: notifyEmail,
        subject: `📦 Exportación ZIP lista — ${empresaNombre || 'Gestor Documental'}`,
        html,
      });
      LOG(`Mail enviado a ${notifyEmail}`);
    }

    await setJobState(jobId, { status: 'done', progress: 100 });
    LOG(`✅ Completado.`);

  } catch (e: any) {
    console.error(`[ZipExport:${jobId}] ❌ Error:`, e);
    await setJobState(jobId, { status: 'error', error: String(e?.message || e) }).catch(() => {});
  }
}

// ─── API pública del servicio ─────────────────────────────────────────────────

/**
 * Dispara la generación del ZIP en background (fire-and-forget).
 * Retorna el jobId para que el llamador pueda hacer polling de estado.
 */
export function triggerZipGeneration(jobId: string, params: ZipJobParams): void {
  // Inicializar estado en Redis de forma síncrona (best-effort)
  setJobState(jobId, {
    status: 'pending',
    progress: 0,
    createdAt: Date.now(),
  }).catch(() => {});

  // Fire and forget — no await, no bloqueo
  void runZipGeneration(jobId, params);
}
