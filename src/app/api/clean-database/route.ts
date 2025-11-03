import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import connection from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    
    if (!session || !session.userId) {
      console.warn('[CLEAN DB] ❌ Intento sin autenticación');
      return NextResponse.json(
        { error: 'No tienes permisos para realizar esta acción' },
        { status: 401 }
      );
    }

    const userId = session.userId;
    const userEmail = session.email;

    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT id, email, has_permits FROM erp49.usuarios WHERE id = ?`,
      [userId]
    );

    if (rows.length === 0) {
      console.warn(`[CLEAN DB] ❌ Usuario ${userId} no encontrado en la BD`);
      return NextResponse.json(
        { error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    const user = rows[0];

    if (user.id !== 5 || !user.has_permits) {
      console.warn(
        `[CLEAN DB] ❌ Usuario ${userId} (${userEmail}) intentó limpiar la BD sin permisos\n` +
        `   - ID del usuario: ${user.id} (requiere: 5)\n` +
        `   - has_permits: ${user.has_permits} (requiere: 1)`
      );
      return NextResponse.json(
        { error: 'No tienes permisos para realizar esta acción' },
        { status: 403 }
      );
    }

    console.log(`[CLEAN DB] ✅ Usuario ${userId} (${userEmail}) ejecutando limpieza de BD...`);
    
    const webhookResponse = await fetch(
      'https://agent.flux1a.com.ar/webhook/b6eec5d7-5509-4c65-85b9-80ff5d183817',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'clean_database',
          userId: userId,
          userEmail: userEmail,
          timestamp: new Date().toISOString(),
        }),
      }
    );

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      console.error(`[CLEAN DB] ❌ Error del webhook: ${webhookResponse.status} - ${errorText}`);
      throw new Error(`Webhook error: ${webhookResponse.status}`);
    }

    const webhookResult = await webhookResponse.json();

    console.log(`[CLEAN DB] ✅ Base de datos limpiada exitosamente por usuario ${userId} (${userEmail})`);

    return NextResponse.json({
      success: true,
      message: 'Base de datos limpiada correctamente',
      webhookResult,
    });

  } catch (error) {
    console.error('[CLEAN DB] ❌ Error:', error);
    return NextResponse.json(
      { 
        error: 'Error al limpiar la base de datos',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}