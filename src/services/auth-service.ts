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
    
    const parsedPayload = z.object({
        userId: z.number(),
        email: z.string().email(),
        nombre: z.string(),
        exp: z.number(),
    }).safeParse(payload);
    
    if(!parsedPayload.success) return null;

    return {
        userId: parsedPayload.data.userId,
        email: parsedPayload.data.email,
        nombre: parsedPayload.data.nombre,
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

export async function createSession(userId: number, email: string, nombre: string) {
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const session = await encrypt({ userId, email, nombre, expires });

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, session, {
        expires,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
    });
        console.log('🍪 [createSession] Cookie guardada:', { name: SESSION_COOKIE_NAME, path: '/' });

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
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM usuarios WHERE email = ?',
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
      passwordEnBD: user.password,
      passwordIngresada: password,
      coinciden: user.password === password.trim()
    });
    
    if (user.password !== password.trim()) {
      console.warn('❌ [login] Contraseña incorrecta');
      return redirect('/auth/login?error=invalid_credentials');
    }

    console.log('✅ [login] Contraseña correcta, creando sesión');
    
    await createSession(user.id, user.email, user.nombre);
    
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

        const [result] = await db.query<OkPacket>(
            'INSERT INTO usuarios (nombre, email, password) VALUES (?, ?, ?)',
            [nombre, email, password]
        );

        const newUserId = result.insertId;
        
        // Crear configuración de IA por defecto
        await createDefaultAIConfig(newUserId);
        
        await createSession(newUserId, email, nombre);

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
      'SELECT * FROM usuarios WHERE email = ?',
      [email]
    );

    let user: User;

    if (existingUsers.length > 0) {
      user = existingUsers[0] as User;
    } else {
      const nombre = displayName || email.split('@')[0] || 'Nuevo Usuario';
      const [result] = await db.query<OkPacket>(
          'INSERT INTO usuarios (nombre, email, password) VALUES (?, ?, ?)',
          [nombre, email, null]
      );
      user = { id: result.insertId, email, nombre };
      
      // Crear configuración de IA por defecto para nuevo usuario
      await createDefaultAIConfig(user.id);
    }

    await createSession(user.id, user.email, user.nombre);
    
    return { success: true };

  } catch (error) {
    console.error("Server-side Google sign-in error:", error);
    return { success: false, error: 'Error del servidor al procesar el inicio de sesión con Google.' };
  }
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect('/auth/login');
}