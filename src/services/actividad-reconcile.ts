import { prisma } from '@/lib/prisma';

/** queued sin bytes: el cliente no terminó de subir (o IDB no reanudó). */
export const QUEUED_NO_FILE_STALE_MS = 2 * 60 * 1000;

/**
 * procesando / waiting_capacity / etc. sin avance:
 * job BullMQ perdido, worker muerto, o lock robado.
 */
export const ORPHAN_PROCESSING_STALE_MS = 25 * 60 * 1000;

const NON_TERMINAL = [
  'queued',
  'waiting',
  'waiting_capacity',
  'iniciando',
  'analyzing',
  'saving',
  'procesando',
  'processing',
  'Reintentando',
  'reintentando',
] as const;

export type ReconcileResult = {
  queuedNoFile: number;
  orphanProcessing: number;
};

/**
 * Cierra filas de actividad que el contrato deja abiertas cuando
 * el proceso real (cliente / Redis / worker) ya murió.
 *
 * Idempotente: seguro llamar desde API o desde el loop del worker.
 */
export async function reconcileStaleActividad(opts?: {
  empresaIds?: Array<number | bigint>;
}): Promise<ReconcileResult> {
  const now = Date.now();
  const queuedCutoff = new Date(now - QUEUED_NO_FILE_STALE_MS);
  const orphanCutoff = new Date(now - ORPHAN_PROCESSING_STALE_MS);

  const empresaFilter =
    opts?.empresaIds && opts.empresaIds.length > 0
      ? { id_de_empresa: { in: opts.empresaIds.map((id) => BigInt(id)) } }
      : {};

  const queuedNoFile = await prisma.actividad.updateMany({
    where: {
      ...empresaFilter,
      parent_upload_id: null,
      status: 'queued',
      file_path: null,
      updated_at: { lt: queuedCutoff },
    },
    data: {
      status: 'Fallido',
      step: 'Subida interrumpida',
      progress: 0,
      mensaje:
        'No llegaron los bytes del archivo (cliente cortado o cola local vacía). Volvé a subir.',
      completed_at: new Date(),
      is_new: true,
    },
  });

  const orphanProcessing = await prisma.actividad.updateMany({
    where: {
      ...empresaFilter,
      status: { in: [...NON_TERMINAL].filter((s) => s !== 'queued') },
      updated_at: { lt: orphanCutoff },
    },
    data: {
      status: 'Fallido',
      step: 'Proceso interrumpido',
      progress: 0,
      mensaje:
        'Sin avance en cola/workers (job perdido o worker caído). Volvé a subir si hace falta.',
      completed_at: new Date(),
      is_new: true,
    },
  });

  // queued con file_path pero sin avance (encolado y abandonado)
  const queuedStuck = await prisma.actividad.updateMany({
    where: {
      ...empresaFilter,
      status: 'queued',
      file_path: { not: null },
      updated_at: { lt: orphanCutoff },
    },
    data: {
      status: 'Fallido',
      step: 'Proceso interrumpido',
      progress: 0,
      mensaje: 'Archivo recibido pero el job no avanzó. Volvé a subir o reintentá desde Actividad.',
      completed_at: new Date(),
      is_new: true,
    },
  });

  return {
    queuedNoFile: queuedNoFile.count,
    orphanProcessing: orphanProcessing.count + queuedStuck.count,
  };
}

/**
 * Antes de un lote nuevo: mata fantasmas queued-sin-archivo de esa empresa
 * para no acumular N× reintentos en la cola.
 */
export async function invalidateQueuedGhostsForEmpresa(empresaId: number | string | bigint) {
  const result = await prisma.actividad.updateMany({
    where: {
      id_de_empresa: BigInt(empresaId),
      status: 'queued',
      file_path: null,
    },
    data: {
      status: 'Fallido',
      step: 'Reemplazado por lote nuevo',
      progress: 0,
      mensaje: 'Se registró un lote nuevo; este registro sin archivo quedó invalidado.',
      completed_at: new Date(),
      is_new: false,
    },
  });
  return result.count;
}
