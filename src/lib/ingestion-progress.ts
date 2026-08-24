/**
 * src/lib/ingestion-progress.ts
 *
 * Reemplaza los ~60 nodos HTTP de n8n que hacen POST a /api/upload-progress.
 * En el código, esto es una llamada directa a Prisma — sin latencia de red,
 * sin round-trip HTTP, con la misma granularidad que n8n.
 *
 * Contrato idéntico al de la API /api/upload-progress (POST):
 *   { uploadId, status, step, progress, message, documentId? }
 */
import { prisma } from './prisma';

export type IngestionStatus =
  | 'waiting'
  | 'waiting_capacity'
  | 'queued'
  | 'processing'
  | 'analyzing'
  | 'saving'
  | 'completed'
  | 'failed'
  // valores en español usados por los workers:
  | 'procesando'
  | 'iniciando'
  | 'Fallido'
  | 'Completado'
  | 'Reintentando'
  | 'Duplicado';


export interface ProgressUpdate {
  status: IngestionStatus;
  step: string;
  progress: number;        // 0-100
  mensaje: string;
  documentoId?: bigint;
  errorDetalle?: string;
  errorCode?: string;      // MAX_TOKENS_EXCEEDED | DUPLICATE_DOCUMENT | etc.
}

/**
 * Actualiza el estado de una operación de ingesta en la tabla `actividad`.
 * Equivale a uno de los ~60 nodos HTTP Request de n8n que llaman a /api/upload-progress.
 */
export async function updateIngestionProgress(
  uploadId: string,
  update: ProgressUpdate
): Promise<void> {
  try {
    // 1. Obtener si tiene parent ANTES de actualizar
    const record = await prisma.actividad.findFirst({
      where: { upload_id: uploadId },
      select: { parent_upload_id: true }
    });

    // 2. Actualizar el registro
    await prisma.actividad.updateMany({
      where: { upload_id: uploadId },
      data: {
        status: update.status,
        step: update.step,
        progress: update.progress,
        mensaje: update.mensaje,
        documento_id: update.documentoId ?? undefined,
        error_detalle: update.errorDetalle ?? undefined,
        updated_at: new Date(),
        ...(update.status === 'completed' || update.status === 'Completado' ? { completed_at: new Date() } : {}),
      },
    });

    // 3. Si tiene padre, recalcular el progreso del padre
    if (record?.parent_upload_id) {
      await updateParentProgress(record.parent_upload_id);
    }
  } catch (err) {
    // Log pero no relanzar — un fallo en el tracking no debe detener la ingesta
    console.error(`[IngestionProgress] Error actualizando ${uploadId}:`, err);
  }
}

/**
 * Recalcula y actualiza el progreso del registro padre en base al estado de sus hijos.
 * Se llama: (a) automáticamente desde updateIngestionProgress cuando un hijo cambia,
 * y (b) explícitamente desde el db-writer después de completar un hijo.
 */
