import crypto from 'crypto';
import db from '@/lib/db';
import type { RowDataPacket, OkPacket } from 'mysql2';
import { prisma } from '@/lib/prisma';


// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiKey {
  id: number;
  nombre: string;
  key_prefix: string;   // primeros 12 chars del token (para identificarlo en UI)
  empresa_id: number;
  empresa_nombre: string;
  usuario_id: number;
  activa: boolean;
  ultimo_uso: string | null;
  fecha_creacion: string;
}

export interface GenerateApiKeyResult {
  success: boolean;
  raw_key?: string;   // Token COMPLETO — solo se devuelve aquí, nunca más
  key?: ApiKey;
  error?: string;
}

export interface ValidateApiKeyResult {
  valid: boolean;
  empresa_id?: number;
  usuario_id?: number;
  key_id?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS INTERNOS
// ─────────────────────────────────────────────────────────────────────────────

const hashKey = (rawKey: string): string =>
  crypto.createHash('sha256').update(rawKey).digest('hex');

// ─────────────────────────────────────────────────────────────────────────────
// GENERAR CLAVE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Genera una nueva API Key para el usuario y empresa indicados.
 * El token completo se devuelve UNA SOLA VEZ en raw_key.
 * En la BD solo se almacena el hash SHA-256 y los primeros 12 chars (prefix).
 */
export async function generateApiKey(params: {
  nombre: string;
  empresa_id: number;
  usuario_id: number;
}): Promise<GenerateApiKeyResult> {
  try {
    const { nombre, empresa_id, usuario_id } = params;

    // 1. Verificar que el usuario pertenece a la empresa
    const [empresaRows] = await db.query<RowDataPacket[]>(
      `SELECT id FROM empresas WHERE id = ? AND JSON_CONTAINS(id_de_usuario, CAST(? AS JSON))`,
      [empresa_id, usuario_id]
    );

    if (empresaRows.length === 0) {
      return { success: false, error: 'No tienes acceso a esta empresa.' };
    }

    // 2. Generar token: "muvail_" + 43 chars URL-safe base64
    const randomPart = crypto.randomBytes(32).toString('base64url');
    const rawKey = `muvail_${randomPart}`;
    const keyHash = hashKey(rawKey);
    const keyPrefix = rawKey.slice(0, 14); // "muvail_Ab3xKm9"

    // 3. Obtener nombre de empresa para la respuesta (Prisma desencripta automáticamente)
    const empresaRecord = await prisma.empresas.findUnique({
      where: { id: BigInt(empresa_id) },
      select: { nombre_de_empresa: true }
    });
    const empresa_nombre = empresaRecord?.nombre_de_empresa || 'Empresa';

    // 4. Insertar en BD
    const [result] = await db.query<OkPacket>(
      `INSERT INTO api_keys (nombre, key_hash, key_prefix, empresa_id, usuario_id, activa)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [nombre, keyHash, keyPrefix, empresa_id, usuario_id]
    );

    const newKeyId = result.insertId;

    const key: ApiKey = {
      id: newKeyId,
      nombre,
      key_prefix: keyPrefix,
      empresa_id,
      empresa_nombre,
      usuario_id,
      activa: true,
      ultimo_uso: null,
      fecha_creacion: new Date().toISOString()
    };

    return { success: true, raw_key: rawKey, key };
  } catch (error) {
    console.error('❌ [api-key-service] generateApiKey error:', error);
    return { success: false, error: 'Error al generar la clave API.' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LISTAR CLAVES DEL USUARIO
// ─────────────────────────────────────────────────────────────────────────────

export async function listApiKeys(usuario_id: number): Promise<ApiKey[]> {
  try {
    // 1. Traer las api_keys del usuario sin JOIN a empresas (evita exponer datos encriptados)
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT
         ak.id,
         ak.nombre,
         ak.key_prefix,
         ak.empresa_id,
         ak.usuario_id,
         ak.activa,
         ak.ultimo_uso,
         ak.fecha_creacion
       FROM api_keys ak
       WHERE ak.usuario_id = ? AND ak.activa = 1
       ORDER BY ak.fecha_creacion DESC`,
      [usuario_id]
    );

    if (rows.length === 0) return [];

    // 2. Hidratar nombres de empresa con Prisma (desencripta automáticamente)
    const empresaIds = [...new Set(rows.map(r => BigInt(r.empresa_id)))];
    const empresas = await prisma.empresas.findMany({
      where: { id: { in: empresaIds } },
      select: { id: true, nombre_de_empresa: true }
    });
    const empresaMap = new Map(empresas.map(e => [Number(e.id), e.nombre_de_empresa || 'Empresa']));

    return rows.map(r => ({
      id: r.id,
      nombre: r.nombre,
      key_prefix: r.key_prefix,
      empresa_id: r.empresa_id,
      empresa_nombre: empresaMap.get(r.empresa_id) || 'Empresa',
      usuario_id: r.usuario_id,
      activa: !!r.activa,
      ultimo_uso: r.ultimo_uso,
      fecha_creacion: r.fecha_creacion
    }));
  } catch (error) {
    console.error('❌ [api-key-service] listApiKeys error:', error);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REVOCAR CLAVE
// ─────────────────────────────────────────────────────────────────────────────

export async function revokeApiKey(keyId: number, usuario_id: number): Promise<boolean> {
  try {
    const [result] = await db.query<OkPacket>(
      `UPDATE api_keys SET activa = 0 WHERE id = ? AND usuario_id = ?`,
      [keyId, usuario_id]
    );
    return result.affectedRows > 0;
  } catch (error) {
    console.error('❌ [api-key-service] revokeApiKey error:', error);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDAR CLAVE (usado en endpoint público)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valida un raw token recibido en el header X-Api-Key.
 * Si es válido, actualiza ultimo_uso y devuelve empresa_id + usuario_id.
 */
export async function validateApiKey(rawKey: string): Promise<ValidateApiKeyResult> {
  try {
    if (!rawKey || !rawKey.startsWith('muvail_')) {
      return { valid: false };
    }

    const keyHash = hashKey(rawKey);

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id, empresa_id, usuario_id FROM api_keys
       WHERE key_hash = ? AND activa = 1`,
      [keyHash]
    );

    if (rows.length === 0) {
      return { valid: false };
    }

    const { id: key_id, empresa_id, usuario_id } = rows[0];

    // Actualizar ultimo_uso en background (no bloqueante)
    db.query(`UPDATE api_keys SET ultimo_uso = NOW() WHERE id = ?`, [key_id])
      .catch(() => {});

    return { valid: true, empresa_id, usuario_id, key_id };
  } catch (error) {
    console.error('❌ [api-key-service] validateApiKey error:', error);
    return { valid: false };
  }
}
