import { NextResponse } from 'next/server';
import { getSession, completeTutorialComprobantes } from '@/services/auth-service';
import db from '@/lib/db';
import { RowDataPacket } from 'mysql2';

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Por defecto 1 (pendiente de ver tutorial)
    let tutorialStatus = 1;
    try {
      const [dbUser] = await db.query<RowDataPacket[]>(
        'SELECT tutorial_comprobantes FROM usuarios WHERE id = ?',
        [session.userId]
      );
      if (dbUser && dbUser.length > 0 && dbUser[0]?.tutorial_comprobantes !== undefined && dbUser[0]?.tutorial_comprobantes !== null) {
        tutorialStatus = Number(dbUser[0].tutorial_comprobantes);
      }
    } catch (e) {
      console.warn('⚠️ [GET /api/user/tutorial-comprobantes] Campo tutorial_comprobantes no hallado aún en DB, default a 1');
    }

    const shouldShow = tutorialStatus === 1;

    return NextResponse.json({
      shouldShow,
      tutorial: shouldShow,
      tutorialComprobantes: tutorialStatus
    });

  } catch (error) {
    console.error('❌ [GET /api/user/tutorial-comprobantes] Error:', error);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

export async function POST() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    await completeTutorialComprobantes();

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('❌ [POST /api/user/tutorial-comprobantes] Error:', error);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
