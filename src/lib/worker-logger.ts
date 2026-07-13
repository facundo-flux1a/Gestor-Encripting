/**
 * src/lib/worker-logger.ts
 *
 * Logger compartido para workers BullMQ.
 * Escribe en console.log Y en Redis (lista circular de 300 entradas).
 * La API /api/debug/worker-logs lee de Redis para mostrar en el frontend.
 *
 * ⚠️ DEBUG ONLY — remover de producción cuando ya no se necesite.
 */

import { redis } from '@/lib/redis';

const LOG_KEY = 'worker:debug:logs';
const MAX_LOGS = 300; // mantener los últimos 300 mensajes

export type LogLevel = 'info' | 'success' | 'warn' | 'error' | 'rate';

interface WorkerLogEntry {
  ts: number;       // timestamp unix ms
  tag: string;      // ej: "GeminiWorker", "DbWriterWorker"
  level: LogLevel;
  msg: string;
}

/**
 * Detecta el nivel a partir del contenido del mensaje.
 */
function detectLevel(msg: string): LogLevel {
  if (msg.includes('❌') || msg.includes('Error') || msg.includes('error') || msg.includes('fallid')) return 'error';
  if (msg.includes('⚠️') || msg.includes('Rate limit') || msg.includes('429') || msg.includes('Reintento')) return 'rate';
  if (msg.includes('✅') || msg.includes('completado') || msg.includes('Completado') || msg.includes('Conectado')) return 'success';
  if (msg.includes('⏳') || msg.includes('Esperando') || msg.includes('Límite')) return 'warn';
  return 'info';
}

/**
 * Escribe un log en console.log + Redis de manera no bloqueante.
 */
export function wLog(tag: string, msg: string, level?: LogLevel): void {
  // Siempre escribir a consola
  const prefix = `[${tag}]`;
  if (level === 'error') {
    console.error(`${prefix} ${msg}`);
  } else if (level === 'warn' || level === 'rate') {
    console.warn(`${prefix} ${msg}`);
  } else {
    console.log(`${prefix} ${msg}`);
  }

  // Escribir a Redis de forma fire-and-forget (no await para no bloquear)
  const entry: WorkerLogEntry = {
    ts: Date.now(),
    tag,
    level: level ?? detectLevel(msg),
    msg,
  };

  redis.lpush(LOG_KEY, JSON.stringify(entry))
    .then(() => redis.ltrim(LOG_KEY, 0, MAX_LOGS - 1))
    .catch(() => { /* ignorar errores de logging */ });
}

/**
 * Obtener los últimos N logs desde Redis.
 */
export async function getWorkerLogs(limit = 100): Promise<WorkerLogEntry[]> {
  try {
    const raw = await redis.lrange(LOG_KEY, 0, limit - 1);
    return raw.map(r => {
      try { return JSON.parse(r) as WorkerLogEntry; }
      catch { return null; }
    }).filter(Boolean) as WorkerLogEntry[];
  } catch {
    return [];
  }
}

/**
 * Limpiar todos los logs de Redis.
 */
export async function clearWorkerLogs(): Promise<void> {
  await redis.del(LOG_KEY);
}
