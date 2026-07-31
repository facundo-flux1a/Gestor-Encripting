'use server';

import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import db from '@/lib/db'; // Mantenido como fallback durante migración a Prisma
import type { RowDataPacket, OkPacket } from 'mysql2';
import type { User, SessionPayload } from '@/lib/types';
import { redirect } from 'next/navigation';
import crypto from 'crypto';
import { GOOGLE_PASSWORD_MARKER } from '@/lib/constants';
import { acceptInvitation } from './invitation-service';
import { sendEmail } from './email-service';
import { prisma } from '@/lib/prisma';
import { hashField } from '@/lib/encryption';
import { headers } from 'next/headers';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_S,
  sessionCookieOptions,
} from '@/lib/session-config';

/**
 * Helper para registrar eventos de sesión en eventos_sistema (VeriFactu / Orden HAC/1177/2024)
 * No lanza excepciones: un fallo de log nunca debe bloquear el flujo de autenticación.
 */
async function logAuthEvent(tipo: 'LOGIN' | 'LOGOUT', userEmail: string) {
  try {
    const h = await headers();
    const ip = h.get('x-forwarded-for') || h.get('x-real-ip') || 'unknown';
    const agent = h.get('user-agent') || 'unknown';
    await prisma.eventos_sistema.create({
      data: {
        usuario: userEmail,
        tipo_evento: tipo,
        metadata: JSON.stringify({ ip, agent }),
        fecha: new Date()
      }
    });
  } catch (e) {
    console.warn(`⚠️ [logAuthEvent] No se pudo registrar evento ${tipo}:`, e);
  }
}

const secretKey = new TextEncoder().encode(process.env.SESSION_SECRET);
const key = secretKey;

// ==========================================
// HELPERS DE SEGURIDAD (BLIND INDEX)
// ==========================================

// Import hashField from encryption.ts

/**
 * Busca un usuario por email de forma segura.
 * 1. Intenta por Blind Index (email_hash) → funciona después de migrar.
 * 2. Si no encuentra, cae en fallback a texto plano → funciona antes de migrar.
 *    Además, aprovecha para rellenar el email_hash del usuario (migración lazy).
 */
export async function findUserByEmail(email: string) {
  const emailHash = hashField(email);

  // Intento 1: Blind Index (post-migración)
  const userByHash = await prisma.usuarios.findUnique({
    where: { email_hash: emailHash }
  });
  if (userByHash) return userByHash;

  // Intento 2: Texto plano (pre-migración, fallback legacy)
  // Buscamos usuarios sin hash y filtramos en memoria, usando Prisma para aprovechar desencriptación si aplica
  const legacyUsers = await prisma.usuarios.findMany({
    where: { email_hash: null }
  });
  const matchedUser = legacyUsers.find(u => u.email === email.trim());

  if (matchedUser) {
    // Backfill lazy: rellenar email_hash para este usuario
    try {
      await prisma.usuarios.update({
        where: { id: matchedUser.id },
        data: { email_hash: emailHash }
      });
    } catch (_) { /* Ignorar error de backfill */ }
    return matchedUser;
  }

  return null;
}

export async function encrypt(payload: any) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_S)
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
      tutorialHealthCheck: z.number().optional(),
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
      tutorialHealthCheck: parsedPayload.data.tutorialHealthCheck,
      organization_rol: (parsedPayload.data.organization_rol as "ADMIN" | "EDITOR" | "VIEWER") || 'EDITOR',
      expires: new Date(parsedPayload.data.exp * 1000).toISOString(),
    };

  } catch (error) {
    console.error('Failed to verify session:', error);
    return null;
  }
}

// Cache corto de "usuario activo" — evita ~650ms de MySQL remoto en CADA /api/*
const activoCache = new Map<number, { activo: boolean; expires: number }>();
const ACTIVO_TTL_MS = 60_000;

