import { NextResponse } from 'next/server';
import { getSession, completeTutorialCuentasContables } from '@/services/auth-service';
import db from '@/lib/db';
import { RowDataPacket } from 'mysql2';

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Por defecto 1 (pendiente)
    let tutorialStatus = 1;
    try {
      const [dbUser] = await db.query<RowDataPacket[]>(
        'SELECT tutorial_cuentas_contables FROM usuarios WHERE id = ?',
        [session.userId]
      );
      if (dbUser && dbUser.length > 0 && dbUser[0]?.tutorial_cuentas_contables !== undefined && dbUser[0]?.tutorial_cuentas_contables !== null) {
        tutorialStatus = Number(dbUser[0].tutorial_cuentas_contables);
      }
    } catch (e) {
      console.warn('⚠️ [GET /api/user/tutorial-cuentas-contables] Campo tutorial_cuentas_contables no hallado aún en DB, default a 1');
    }

    const shouldShow = tutorialStatus === 1;

    return NextResponse.json({
      shouldShow,
      tutorial: shouldShow,
      tutorialCuentasContables: tutorialStatus
    });

  } catch (error) {
    console.error('❌ [GET /api/user/tutorial-cuentas-contables] Error:', error);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

export async function POST() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    await completeTutorialCuentasContables();

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('❌ [POST /api/user/tutorial-cuentas-contables] Error:', error);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
