import { prisma } from '@/lib/prisma';

/** queued sin bytes: el cliente no terminó de subir (o IDB no reanudó). */
export const QUEUED_NO_FILE_STALE_MS = 2 * 60 * 1000;

/**
 * procesando / waiting_capacity / etc. sin avance:
 * job BullMQ perdido, worker muerto, o lock robado.
 */
export const ORPHAN_PROCESSING_STALE_MS = 25 * 60 * 1000;

/**
 * Un lote grande puede quedar legítimamente en espera de OCR durante bastante
 * tiempo. Estas actividades no son "huérfanas": el job sigue en Redis aunque
 * todavía no haya vuelto a escribir progreso en MySQL.
 *
 * Se mantiene configurable porque debe ser superior al peor tiempo esperado de
 * cola. El valor por defecto evita que un lote de 1.000 documentos sea marcado
 * como fallido sólo por estar esperando capacidad.
 */
export const QUEUE_WAIT_STALE_MS = Number.parseInt(
  process.env.QUEUE_WAIT_STALE_MS || String(24 * 60 * 60 * 1000),
  10
);

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

/** Estados que pueden permanecer sin cambios mientras BullMQ espera turno o backoff. */
const QUEUE_WAITING_STATUSES = [
  'queued',
  'waiting',
  'waiting_capacity',
  'iniciando',
  'Reintentando',
  'reintentando',
] as const;

export type ReconcileResult = {
  queuedNoFile: number;
  orphanProcessing: number;
};

type StaleActividad = {
  upload_id: string | null;
};

type QueueWithJobs = {
  getJob(jobId: string): Promise<{ getState(): Promise<string> } | null | undefined>;
};

/**
 * Devuelve los uploadId que todavía tienen un trabajo no terminal en BullMQ.
 *
 * El estado de Actividad es deliberadamente más estable que el de BullMQ y un
 * OCR, fallback visual o guardado puede tardar más que el umbral de actividad.
 * Antes se marcaba "procesando" como caído sólo por tiempo transcurrido: en
 * lotes grandes eso generaba falsos Fallido aunque el job siguiera activo.
 */
async function liveQueueUploadIds(uploadIds: string[]): Promise<Set<string>> {
  if (uploadIds.length === 0) return new Set();

  // Importación diferida: la conciliación puede ejecutarse desde rutas HTTP
  // que no necesitan abrir Redis si no hay candidatos antiguos.
  const { ingestionQueue, extractionQueue, dbWriterQueue } = await import('@/lib/queue');
  const maxRepairs = Math.max(1, Number.parseInt(process.env.MAX_EXTRACT_REPAIRS || '1', 10) || 1);
  const pendingStates = new Set([
    'active',
    'waiting',
    'waiting-children',
    'delayed',
    'prioritized',
    'paused',
  ]);

  const jobs = uploadIds.flatMap((uploadId) => {
    const candidates: Array<{ uploadId: string; queue: QueueWithJobs; jobId: string }> = [
      { uploadId, queue: ingestionQueue, jobId: `ingest-child-${uploadId}` },
      { uploadId, queue: extractionQueue, jobId: `extract-facturable-${uploadId}` },
      { uploadId, queue: extractionQueue, jobId: `paginate-${uploadId}` },
      { uploadId, queue: extractionQueue, jobId: `extract-non-${uploadId}` },
      { uploadId, queue: extractionQueue, jobId: `extract-multi-img-${uploadId}` },
      { uploadId, queue: dbWriterQueue, jobId: `db-writer-${uploadId}` },
      { uploadId, queue: dbWriterQueue, jobId: `db-writer-${uploadId}-revision` },
      ...Array.from({ length: maxRepairs + 1 }, (_, attempt) => ({
        uploadId,
        queue: dbWriterQueue,
        jobId: `db-writer-${uploadId}-v${attempt}`,
      })),
      ...Array.from({ length: maxRepairs }, (_, index) => ({
        uploadId,
        queue: extractionQueue,
        jobId: `extract-repair-${uploadId}-${index + 1}`,
      })),
    ];
    return candidates;
  });

  const states = await Promise.all(jobs.map(async ({ uploadId, queue, jobId }) => {
    try {
      const job = await queue.getJob(jobId);
      if (!job) return null;
      const state = await job.getState();
      // Ante un estado transitorio/desconocido preferimos conservar la
      // actividad para la siguiente conciliación, nunca inventar un Fallido.
      return pendingStates.has(state) || state === 'unknown' ? uploadId : null;
    } catch {
      // No marcamos una actividad como fallida cuando Redis no pudo ser
      // consultado; el siguiente ciclo podrá verificarla de nuevo.
      return uploadId;
    }
  }));

  return new Set(states.filter((uploadId): uploadId is string => Boolean(uploadId)));
}

