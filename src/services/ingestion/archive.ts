/**
 * Extracción segura e idempotente de contenedores de documentos.
 *
 * Este módulo no conoce MinIO, Redis ni la base de datos: toma los bytes de un
 * ZIP/RAR y devuelve una lista estable de hijos. Separar la lectura del
 * almacenamiento evita que un ZIP dependa de una URL pública para poder ser
 * procesado por el worker.
 */

import crypto from 'crypto';
import JSZip from 'jszip';

export type ArchiveType = 'zip' | 'rar';

export type ArchiveChildFileType =
  | 'pdf'
  | 'jpeg'
  | 'png'
  | 'webp'
  | 'tiff'
  | 'bmp'
  | 'word'
  | 'excel';

export interface ArchiveChild {
  /** Identificador estable dentro del archivo comprimido. */
  entryId: string;
  /** Ruta original dentro del contenedor, preservada para auditoría. */
  originalFileName: string;
  /** Nombre apto para mostrar y almacenar en actividad. */
  fileName: string;
  uploadId: string;
  fileHash?: string;
  fileBuffer?: Buffer;
  fileSize: number;
  mimeType?: string;
  normalizedFileType?: ArchiveChildFileType;
  /** Si existe, este hijo se muestra como fallido y no se encola. */
  rejectionReason?: string;
}

export interface ArchiveExtractionResult {
  entries: ArchiveChild[];
  ignoredEntries: number;
  nestedArchives: number;
}

export interface ArchiveExtractionLimits {
  /** Máximo de documentos reales que se leen de un contenedor. */
  maxEntries: number;
  /** Límite agregado descomprimido. Protege de zip bombs. */
  maxUncompressedBytes: number;
  /** Profundidad de contenedores anidados que se permite abrir. */
  maxDepth: number;
}

const DEFAULT_LIMITS: ArchiveExtractionLimits = {
  maxEntries: parsePositiveEnv('MAX_ARCHIVE_ENTRIES', 1000),
  maxUncompressedBytes: parsePositiveEnv('MAX_ARCHIVE_UNCOMPRESSED_BYTES', 250 * 1024 * 1024),
  maxDepth: parsePositiveEnv('MAX_ARCHIVE_DEPTH', 2),
};

const SYSTEM_ENTRY = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini|\._[^/]*)$/i;

const TYPE_BY_EXTENSION: Record<string, { type: ArchiveChildFileType; mime: string }> = {
  pdf: { type: 'pdf', mime: 'application/pdf' },
  jpg: { type: 'jpeg', mime: 'image/jpeg' },
  jpeg: { type: 'jpeg', mime: 'image/jpeg' },
  png: { type: 'png', mime: 'image/png' },
  webp: { type: 'webp', mime: 'image/webp' },
  tif: { type: 'tiff', mime: 'image/tiff' },
  tiff: { type: 'tiff', mime: 'image/tiff' },
  bmp: { type: 'bmp', mime: 'image/bmp' },
  doc: { type: 'word', mime: 'application/msword' },
  docx: {
    type: 'word',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  xls: { type: 'excel', mime: 'application/vnd.ms-excel' },
  xlsx: {
    type: 'excel',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
};

type DetectedType = {
  type: ArchiveChildFileType;
  mime: string;
};

type ExtractionState = {
  parentUploadId: string;
  limits: ArchiveExtractionLimits;
  entries: ArchiveChild[];
  ignoredEntries: number;
  nestedArchives: number;
  usedUncompressedBytes: number;
  processedEntries: number;
  sourceOrdinal: number;
  limitRejectionAdded: boolean;
};

function parsePositiveEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function extensionOf(fileName: string): string {
  const clean = fileName.split('/').pop() || fileName;
  const dot = clean.lastIndexOf('.');
  return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : '';
}

function hash(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function isZipBuffer(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    ([0x03, 0x05, 0x07].includes(buffer[2])) &&
    ([0x04, 0x06, 0x08].includes(buffer[3]))
  );
}

function isRarBuffer(buffer: Buffer): boolean {
  return (
    (buffer.length >= 7 && buffer.subarray(0, 7).equals(Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]))) ||
    (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00])))
  );
}