export async function updateParentProgress(parentUploadId: string): Promise<void> {
  try {
    const children = await prisma.actividad.findMany({
      where: { parent_upload_id: parentUploadId },
      select: { status: true, progress: true }
    });

    if (children.length === 0) return;

    const total      = children.length;
    const completed  = children.filter((c: { status: string | null }) => c.status === 'completed' || c.status === 'Completado').length;
    const failed     = children.filter((c: { status: string | null }) => c.status === 'failed'    || c.status === 'Fallido').length;
    const paused     = children.filter((c: { status: string | null }) =>
      c.status?.toLowerCase().includes('cuota') || c.status?.toLowerCase().includes('esperando')
    ).length;
    const inProgress = total - completed - failed;

    // Progreso del padre = media ponderada del progreso de todos los hijos
    const sumProgress    = children.reduce((sum: number, c: { progress: number | null }) => sum + (c.progress || 0), 0);
    const parentProgress = Math.round(sumProgress / total);


    const allCompleted = completed === total;
    const allDone      = (completed + failed) === total;

    let parentStatus: string;
    let parentStep: string;
    let parentMessage: string;

    if (allCompleted) {
      parentStatus  = 'Completado';
      parentStep    = 'Lote completado';
      parentMessage = `✅ ${total} documentos procesados exitosamente`;
    } else if (allDone && failed > 0) {
      parentStatus  = 'procesando'; // algunos fallaron pero el lote terminó
      parentStep    = 'Completado con errores';
      parentMessage = `⚠️ ${completed} completados / ${failed} fallidos de ${total} documentos`;
    } else {
      parentStatus  = 'procesando';
      parentStep    = `Procesando lote (${completed}/${total})`;
      // Mensaje detallado para la UI
      const parts: string[] = [`${completed} completados`];
      if (inProgress > 0) parts.push(`${inProgress} en proceso`);
      if (paused    > 0) parts.push(`${paused} pausados (cuota)`);
      if (failed    > 0) parts.push(`${failed} fallidos`);
      parentMessage = `📦 ${parts.join(' · ')} de ${total} documentos`;
    }

    await prisma.actividad.updateMany({
      where: { upload_id: parentUploadId },
      data: {
        status: parentStatus,
        step: parentStep,
        progress: parentProgress,
        mensaje: parentMessage,
        updated_at: new Date(),
        ...(allCompleted ? { completed_at: new Date() } : {}),
      },
    });

    // Cascading: Si este padre tiene a su vez un padre (ej. es un PDF dentro de un ZIP),
    // propagar el progreso hacia arriba.
    const parentRecord = await prisma.actividad.findFirst({
      where: { upload_id: parentUploadId },
      select: { parent_upload_id: true }
    });
    
    if (parentRecord?.parent_upload_id) {
      await updateParentProgress(parentRecord.parent_upload_id);
    }

  } catch (err) {
    console.error(`[IngestionProgress] Error actualizando padre ${parentUploadId}:`, err);
  }
}

/**
 * Crea el registro inicial en actividad para un job de ingesta.
 * Se llama al momento de recibir el archivo en el endpoint /api/v1/ingest.
 */
export async function createIngestionRecord(params: {
  uploadId: string;
  parentUploadId?: string;
  empresaId: bigint;
  documentoNombre: string;
  documentoTipo?: string;
  fileHash?: string;
  filePath?: string;
  origen: 'dashboard' | 'correo';
  /** Estado inicial para trabajo ya encolado, antes de que lo tome un worker. */
  initialStatus?: IngestionStatus;
}): Promise<void> {
  // Los workers pueden reintentarse después de haber extraído el archivo pero
  // antes de encolar todos sus hijos. El uploadId de cada hijo es determinista,
  // por lo que este upsert hace la expansión de ZIP/RAR idempotente: nunca
  // abortamos el lote por un P2002 ni generamos actividades huérfanas nuevas.
  await prisma.actividad.upsert({
    where: { upload_id: params.uploadId },
    update: {
      ...(params.parentUploadId !== undefined ? { parent_upload_id: params.parentUploadId } : {}),
      id_de_empresa: params.empresaId,
      documento_nombre: params.documentoNombre,
      ...(params.documentoTipo !== undefined ? { documento_tipo: params.documentoTipo } : {}),
      ...(params.fileHash !== undefined ? { file_hash: params.fileHash } : {}),
      ...(params.filePath !== undefined ? { file_path: params.filePath } : {}),
      dashboard_correo: params.origen,
      updated_at: new Date(),
    },
    create: {
      upload_id: params.uploadId,
      parent_upload_id: params.parentUploadId ?? null,
      id_de_empresa: params.empresaId,
      documento_nombre: params.documentoNombre,
      documento_tipo: params.documentoTipo ?? null,
      status: params.initialStatus ?? 'processing',
      step: 'Recibiendo archivo',
      progress: 5,
      mensaje: 'Archivo recibido, iniciando procesamiento...',
      file_hash: params.fileHash ?? null,
      file_path: params.filePath ?? null,
      dashboard_correo: params.origen,
      is_new: true,
    },
  });

  // Un hijo determinista puede volver a aparecer al reintentar la expansión
  // de un lote. Si todavía no produjo un documento, debe volver a la cola en
  // vez de conservar un estado viejo de "procesando" que el reconciliador
  // podría interpretar como un proceso interrumpido. Nunca se toca un hijo
  // que ya tiene documento asociado.
  if (params.initialStatus) {
    await prisma.actividad.updateMany({
      where: {
        upload_id: params.uploadId,
        documento_id: null,
      },
      data: {
        status: params.initialStatus,
        step: 'Recibiendo archivo',
        progress: 5,
        mensaje: 'Archivo en cola para procesamiento...',
        error_detalle: null,
        completed_at: null,
      },
    });
  }
}

