/**
 * Parámetros de la sesión, compartidos entre el middleware (Edge) y
 * auth-service (Node).
 *
 * Vive en su propio archivo porque auth-service.ts es un módulo 'use server':
 * ahí sólo se pueden exportar funciones async, no constantes.
 */

export const SESSION_COOKIE_NAME = 'session';

/** Duración de la sesión: 30 días. */
export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;

/**
 * Ventana deslizante: el middleware reemite la cookie cuando a la sesión le
 * quedan menos de estos segundos. Con 25 días, a un usuario que entra todos
 * los días se le renueva como mucho una vez cada 5 días (una sola cabecera
 * Set-Cookie extra), y quien no entra en 30 días tiene que loguearse de nuevo.
 */
export const SESSION_RENEW_WHEN_REMAINING_S = 25 * 24 * 60 * 60;

/** Atributos de la cookie. Iguales en el login y en la renovación. */
export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
} as const;
