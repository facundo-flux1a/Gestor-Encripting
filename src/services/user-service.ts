'use server';

import db from '@/lib/db';
import type { User } from '@/lib/types';
import { getSession } from './auth-service';
import type { RowDataPacket } from 'mysql2';

/**
 * Retrieves the full user object for the currently authenticated user.
 * @returns A promise that resolves to the User object or null if not found or not authenticated.
 */
export async function getCurrentUser(): Promise<User | null> {
  const session = await getSession();

  if (!session?.userId) {
    return null;
  }

  // Si la sesión no tiene el campo tutorial, consultamos la BD
  // Esto es un fallback por si la sesión se creó antes de agregar el campo
  if (session.tutorial === undefined) {
    console.log('⚠️ [getCurrentUser] Tutorial no está en sesión, consultando BD');
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT id, nombre, email, tutorial FROM usuarios WHERE id = ?',
      [session.userId]
    );

    if (rows.length > 0) {
      return {
        id: rows[0].id,
        nombre: rows[0].nombre,
        email: rows[0].email,
        tutorial: rows[0].tutorial,
      };
    }
  }

  // The session now contains all the necessary user data
  return {
    id: session.userId,
    nombre: session.nombre,
    email: session.email,
    tutorial: session.tutorial,
  };
}

/**
 * Obtiene la configuración de tipos para la sección "Otros"
 */
export async function getUserConfigOtros(): Promise<string[] | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT config_otros_tipos FROM usuarios WHERE id = ?',
    [user.id]
  );

  if (rows.length > 0 && rows[0].config_otros_tipos) {
    try {
      const config = typeof rows[0].config_otros_tipos === 'string'
        ? JSON.parse(rows[0].config_otros_tipos)
        : rows[0].config_otros_tipos;
      return config.tipos || null;
    } catch (e) {
      console.error('Error parsing config_otros_tipos:', e);
      return null;
    }
  }

  return null;
}

/**
 * Actualiza la configuración de tipos para la sección "Otros"
 */
export async function updateUserConfigOtros(tipos: string[]): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;

  try {
    await db.query(
      'UPDATE usuarios SET config_otros_tipos = ? WHERE id = ?',
      [JSON.stringify({ tipos }), user.id]
    );
    return true;
  } catch (e) {
    console.error('Error updating config_otros_tipos:', e);
    return false;
  }
}