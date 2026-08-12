/**
 * Cola de subida en el navegador:
 * - Guarda blobs en IndexedDB → sobrevive refresh / navegación
 * - Sube con concurrencia vía POST /api/uploads/file
 * - Reanuda sola al cargar la app
 */

const DB_NAME = 'gestor-upload-queue';
const DB_VERSION = 1;
const STORE = 'pending';
const CONCURRENCY = 5;
const MAX_ATTEMPTS = 4;

export type PendingUploadRecord = {
  uploadId: string;
  batchId: string;
  empresaId: string;
  fileName: string;
  mimeType: string;
  blob: Blob;
  createdAt: number;
  attempts: number;
};

export type BatchSummary = {
  batchId: string;
  successCount: number;
  duplicateCount: number;
  errorCount: number;
  errorDetails: string[];
};

let dbPromise: Promise<IDBDatabase> | null = null;
let pumpPromise: Promise<void> | null = null;
const inFlight = new Set<string>();
const batchSummaries = new Map<string, BatchSummary>();

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB no disponible'));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'uploadId' });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onclose = () => {
          console.warn('⚠️ [ClientUploadQueue] Conexión IndexedDB cerrada, reseteando handle');
          dbPromise = null;
        };
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        dbPromise = null;
        reject(req.error || new Error('No se pudo abrir IndexedDB'));
      };
    });
  }
  return dbPromise;
}

