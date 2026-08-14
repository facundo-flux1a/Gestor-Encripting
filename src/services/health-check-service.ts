import db from '@/lib/db';
import { prisma } from '@/lib/prisma';
import type { RowDataPacket } from 'mysql2';
import { resolverTrimestreContableImportacion } from '@/lib/trimestre-utils';

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
      num_trimestre: true,
      importe_total: true,
      importe_sin_impuestos: true,
      datos_extra: true,
    },
  });

  if (!doc) return;

  const empresaId = doc.id_de_empresa ? Number(doc.id_de_empresa) : null;
  let checkTypeFound: string | null = null;
  let motivoFound: string | null = null;

  // ── 1. Descuadre matemático ──
  // Nota: retencion_irpf y las filas RETENCION en impuestos_documento son mutuamente excluyentes.
  // Cuando el usuario guarda con el campo IRPF separado, impuestos_documento se recrea sin fila RETENCION,
  // y el valor va a datos_extra.retencion_irpf. El SUM ya maneja cuotas negativas del caso OCR.
  const [mathRows] = await db.query<RowDataPacket[]>(
    `SELECT ABS(d.importe_total - (
        d.importe_sin_impuestos +
        COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(d.datos_extra, '$.base_no_sujeta')) AS DECIMAL(10,2)), 0) +
        COALESCE((SELECT SUM(di.cuota) FROM impuestos_documento di WHERE di.documento_id = d.id), 0) -
        COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(d.datos_extra, '$.retencion_irpf')) AS DECIMAL(10,2)), 0) -
        COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(d.datos_extra, '$.descuento_global')) AS DECIMAL(10,2)), 0)
      )) as mismatch
     FROM documentos d WHERE d.id = ?`,
    [documentId]
  );

  const mismatch = Number(mathRows[0]?.mismatch || 0);
  if (mismatch > MATH_TOLERANCE) {
    checkTypeFound = 'MISMATCH_MATEMATICO';
    motivoFound = `Descuadre de ${mismatch.toFixed(2)}€ entre importe total y la suma de base + impuestos.`;
  }

  // ── 2. Fecha anómala (según resolución fiscal de trimestres) ──
  if (!checkTypeFound && doc.fecha_emision) {
    const year = doc.fecha_emision.getFullYear();
    const currentYear = new Date().getFullYear();

    if (year < 2020 || year > currentYear + 1) {
      const fechaFmt = doc.fecha_emision.toLocaleDateString('es-ES');
      checkTypeFound = 'FECHA_ANOMALA';
      motivoFound = `Fecha de emisión (${fechaFmt}) fuera de rango razonable (${year}). Posible error de OCR.`;
    } else if (doc.año_trimestre && doc.num_trimestre) {
      // Resolver el trimestre legalmente asignable según normativa fiscal
      try {
        const resuelto = await resolverTrimestreContableImportacion(doc.fecha_emision, empresaId);
        if (doc.año_trimestre !== resuelto.año || doc.num_trimestre !== resuelto.trimestre) {
          const fechaFmt = doc.fecha_emision.toLocaleDateString('es-ES');
          checkTypeFound = 'FECHA_ANOMALA';
          motivoFound = `Fecha de emisión (${fechaFmt}) asignada a ${doc.año_trimestre}-T${doc.num_trimestre}, pero le corresponde legalmente ${resuelto.año}-T${resuelto.trimestre}.`;
        }
      } catch (e) {
        console.warn('⚠️ [HealthCheck] Error resolviendo trimestre contable:', e);
      }
    }
  }

  // ── 3. Entidad duplicada (emisor = receptor) ──
  if (!checkTypeFound) {
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
      checkTypeFound = 'ENTIDAD_DUPLICADA';
      motivoFound = 'La misma entidad aparece como emisor/proveedor y receptor/cliente.';
    }
  }

  // ── Aplicar cambios en la tabla health_check_status ──
  if (checkTypeFound && motivoFound) {
    // Upsert status: Si existe, actualiza a no verificado con el nuevo motivo; si no existe, lo crea.
    const existing = await prisma.health_check_status.findUnique({
      where: { documento_id: Number(documentId) },
    });

    if (existing) {
      await prisma.health_check_status.update({
        where: { documento_id: Number(documentId) },
        data: {
          verified: false,
          check_type: checkTypeFound,
          motivo: motivoFound,
        },
      });
    } else {
      await prisma.health_check_status.create({
        data: {
          documento_id: Number(documentId),
          empresa_id: empresaId || 0,
          verified: false,
          check_type: checkTypeFound,
          motivo: motivoFound,
        },
      });
    }
  } else {
    // Si ya no hay ningún error y existía un registro no verificado, lo eliminamos/verificamos para sacarlo de cuarentena
    await prisma.health_check_status.deleteMany({
      where: { documento_id: Number(documentId), verified: false },
    });
  }

  if (empresaId) {
    console.log(`🏥 [HealthCheck] Validaciones ejecutadas para doc #${documentId} -> ${checkTypeFound || 'OK (Cuadrado)'}`);
  }
}

