'use server';

import db from '@/lib/db';
import type { User } from '@/lib/types';
import { getSession, createSession } from './auth-service';
import { GOOGLE_PASSWORD_MARKER } from '@/lib/constants';
import type { RowDataPacket } from 'mysql2';
import bcrypt from 'bcryptjs';

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

  return {
    id: session.userId,
    nombre: session.nombre,
    email: session.email,
    tutorial: session.tutorial,
  };
}

/**
 * Obtiene los detalles básicos de una lista de usuarios por ID
 */
export async function getUsersByIds(ids: number[]): Promise<Partial<User>[]> {
  if (!ids || ids.length === 0) return [];

  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT id, nombre, email FROM usuarios WHERE id IN (?)',
    [ids]
  );

  return rows.map(row => ({
    id: row.id,
    nombre: row.nombre,
    email: row.email
  }));
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

/**
 * Actualiza el perfil del usuario (nombre y email) y refresca la sesión.
 */
export async function updateUserProfile(nombre: string, email: string): Promise<{ success: boolean; message?: string }> {
  const session = await getSession();
  if (!session?.userId) return { success: false, message: 'No autenticado' };

  try {
    await db.query(
      'UPDATE usuarios SET nombre = ?, email = ? WHERE id = ?',
      [nombre, email, session.userId]
    );

    // Refrescar la sesión con los nuevos datos
    await createSession(
      session.userId,
      email,
      nombre,
      session.tutorial || 0,
      session.tutorialDocumentos || 0,
      session.tutorialTrimestres || 0,
      session.tutorialActividad || 0,
      session.tutorialIndividual || 0,
      session.tutorialIncidencias || 0,
      session.tutorialProveedores || 0
    );

    return { success: true };
  } catch (error) {
    console.error('❌ [updateUserProfile] Error:', error);
    return { success: false, message: 'Error al actualizar el perfil' };
  }
}

/**
 * Actualiza la contraseña del usuario con hasheo y validación de duplicados.
 */
export async function updateUserPassword(newPassword: string, currentPassword?: string): Promise<{ success: boolean; message?: string }> {
  const session = await getSession();
  if (!session?.userId) return { success: false, message: 'No autenticado' };

  try {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT password FROM usuarios WHERE id = ?',
      [session.userId]
    );

    if (rows.length === 0) return { success: false, message: 'Usuario no encontrado' };

    const currentPasswordHash = rows[0].password;

    // Verificar si es cuenta de Google
    if (currentPasswordHash && currentPasswordHash.startsWith(GOOGLE_PASSWORD_MARKER)) {
      return { success: false, message: 'Esta cuenta está vinculada a Google. La contraseña debe gestionarse desde Google.' };
    }

    // ✅ NUEVO: Verificar contraseña actual si se proporciona
    if (currentPassword) {
      const isCurrentValid = await bcrypt.compare(currentPassword, currentPasswordHash);
      if (!isCurrentValid) {
        return { success: false, message: 'La contraseña actual es incorrecta.' };
      }
    } else {
      return { success: false, message: 'Se requiere la contraseña actual para realizar este cambio.' };
    }

    // Verificar que la nueva contraseña no sea igual a la actual
    if (currentPasswordHash) {
      const isSame = await bcrypt.compare(newPassword, currentPasswordHash);
      if (isSame) {
        return { success: false, message: 'La nueva contraseña no puede ser igual a la anterior.' };
      }
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.query(
      'UPDATE usuarios SET password = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?',
      [hashedPassword, session.userId]
    );

    return { success: true };
  } catch (error) {
    console.error('❌ [updateUserPassword] Error:', error);
    return { success: false, message: 'Error al actualizar la contraseña' };
  }
}