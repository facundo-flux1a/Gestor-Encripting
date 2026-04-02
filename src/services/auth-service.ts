'use server';

import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import db from '@/lib/db';
import type { RowDataPacket, OkPacket } from 'mysql2';
import type { User, SessionPayload } from '@/lib/types';
import { redirect } from 'next/navigation';
import crypto from 'crypto';
import { GOOGLE_PASSWORD_MARKER } from '@/lib/constants';
import { acceptInvitation } from './invitation-service';

const secretKey = new TextEncoder().encode(process.env.SESSION_SECRET);
const key = secretKey;
const SESSION_COOKIE_NAME = 'session';

export async function encrypt(payload: any) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1d')
    .sign(key);
}

export async function decrypt(session: string | undefined = ''): Promise<SessionPayload | null> {
  if (!session) return null;
  try {
    const { payload } = await jwtVerify(session, key, {
      algorithms: ['HS256'],
    });

    const parsedPayload = z.object({
      userId: z.number(),
      email: z.string().email(),
      nombre: z.string(),
      tutorial: z.number().optional(),
      tutorialDocumentos: z.number().optional(),
      tutorialTrimestres: z.number().optional(),
      tutorialActividad: z.number().optional(),
      tutorialIndividual: z.number().optional(),
      tutorialIncidencias: z.number().optional(),
      tutorialProveedores: z.number().optional(),
      organization_rol: z.enum(['ADMIN', 'EDITOR', 'VIEWER']).optional(),
      exp: z.number(),
    }).safeParse(payload);

    if (!parsedPayload.success) return null;

    return {
      userId: parsedPayload.data.userId,
      email: parsedPayload.data.email,
      nombre: parsedPayload.data.nombre,
      tutorial: parsedPayload.data.tutorial,
      tutorialDocumentos: parsedPayload.data.tutorialDocumentos,
      tutorialTrimestres: parsedPayload.data.tutorialTrimestres,
      tutorialActividad: parsedPayload.data.tutorialActividad,
      tutorialIndividual: parsedPayload.data.tutorialIndividual,
      tutorialIncidencias: parsedPayload.data.tutorialIncidencias,
      tutorialProveedores: parsedPayload.data.tutorialProveedores,
      organization_rol: (parsedPayload.data.organization_rol as "ADMIN" | "EDITOR" | "VIEWER") || 'EDITOR',
      expires: new Date(parsedPayload.data.exp * 1000).toISOString(),
    };

  } catch (error) {
    console.error('Failed to verify session:', error);
    return null;
  }
}

export async function getSession(cookie?: string): Promise<SessionPayload | null> {
  let sessionCookie = cookie;

  if (!sessionCookie) {
    const cookieStore = await cookies();
    sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  }

  if (!sessionCookie) return null;

  const session = await decrypt(sessionCookie);
  if (!session) return null;

  try {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT activo FROM usuarios WHERE id = ?',
      [session.userId]
    );

    const isActive = rows[0] && (
      Buffer.isBuffer(rows[0].activo)
        ? rows[0].activo[0] === 1
        : Number(rows[0].activo) === 1
    );

    if (!isActive) {
      console.warn(`⚠️ [getSession] Usuario ${session.userId} inactivo o eliminado. Limpiando cookie zombie.`);
      try {
        const cookieStore = await cookies();
        cookieStore.delete(SESSION_COOKIE_NAME);
      } catch (e) {
        console.error("No se pudo borrar la cookie (quizás server component context):", e);
      }
      return null;
    }
    return session;
  } catch (error) {
    console.error('Error in getSession DB query:', error);
    // Asumimos inactivo/error, es mejor borrar y forzar login
    try {
      const cookieStore = await cookies();
      cookieStore.delete(SESSION_COOKIE_NAME);
    } catch (e) { }
    return null;
  }
}

export async function createSession(
  userId: number,
  email: string,
  nombre: string,
  tutorial: number = 0,
  tutorialDocumentos: number = 0,
  tutorialTrimestres: number = 0,
  tutorialActividad: number = 0,
  tutorialIndividual: number = 0,
  tutorialIncidencias: number = 0,
  tutorialProveedores: number = 0,
  organizationRol: 'ADMIN' | 'EDITOR' | 'VIEWER' = 'EDITOR'
) {
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const session = await encrypt({
    userId, email, nombre, tutorial,
    tutorialDocumentos, tutorialTrimestres, tutorialActividad,
    tutorialIndividual, tutorialIncidencias, tutorialProveedores,
    organization_rol: organizationRol
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    expires,
    sameSite: 'lax',
    path: '/',
  });
}

async function createDefaultAIConfig(userId: number) {
  try {
    await db.query(
      `INSERT INTO erp49.ai_user_config 
       (user_id, use_own_key, daily_limit_openai, daily_limit_gemini, is_unlimited)
       VALUES (?, FALSE, 5, 50, FALSE)
       ON DUPLICATE KEY UPDATE user_id = user_id`,
      [userId]
    );
    console.log('✅ [createDefaultAIConfig] Config de IA creada para usuario:', userId);
  } catch (error) {
    console.error('❌ [createDefaultAIConfig] Error creando config:', error);
  }
}

