'use server';

import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import db from '@/lib/db';
import type { RowDataPacket, OkPacket } from 'mysql2';
import type { User, SessionPayload } from '@/lib/types';
import { redirect } from 'next/navigation';
 
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
    
    // ✅ MODIFICADO: Agregado campo tutorial al schema
    const parsedPayload = z.object({
        userId: z.number(),
        email: z.string().email(),
        nombre: z.string(),
        tutorial: z.number().optional(), // ⬅️ NUEVO CAMPO
        exp: z.number(),
    }).safeParse(payload);
    
    if(!parsedPayload.success) return null;

    return {
        userId: parsedPayload.data.userId,
        email: parsedPayload.data.email,
        nombre: parsedPayload.data.nombre,
        tutorial: parsedPayload.data.tutorial, // ⬅️ NUEVO CAMPO
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

// ✅ MODIFICADO: Agregado parámetro tutorial
export async function createSession(userId: number, email: string, nombre: string, tutorial: number = 0) {
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const session = await encrypt({ userId, email, nombre, tutorial, expires }); // ⬅️ Incluir tutorial

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, session, {
        expires,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
    });
    console.log('🍪 [createSession] Cookie guardada:', { name: SESSION_COOKIE_NAME, path: '/', tutorial });
}

/**
 * Crea la configuración de IA por defecto para un nuevo usuario
 */
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
    // No fallar el registro si esto falla
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
    // ✅ MODIFICADO: Agregado campo tutorial al SELECT
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT id, nombre, email, password, tutorial FROM usuarios WHERE email = ?',
      [email.trim()]
    );
    
    console.log('📊 [login] Usuarios encontrados con ese email:', rows.length);
    
    if (rows.length === 0) {
      console.warn('⚠️ [login] No existe usuario con email:', email.trim());
      return redirect('/auth/login?error=invalid_credentials');
    }

    const user = rows[0] as User;
    
    console.log('👤 [login] Usuario encontrado:', {
      id: user.id,
      email: user.email,
      tutorial: user.tutorial, // ⬅️ Log del tutorial
      passwordEnBD: user.password,
      passwordIngresada: password,
      coinciden: user.password === password.trim()
    });
    
    if (user.password !== password.trim()) {
      console.warn('❌ [login] Contraseña incorrecta');
      return redirect('/auth/login?error=invalid_credentials');
    }

    console.log('✅ [login] Contraseña correcta, creando sesión con tutorial:', user.tutorial);
    
    // ✅ MODIFICADO: Pasar el campo tutorial
    await createSession(user.id, user.email, user.nombre, user.tutorial || 0);
    
  } catch (error) {
    console.error('❌ [login] Error:', error);
    return redirect('/auth/login?error=server_error');
  }

  redirect('/dashboard');
}

export async function register(formData: FormData) {
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

        // ✅ MODIFICADO: Asegurar que tutorial se inicializa en 1 para nuevos usuarios
        const [result] = await db.query<OkPacket>(
            'INSERT INTO usuarios (nombre, email, password, tutorial) VALUES (?, ?, ?, 1)',
            [nombre, email, password]
        );

        const newUserId = result.insertId;
        
        // Crear configuración de IA por defecto
        await createDefaultAIConfig(newUserId);
        
        // ✅ MODIFICADO: Nuevos usuarios tienen tutorial = 1
        await createSession(newUserId, email, nombre, 1);

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

    // ✅ MODIFICADO: Traer campo tutorial
    const [existingUsers] = await db.query<RowDataPacket[]>(
      'SELECT id, nombre, email, tutorial FROM usuarios WHERE email = ?',
      [email]
    );

    let user: User;
    let tutorialValue = 0;

    if (existingUsers.length > 0) {
      user = existingUsers[0] as User;
      tutorialValue = user.tutorial || 0;
    } else {
      const nombre = displayName || email.split('@')[0] || 'Nuevo Usuario';
      // ✅ MODIFICADO: Nuevos usuarios de Google también tienen tutorial = 1
      const [result] = await db.query<OkPacket>(
          'INSERT INTO usuarios (nombre, email, password, tutorial) VALUES (?, ?, ?, 1)',
          [nombre, email, null]
      );
      user = { id: result.insertId, email, nombre, tutorial: 1 };
      tutorialValue = 1;
      
      // Crear configuración de IA por defecto para nuevo usuario
      await createDefaultAIConfig(user.id);
    }

    // ✅ MODIFICADO: Pasar tutorial a la sesión
    await createSession(user.id, user.email, user.nombre, tutorialValue);
    
    return { success: true };

  } catch (error) {
    console.error("Server-side Google sign-in error:", error);
    return { success: false, error: 'Error del servidor al procesar el inicio de sesión con Google.' };
  }
}

/**
 * Marca el tutorial como completado para el usuario actual
 */
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

    // Recrear la sesión con tutorial = 0
    await createSession(session.userId, session.email, session.nombre, 0);

  } catch (error) {
    console.error('❌ [completeTutorial] Error:', error);
    throw error;
  }
}

/**
 * Cierra sesión y retorna información para que el cliente limpie el localStorage
 */
export async function logout() {
  console.log('🚪 [logout] Cerrando sesión del servidor');
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  
  // Redirigir con query param para que el cliente sepa que debe limpiar storage
  redirect('/auth/login?logout=true');
}