export async function getSession(cookie?: string): Promise<SessionPayload | null> {
  const t0 = performance.now();
  let sessionCookie = cookie;

  if (!sessionCookie) {
    const cookieStore = await cookies();
    sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  }

  if (!sessionCookie) return null;

  const tDecrypt = performance.now();
  const session = await decrypt(sessionCookie);
  const decryptMs = Math.round(performance.now() - tDecrypt);
  if (!session) return null;

  // JWT ya firmado + middleware verificó firma. El check activo va cacheado 60s.
  const cached = activoCache.get(session.userId);
  if (cached && cached.expires > Date.now()) {
    if (!cached.activo) return null;
    console.log(`⏱️ [PERF] getSession | ${Math.round(performance.now() - t0)}ms |`, { decryptMs, dbMs: 0, cache: 'hit', userId: session.userId });
    return session;
  }

  try {
    const tDb = performance.now();
    const user = await prisma.usuarios.findUnique({
      where: { id: BigInt(session.userId) },
      select: { activo: true }
    });
    const dbMs = Math.round(performance.now() - tDb);
    const isActive = user?.activo === true;
    activoCache.set(session.userId, { activo: isActive, expires: Date.now() + ACTIVO_TTL_MS });

    // Usuario inexistente o desactivado → cookie zombie
    if (!isActive) {
      console.warn(`⚠️ [getSession] Usuario ${session.userId} inactivo o eliminado. Limpiando cookie zombie.`);
      try {
        const cookieStore = await cookies();
        cookieStore.delete(SESSION_COOKIE_NAME);
      } catch (e) {
        console.error("No se pudo borrar la cookie (quizás server component context):", e);
      }
      console.log(`⏱️ [PERF] getSession | ${Math.round(performance.now() - t0)}ms |`, { decryptMs, dbMs, result: 'inactive' });
      return null;
    }
    console.log(`⏱️ [PERF] getSession | ${Math.round(performance.now() - t0)}ms |`, { decryptMs, dbMs, cache: 'miss', userId: session.userId });
    return session;
  } catch (error) {
    // Fallos transitorios de red/DB (Railway ECONNRESET, etc.): NO borrar cookie.
    // Forzar logout aquí te echa en cada blip de conexión remota.
    console.error('Error in getSession DB query (manteniendo sesión):', error);
    // En error de red, asumir activo un rato para no martillar la DB caída
    activoCache.set(session.userId, { activo: true, expires: Date.now() + ACTIVO_TTL_MS });
    console.log(`⏱️ [PERF] getSession | ${Math.round(performance.now() - t0)}ms |`, { decryptMs, result: 'db_error_keep_session' });
    return session;
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
  tutorialHealthCheck: number = 0,
  organizationRol: 'ADMIN' | 'EDITOR' | 'VIEWER' = 'EDITOR'
) {
  const expires = new Date(Date.now() + SESSION_MAX_AGE_S * 1000);
  const session = await encrypt({
    userId, email, nombre, tutorial,
    tutorialDocumentos, tutorialTrimestres, tutorialActividad,
    tutorialIndividual, tutorialIncidencias, tutorialProveedores,
    tutorialHealthCheck,
    organization_rol: organizationRol
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, session, {
    ...sessionCookieOptions,
    expires,
  });
}

async function createDefaultAIConfig(userId: number) {
  try {
    await prisma.ai_user_config.upsert({
      where: { user_id: BigInt(userId) },
      create: {
        user_id: BigInt(userId),
        use_own_key: false,
        daily_limit_openai: 5,
        daily_limit_gemini: 50,
        is_unlimited: false,
      },
      update: {} // Si ya existe, no cambiar nada
    });
    console.log('✅ [createDefaultAIConfig] Config de IA creada para usuario:', userId);
  } catch (error) {
    console.error('❌ [createDefaultAIConfig] Error creando config:', error);
  }
}

async function migratePasswordToHash(userId: number, plainPassword: string) {
  try {
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    await prisma.usuarios.update({
      where: { id: BigInt(userId) },
      data: { password: hashedPassword }
    });
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
    // Búsqueda segura: Blind Index primero, fallback a texto plano para legacy
    const user = await findUserByEmail(email);

    if (!user) {
      return redirect('/auth/login?error=invalid_credentials');
    }

    const userId = BigInt(user.id);
    const userEmail = (user.email as string) || '';
    const userName = (user.nombre as string) || '';

    let passwordValid = false;
    if (user.password === password.trim()) {
      // Migración automática si estaba en texto plano
      await migratePasswordToHash(Number(userId), password.trim());
      passwordValid = true;
    } else {
      passwordValid = await bcrypt.compare(password.trim(), (user.password as string) || '');
    }

    if (!passwordValid) {
      return redirect('/auth/login?error=invalid_credentials');
    }

    const emailVerified = typeof user.email_verified === 'boolean'
      ? user.email_verified
      : Number(user.email_verified) === 1;

    if (!emailVerified) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await prisma.usuarios.update({ where: { id: userId }, data: { two_factor_code: code, two_factor_expires_at: expiresAt } });
      await send2FAEmail(userEmail, userName, code, true);
      return redirect(`/auth/verify-email?email=${encodeURIComponent(userEmail)}${inviteToken ? `&invite_token=${inviteToken}` : ''}`);
    }

    // BYPASS 2FA TEMPORAL PARA DEBUGGING
    const t = (v: any) => (typeof v === 'boolean' ? Number(v) : Number(v ?? 1));
    await createSession(Number(userId), userEmail, userName,
      t(user.tutorial), t(user.tutorial_documentos), t(user.tutorial_trimestres),
      t(user.tutorial_actividad), t(user.tutorial_individual), t(user.tutorial_incidencias),
      t(user.tutorial_proveedores), t(user.tutorial_health_check),
      (user.organization_rol as any) || 'EDITOR');
    await logAuthEvent('LOGIN', userEmail);

    if (inviteToken) {
      await acceptInvitation(inviteToken, Number(userId));
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
    // Buscar por Blind Index para verificar unicidad
    const emailHash = hashField(email);
    const existing = await prisma.usuarios.findUnique({ where: { email_hash: emailHash } });
    if (existing) {
      return redirect('/auth/register?error=user_exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const newUser = await prisma.usuarios.create({
      data: {
        nombre,
        email,           // Prisma encriptará automáticamente (/// @encrypted)
        email_hash: emailHash, // Blind Index para búsquedas futuras
        password: hashedPassword,
        activo: true,
        tutorial: true,
        tutorial_documentos: true,
        tutorial_trimestres: true,
        tutorial_actividad: true,
        tutorial_individual: true,
        tutorial_incidencias: true,
        tutorial_proveedores: true,
        tutorial_health_check: true,
        email_verified: false,
        two_factor_code: code,
        two_factor_expires_at: expiresAt,
      }
    });

    await createDefaultAIConfig(Number(newUser.id));
    await send2FAEmail(email, nombre, code, true);

    redirect(`/auth/verify-email?email=${encodeURIComponent(email)}${inviteToken ? `&invite_token=${inviteToken}` : ''}`);
  } catch (error: any) {
    if (error?.digest?.startsWith('NEXT_REDIRECT')) throw error;
    console.error('Registration error:', error);
    return redirect('/auth/register?error=server_error');
  }
}


export async function send2FAEmail(email: string, nombre: string, code: string, isVerification: boolean) {
  const magicLink = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/magic-login?email=${encodeURIComponent(email)}&code=${code}&type=${isVerification ? 'verify' : '2fa'}`;
  const subject = isVerification ? 'Verifica tu cuenta en Muvail' : 'Tu código de acceso a Muvail';
  const html = `
    <div style="font-family: Arial, sans-serif; max-w: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px;">
      <h2 style="color: #4F46E5; text-align: center;">Gestor Documental Muvail</h2>
      <p>Hola ${nombre},</p>
      <p>${isVerification ? 'Para activar tu cuenta y empezar a usar el Gestor Documental' : 'Para acceder a tu cuenta'}, por favor haz clic en el siguiente botón:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${magicLink}" style="background-color: #4F46E5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          ${isVerification ? 'Verificar mi cuenta' : 'Iniciar sesión automáticamente'}
        </a>
      </div>
      <p style="color: #666; font-size: 14px; text-align: center;">Si estás intentando iniciar sesión desde otro dispositivo, ingresa este código manualmente:</p>
      <div style="text-align: center; margin: 20px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #111;">${code}</span>
      </div>
      <p style="color: #999; font-size: 12px; text-align: center; margin-top: 40px;">Este código expira en ${isVerification ? '15' : '10'} minutos.<br>Si no solicitaste este acceso, puedes ignorar este correo.</p>
    </div>
  `;
  await sendEmail({ to: email, subject, html, fromName: 'Muvail Seguridad' });
}

export async function verifyEmailCode(formData: FormData) {
  const email = formData.get('email') as string;
  const code = formData.get('code') as string;
  const inviteToken = formData.get('invite_token') as string;

  if (!email || !code) return { success: false, error: 'Código inválido' };

  try {
    const user = await findUserByEmail(email);
    if (!user) return { success: false, error: 'Usuario no encontrado' };

    if (user.two_factor_code !== code.trim()) return { success: false, error: 'Código incorrecto' };
    if (!user.two_factor_expires_at || new Date(user.two_factor_expires_at as any) < new Date()) {
      return { success: false, error: 'El código ha expirado' };
    }

    await prisma.usuarios.update({
      where: { id: BigInt(user.id) },
      data: { email_verified: true, two_factor_code: null, two_factor_expires_at: null }
    });

    const t = (v: any) => (typeof v === 'boolean' ? Number(v) : Number(v ?? 1));
    await createSession(Number(user.id), user.email as string, user.nombre as string,
      t(user.tutorial), t(user.tutorial_documentos), t(user.tutorial_trimestres),
      t(user.tutorial_actividad), t(user.tutorial_individual), t(user.tutorial_incidencias),
      t(user.tutorial_proveedores), t(user.tutorial_health_check),
      (user.organization_rol as any) || 'EDITOR');
    await logAuthEvent('LOGIN', user.email as string);

    if (inviteToken) await acceptInvitation(inviteToken, Number(user.id));
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Error interno' };
  }
}

export async function verify2FACode(formData: FormData) {
  const code = formData.get('code') as string;
  if (!code) return { success: false, error: 'Código inválido' };

  const cookieStore = await cookies();
  const pendingSession = cookieStore.get('pending_2fa')?.value;
  if (!pendingSession) return { success: false, error: 'Sesión expirada. Por favor, inicia sesión nuevamente.' };

  try {
    const { payload } = await jwtVerify(pendingSession, secretKey, { algorithms: ['HS256'] });
    const { userId, inviteToken } = payload as any;

    const user = await prisma.usuarios.findUnique({ where: { id: BigInt(userId) } });
    if (!user) return { success: false, error: 'Usuario no encontrado' };

    if (user.two_factor_code !== code.trim()) return { success: false, error: 'Código incorrecto' };
    if (!user.two_factor_expires_at || new Date(user.two_factor_expires_at) < new Date()) {
      return { success: false, error: 'El código ha expirado' };
    }

    await prisma.usuarios.update({
      where: { id: user.id },
      data: { two_factor_code: null, two_factor_expires_at: null }
    });
    cookieStore.delete('pending_2fa');

    const t = (v: any) => (typeof v === 'boolean' ? Number(v) : Number(v ?? 1));
    await createSession(Number(user.id), user.email as string, user.nombre as string,
      t(user.tutorial), t(user.tutorial_documentos), t(user.tutorial_trimestres),
      t(user.tutorial_actividad), t(user.tutorial_individual), t(user.tutorial_incidencias),
      t(user.tutorial_proveedores), t(user.tutorial_health_check),
      (user.organization_rol as any) || 'EDITOR');
    await logAuthEvent('LOGIN', user.email as string);

    if (inviteToken) await acceptInvitation(inviteToken, Number(user.id));
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Sesión inválida o expirada' };
  }
}

export async function handleGoogleSignInOnServer(
  firebaseUser: { uid: string, email: string | null, displayName: string | null }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { email, displayName, uid } = firebaseUser;
    if (!email) return { success: false, error: 'El proveedor de Google no proporcionó un email.' };

    const existingUser = await findUserByEmail(email);

    let user: any;
    if (existingUser) {
      const isActive = typeof existingUser.activo === 'boolean' ? existingUser.activo : Number(existingUser.activo) === 1;
      if (!isActive) return { success: false, error: 'Usuario inactivo. Contacte al administrador.' };
      user = existingUser;
    } else {
      const nombre = displayName || email.split('@')[0] || 'Nuevo Usuario';
      const emailHash = hashField(email);
      const newUser = await prisma.usuarios.create({
        data: {
          nombre, email, email_hash: emailHash,
          password: GOOGLE_PASSWORD_MARKER + uid,
          activo: true,
          tutorial: true, tutorial_documentos: true, tutorial_trimestres: true,
          tutorial_actividad: true, tutorial_individual: true, tutorial_incidencias: true,
          tutorial_proveedores: true, tutorial_health_check: true,
        }
      });
      await createDefaultAIConfig(Number(newUser.id));
      user = { ...newUser, tutorial: 1, tutorial_documentos: 1, tutorial_trimestres: 1,
        tutorial_actividad: 1, tutorial_individual: 1, tutorial_incidencias: 1,
        tutorial_proveedores: 1, tutorial_health_check: 1, organization_rol: 'EDITOR' };
    }

    const t = (v: any) => (typeof v === 'boolean' ? Number(v) : Number(v ?? 1));
    await createSession(Number(user.id), user.email as string, user.nombre as string,
      t(user.tutorial), t(user.tutorial_documentos), t(user.tutorial_trimestres),
      t(user.tutorial_actividad), t(user.tutorial_individual), t(user.tutorial_incidencias),
      t(user.tutorial_proveedores), t(user.tutorial_health_check),
      (user.organization_rol as any) || 'EDITOR');
    await logAuthEvent('LOGIN', email);

    return { success: true };
  } catch (error) {
    console.error('Google Sign-In error:', error);
    return { success: false, error: 'Error interno del servidor' };
  }
}

export async function logout() {
  const cookieStore = await cookies();
  const session = await getSession();
  if (session?.email) {
    await logAuthEvent('LOGOUT', session.email);
  }
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

    // 1. Actualizar en Base de Datos con Prisma (los campos de tutorial son Boolean en el schema)
    const boolValue = value === 0 ? false : true;
    const updated = await prisma.usuarios.update({
      where: { id: BigInt(session.userId) },
      data: { [field]: boolValue } as any
    });

    if (!updated) {
      console.warn(`⚠️ [auth-service] El UPDATE no afectó a ninguna fila. ¿El usuario ${session.userId} existe?`);
    } else {
      console.log(`✅ [auth-service] DB actualizada para usuario ${session.userId}`);
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
      'tutorial_proveedores': 'tutorialProveedores',
      'tutorial_health_check': 'tutorialHealthCheck'
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
      updatedPayload.tutorialHealthCheck ?? 0,
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

export async function completeTutorialHealthCheck() {
  return await updateUserTutorialField('tutorial_health_check', 0);
}