async function getTransaction(storeName: string, mode: IDBTransactionMode): Promise<IDBTransaction> {
  try {
    const db = await openDb();
    return db.transaction(storeName, mode);
  } catch (err) {
    console.warn('⚠️ [ClientUploadQueue] Falló db.transaction (reabriendo IndexedDB)...', err);
    dbPromise = null;
    const db = await openDb();
    return db.transaction(storeName, mode);
  }
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putPending(record: PendingUploadRecord) {
  const tx = await getTransaction(STORE, 'readwrite');
  await idbReq(tx.objectStore(STORE).put(record));
  try {
    (window as any).__gestorUploadPendingCount = await getPendingUploadCount();
  } catch {
    /* ignore */
  }
}

async function deletePending(uploadId: string) {
  const tx = await getTransaction(STORE, 'readwrite');
  await idbReq(tx.objectStore(STORE).delete(uploadId));
  try {
    (window as any).__gestorUploadPendingCount = await getPendingUploadCount();
  } catch {
    /* ignore */
  }
}

async function getAllPending(): Promise<PendingUploadRecord[]> {
  const tx = await getTransaction(STORE, 'readonly');
  return await idbReq(tx.objectStore(STORE).getAll());
}

async function updateAttempts(uploadId: string, attempts: number) {
  const tx = await getTransaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const row = await idbReq<PendingUploadRecord | undefined>(store.get(uploadId));
  if (!row) return;
  row.attempts = attempts;
  await idbReq(store.put(row));
}

function normalizeName(n: string) {
  return n.replace(/ /g, '-');
}

function notifyProgress(uploadId: string, fileName: string, batchId: string | null) {
  try {
    const mgr = (window as any).__uploadProgressManager;
    if (mgr?.addUpload) mgr.addUpload(uploadId, fileName, batchId);
  } catch {
    /* ignore */
  }
}

function bumpSummary(batchId: string, kind: 'ok' | 'dup' | 'error', detail?: string) {
  const s = batchSummaries.get(batchId);
  if (!s) return;
  if (kind === 'ok') s.successCount++;
  else if (kind === 'dup') s.duplicateCount++;
  else {
    s.errorCount++;
    if (detail) s.errorDetails.push(detail);
  }
}

async function uploadOne(rec: PendingUploadRecord): Promise<'ok' | 'dup'> {
  const formData = new FormData();
  const file = new File([rec.blob], rec.fileName, {
    type: rec.mimeType || 'application/octet-stream',
  });
  formData.append('file', file);
  formData.append('empresaId', rec.empresaId);
  formData.append('uploadId', rec.uploadId);
  if (rec.batchId) formData.append('batchId', rec.batchId);

  const res = await fetch('/api/uploads/file', { method: 'POST', body: formData });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (json?.isDuplicate || /duplicado/i.test(json?.message || '')) return 'dup';
  if (res.ok && json?.success !== false) return 'ok';
  throw new Error(json?.message || `HTTP ${res.status}`);
}

async function processOne(rec: PendingUploadRecord): Promise<boolean> {
  if (inFlight.has(rec.uploadId)) return false;
  inFlight.add(rec.uploadId);
  try {
    notifyProgress(rec.uploadId, rec.fileName, rec.batchId);
    const result = await uploadOne(rec);
    await deletePending(rec.uploadId);
    bumpSummary(rec.batchId, result === 'dup' ? 'dup' : 'ok');
    console.log(`✅ [ClientUploadQueue] ${rec.fileName} → ${result}`);
    return true;
  } catch (err: any) {
    const attempts = (rec.attempts || 0) + 1;
    console.error(`❌ [ClientUploadQueue] ${rec.fileName} intento ${attempts}:`, err?.message || err);
    if (attempts >= MAX_ATTEMPTS) {
      await deletePending(rec.uploadId);
      bumpSummary(rec.batchId, 'error', `${rec.fileName}: ${err?.message || 'falló'}`);
    } else {
      await updateAttempts(rec.uploadId, attempts);
    }
    return true;
  } finally {
    inFlight.delete(rec.uploadId);
  }
}

async function doPump() {
  const worker = async () => {
    while (true) {
      const pending = await getAllPending();
      const next = pending.find((p) => !inFlight.has(p.uploadId));
      if (!next) return;
      const ran = await processOne(next);
      if (!ran) {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
}

/** Bombea pendientes hasta vaciar IndexedDB (concurrencia limitada). */
export function pumpClientUploadQueue(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (!pumpPromise) {
    pumpPromise = doPump().finally(() => {
      pumpPromise = null;
    });
  }
  return pumpPromise;
}

export async function getPendingUploadCount(): Promise<number> {
  try {
    return (await getAllPending()).length;
  } catch {
    return 0;
  }
}

/**
 * Registra lote en servidor, guarda blobs en IDB y arranca la bomba.
 * Sobrevive refresh: los bytes quedan en IndexedDB.
 */
export async function enqueueClientUploadBatch(opts: {
  empresaId: string;
  files: File[];
}): Promise<BatchSummary> {
  const { empresaId, files } = opts;

  const batchRes = await fetch('/api/uploads/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      empresaId,
      files: files.map((f) => ({
        fileName: f.name,
        size: f.size,
        mimeType: f.type,
      })),
    }),
  });
  const batchJson = await batchRes.json();
  if (!batchRes.ok || !batchJson.success || !Array.isArray(batchJson.items)) {
    throw new Error(batchJson.error || 'No se pudo registrar el lote de subida');
  }

  const batchId: string = batchJson.batchId;
  const batchItems: Array<{ uploadId: string; fileName: string }> = batchJson.items;

  const filesByNorm = new Map<string, File[]>();
  for (const f of files) {
    const key = normalizeName(f.name);
    const list = filesByNorm.get(key) || [];
    list.push(f);
    filesByNorm.set(key, list);
  }

  const summary: BatchSummary = {
    batchId,
    successCount: 0,
    duplicateCount: 0,
    errorCount: 0,
    errorDetails: [],
  };
  batchSummaries.set(batchId, summary);

  const now = Date.now();
  for (const item of batchItems) {
    const list = filesByNorm.get(item.fileName) || filesByNorm.get(normalizeName(item.fileName));
    const file = list?.shift();
    if (!file) {
      summary.errorCount++;
      summary.errorDetails.push(`${item.fileName}: no se encontró el archivo local`);
      continue;
    }
    await putPending({
      uploadId: item.uploadId,
      batchId,
      empresaId,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      blob: file,
      createdAt: now,
      attempts: 0,
    });
    notifyProgress(item.uploadId, file.name, batchId);
  }

  console.log('📦 [ClientUploadQueue] Lote en IDB', {
    batchId,
    pending: await getPendingUploadCount(),
  });

  try {
    await pumpClientUploadQueue();
  } finally {
    batchSummaries.delete(batchId);
  }

  return summary;
}

/** Llamar al montar la app: reanuda lo que quedó en IDB tras un refresh. */
export async function resumeClientUploadQueue(): Promise<number> {
  if (typeof window === 'undefined') return 0;
  try {
    const pending = await getAllPending();
    if (pending.length === 0) return 0;
    console.log(`🔄 [ClientUploadQueue] Reanudando ${pending.length} pendiente(s) desde IndexedDB`);
    for (const p of pending) {
      notifyProgress(p.uploadId, p.fileName, p.batchId);
    }
    void pumpClientUploadQueue();
    return pending.length;
  } catch (e) {
    console.warn('⚠️ [ClientUploadQueue] No se pudo reanudar:', e);
    return 0;
  }
}
