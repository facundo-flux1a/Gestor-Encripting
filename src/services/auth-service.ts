
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { SessionPayload, User } from '@/lib/types';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';
import { SignJWT, jwtVerify } from 'jose';
import type { JWTPayload } from 'jose';

const secretKey = process.env.SESSION_SECRET || 'default_secret_key_for_development';
const key = new TextEncoder().encode(secretKey);

export interface SessionJWTPayload extends JWTPayload {
    user: any;
    expires: Date;
}

export async function encrypt(payload: SessionJWTPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h') // Token expires in 1 hour
    .sign(key);
}

export async function decrypt(input: string): Promise<SessionJWTPayload | null> {
    try {
        const { payload } = await jwtVerify(input, key, {
            algorithms: ['HS256'],
        });
        return payload as SessionJWTPayload;
    } catch (error) {
        // This will be caught for expired tokens or invalid signatures
        console.log('Failed to verify session:', error);
        return null;
    }
}


async function createSession(userPayload: SessionPayload) {
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    const sessionPayload: SessionJWTPayload = { user: userPayload, expires };
    const session = await encrypt(sessionPayload);
    cookies().set('session', session, { expires, httpOnly: true });
    redirect('/dashboard');
}

export async function login(formData: FormData) {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    if (!email || !password) {
        redirect('/auth/login?error=InvalidCredentials');
    }

    try {
        const [rows] = await db.query<RowDataPacket[]>(
            'SELECT * FROM usuarios WHERE email = ? AND password = ? AND activo = 1',
            [email, password]
        );

        let user: User | null = rows.length === 1 ? (rows[0] as User) : null;

        if (user) {
            const userPayload: SessionPayload = {
                userId: user.id.toString(),
                username: user.nombre,
                role: 'administrator' 
            };
            await createSession(userPayload);
        } else {
            console.log('Invalid credentials for email:', email);
            redirect('/auth/login?error=InvalidCredentials');
        }
    } catch (error) {
        console.error('Login error:', error);
        redirect('/auth/login?error=ServerError');
    }
}

export async function logout() {
  // Destroy the session
  cookies().set('session', '', { expires: new Date(0) });
  redirect('/auth/login');
}


export async function getSession(): Promise<SessionPayload | null> {
  const sessionCookie = cookies().get('session')?.value;
  if (!sessionCookie) return null;
  const decrypted = await decrypt(sessionCookie);
  if (!decrypted?.user) return null;
  return decrypted.user;
}

