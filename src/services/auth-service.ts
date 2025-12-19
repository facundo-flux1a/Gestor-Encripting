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
 
const secretKey = new TextEncoder().encode(process.env.SESSION_SECRET);
const key = secretKey;
const SESSION_COOKIE_NAME = 'session';
const GOOGLE_PASSWORD_MARKER = 'GOOGLE_AUTH_';

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
        tutorialProveedores: z.number().optional(), // ⬅️ NUEVO
        exp: z.number(),
    }).safeParse(payload);
    
    if(!parsedPayload.success) return null;

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
        tutorialProveedores: parsedPayload.data.tutorialProveedores, // ⬅️ NUEVO
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
      console.log('🍪 [getSession] Intentando obtener cookie:', { 
        existe: !!sessionCookie,
        todas: cookieStore.getAll().map(c => c.name)
      });
    }
    
    if (!sessionCookie) return null;
    
    const session = await decrypt(sessionCookie);
    if (!session) {
      const cookieStore = await cookies();
      cookieStore.delete(SESSION_COOKIE_NAME);
      return null;
    }
    
    return session;
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
  tutorialProveedores: number = 0 // ⬅️ NUEVO
) {
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const session = await encrypt({ 
      userId, 
      email, 
      nombre, 
      tutorial, 
      tutorialDocumentos,
      tutorialTrimestres,
      tutorialActividad,
      tutorialIndividual,
      tutorialIncidencias,
      tutorialProveedores, // ⬅️ NUEVO
      expires 
    });

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, session, {
        expires,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
    });
    console.log('🍪 [createSession] Cookie guardada:', { 
      name: SESSION_COOKIE_NAME, 
      path: '/', 
      tutorial,
      tutorialDocumentos,
      tutorialTrimestres,
      tutorialActividad,
      tutorialIndividual,
      tutorialIncidencias,
      tutorialProveedores // ⬅️ NUEVO
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

  console.log('🔍 [login] Intentando login con:', { email: email?.trim(), passwordLength: password?.length });

  if (!email || !password) {
    console.warn('⚠️ [login] Email o password vacíos');
    return redirect('/auth/login?error=invalid_credentials');
  }

  try {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT id, nombre, email, password, tutorial, tutorial_documentos, tutorial_trimestres, tutorial_actividad, tutorial_individual, tutorial_incidencias, tutorial_proveedores FROM usuarios WHERE email = ?', // ⬅️ MODIFICADO
      [email.trim()]
    );
    
    console.log('📊 [login] Usuarios encontrados con ese email:', rows.length);
    
    if (rows.length === 0) {
      console.warn('⚠️ [login] No existe usuario con email:', email.trim());
      return redirect('/auth/login?error=invalid_credentials');
    }

    const user = rows[0] as User & { 
      tutorial_documentos?: number; 
      tutorial_trimestres?: number;
      tutorial_actividad?: number;
      tutorial_individual?: number;
      tutorial_incidencias?: number;
      tutorial_proveedores?: number; // ⬅️ NUEVO
    };
    
    // 🔥 DETECTAR SI ES CUENTA DE GOOGLE
    if (user.password && user.password.startsWith(GOOGLE_PASSWORD_MARKER)) {
      console.warn('⚠️ [login] Cuenta creada con Google - debe usar Google Sign In');
      return redirect('/auth/login?error=google_account');
    }
    
    let passwordValid = false;
    let isPlainText = false;

    if (user.password === password.trim()) {
      console.log('✅ [login] Contraseña en texto plano válida');
      passwordValid = true;
      isPlainText = true;
    } else {
      try {
        passwordValid = await bcrypt.compare(password.trim(), user.password);
        console.log('🔐 [login] Validación bcrypt:', passwordValid);
      } catch (bcryptError) {
        console.log('⚠️ [login] bcrypt falló:', bcryptError);
        passwordValid = false;
      }
    }

    if (!passwordValid) {
      console.warn('❌ [login] Contraseña incorrecta');
      return redirect('/auth/login?error=invalid_credentials');
    }

    if (isPlainText) {
      console.log('🔄 [login] Migrando contraseña a hash...');
      await migratePasswordToHash(user.id, password.trim());
    }

    console.log('✅ [login] Contraseña correcta, creando sesión con:', {
      tutorial: user.tutorial || 0,
      tutorialDocumentos: user.tutorial_documentos || 0,
      tutorialTrimestres: user.tutorial_trimestres || 0,
      tutorialActividad: user.tutorial_actividad || 0,
      tutorialIndividual: user.tutorial_individual || 0,
      tutorialIncidencias: user.tutorial_incidencias || 0,
      tutorialProveedores: user.tutorial_proveedores || 0 // ⬅️ NUEVO
    });
    
    await createSession(
      user.id, 
      user.email, 
      user.nombre, 
      user.tutorial || 0,
      user.tutorial_documentos || 0,
      user.tutorial_trimestres || 0,
      user.tutorial_actividad || 0,
      user.tutorial_individual || 0,
      user.tutorial_incidencias || 0,
      user.tutorial_proveedores || 0 // ⬅️ NUEVO
    );
    
  } catch (error) {
    console.error('❌ [login] Error:', error);
    return redirect('/auth/login?error=server_error');
  }

  redirect('/dashboard');
}export async function register(formData: FormData) {
    const nombre = formData.get('name') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    if (!nombre || !email || !password) {
        return redirect('/auth/register?error=missing_fields');
    }

    try {
        const [existingUser] = await db.query<RowDataPacket[]>('SELECT id FROM usuarios WHERE email = ?', [email]);
        if (existingUser.length > 0) {
            return redirect('/auth/register?error=user_exists');
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        console.log('🔐 [register] Contraseña hasheada para nuevo usuario');

        const [result] = await db.query<OkPacket>(
            'INSERT INTO usuarios (nombre, email, password, tutorial, tutorial_documentos, tutorial_trimestres, tutorial_actividad, tutorial_individual, tutorial_incidencias, tutorial_proveedores) VALUES (?, ?, ?, 1, 1, 1, 1, 1, 1, 1)', // ⬅️ MODIFICADO
            [nombre, email, hashedPassword]
        );

        const newUserId = result.insertId;
        
        await createDefaultAIConfig(newUserId);
        
        await createSession(newUserId, email, nombre, 1, 1, 1, 1, 1, 1, 1); // ⬅️ MODIFICADO

    } catch (error) {
        console.error('Registration error:', error);
        return redirect('/auth/register?error=server_error');
    }

    redirect('/dashboard');
}

export async function handleGoogleSignInOnServer(
    firebaseUser: {uid: string, email: string | null, displayName: string | null}
): Promise<{ success: boolean; error?: string }> {
  try {
    const { email, displayName } = firebaseUser;
    if (!email) {
      return { success: false, error: 'El proveedor de Google no proporcionó un email.' };
    }

    const [existingUsers] = await db.query<RowDataPacket[]>(
      'SELECT id, nombre, email, password, tutorial, tutorial_documentos, tutorial_trimestres, tutorial_actividad, tutorial_individual, tutorial_incidencias, tutorial_proveedores FROM usuarios WHERE email = ?', // ⬅️ MODIFICADO
      [email]
    );

    let user: User & { 
      tutorial_documentos?: number; 
      tutorial_trimestres?: number;
      tutorial_actividad?: number;
      tutorial_individual?: number;
      tutorial_incidencias?: number;
      tutorial_proveedores?: number; // ⬅️ NUEVO
    };
    let tutorialValue = 0;
    let tutorialDocumentosValue = 0;
    let tutorialTrimestresValue = 0;
    let tutorialActividadValue = 0;
    let tutorialIndividualValue = 0;
    let tutorialIncidenciasValue = 0;
    let tutorialProveedoresValue = 0; // ⬅️ NUEVO

    if (existingUsers.length > 0) {
      user = existingUsers[0] as User & { 
        tutorial_documentos?: number; 
        tutorial_trimestres?: number;
        tutorial_actividad?: number;
        tutorial_individual?: number;
        tutorial_incidencias?: number;
        tutorial_proveedores?: number; // ⬅️ NUEVO
      };
      tutorialValue = user.tutorial || 0;
      tutorialDocumentosValue = user.tutorial_documentos || 0;
      tutorialTrimestresValue = user.tutorial_trimestres || 0;
      tutorialActividadValue = user.tutorial_actividad || 0;
      tutorialIndividualValue = user.tutorial_individual || 0;
      tutorialIncidenciasValue = user.tutorial_incidencias || 0;
      tutorialProveedoresValue = user.tutorial_proveedores || 0; // ⬅️ NUEVO
      console.log('✅ [handleGoogleSignIn] Usuario existente encontrado:', user.id);
    } else {
      const nombre = displayName || email.split('@')[0] || 'Nuevo Usuario';
      
      const googlePassword = GOOGLE_PASSWORD_MARKER + crypto.randomBytes(32).toString('hex');
      
      console.log('🆕 [handleGoogleSignIn] Creando nuevo usuario de Google');
      
      const [result] = await db.query<OkPacket>(
          'INSERT INTO usuarios (nombre, email, password, tutorial, tutorial_documentos, tutorial_trimestres, tutorial_actividad, tutorial_individual, tutorial_incidencias, tutorial_proveedores) VALUES (?, ?, ?, 1, 1, 1, 1, 1, 1, 1)', // ⬅️ MODIFICADO
          [nombre, email, googlePassword]
      );
      
      user = { 
        id: result.insertId, 
        email, 
        nombre, 
        tutorial: 1,
        tutorial_documentos: 1,
        tutorial_trimestres: 1,
        tutorial_actividad: 1,
        tutorial_individual: 1,
        tutorial_incidencias: 1,
        tutorial_proveedores: 1 // ⬅️ NUEVO
      };
      tutorialValue = 1;
      tutorialDocumentosValue = 1;
      tutorialTrimestresValue = 1;
      tutorialActividadValue = 1;
      tutorialIndividualValue = 1;
      tutorialIncidenciasValue = 1;
      tutorialProveedoresValue = 1; // ⬅️ NUEVO
      
      await createDefaultAIConfig(user.id);
      console.log('✅ [handleGoogleSignIn] Usuario creado con ID:', user.id);
    }

    await createSession(
      user.id, 
      user.email, 
      user.nombre, 
      tutorialValue, 
      tutorialDocumentosValue, 
      tutorialTrimestresValue,
      tutorialActividadValue,
      tutorialIndividualValue,
      tutorialIncidenciasValue,
      tutorialProveedoresValue // ⬅️ NUEVO
    );
    
    return { success: true };

  } catch (error) {
    console.error("❌ [handleGoogleSignIn] Error:", error);
    return { success: false, error: 'Error del servidor al procesar el inicio de sesión con Google.' };
  }
}

export async function completeTutorial() {
  try {
    const session = await getSession();
    
    if (!session?.userId) {
      throw new Error('No hay sesión activa');
    }

    console.log('📝 [completeTutorial] Actualizando tutorial para usuario:', session.userId);

    await db.query(
      'UPDATE usuarios SET tutorial = 0 WHERE id = ?',
      [session.userId]
    );

    console.log('✅ [completeTutorial] Tutorial marcado como completado');

    await createSession(
      session.userId, 
      session.email, 
      session.nombre, 
      0,
      session.tutorialDocumentos || 0,
      session.tutorialTrimestres || 0,
      session.tutorialActividad || 0,
      session.tutorialIndividual || 0,
      session.tutorialIncidencias || 0,
      session.tutorialProveedores || 0 // ⬅️ MANTENER
    );

  } catch (error) {
    console.error('❌ [completeTutorial] Error:', error);
    throw error;
  }
}

export async function completeTutorialDocumentos() {
  try {
    const session = await getSession();
    
    if (!session?.userId) {
      throw new Error('No hay sesión activa');
    }

    console.log('📝 [completeTutorialDocumentos] Actualizando tutorial documentos para usuario:', session.userId);

    await db.query(
      'UPDATE usuarios SET tutorial_documentos = 0 WHERE id = ?',
      [session.userId]
    );

    console.log('✅ [completeTutorialDocumentos] Tutorial documentos marcado como completado');

    await createSession(
      session.userId, 
      session.email, 
      session.nombre, 
      session.tutorial || 0,
      0,
      session.tutorialTrimestres || 0,
      session.tutorialActividad || 0,
      session.tutorialIndividual || 0,
      session.tutorialIncidencias || 0,
      session.tutorialProveedores || 0 // ⬅️ MANTENER
    );

  } catch (error) {
    console.error('❌ [completeTutorialDocumentos] Error:', error);
    throw error;
  }
}

export async function completeTutorialTrimestres() {
  try {
    const session = await getSession();
    
    if (!session?.userId) {
      throw new Error('No hay sesión activa');
    }

    console.log('📝 [completeTutorialTrimestres] Actualizando tutorial trimestres para usuario:', session.userId);

    await db.query(
      'UPDATE usuarios SET tutorial_trimestres = 0 WHERE id = ?',
      [session.userId]
    );

    console.log('✅ [completeTutorialTrimestres] Tutorial trimestres marcado como completado');

    await createSession(
      session.userId, 
      session.email, 
      session.nombre, 
      session.tutorial || 0,
      session.tutorialDocumentos || 0,
      0,
      session.tutorialActividad || 0,
      session.tutorialIndividual || 0,
      session.tutorialIncidencias || 0,
      session.tutorialProveedores || 0 // ⬅️ MANTENER
    );

  } catch (error) {
    console.error('❌ [completeTutorialTrimestres] Error:', error);
    throw error;
  }
}

export async function completeTutorialActividad() {
  try {
    const session = await getSession();
    
    if (!session?.userId) {
      throw new Error('No hay sesión activa');
    }

    console.log('📝 [completeTutorialActividad] Actualizando tutorial actividad para usuario:', session.userId);

    await db.query(
      'UPDATE usuarios SET tutorial_actividad = 0 WHERE id = ?',
      [session.userId]
    );

    console.log('✅ [completeTutorialActividad] Tutorial actividad marcado como completado');

    await createSession(
      session.userId, 
      session.email, 
      session.nombre, 
      session.tutorial || 0,
      session.tutorialDocumentos || 0,
      session.tutorialTrimestres || 0,
      0,
      session.tutorialIndividual || 0,
      session.tutorialIncidencias || 0,
      session.tutorialProveedores || 0 // ⬅️ MANTENER
    );

  } catch (error) {
    console.error('❌ [completeTutorialActividad] Error:', error);
    throw error;
  }
}

export async function completeTutorialIndividual() {
  try {
    const session = await getSession();
    
    if (!session?.userId) {
      throw new Error('No hay sesión activa');
    }

    console.log('📝 [completeTutorialIndividual] Actualizando tutorial individual para usuario:', session.userId);

    await db.query(
      'UPDATE usuarios SET tutorial_individual = 0 WHERE id = ?',
      [session.userId]
    );

    console.log('✅ [completeTutorialIndividual] Tutorial individual marcado como completado');

    await createSession(
      session.userId, 
      session.email, 
      session.nombre, 
      session.tutorial || 0,
      session.tutorialDocumentos || 0,
      session.tutorialTrimestres || 0,
      session.tutorialActividad || 0,
      0,
      session.tutorialIncidencias || 0,
      session.tutorialProveedores || 0 // ⬅️ MANTENER
    );

  } catch (error) {
    console.error('❌ [completeTutorialIndividual] Error:', error);
    throw error;
  }
}

export async function completeTutorialIncidencias() {
  try {
    const session = await getSession();
    
    if (!session?.userId) {
      throw new Error('No hay sesión activa');
    }

    console.log('📝 [completeTutorialIncidencias] Actualizando tutorial incidencias para usuario:', session.userId);

    await db.query(
      'UPDATE usuarios SET tutorial_incidencias = 0 WHERE id = ?',
      [session.userId]
    );

    console.log('✅ [completeTutorialIncidencias] Tutorial incidencias marcado como completado');

    await createSession(
      session.userId, 
      session.email, 
      session.nombre, 
      session.tutorial || 0,
      session.tutorialDocumentos || 0,
      session.tutorialTrimestres || 0,
      session.tutorialActividad || 0,
      session.tutorialIndividual || 0,
      0,
      session.tutorialProveedores || 0 // ⬅️ MANTENER
    );

  } catch (error) {
    console.error('❌ [completeTutorialIncidencias] Error:', error);
    throw error;
  }
}

// ⬅️ NUEVA FUNCIÓN
export async function completeTutorialProveedores() {
  try {
    const session = await getSession();
    
    if (!session?.userId) {
      throw new Error('No hay sesión activa');
    }

    console.log('📝 [completeTutorialProveedores] Actualizando tutorial proveedores para usuario:', session.userId);

    await db.query(
      'UPDATE usuarios SET tutorial_proveedores = 0 WHERE id = ?',
      [session.userId]
    );

    console.log('✅ [completeTutorialProveedores] Tutorial proveedores marcado como completado');

    await createSession(
      session.userId, 
      session.email, 
      session.nombre, 
      session.tutorial || 0,
      session.tutorialDocumentos || 0,
      session.tutorialTrimestres || 0,
      session.tutorialActividad || 0,
      session.tutorialIndividual || 0,
      session.tutorialIncidencias || 0,
      0 // ⬅️ MARCAR PROVEEDORES COMO COMPLETADO
    );

  } catch (error) {
    console.error('❌ [completeTutorialProveedores] Error:', error);
    throw error;
  }
}

export async function logout() {
  console.log('🚪 [logout] Cerrando sesión del servidor');
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  
  redirect('/auth/login?logout=true');
}