/**
 * Correos usados para iniciar sesión en este dispositivo.
 *
 * Sólo se guarda la dirección de correo, NUNCA la contraseña ni el token de
 * sesión. Un correo no da acceso a nada por sí solo: es el mismo dato que ya
 * viaja en la URL de las invitaciones (/auth/login?email=...).
 *
 * Está en el lado del cliente a propósito: el desplegable de "correos usados"
 * lo aporta normalmente el gestor de contraseñas del navegador, y dentro de la
 * app de escritorio (Electron) ese componente no existe. Implementándolo acá
 * funciona igual en el navegador y en la app instalada.
 */

const STORAGE_KEY = 'gestor_correos_recientes';
const MAX_CORREOS = 5;

function leerCrudo(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string' && v.includes('@'));
  } catch {
    // localStorage bloqueado (modo privado) o JSON corrupto: arrancamos vacíos
    return [];
  }
}

function escribir(correos: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(correos.slice(0, MAX_CORREOS)));
  } catch {
    // Sin espacio o storage deshabilitado: no es grave, se pierde el recuerdo
  }
}

/** Correos guardados, del más reciente al más viejo. */
export function getRecentEmails(): string[] {
  return leerCrudo().slice(0, MAX_CORREOS);
}

/** Agrega (o sube al tope) un correo. Se llama al enviar el formulario. */
export function rememberEmail(email: string) {
  const limpio = email.trim().toLowerCase();
  if (!limpio || !limpio.includes('@')) return;

  const resto = leerCrudo().filter(c => c.toLowerCase() !== limpio);
  escribir([limpio, ...resto]);
}

/** Borra todos los correos guardados en este dispositivo. */
export function forgetEmails() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // idem: si no se puede borrar, no hay nada que hacer acá
  }
}
