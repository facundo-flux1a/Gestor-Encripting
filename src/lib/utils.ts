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
  normalized = normalized.replace(/[\s\-_]+/g, " ");
  // 4. Pasar a mayúsculas para comparación insensible
  return normalized.trim().toUpperCase();
}
