/**
 * src/services/notification-service.ts
 *
 * Servicio central para crear notificaciones in-app.
 * titulo y mensaje se cifran con AES-256-CBC usando el mismo encrypt() del sistema.
 * Todas las operaciones son fire-and-forget: si falla, solo logea un warning
 * y nunca interrumpe el flujo principal (ingesta, workers, etc).
 */

import connection, { dbName } from '@/lib/db';
import { encrypt } from '@/lib/encryption';

export type NotificationType =
  | 'documento_procesado'
  | 'documento_revision'
  | 'variacion_precio'
  | 'factura_duplicada'
  | 'ingesta_completada';

export interface CreateNotificationParams {
  userIds: number[];
  empresaId: number;
  tipo: NotificationType;
  titulo: string;
  mensaje?: string;
  metadata?: Record<string, any>;
}

/**
 * Crea una notificacion para uno o mas usuarios de forma segura.
 * titulo y mensaje se cifran antes de persistir.
 * Nunca lanza excepciones — cualquier error se logea silenciosamente.
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  const { userIds, empresaId, tipo, titulo, mensaje, metadata } = params;

  if (!userIds || userIds.length === 0) return;

  try {
    const encryptedTitulo  = encrypt(titulo);
    const encryptedMensaje = mensaje ? encrypt(mensaje) : null;
    const metadataJson     = metadata ? JSON.stringify(metadata) : null;

    const rows = userIds.map(() => '(?, ?, ?, ?, ?, ?)');
    const values: any[] = [];
    for (const userId of userIds) {
      values.push(userId, empresaId, tipo, encryptedTitulo, encryptedMensaje, metadataJson);
    }

    await connection.query(
      `INSERT INTO ${dbName}.notificaciones (user_id, empresa_id, tipo, titulo, mensaje, metadata)
       VALUES ${rows.join(', ')}`,
      values
    );
  } catch (err: any) {
    console.warn('[notification-service] No se pudo crear la notificacion (ignorado):', err.message);
  }
}

/**
 * Obtiene los user_ids de todos los miembros de una empresa.
 * Util para notificar a todos cuando un documento es procesado.
 */
export async function getUserIdsForEmpresa(empresaId: number): Promise<number[]> {
  try {
    const [rows] = await connection.query<any[]>(
      `SELECT id_de_usuario FROM ${dbName}.empresas WHERE id = ? LIMIT 1`,
      [empresaId]
    );
    if (!rows[0]?.id_de_usuario) return [];
    const raw = rows[0].id_de_usuario;
    const arr = Array.isArray(raw) ? raw : JSON.parse(raw);
    return arr.map(Number).filter(Boolean);
  } catch {
    return [];
  }
}