async function migratePasswordToHash(userId: number, plainPassword: string) {
  try {
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    await db.query(
      'UPDATE usuarios SET password = ? WHERE id = ?',
      [hashedPassword, userId]
    );
    console.log('🔄 [migratePasswordToHash] Contraseña migrada a hash para usuario:', userId);
  } catch (error) {
    console.error('❌ [migratePasswordToHash] Error migrando:', error);
  }
}

export async function login(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const inviteToken = formData.get('invite_token') as string;

  if (!email || !password) {
    return redirect('/auth/login?error=invalid_credentials');
  }

  try {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM usuarios WHERE email = ?',
      [email.trim()]
    );

    if (rows.length === 0) {
      return redirect('/auth/login?error=invalid_credentials');
    }

    const user = rows[0];

    let passwordValid = false;
    if (user.password === password.trim()) {
      // Migración automática si estaba en texto plano
      await migratePasswordToHash(user.id, password.trim());
      passwordValid = true;
    } else {
      passwordValid = await bcrypt.compare(password.trim(), user.password || '');
    }

    if (!passwordValid) {
      return redirect('/auth/login?error=invalid_credentials');
    }

    await createSession(
      user.id,
      user.email,
      user.nombre,
      user.tutorial,
      user.tutorial_documentos,
      user.tutorial_trimestres,
      user.tutorial_actividad,
      user.tutorial_individual,
      user.tutorial_incidencias,
      user.tutorial_proveedores,
      user.organization_rol
    );

    if (inviteToken) {
      console.log('🎁 [auth-service] Token de invitación detectado en LOGIN:', inviteToken);
      const inviteResult = await acceptInvitation(inviteToken, user.id);
      console.log('🎁 [auth-service] Resultado acceptInvitation en LOGIN:', inviteResult);
      if (!inviteResult.success) {
        // ... (keep redirect)
        return redirect(`/auth/login?error=invitation_error&message=${encodeURIComponent(inviteResult.error || '')}`);
      }
    }

    redirect('/dashboard');
  } catch (error: any) {
    if (error?.digest?.startsWith('NEXT_REDIRECT')) throw error;
    console.error('Login error:', error);
    return redirect('/auth/login?error=server_error');
  }
}

export async function register(formData: FormData) {
  const nombre = formData.get('name') as string;
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const inviteToken = formData.get('invite_token') as string;

  if (!nombre || !email || !password) {
    return redirect('/auth/register?error=missing_fields');
  }

  try {
    const [existingUser] = await db.query<RowDataPacket[]>('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (existingUser.length > 0) {
      return redirect('/auth/register?error=user_exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await db.query<OkPacket>(
      'INSERT INTO usuarios (nombre, email, password, activo, tutorial, tutorial_documentos, tutorial_trimestres, tutorial_actividad, tutorial_individual, tutorial_incidencias, tutorial_proveedores) VALUES (?, ?, ?, 1, 1, 1, 1, 1, 1, 1, 1)',
      [nombre, email, hashedPassword]
    );

    const newUserId = result.insertId;

    await createDefaultAIConfig(newUserId);

    await createSession(newUserId, email, nombre, 1, 1, 1, 1, 1, 1, 1);

    if (inviteToken) {
      console.log('🎁 [auth-service] Token de invitación detectado en REGISTER:', inviteToken);
      const inviteResult = await acceptInvitation(inviteToken, newUserId);
      console.log('🎁 [auth-service] Resultado acceptInvitation en REGISTER:', inviteResult);
    }

    redirect('/dashboard');
  } catch (error: any) {
    if (error?.digest?.startsWith('NEXT_REDIRECT')) throw error;
    console.error('Registration error:', error);
    return redirect('/auth/register?error=server_error');
  }
}

export async function handleGoogleSignInOnServer(
  firebaseUser: { uid: string, email: string | null, displayName: string | null }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { email, displayName, uid } = firebaseUser;
    if (!email) {
      return { success: false, error: 'El proveedor de Google no proporcionó un email.' };
    }

    const [existingUsers] = await db.query<RowDataPacket[]>(
      'SELECT id, nombre, email, password, activo, tutorial, tutorial_documentos, tutorial_trimestres, tutorial_actividad, tutorial_individual, tutorial_incidencias, tutorial_proveedores, organization_rol FROM usuarios WHERE email = ?',
      [email]
    );

    let user;
    if (existingUsers.length > 0) {
      user = existingUsers[0];
      if (!user.activo || user.activo === 0) {
        return { success: false, error: 'Usuario inactivo. Contacte al administrador.' };
      }
    } else {
      const nombre = displayName || email.split('@')[0] || 'Nuevo Usuario';
      const [result] = await db.query<OkPacket>(
        'INSERT INTO usuarios (nombre, email, password, activo, tutorial, tutorial_documentos, tutorial_trimestres, tutorial_actividad, tutorial_individual, tutorial_incidencias, tutorial_proveedores) VALUES (?, ?, ?, 1, 1, 1, 1, 1, 1, 1, 1)',
        [nombre, email, GOOGLE_PASSWORD_MARKER + uid]
      );
      const newUserId = result.insertId;
      await createDefaultAIConfig(newUserId);
      user = {
        id: newUserId, email, nombre,
        tutorial: 1, tutorial_documentos: 1, tutorial_trimestres: 1,
        tutorial_actividad: 1, tutorial_individual: 1, tutorial_incidencias: 1, tutorial_proveedores: 1,
        organization_rol: 'EDITOR'
      };
    }

    await createSession(
      user.id, user.email, user.nombre,
      user.tutorial, user.tutorial_documentos, user.tutorial_trimestres,
      user.tutorial_actividad, user.tutorial_individual, user.tutorial_incidencias, user.tutorial_proveedores,
      user.organization_rol
    );

    return { success: true };
  } catch (error) {
    console.error('Google Sign-In error:', error);
    return { success: false, error: 'Error interno del servidor' };
  }
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect('/auth/login?logout=true');
}


