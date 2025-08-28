
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
    .setExpirationTime('1d') // 1 day session
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

// Updated to accept a cookie value, making it more testable and decoupled
export async function getSession(cookie?: string): Promise<SessionPayload | null> {
  const sessionCookie = cookie ?? (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;

  return await decrypt(sessionCookie);
}


export async function createSession(userId: number, email: string, nombre: string) {
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    const session = await encrypt({ userId, email, nombre, expires });

    cookies().set(SESSION_COOKIE_NAME, session, {
        expires,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
    });
}

export async function login(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return redirect('/auth/login?error=invalid_credentials');
  }

  try {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM usuarios WHERE email = ? AND password = ?',
      [email, password]
    );
    
    if (rows.length !== 1) {
        return redirect('/auth/login?error=invalid_credentials');
    }

    const user = rows[0] as User;

    await createSession(user.id, user.email, user.nombre);
    
  } catch (error) {
    console.error('Login error:', error);
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
      // User exists, use their data.
      user = existingUsers[0] as User;
    } else {
      // User does not exist, create a new one.
      const nombre = displayName || email.split('@')[0] || 'Nuevo Usuario';
      // We don't store a password for Google-based users.
      const [result] = await db.query<OkPacket>(
          'INSERT INTO usuarios (nombre, email) VALUES (?, ?)',
          [nombre, email]
      );
      user = { id: result.insertId, email, nombre };
    }

    // Create session for the user (existing or new)
    await createSession(user.id, user.email, user.nombre);
    
    return { success: true };

  } catch (error) {
    console.error("Server-side Google sign-in error:", error);
    return { success: false, error: 'Error del servidor al procesar el inicio de sesión con Google.' };
  }
}


export async function logout() {
  cookies().delete(SESSION_COOKIE_NAME);
  redirect('/auth/login');
}
