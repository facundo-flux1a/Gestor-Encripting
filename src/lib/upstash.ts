
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

// ========================================
// Visibilidad de columnas
// ========================================

export interface ColumnVisibilityData {
  columnVisibility: Record<string, boolean>;
  viewId: string;
  userId: number;
  updatedAt: string;
}

export function getColumnVisibilityKey(userId: number, viewId: string): string {
  return `column-visibility:${userId}:${viewId}`;
}

export async function saveColumnVisibility(
  userId: number,
  viewId: string,
  columnVisibility: Record<string, boolean>
): Promise<boolean> {
  try {
    const key = getColumnVisibilityKey(userId, viewId);
    const data: ColumnVisibilityData = {
      columnVisibility,
      viewId,
      userId,
      updatedAt: new Date().toISOString(),
    };
    await upstash.set(key, data);
    return true;
  } catch (error) {
    console.error('❌ [Upstash] Error guardando visibilidad:', error);
    return false;
  }
}

export async function getColumnVisibility(
  userId: number,
  viewId: string
): Promise<Record<string, boolean> | null> {
  try {
    const key = getColumnVisibilityKey(userId, viewId);
    const data = await upstash.get<ColumnVisibilityData>(key);
    return data?.columnVisibility ?? null;
  } catch (error) {
    console.error('❌ [Upstash] Error obteniendo visibilidad:', error);
    return null;
  }
}

export async function deleteColumnVisibility(
  userId: number,
  viewId: string
): Promise<boolean> {
  try {
    const key = getColumnVisibilityKey(userId, viewId);
    await upstash.del(key);
    return true;
  } catch (error) {
    console.error('❌ [Upstash] Error eliminando visibilidad:', error);
    return false;
  }
}

// ========================================
// Tipos para selección de empresas
// ========================================

export interface SelectedCompaniesData {
  ids: number[];
  userId: number;
  updatedAt: string;
}

// ========================================
// Funciones helpers para selección de empresas
// ========================================

/**
 * Genera la clave de Redis para la selección de empresas
 * Formato: selected-companies:{userId}
 */
export function getSelectedCompaniesKey(userId: number): string {
  return `selected-companies:${userId}`;
}

/**
 * Guarda los IDs de empresas seleccionadas en Redis (TTL 30 días)
 */
export async function saveSelectedCompanies(
  userId: number,
  ids: number[]
): Promise<boolean> {
  try {
    const key = getSelectedCompaniesKey(userId);
    const data: SelectedCompaniesData = {
      ids,
      userId,
      updatedAt: new Date().toISOString(),
    };
    // 30 días de TTL
    await upstash.set(key, data, { ex: 60 * 60 * 24 * 30 });
    console.log(`✅ [Upstash] Empresas seleccionadas guardadas - Key: ${key}, IDs: ${ids}`);
    return true;
  } catch (error) {
    console.error('❌ [Upstash] Error guardando selección de empresas:', error);
    return false;
  }
}

/**
 * Obtiene los IDs de empresas seleccionadas desde Redis
 */
export async function getSelectedCompanies(
  userId: number
): Promise<number[] | null> {
  try {
    const key = getSelectedCompaniesKey(userId);
    const data = await upstash.get<SelectedCompaniesData>(key);

    if (!data) {
      console.log(`ℹ️ [Upstash] No hay selección guardada - Key: ${key}`);
      return null;
    }

    console.log(`✅ [Upstash] Selección recuperada - Key: ${key}, IDs: ${data.ids}`);
    return data.ids;
  } catch (error) {
    console.error('❌ [Upstash] Error obteniendo selección de empresas:', error);
    return null;
  }
}