/**
 * Cierra filas de actividad que el contrato deja abiertas cuando
 * el proceso real (cliente / Redis / worker) ya murió.
 *
 * Idempotente: seguro llamar desde API o desde el loop del worker.
 */
export async function reconcileStaleActividad(opts?: {
  empresaIds?: Array<number | bigint>;
  /**
   * Sólo un worker que comparte el prefijo BullMQ de la ejecución puede
   * verificar procesos activos. Las rutas HTTP no deben inferir que un job
   * aislado (otro prefijo/entorno) está caído.
   */
  reconcileProcessing?: boolean;
}): Promise<ReconcileResult> {
  const now = Date.now();
  const queuedCutoff = new Date(now - QUEUED_NO_FILE_STALE_MS);
  const orphanCutoff = new Date(now - ORPHAN_PROCESSING_STALE_MS);
  const queueWaitCutoff = new Date(now - QUEUE_WAIT_STALE_MS);

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
        'No llegaron los bytes del archivo (cliente cortado o cola local vacía). Vuelve a subir.',
      completed_at: new Date(),
      is_new: true,
    },
  });

  const activeStatuses = [...NON_TERMINAL].filter(
    (s) => s !== 'queued' && !QUEUE_WAITING_STATUSES.includes(s as typeof QUEUE_WAITING_STATUSES[number])
  );
  let orphanProcessing = { count: 0 };
  if (opts?.reconcileProcessing !== false) {
    const staleProcessing = await prisma.actividad.findMany({
      where: {
        ...empresaFilter,
        status: { in: activeStatuses },
        updated_at: { lt: orphanCutoff },
      },
      select: { upload_id: true },
    }) as StaleActividad[];
    const staleIds = staleProcessing
      .map((activity) => activity.upload_id)
      .filter((uploadId): uploadId is string => Boolean(uploadId));
    const liveIds = await liveQueueUploadIds(staleIds);
    const orphanIds = staleIds.filter((uploadId) => !liveIds.has(uploadId));

    if (orphanIds.length > 0) {
      orphanProcessing = await prisma.actividad.updateMany({
        where: {
          ...empresaFilter,
          upload_id: { in: orphanIds },
          status: { in: activeStatuses },
          updated_at: { lt: orphanCutoff },
        },
        data: {
          status: 'Fallido',
          step: 'Proceso interrumpido',
          progress: 0,
          mensaje:
            'Sin avance en cola/workers (job perdido o worker caído). Vuelve a subir si hace falta.',
          completed_at: new Date(),
          is_new: true,
        },
      });
    }
  }

  // queued con file_path pero sin avance (encolado y abandonado)
  const queuedStuck = await prisma.actividad.updateMany({
    where: {
      ...empresaFilter,
      status: { in: [...QUEUE_WAITING_STATUSES] },
      file_path: { not: null },
      updated_at: { lt: queueWaitCutoff },
    },
    data: {
      status: 'Fallido',
      step: 'Proceso interrumpido',
      progress: 0,
      mensaje: 'Archivo recibido pero el job no avanzó. Vuelve a subir o reinténtalo desde Actividad.',
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
