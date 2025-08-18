

'use server';

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { SessionPayload, User } from '@/lib/types';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '@/lib/firebase';

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

export async function loginWithGoogle() {
    'use client';
    try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        if (user) {
            const formData = new FormData();
            formData.append('email', user.email!);
            formData.append('displayName', user.displayName || 'Anonymous');
            formData.append('isGoogle', 'true');
            await login(formData);
        }
    } catch (error: any) {
        console.error('Google Sign-In error:', error);
        // Let the client handle the error display
        throw new Error(error.message || "Failed to login with Google");
    }
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
                // If user doesn't exist, create a new one for Google login
                const [insertResult] = await db.query<any>('INSERT INTO usuarios (nombre, email, activo, password) VALUES (?, ?, ?, ?)', [displayName, email, 1, 'google_user']);
                const [newUserRows] = await db.query<RowDataPacket[]>('SELECT * FROM usuarios WHERE id = ?', [insertResult.insertId]);
                user = newUserRows[0] as User;
            }
        }

        if (!user) {
             console.log('User not found or not active');
             redirect('/auth/login?error=InvalidCredentials');
             return;
        }

        // In a real app, you would use a library like bcrypt to compare hashes.
        // For this prototype, we'll simulate a secure check for the "admin" user.
        const passwordsMatch = isGoogle || (user.password === 'admin' && password === 'admin');

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
  await auth.signOut().catch(console.error); // Catch potential errors on signout
  redirect('/auth/login');
}

export async function getSession(): Promise<SessionPayload | null> {
  const sessionCookie = cookies().get('session')?.value;
  if (!sessionCookie) return null;
  const decrypted = await decrypt(sessionCookie);
  if (!decrypted?.user) return null;
  return decrypted.user;
}
