import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSession } from '@/services/auth-service';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export const dynamic = 'force-dynamic';

interface UserPreferences {
  dinamizar_actividad: boolean;
  dinamizar_incidencias: boolean;
  sin_seleccion_mostrar_todo: boolean;
}

// GET - Obtener preferencias del usuario
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT 
        dinamizar_actividad,
        dinamizar_incidencias,
        sin_seleccion_mostrar_todo
       FROM usuarios 
       WHERE id = ?`,
      [session.userId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const preferences: UserPreferences = {
      dinamizar_actividad: Boolean(rows[0].dinamizar_actividad),
      dinamizar_incidencias: Boolean(rows[0].dinamizar_incidencias),
      sin_seleccion_mostrar_todo: Boolean(rows[0].sin_seleccion_mostrar_todo)
    };

    return NextResponse.json(preferences);

  } catch (error) {
    console.error('❌ [API-PREFERENCES-GET] Error:', error);
    return NextResponse.json({ error: 'Error al obtener preferencias' }, { status: 500 });
  }
}

// POST - Actualizar preferencias del usuario
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { dinamizar_actividad, dinamizar_incidencias, sin_seleccion_mostrar_todo } = body;

    // Validar que al menos un campo esté presente
    if (
      dinamizar_actividad === undefined &&
      dinamizar_incidencias === undefined &&
      sin_seleccion_mostrar_todo === undefined
    ) {
      return NextResponse.json({ error: 'No se proporcionaron preferencias para actualizar' }, { status: 400 });
    }

    // Construir query dinámicamente solo con los campos proporcionados
    const updates: string[] = [];
    const params: any[] = [];

    if (dinamizar_actividad !== undefined) {
      updates.push('dinamizar_actividad = ?');
      params.push(Boolean(dinamizar_actividad));
    }
    if (dinamizar_incidencias !== undefined) {
      updates.push('dinamizar_incidencias = ?');
      params.push(Boolean(dinamizar_incidencias));
    }
    if (sin_seleccion_mostrar_todo !== undefined) {
      updates.push('sin_seleccion_mostrar_todo = ?');
      params.push(Boolean(sin_seleccion_mostrar_todo));
    }

    params.push(session.userId);

    const [result] = await db.query<ResultSetHeader>(
      `UPDATE usuarios SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      updated: {
        dinamizar_actividad,
        dinamizar_incidencias,
        sin_seleccion_mostrar_todo
      }
    });

  } catch (error) {
    console.error('❌ [API-PREFERENCES-POST] Error:', error);
    return NextResponse.json({ error: 'Error al actualizar preferencias' }, { status: 500 });
  }
}
