import { NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import { completeTutorialProveedores } from '@/services/auth-service';
import db from '@/lib/db';
import { RowDataPacket } from 'mysql2';

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // 🔍 RE-CONSULTA A LA DB PARA EVITAR SESIONES OBSOLETAS
    const [dbUser] = await db.query<RowDataPacket[]>(
      'SELECT tutorial_proveedores FROM usuarios WHERE id = ?',
      [session.userId]
    );

    const tutorialStatus = dbUser[0]?.tutorial_proveedores;
    console.log('📊 [API-TUTORIAL-PROVEEDORES-GET] Valor en DB:', tutorialStatus);

    const shouldShow = tutorialStatus === 1;

    return NextResponse.json({
      shouldShow,
      tutorial: shouldShow,
      tutorialProveedores: tutorialStatus
    });

  } catch (error) {
    console.error('❌ [GET /api/user/tutorial-proveedores] Error:', error);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

export async function POST() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    await completeTutorialProveedores();

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('❌ [POST /api/user/tutorial-proveedores] Error:', error);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}