// ─── Estados predefinidos (los mismos de n8n, mapeados 1:1) ──────────────────

export const PROGRESS = {
  RECEIVED:      { status: 'processing' as const, step: 'Subida al agente',          progress: 20, mensaje: 'Archivo guardado en almacenamiento' },
  ANALYZING:     { status: 'analyzing' as const,  step: 'Extrayendo datos',           progress: 50, mensaje: 'Analizando contenido del documento con IA' },
  SAVING:        { status: 'saving' as const,     step: 'Guardando en base de datos', progress: 80, mensaje: 'Almacenando información extraída' },
  CLASSIFYING:   { status: 'analyzing' as const,  step: 'Clasificando documento',     progress: 30, mensaje: 'Determinando tipo de documento...' },
  PAGINATING:    { status: 'analyzing' as const,  step: 'Detectando páginas',         progress: 35, mensaje: 'Identificando documentos en el archivo...' },
  SPLITTING:     { status: 'analyzing' as const,  step: 'Dividiendo documento',       progress: 40, mensaje: 'Preparando páginas para análisis...' },
} as const;

export function completedProgress(documentoId: bigint): ProgressUpdate {
  return {
    status: 'completed',
    step: 'Completado',
    progress: 100,
    mensaje: '✅ Documento procesado exitosamente',
    documentoId,
  };
}

export function failedProgress(errorCode: string, mensaje: string, detalle?: string): ProgressUpdate {
  return {
    status: 'failed',
    step: 'Error',
    progress: 0,
    mensaje,
    errorCode,
    errorDetalle: detalle,
  };
}

// ─── Errores nombrados (los que se pasan a failedProgress) ────────────────────
export const INGESTION_ERRORS = {
  MAX_TOKENS_EXCEEDED: 'La imagen contiene demasiados documentos para un único análisis. Por favor, dividila en partes más pequeñas.',
  LLM_PARSE_ERROR:  'No se pudo interpretar la respuesta del análisis. Se registró una incidencia automática.',
  /** @deprecated alias */
  GEMINI_PARSE_ERROR:  'No se pudo interpretar la respuesta del análisis. Se registró una incidencia automática.',
  DUPLICATE_DOCUMENT:  'Documento duplicado: ya existe un archivo idéntico para esta empresa.',
  PDFTOOLS_ERROR:      'Error al dividir el PDF. El sistema reintentará automáticamente.',
  RAR_EXTRACTOR_ERROR: 'No se pudo extraer el archivo RAR. Verificá que no esté corrupto o protegido.',
  UNREADABLE_FILE:     'El archivo no pudo ser leído. Verificá que sea un documento válido.',
  LLM_RATE_LIMIT:   'Límite de análisis alcanzado. El sistema reintentará en unos momentos.',
  /** @deprecated alias */
  GEMINI_RATE_LIMIT:   'Límite de análisis alcanzado. El sistema reintentará en unos momentos.',
} as const;

export type IngestionErrorCode = keyof typeof INGESTION_ERRORS;
