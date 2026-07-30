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
  | 'ingesta_completada'
  | 'trimestre_cerrado'
  | 'incidencia_resuelta'
  | 'usuario_unido';

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
    // 1. Obtener la config de preferencias de cada usuario en la lista
    const [userRows] = await connection.query<any[]>(
      `SELECT id, config_otros_tipos FROM ${dbName}.usuarios WHERE id IN (?)`,
      [userIds]
    );

    // 2. Filtrar los usuarios que tengan deshabilitado este tipo de notificaciones
    const filteredUserIds = userIds.filter((userId) => {
      const row = userRows.find((r) => Number(r.id) === userId);
      if (!row) return true; // fallback por si no existe
      let config: any = {};
      if (row.config_otros_tipos) {
        try {
          config = typeof row.config_otros_tipos === 'string'
            ? JSON.parse(row.config_otros_tipos)
            : row.config_otros_tipos;
        } catch {
          config = {};
        }
      }
      // config.notif_prefs = { [tipo]: boolean }
      // Si está explícitamente en false, se omite.
      if (config.notif_prefs && config.notif_prefs[tipo] === false) {
        return false;
      }
      return true;
    });

    if (filteredUserIds.length === 0) return;

    const encryptedTitulo  = encrypt(titulo);
    const encryptedMensaje = mensaje ? encrypt(mensaje) : null;
    const metadataJson     = metadata ? JSON.stringify(metadata) : null;

    const rows = filteredUserIds.map(() => '(?, ?, ?, ?, ?, ?)');
    const values: any[] = [];
    for (const userId of filteredUserIds) {
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