export const verifySession = getSession;

/**
 * Helper interno para actualizar campos de tutorial en DB y Sesión
 */
async function updateUserTutorialField(field: string, value: number = 0) {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: 'No hay sesión' };

    // Log persistence to a local file for debugging
    try {
      const fs = require('fs');
      const path = require('path');
      const logMsg = `[${new Date().toISOString()}] USER: ${session.userId} | FIELD: ${field} | VALUE: ${value}\n`;
      fs.appendFileSync(path.join(process.cwd(), 'tutorial-persistence.log'), logMsg);
    } catch (e) { }

    console.log(`🔄 [auth-service] Actualizando "${field}" a ${value} para usuario ${session.userId}`);

    // 1. Actualizar en Base de Datos
    const [result]: any = await db.query(
      `UPDATE usuarios SET ${field} = ? WHERE id = ?`,
      [value, session.userId]
    );

    if (result.affectedRows === 0) {
      console.warn(`⚠️ [auth-service] El UPDATE no afectó a ninguna fila. ¿El usuario ${session.userId} existe?`);
    } else {
      console.log(`✅ [auth-service] DB actualizada: ${result.affectedRows} fila(s) afectada(s)`);
    }

    // 2. Re-crear sesión con el valor actualizado para sincronizar la cookie
    // Obtenemos los valores actuales de la sesión
    const updatedPayload = { ...session };

    // Mapear el campo de DB al campo del payload de sesión
    const fieldMap: Record<string, keyof typeof updatedPayload> = {
      'tutorial': 'tutorial',
      'tutorial_documentos': 'tutorialDocumentos',
      'tutorial_trimestres': 'tutorialTrimestres',
      'tutorial_actividad': 'tutorialActividad',
      'tutorial_individual': 'tutorialIndividual',
      'tutorial_incidencias': 'tutorialIncidencias',
      'tutorial_proveedores': 'tutorialProveedores'
    };

    const payloadField = fieldMap[field];
    if (payloadField) {
      (updatedPayload as any)[payloadField] = value;
    }

    // Actualizar la cookie de sesión con todos los campos actuales para no perder datos
    await createSession(
      updatedPayload.userId,
      updatedPayload.email,
      updatedPayload.nombre,
      updatedPayload.tutorial ?? 0,
      updatedPayload.tutorialDocumentos ?? 0,
      updatedPayload.tutorialTrimestres ?? 0,
      updatedPayload.tutorialActividad ?? 0,
      updatedPayload.tutorialIndividual ?? 0,
      updatedPayload.tutorialIncidencias ?? 0,
      updatedPayload.tutorialProveedores ?? 0,
      (updatedPayload as any).organization_rol as any
    );

    console.log(`✅ [auth-service] ${field} actualizado exitosamente`);
    return { success: true };
  } catch (error) {
    console.error(`❌ [auth-service] Error actualizando ${field}:`, error);
    return { success: false, error };
  }
}

export async function completeTutorial() {
  return await updateUserTutorialField('tutorial', 0);
}

export async function completeTutorialDocumentos() {
  return await updateUserTutorialField('tutorial_documentos', 0);
}

export async function completeTutorialTrimestres() {
  return await updateUserTutorialField('tutorial_trimestres', 0);
}

export async function completeTutorialActividad() {
  return await updateUserTutorialField('tutorial_actividad', 0);
}

export async function completeTutorialIndividual() {
  return await updateUserTutorialField('tutorial_individual', 0);
}

export async function completeTutorialIncidencias() {
  return await updateUserTutorialField('tutorial_incidencias', 0);
}

export async function completeTutorialProveedores() {
  return await updateUserTutorialField('tutorial_proveedores', 0);
}
