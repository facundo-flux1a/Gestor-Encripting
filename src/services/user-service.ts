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

  try {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT id, nombre, email FROM usuarios WHERE id = ?',
      [session.userId]
    );

    if (rows.length === 0) {
      return null;
    }

    return rows[0] as User;
  } catch (error) {
    console.error("Error fetching current user:", error);
    // In case of a database error, we should not expose details
    // and return null as if the user was not found.
    return null;
  }
}