function archiveTypeOf(buffer: Buffer, fileName: string): ArchiveType | null {
  const ext = extensionOf(fileName);
  // DOCX/XLSX también son contenedores ZIP; por su extensión se tratan como
  // documento Office y no se expanden como si fueran otro lote de facturas.
  if (ext === 'docx' || ext === 'xlsx') return null;
  if (ext === 'zip') return 'zip';
  if (ext === 'rar') return 'rar';
  if (isZipBuffer(buffer)) return 'zip';
  if (isRarBuffer(buffer)) return 'rar';
  return null;
}

/** Detecta por bytes antes de confiar en la extensión del archivo. */
export function detectArchiveChildType(buffer: Buffer, fileName: string): DetectedType | null {
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') {
    return TYPE_BY_EXTENSION.pdf;
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return TYPE_BY_EXTENSION.jpeg;
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return TYPE_BY_EXTENSION.png;
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return TYPE_BY_EXTENSION.webp;
  }
  if (buffer.length >= 4) {
    const tiffLittle = buffer.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00]));
    const tiffBig = buffer.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]));
    if (tiffLittle || tiffBig) return TYPE_BY_EXTENSION.tiff;
    if (buffer.subarray(0, 2).toString('ascii') === 'BM') return TYPE_BY_EXTENSION.bmp;
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) {
    const ext = extensionOf(fileName);
    return ext === 'xls' ? TYPE_BY_EXTENSION.xls : TYPE_BY_EXTENSION.doc;
  }

  // DOCX/XLSX son ZIPs; aquí la extensión es necesaria para distinguirlos de
  // un ZIP anidado, que se abre antes de llegar a esta función.
  return TYPE_BY_EXTENSION[extensionOf(fileName)] || null;
}

function safeArchivePath(rawName: string): string | null {
  const name = rawName.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!name || name.includes('\0') || name.startsWith('/') || name.split('/').some((part) => part === '..')) {
    return null;
  }
  return name;
}

function displayName(path: string): string {
  // El path relativo desambigua "factura.pdf" repetida en dos carpetas y evita
  // que una normalización de espacios fusione dos hijos distintos.
  return path.normalize('NFKC').slice(0, 500);
}

function makeChildId(parentUploadId: string, ordinal: number, name: string, fileHash: string): string {
  const suffix = hash(`${ordinal}\0${name}\0${fileHash}`).slice(0, 20);
  return `${parentUploadId}_entry_${suffix}`;
}

function pushRejected(
  state: ExtractionState,
  originalFileName: string,
  reason: string,
  fileSize = 0
): void {
  const ordinal = state.sourceOrdinal++;
  const safeName = safeArchivePath(originalFileName) || `entrada_${ordinal}`;
  const idHash = hash(`${ordinal}\0${safeName}\0${reason}`);
  state.entries.push({
    entryId: `${ordinal}:${safeName}`,
    originalFileName,
    fileName: displayName(safeName),
    uploadId: makeChildId(state.parentUploadId, ordinal, safeName, idHash),
    fileSize,
    rejectionReason: reason,
  });
}

function canAddFile(state: ExtractionState, declaredSize: number, fileName: string): boolean {
  state.processedEntries++;
  if (state.processedEntries > state.limits.maxEntries) {
    if (!state.limitRejectionAdded) {
      state.limitRejectionAdded = true;
      pushRejected(
        state,
        '[límite del archivo comprimido]',
        `El contenedor supera el máximo de ${state.limits.maxEntries} documentos permitidos.`
      );
    }
    return false;
  }

  if (declaredSize > 0 && state.usedUncompressedBytes + declaredSize > state.limits.maxUncompressedBytes) {
    pushRejected(
      state,
      fileName,
      `El contenido descomprimido supera el límite seguro de ${formatBytes(state.limits.maxUncompressedBytes)}.`,
      declaredSize
    );
    return false;
  }
  return true;
}

