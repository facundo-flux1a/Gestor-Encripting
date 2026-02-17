import { NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import { completeTutorialIndividual } from '@/services/auth-service';
import db from '@/lib/db';
import { RowDataPacket } from 'mysql2';

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // 🔍 RE-CONSULTA A LA DB PARA EVITAR SESIONES OBSOLETAS
    const [dbUser] = await db.query<RowDataPacket[]>(
      'SELECT tutorial_individual FROM usuarios WHERE id = ?',
      [session.userId]
    );

    const tutorialStatus = dbUser[0]?.tutorial_individual;
    console.log('📊 [API-TUTORIAL-INDIVIDUAL-GET] Valor en DB:', tutorialStatus);

    const shouldShow = tutorialStatus === 1;

    return NextResponse.json({
      tutorial: shouldShow,
      tutorialIndividual: tutorialStatus
    });

  } catch (error) {
    console.error('❌ [GET /api/user/tutorial-individual] Error:', error);
    return NextResponse.json({ error: 'Error al obtener estado del tutorial' }, { status: 500 });
  }
}

export async function POST() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    console.log('✅ [POST /api/user/tutorial-individual] Marcando tutorial como completado');

    await completeTutorialIndividual();

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('❌ [POST /api/user/tutorial-individual] Error:', error);
    return NextResponse.json({ error: 'Error al completar tutorial' }, { status: 500 });
  }
}