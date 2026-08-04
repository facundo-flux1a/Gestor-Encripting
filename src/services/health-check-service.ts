import db from '@/lib/db';
import { prisma } from '@/lib/prisma';
import type { RowDataPacket } from 'mysql2';

const MATH_TOLERANCE = 0.05;

/**
 * Ejecuta validaciones de salud documental para un documento concreto.
 * Se invoca tras crear/actualizar documentos (fire-and-forget).
 */
export async function runHealthChecksForDocument(documentId: number): Promise<void> {
  const doc = await prisma.documentos.findUnique({
    where: { id: BigInt(documentId) },
    select: {
      id: true,
      id_de_empresa: true,
      fecha_emision: true,
      año_trimestre: true,
      importe_total: true,
      importe_sin_impuestos: true,
      datos_extra: true,
    },
  });

  if (!doc) return;

  const empresaId = doc.id_de_empresa ? Number(doc.id_de_empresa) : null;

  // ── Descuadre matemático ──
  const [mathRows] = await db.query<RowDataPacket[]>(
    `SELECT ABS(d.importe_total - (
        d.importe_sin_impuestos +
        COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(d.datos_extra, '$.base_no_sujeta')) AS DECIMAL(10,2)), 0) +
        COALESCE((SELECT SUM(di.cuota) FROM impuestos_documento di WHERE di.documento_id = d.id), 0)
      )) as mismatch
     FROM documentos d WHERE d.id = ?`,
    [documentId]
  );

  const mismatch = Number(mathRows[0]?.mismatch || 0);
  if (mismatch > MATH_TOLERANCE) {
    await prisma.health_check_status.createMany({
      data: [{
        documento_id: BigInt(documentId),
        empresa_id: doc.id_de_empresa,
        verified: false,
        check_type: 'MISMATCH_MATEMATICO',
        motivo: `Descuadre de ${mismatch.toFixed(2)}€ entre importe total y la suma de base + impuestos.`,
      }] as any[],
      skipDuplicates: true,
    });
  }

  // ── Fecha anómala (año distinto al trimestre o anterior a 2020) ──
  if (doc.fecha_emision) {
    const year = doc.fecha_emision.getFullYear();
    if (doc.año_trimestre && (year !== doc.año_trimestre || year < 2020)) {
      const fechaFmt = doc.fecha_emision.toLocaleDateString('es-ES');
      await prisma.health_check_status.createMany({
        data: [{
          documento_id: BigInt(documentId),
          empresa_id: doc.id_de_empresa,
          verified: false,
          check_type: 'FECHA_ANOMALA',
          motivo: `Fecha de emisión (${fechaFmt}) no coincide con el año del trimestre asignado (${doc.año_trimestre}). Posible error de OCR o factura de otro ejercicio.`,
        }] as any[],
        skipDuplicates: true,
      });
    }
  }

  // ── Entidad duplicada (emisor = receptor) ──
  const [dupRows] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) as cnt FROM entidades_documento ed
     WHERE ed.documento_id = ?
     GROUP BY COALESCE(NULLIF(ed.identificador_fiscal_hash,''), NULLIF(ed.nombre_hash,''),
                       NULLIF(ed.identificador_fiscal,''), ed.nombre)
     HAVING SUM(ed.rol IN ('emisor','proveedor')) > 0
        AND SUM(ed.rol IN ('receptor','cliente')) > 0`,
    [documentId]
  );

  if ((dupRows as any[]).length > 0) {
    await prisma.health_check_status.createMany({
      data: [{
        documento_id: BigInt(documentId),
        empresa_id: doc.id_de_empresa,
        verified: false,
        check_type: 'ENTIDAD_DUPLICADA',
        motivo: 'La misma entidad aparece como emisor/proveedor y receptor/cliente.',
      }] as any[],
      skipDuplicates: true,
    });
  }

  if (empresaId) {
    console.log(`🏥 [HealthCheck] Validaciones ejecutadas para doc #${documentId}`);
  }
}