function formatBytes(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

async function readZip(
  buffer: Buffer,
  prefix: string,
  depth: number,
  state: ExtractionState,
  nestedFailureName?: string
): Promise<void> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer, { checkCRC32: true, createFolders: false });
  } catch (error: any) {
    if (nestedFailureName) {
      pushRejected(state, nestedFailureName, `No se pudo abrir el ZIP anidado: ${error?.message || 'archivo corrupto'}`);
      return;
    }
    throw new Error(`ZIP inválido o corrupto: ${error?.message || 'no se pudo leer'}`);
  }

  const entries = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .sort((a, b) => {
      const aName = (a as any).unsafeOriginalName || a.name;
      const bName = (b as any).unsafeOriginalName || b.name;
      // Orden binario, no localeCompare: el locale del host no debe cambiar
      // los uploadId deterministas al reintentar en otro worker.
      const left = String(aName);
      const right = String(bName);
      return left < right ? -1 : left > right ? 1 : 0;
    });

  for (const entry of entries) {
    const unsafeName = String((entry as any).unsafeOriginalName || entry.name);
    const safeName = safeArchivePath(unsafeName);
    if (!safeName) {
      pushRejected(state, unsafeName, 'La ruta del archivo dentro del ZIP no es segura.');
      continue;
    }
    if (SYSTEM_ENTRY.test(safeName)) {
      state.ignoredEntries++;
      continue;
    }

    const declaredSize = Number((entry as any)?._data?.uncompressedSize || 0);
    if (!canAddFile(state, declaredSize, `${prefix}${safeName}`)) continue;

    let fileBuffer: Buffer;
    try {
      fileBuffer = await entry.async('nodebuffer');
    } catch (error: any) {
      pushRejected(state, `${prefix}${safeName}`, `No se pudo descomprimir el archivo: ${error?.message || 'error desconocido'}`);
      continue;
    }
    await handleExtractedFile(fileBuffer, `${prefix}${safeName}`, depth, state);
  }
}

async function readRar(
  buffer: Buffer,
  prefix: string,
  depth: number,
  state: ExtractionState,
  nestedFailureName?: string
): Promise<void> {
  try {
    const unrar = await import('node-unrar-js');
    const extractor = await unrar.createExtractorFromData({
      data: new Uint8Array(buffer) as unknown as ArrayBuffer,
    });
    const extracted = extractor.extract();

    for (const file of extracted.files) {
      if (!file.extraction || file.fileHeader.flags.directory) continue;
      const unsafeName = String(file.fileHeader.name);
      const safeName = safeArchivePath(unsafeName);
      if (!safeName) {
        pushRejected(state, unsafeName, 'La ruta del archivo dentro del RAR no es segura.');
        continue;
      }
      if (SYSTEM_ENTRY.test(safeName)) {
        state.ignoredEntries++;
        continue;
      }

      const fileBuffer = Buffer.from(file.extraction);
      if (!canAddFile(state, fileBuffer.length, `${prefix}${safeName}`)) continue;
      await handleExtractedFile(fileBuffer, `${prefix}${safeName}`, depth, state);
    }
  } catch (error: any) {
    if (nestedFailureName) {
      pushRejected(state, nestedFailureName, `No se pudo abrir el RAR anidado: ${error?.message || 'archivo corrupto'}`);
      return;
    }
    throw new Error(`RAR inválido, protegido o corrupto: ${error?.message || 'no se pudo leer'}`);
  }
}

