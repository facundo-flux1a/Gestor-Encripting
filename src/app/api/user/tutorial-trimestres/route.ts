import { getSession } from '@/services/auth-service';
import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { RowDataPacket } from 'mysql2';

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ tutorial: false }, { status: 401 });
    }

    // 🔍 RE-CONSULTA A LA DB PARA EVITAR SESIONES OBSOLETAS
    const [dbUser] = await db.query<RowDataPacket[]>(
      'SELECT tutorial_trimestres FROM usuarios WHERE id = ?',
      [session.userId]
    );

    const tutorialStatus = dbUser[0]?.tutorial_trimestres;
    console.log('📊 [API-TUTORIAL-TRIMESTRES-GET] Valor en DB:', tutorialStatus);

    const shouldShow = tutorialStatus === 1;

    return NextResponse.json({
      tutorial: shouldShow,
      userId: session.userId
    });
  } catch (error) {
    console.error('❌ [API-TUTORIAL-TRIMESTRES-GET] Error:', error);
    return NextResponse.json({ tutorial: false }, { status: 500 });
  }
}

export async function POST() {
  try {
    const session = await getSession();

    console.log('🔍 [API-TUTORIAL-TRIMESTRES-POST] Session:', session);

    if (!session) {
      console.log('❌ [API-TUTORIAL-TRIMESTRES-POST] No hay sesión');
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    console.log('✅ [API-TUTORIAL-TRIMESTRES-POST] Completando tutorial trimestres para usuario:', session.userId);

    // Llamar a la función completeTutorialTrimestres del auth-service
    const { completeTutorialTrimestres } = await import('@/services/auth-service');
    await completeTutorialTrimestres();

    console.log('🎉 [API-TUTORIAL-TRIMESTRES-POST] Tutorial trimestres completado exitosamente');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ [API-TUTORIAL-TRIMESTRES-POST] Error completando tutorial:', error);
    return NextResponse.json({ error: 'Error al completar tutorial' }, { status: 500 });
  }
}