import db from '@/lib/db';
import type { PoolConnection } from 'mysql2/promise';

export type AuditAccion = 
  | 'SUBIDA'
  | 'EDICION'
  | 'ELIMINACION'
  | 'CAMBIO_SECCION'
  | 'VISTO_POR_PRIMERA_VEZ'
  | 'ENVIO_SII'
  | 'CIERRE_TRIMESTRE'
  | 'EDICION_ENTIDAD'
  | 'VALIDACION_MANUAL'
  | 'EVALUACION_IA'
  | 'EXPORTACION_DATOS';

export interface AuditParams {
  documentoId?: number | null;
  empresaId?: number | null;
  userId?: number | string | null;
  accion: AuditAccion;
  usuarioEmail: string;
  detalle?: Record<string, any>;
  connection?: PoolConnection;
}

/**
 * Registra una acción en la tabla documentos_auditoria.
 * Si se proporciona una conexión (connection), la usa para mantener la integridad de la transacción.
 * Si no viene empresaId pero sí documentoId, lo resuelve automáticamente.
 */
export async function logAuditAction(params: AuditParams): Promise<void> {
  const { documentoId, accion, usuarioEmail, userId, detalle, connection } = params;
  let { empresaId } = params;

  // ✅ Auto-resolver empresaId si no viene pero sí hay documentoId
  if ((empresaId === undefined || empresaId === null) && documentoId) {
    try {
      const [rows] = await db.query<import('mysql2').RowDataPacket[]>(
        'SELECT id_de_empresa FROM documentos WHERE id = ? LIMIT 1',
        [documentoId]
      );
      if (rows.length > 0) {
        empresaId = rows[0].id_de_empresa ?? null;
      }
    } catch (e) {
      console.warn('⚠️ [AuditService] No se pudo resolver id_de_empresa para documento', documentoId);
    }
  }

  const query = `
    INSERT INTO documentos_auditoria 
    (documento_id, id_de_empresa, id_de_usuario, accion, usuario, detalle) 
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  const values = [
    documentoId || null,
    empresaId || null,
    userId || null,
    accion,
    usuarioEmail,
    detalle ? JSON.stringify(detalle) : null
  ];

  try {
    if (connection) {
      await connection.query(query, values);
    } else {
      await db.query(query, values);
    }
    console.log(`✅ [AuditService] Acción ${accion} registrada — doc:${documentoId || 'N/A'} empresa:${empresaId || 'N/A'} user:${userId || usuarioEmail}`);
  } catch (error) {
    console.error('❌ [AuditService] Error registrando auditoría:', error, params);
    if (connection) {
      throw error;
    }
  }
}