async function handleExtractedFile(
  fileBuffer: Buffer,
  originalFileName: string,
  depth: number,
  state: ExtractionState
): Promise<void> {
  const nestedType = archiveTypeOf(fileBuffer, originalFileName);
  if (nestedType) {
    if (depth >= state.limits.maxDepth) {
      pushRejected(
        state,
        originalFileName,
        `El archivo comprimido anidado supera la profundidad máxima (${state.limits.maxDepth}).`,
        fileBuffer.length
      );
      return;
    }
    state.nestedArchives++;
    const prefix = `${originalFileName}/`;
    if (nestedType === 'zip') {
      await readZip(fileBuffer, prefix, depth + 1, state, originalFileName);
    } else {
      await readRar(fileBuffer, prefix, depth + 1, state, originalFileName);
    }
    return;
  }

  if (fileBuffer.length === 0) {
    pushRejected(state, originalFileName, 'El archivo dentro del contenedor está vacío.');
    return;
  }
  if (state.usedUncompressedBytes + fileBuffer.length > state.limits.maxUncompressedBytes) {
    pushRejected(
      state,
      originalFileName,
      `El contenido descomprimido supera el límite seguro de ${formatBytes(state.limits.maxUncompressedBytes)}.`,
      fileBuffer.length
    );
    return;
  }

  const detected = detectArchiveChildType(fileBuffer, originalFileName);
  if (!detected) {
    pushRejected(
      state,
      originalFileName,
      'Tipo de archivo no compatible dentro del contenedor. Se aceptan PDF, imágenes y documentos Office.'
    );
    return;
  }

  const ordinal = state.sourceOrdinal++;
  const fileHash = hash(fileBuffer);
  const safeName = safeArchivePath(originalFileName) || `entrada_${ordinal}`;
  state.usedUncompressedBytes += fileBuffer.length;
  state.entries.push({
    entryId: `${ordinal}:${safeName}`,
    originalFileName,
    fileName: displayName(safeName),
    uploadId: makeChildId(state.parentUploadId, ordinal, safeName, fileHash),
    fileHash,
    fileBuffer,
    fileSize: fileBuffer.length,
    mimeType: detected.mime,
    normalizedFileType: detected.type,
  });
}

/**
 * Extrae todos los archivos útiles de un ZIP/RAR. Los documentos inválidos se
 * devuelven como entradas rechazadas para que el usuario vea el motivo en vez
 * de tener un archivo que "no llega".
 */
export async function extractArchiveEntries(
  archiveBuffer: Buffer | ArrayBuffer,
  archiveType: ArchiveType,
  parentUploadId: string,
  limits: Partial<ArchiveExtractionLimits> = {}
): Promise<ArchiveExtractionResult> {
  const state: ExtractionState = {
    parentUploadId,
    limits: { ...DEFAULT_LIMITS, ...limits },
    entries: [],
    ignoredEntries: 0,
    nestedArchives: 0,
    usedUncompressedBytes: 0,
    processedEntries: 0,
    sourceOrdinal: 0,
    limitRejectionAdded: false,
  };
  const buffer = Buffer.isBuffer(archiveBuffer) ? archiveBuffer : Buffer.from(archiveBuffer);

  if (archiveType === 'zip') await readZip(buffer, '', 0, state);
  else await readRar(buffer, '', 0, state);

  return {
    entries: state.entries,
    ignoredEntries: state.ignoredEntries,
    nestedArchives: state.nestedArchives,
  };
}

/** Construye una clave segura y única para el objeto hijo en MinIO/S3. */
export function archiveChildStorageKey(empresaId: string, parentUploadId: string, child: ArchiveChild): string {
  const leaf = (child.fileName.split('/').pop() || 'documento').replace(/[^\p{L}\p{N}._-]/gu, '_');
  return `archivos/${empresaId}/${parentUploadId}/children/${child.uploadId}/${leaf || 'documento'}`;
}

/**
 * Identidad estable de una factura obtenida al dividir un PDF multipágina.
 *
 * `uploadId` identifica el trabajo dentro de este lote; `fileHash` identifica
 * el tramo del archivo fuente y se conserva entre re-subidas del mismo PDF.
 * Así el constraint de documentos puede frenar duplicados reales y un retry
 * del paginador no crea actividades nuevas al azar.
 */
export function deriveSplitDocumentIdentity(input: {
  parentUploadId: string;
  parentFileHash?: string | null;
  empresaId: string;
  pageStart: number;
  pageEnd: number;
  index: number;
}): { uploadId: string; fileHash: string } {
  const source = input.parentFileHash || `upload:${input.parentUploadId}`;
  const segment = `${source}\0${input.empresaId}\0${input.pageStart}\0${input.pageEnd}\0${input.index}`;
  const fileHash = hash(`split-document-v1\0${segment}`);
  const uploadSuffix = hash(`split-upload-v1\0${segment}`).slice(0, 16);
  return {
    uploadId: `${input.parentUploadId}_doc_${uploadSuffix}`,
    fileHash,
  };
}
