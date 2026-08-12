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
// 🪣 Fix MinIO URLs with fallback domain
export function fixMinioUrl(url: string | null | undefined): string {
  if (!url) return '';
  const brokenDomain = 'http://flux1a-minio-32adec-164-68-127-171.traefik.me:9000';
  const fallbackDomain = 'https://minio.allbase.com.ar';
  
  if (url.includes(brokenDomain)) {
    return url.replace(brokenDomain, fallbackDomain);
  }
  return url;
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

