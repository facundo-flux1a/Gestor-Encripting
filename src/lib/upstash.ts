
// ========================================
// ARCHIVO 1: lib/upstash.ts
// ========================================

import { Redis } from '@upstash/redis'; 

// ========================================
// Cliente Redis de Upstash (GRATIS 🐀💰)
// ========================================

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!upstashUrl || !upstashToken) {
  throw new Error(
    '❌ [Upstash] Faltan las variables de entorno:\n' +
    '   - UPSTASH_REDIS_REST_URL\n' +
    '   - UPSTASH_REDIS_REST_TOKEN\n' +
    'Verifica tu archivo .env.local'
  );
}

// Cliente global de Upstash
export const upstash = new Redis({
  url: upstashUrl,
  token: upstashToken,
});

console.log('✅ [Upstash] Cliente inicializado correctamente');

// ========================================
// Tipos para orden de columnas
// ========================================

export interface ColumnOrderData {
  columnOrder: string[];
  viewId: string;
  userId: number;
  updatedAt: string;
}

// ========================================
// Funciones helpers para orden de columnas
// ========================================

/**
 * Genera la clave de Redis para el orden de columnas
 * Formato: column-order:{userId}:{viewId}
 */
export function getColumnOrderKey(userId: number, viewId: string): string {
  return `column-order:${userId}:${viewId}`;
}

/**
 * Guarda el orden de columnas en Redis
 */
export async function saveColumnOrder(
  userId: number,
  viewId: string,
  columnOrder: string[]
): Promise<boolean> {
  try {
    const key = getColumnOrderKey(userId, viewId);
    const data: ColumnOrderData = {
      columnOrder,
      viewId,
      userId,
      updatedAt: new Date().toISOString(),
    };

    // 🔧 FIX: Upstash maneja la serialización automáticamente
    await upstash.set(key, data);
    console.log(`✅ [Upstash] Orden guardado - Key: ${key}`);
    return true;
  } catch (error) {
    console.error('❌ [Upstash] Error guardando orden:', error);
    return false;
  }
}

/**
 * Obtiene el orden de columnas desde Redis
 */
export async function getColumnOrder(
  userId: number,
  viewId: string
): Promise<string[] | null> {
  try {
    const key = getColumnOrderKey(userId, viewId);
    
    // 🔧 FIX: Upstash ya devuelve el objeto parseado, no un string
    const data = await upstash.get<ColumnOrderData>(key);

    if (!data) {
      console.log(`ℹ️ [Upstash] No hay orden guardado - Key: ${key}`);
      return null;
    }

    // 🔧 FIX: Ya no necesitamos JSON.parse(), data ya es un objeto
    console.log(`✅ [Upstash] Orden recuperado - Key: ${key}, Columnas: ${data.columnOrder.length}`);
    return data.columnOrder;
  } catch (error) {
    console.error('❌ [Upstash] Error obteniendo orden:', error);
    return null;
  }
}

/**
 * Elimina el orden de columnas (reset)
 */
export async function deleteColumnOrder(
  userId: number,
  viewId: string
): Promise<boolean> {
  try {
    const key = getColumnOrderKey(userId, viewId);
    await upstash.del(key);
    console.log(`✅ [Upstash] Orden eliminado - Key: ${key}`);
    return true;
  } catch (error) {
    console.error('❌ [Upstash] Error eliminando orden:', error);
    return false;
  }
}
