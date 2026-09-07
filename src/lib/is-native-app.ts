/**
 * Detecta si el código se está ejecutando dentro de la APK nativa de Capacitor.
 *
 * Estrategia dual:
 * 1. Capacitor inyecta `window.Capacitor.isNative = true` en el WebView.
 * 2. El `appendUserAgent: 'MuvailApp/1.0'` de capacitor.config.ts añade
 *    "MuvailApp" al User-Agent, como fallback.
 *
 * Siempre devuelve `false` en SSR (typeof window === 'undefined').
 */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;

  // Capacitor v6 expone window.Capacitor.isNative
  const cap = (window as unknown as { Capacitor?: { isNative?: boolean } }).Capacitor;
  if (cap?.isNative === true) return true;

  // Fallback: User-Agent personalizado añadido en capacitor.config.ts
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('MuvailApp')) return true;

  return false;
}
