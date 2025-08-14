
'use server';

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { SessionPayload } from '@/lib/types';

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
    const email = formData.get('email');
    const password = formData.get('password');

    // For now, using hardcoded credentials as requested
    if (email === 'admin@example.com' && password === 'admin') {
        const userPayload: SessionPayload = {
            userId: '1',
            username: 'Admin User',
            role: 'administrator'
        };

        // Create the session
        const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        const session = await encrypt({ user: userPayload, expires });

        // Save the session in a cookie
        cookies().set('session', session, { expires, httpOnly: true });

        // Redirect to dashboard
        redirect('/dashboard');
    } else {
       // In a real app, you would handle the error, maybe redirect back with an error message
       console.log('Invalid credentials');
       redirect('/auth/login?error=InvalidCredentials');
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
