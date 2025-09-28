
'use server';

import db from '@/lib/db';
import type { User } from '@/lib/types';
import { getSession } from './auth-service';
import type { RowDataPacket } from 'mysql2';

/**
 * Retrieves the full user object for the currently authenticated user.
 * @returns A promise that resolves to the User object or null if not found or not authenticated.
 */
export async function getCurrentUser(): Promise<User | null> {
  const session = await getSession();
  
  if (!session?.userId) {
    return null;
  }

  // The session now contains all the necessary user data, no need to query again.
  return {
    id: session.userId,
    nombre: session.nombre,
    email: session.email,
  };
}
