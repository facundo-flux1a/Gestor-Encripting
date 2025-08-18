

'use server';

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { SessionPayload, User } from '@/lib/types';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';
import { comparePassword } from './password-service';

const secretKey = process.env.SESSION_SECRET || 'default_secret_key_for_development';
const key = new TextEncoder().encode(secretKey);

export async function encrypt(payload: any) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h') // Token expires in 1 hour
    .sign(key);
}

export async function decrypt(input: string): Promise<any> {
    try {
        const { payload } = await jwtVerify(input, key, {
            algorithms: ['HS256'],
        });
        return payload;
    } catch (error) {
        // This will be caught for expired tokens or invalid signatures
        console.log('Failed to verify session:', error);
        return null;
    }
}

async function createSession(userPayload: SessionPayload) {
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    const session = await encrypt({ user: userPayload, expires });
    cookies().set('session', session, { expires, httpOnly: true });
    redirect('/dashboard');
}

export async function login(formData: FormData) {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const isGoogle = formData.get('isGoogle') === 'true';
    const displayName = formData.get('displayName') as string;

    if (!email || (!password && !isGoogle)) {
        redirect('/auth/login?error=InvalidCredentials');
    }

    try {
        const [rows] = await db.query<RowDataPacket[]>(
            'SELECT * FROM usuarios WHERE email = ? AND activo = 1',
            [email]
        );

        let user: User | null = rows.length > 0 ? (rows[0] as User) : null;
        
        if (isGoogle) {
            if (!user) {
                // For Google Sign-In, we create a user without a password hash.
                // It's important they can't log in via email/password.
                const [insertResult] = await db.query<any>('INSERT INTO usuarios (nombre, email, activo, password) VALUES (?, ?, ?, ?)', [displayName, email, 1, 'google_sso_user']);
                const [newUserRows] = await db.query<RowDataPacket[]>('SELECT * FROM usuarios WHERE id = ?', [insertResult.insertId]);
                user = newUserRows[0] as User;
            }
        }

        if (!user) {
             console.log('User not found or not active');
             redirect('/auth/login?error=InvalidCredentials');
             return;
        }

        const passwordsMatch = isGoogle || await comparePassword(password, user.password);

        if (passwordsMatch) {
            const userPayload: SessionPayload = {
                userId: user.id.toString(),
                username: user.nombre,
                role: 'administrator' 
            };
            await createSession(userPayload);
        } else {
            console.log('Invalid credentials');
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
  // The client-side part of logout (Firebase) should be handled on the client
  redirect('/auth/login');
}


export async function getSession(): Promise<SessionPayload | null> {
  const sessionCookie = cookies().get('session')?.value;
  if (!sessionCookie) return null;
  const decrypted = await decrypt(sessionCookie);
  if (!decrypted?.user) return null;
  return decrypted.user;
}
