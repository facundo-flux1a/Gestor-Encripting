
'use server';

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { SessionPayload, User } from '@/lib/types';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

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


export async function login(formData: FormData) {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    if (!email || !password) {
        redirect('/auth/login?error=InvalidCredentials');
    }

    try {
        const [rows] = await db.query<RowDataPacket[]>(
            'SELECT * FROM usuarios WHERE email = ? AND activo = 1',
            [email]
        );

        if (rows.length === 0) {
            console.log('User not found or not active');
            redirect('/auth/login?error=InvalidCredentials');
            return;
        }

        const user = rows[0] as User;

        // !! SECURITY WARNING !!
        // This is comparing plain text passwords. In a real production environment,
        // you MUST hash passwords during registration and compare the hash here.
        // Example using a library like bcrypt: const passwordsMatch = await bcrypt.compare(password, user.password);
        const passwordsMatch = password === user.password;

        if (passwordsMatch) {
            const userPayload: SessionPayload = {
                userId: user.id.toString(),
                username: user.nombre,
                // In a real app, role should probably come from the database
                role: 'administrator' 
            };

            const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
            const session = await encrypt({ user: userPayload, expires });

            cookies().set('session', session, { expires, httpOnly: true });

            redirect('/dashboard');
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
  redirect('/auth/login');
}

export async function getSession(): Promise<SessionPayload | null> {
  const sessionCookie = cookies().get('session')?.value;
  if (!sessionCookie) return null;
  const decrypted = await decrypt(sessionCookie);
  if (!decrypted?.user) return null;
  return decrypted.user;
}
