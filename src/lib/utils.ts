import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 🧹 Función de normalización para unificar productos con distintos lotes/fechas en la descripción
export function normalizeProductDescription(desc: string): string {
  if (!desc) return "";
  let normalized = desc;
  // 1. Eliminar contenido entre paréntesis (lotes, fechas, códigos internos)
  normalized = normalized.replace(/\([^)]*\)/g, "");
  // 2. Eliminar contenido entre corchetes
  normalized = normalized.replace(/\[[^\]]*\]/g, "");
  // 3. Limpiar espacios múltiples y caracteres de unión raros
  normalized = normalized.replace(/[\s\-_/]+/g, " ");
  // 4. Pasar a mayúsculas para comparación insensible
  return normalized.trim().toUpperCase();
}

// 📅 Formateo de fechas consistente con soporte UTC
export function formatDate(date: string | null | undefined): string {
  if (!date) return '-';
  try {
    const d = new Date(date);
    const utcDate = new Date(d.valueOf() + d.getTimezoneOffset() * 60 * 1000);
    return new Intl.DateTimeFormat('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(utcDate);
  } catch { return '-'; }
}

// 💶 Formateo de moneda unificado (EUR por defecto)
export function formatCurrency(amount: number | string | null | undefined, currency: string = 'EUR'): string {
  if (amount === null || amount === undefined) return '0,00 €';
  let numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(numericAmount)) return '0,00 €';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency
  }).format(numericAmount);
}
// 🪣 Normaliza URLs de MinIO redirigiéndolas al proxy autenticado interno
export function fixMinioUrl(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('/api/files/') || trimmed.includes('/api/files/')) return trimmed;

  // Si es una ruta relativa que empieza con archivos/
  if (trimmed.startsWith('archivos/')) {
    const segments = trimmed.split('/');
    const filename = segments[segments.length - 1];
    return `/api/files/${encodeURIComponent(filename)}?path=${encodeURIComponent(trimmed)}`;
  }

  if (
    trimmed.includes('minio') ||
    trimmed.includes(':9000') ||
    trimmed.includes('/gestor-documental')
  ) {
    try {
      const parsed = new URL(trimmed);
      const segments = parsed.pathname.replace(/^\//, '').split('/');
      segments.shift(); // Quitar el nombre del bucket (gestor-documental o gestor-documental-2)
      const fullKey = segments.map(decodeURIComponent).join('/');
      const filename = segments[segments.length - 1];

      if (segments.length > 1 && fullKey) {
        // Archivo en subcarpeta (ej: archivos/zip-children/.../AR-2026-0292.pdf)
        return `/api/files/${encodeURIComponent(filename)}?path=${encodeURIComponent(fullKey)}`;
      } else if (filename) {
        // Archivo en la raíz
        return `/api/files/${encodeURIComponent(decodeURIComponent(filename))}`;
      }
    } catch {
      const clean = trimmed.replace(/^\//, '');
      const segments = clean.split('/');
      if (segments[0] === 'gestor-documental' || segments[0] === 'gestor-documental-2') {
        segments.shift();
      }
      const fullKey = segments.map(decodeURIComponent).join('/');
      const filename = segments[segments.length - 1];
      if (segments.length > 1 && fullKey) {
        return `/api/files/${encodeURIComponent(filename)}?path=${encodeURIComponent(fullKey)}`;
      } else if (filename) {
        return `/api/files/${encodeURIComponent(decodeURIComponent(filename))}`;
      }
    }
  }

  return trimmed;
}

// 🪪 Normaliza un CIF/NIF/NIE español a formato estándar (sin separadores ni prefijo ES)
export function normalizeCIF(raw: string | null | undefined): string | null {
  if (!raw || raw.trim() === '') return null;
  let cif = raw.toUpperCase().replace(/[\s\-./()]/g, '');
  if (cif.startsWith('ES')) {
    cif = cif.substring(2);
  }
  return cif || null;
}

