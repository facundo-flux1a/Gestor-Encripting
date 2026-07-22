'use server';

import type { User } from '@/lib/types';
import { getSession, createSession } from './auth-service';
import { GOOGLE_PASSWORD_MARKER } from '@/lib/constants';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

/**
 * Retrieves the full user object for the currently authenticated user.
 * @returns A promise that resolves to the User object or null if not found or not authenticated.
 */
export async function getCurrentUser(): Promise<User | null> {
  const t0 = performance.now();
  const session = await getSession();
  console.log(`⏱️ [PERF] getCurrentUser | ${Math.round(performance.now() - t0)}ms | hasSession=${!!session?.userId}`);

  if (!session?.userId) {
    return null;
  }

  // Si la sesión no tiene el campo tutorial, consultamos la BD
  // Esto es un fallback por si la sesión se creó antes de agregar el campo
  if (session.tutorial === undefined) {
    console.log('⚠️ [getCurrentUser] Tutorial no está en sesión, consultando BD');
    const user = await prisma.usuarios.findUnique({
      where: { id: BigInt(session.userId) },
      select: { id: true, nombre: true, email: true, tutorial: true }
    });

    if (user) {
      return {
        id: Number(user.id),
        nombre: user.nombre as string,
        email: user.email as string,
        tutorial: user.tutorial ? 1 : 0,
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
 * Obtiene los detalles básicos de una lista de usuarios por ID e opcionalmente su rol en una empresa específica
 */
export async function getUsersByIds(ids: number[], companyId?: number): Promise<Partial<User>[]> {
  if (!ids || ids.length === 0) return [];

  const users = await prisma.usuarios.findMany({
    where: { id: { in: ids.map(id => BigInt(id)) } },
    select: { id: true, nombre: true, email: true, organization_rol: true }
  });

  let rolesMap: Record<string, string> = {};
  if (companyId) {
    const comp = await prisma.empresas.findUnique({
      where: { id: BigInt(companyId) },
      select: { config_roles: true }
    });
    if (comp?.config_roles) {
      rolesMap = typeof comp.config_roles === 'string'
        ? JSON.parse(comp.config_roles)
        : comp.config_roles as any;
    }
  }

  return users.map(user => ({
    id: Number(user.id),
    nombre: user.nombre as string,
    email: user.email as string,
    organization_rol: rolesMap[user.id.toString()] || (user.organization_rol as string) || 'EDITOR'
  }));
}

export async function getUserConfigRaw(userId: number | bigint): Promise<any> {
  const userRow = await prisma.usuarios.findUnique({
    where: { id: BigInt(userId) },
    select: { config_otros_tipos: true }
  });

  if (userRow?.config_otros_tipos) {
    try {
      return typeof userRow.config_otros_tipos === 'string'
        ? JSON.parse(userRow.config_otros_tipos)
        : userRow.config_otros_tipos;
    } catch (e) {
      console.error('Error parsing config_otros_tipos:', e);
    }
  }
  return {};
}

/**
 * Obtiene la configuración de tipos para la sección "Otros"
 */
export async function getUserConfigOtros(): Promise<string[] | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const config = await getUserConfigRaw(user.id);
  return config.tipos || null;
}

/**
 * Actualiza la configuración de tipos para la sección "Otros"
 */
export async function updateUserConfigOtros(tipos: string[]): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;

  try {
    const currentConfig = await getUserConfigRaw(user.id);
    const newConfig = { ...currentConfig, tipos };

    await prisma.usuarios.update({
      where: { id: BigInt(user.id) },
      data: { config_otros_tipos: newConfig as any }
    });
    return true;
  } catch (e) {
    console.error('Error updating config_otros_tipos:', e);
    return false;
  }
}

export interface TwoFactorConfig {
  enabled: boolean;
  durationHours: number;
}

export async function get2FAConfig(userId: number): Promise<TwoFactorConfig> {
  const config = await getUserConfigRaw(userId);
  return {
    enabled: config.twoFactor?.enabled ?? true,
    durationHours: config.twoFactor?.durationHours ?? 24
  };
}

export async function update2FAConfig(userId: number, config2FA: TwoFactorConfig): Promise<boolean> {
  try {
    const currentConfig = await getUserConfigRaw(userId);
    const newConfig = { ...currentConfig, twoFactor: config2FA };
    
    await prisma.usuarios.update({
      where: { id: BigInt(userId) },
      data: { config_otros_tipos: newConfig as any }
    });
    return true;
  } catch (e) {
    console.error('Error updating 2FA config:', e);
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
    const emailHash = crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
    await prisma.usuarios.update({
      where: { id: BigInt(session.userId) },
      data: { nombre, email, email_hash: emailHash }
    });

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
    const user = await prisma.usuarios.findUnique({
      where: { id: BigInt(session.userId) },
      select: { password: true }
    });

    if (!user) return { success: false, message: 'Usuario no encontrado' };

    const currentPasswordHash = user.password as string;

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
    await prisma.usuarios.update({
      where: { id: BigInt(session.userId) },
      data: { password: hashedPassword, fecha_actualizacion: new Date() }
    });

    return { success: true };
  } catch (error) {
    console.error('❌ [updateUserPassword] Error:', error);
    return { success: false, message: 'Error al actualizar la contraseña' };
  }
}