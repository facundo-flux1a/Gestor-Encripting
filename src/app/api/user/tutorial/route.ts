import { getSession } from '@/services/auth-service';
import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { RowDataPacket } from 'mysql2';

export async function GET() {
  try {
    const session = await getSession();

    console.log('🔍 [API-TUTORIAL-GET] Session completa:', session);

    if (!session) {
      console.log('❌ [API-TUTORIAL-GET] No hay sesión');
      return NextResponse.json({ tutorial: false }, { status: 401 });
    }

    // 🔍 RE-CONSULTA A LA DB PARA EVITAR SESIONES OBSOLETAS
    const [dbUser] = await db.query<RowDataPacket[]>(
      'SELECT tutorial FROM usuarios WHERE id = ?',
      [session.userId]
    );

    const tutorialStatus = dbUser[0]?.tutorial;
    console.log('📊 [API-TUTORIAL-GET] Valor en DB:', tutorialStatus);

    const shouldShow = tutorialStatus === 1;

    console.log('✨ [API-TUTORIAL-GET] shouldShow final:', shouldShow);

    const response = {
      tutorial: shouldShow,
      userId: session.userId
    };

    console.log('📤 [API-TUTORIAL-GET] Devolviendo:', response);

    return NextResponse.json(response);
  } catch (error) {
    console.error('❌ [API-TUTORIAL-GET] Error:', error);
    return NextResponse.json({ tutorial: false }, { status: 500 });
  }
}

export async function POST() {
  try {
    const session = await getSession();

    console.log('🔍 [API-TUTORIAL-POST] Session:', session);

    if (!session) {
      console.log('❌ [API-TUTORIAL-POST] No hay sesión');
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    console.log('✅ [API-TUTORIAL-POST] Completando tutorial para usuario:', session.userId);

    // Llamar a la función completeTutorial del auth-service
    const { completeTutorial } = await import('@/services/auth-service');
    await completeTutorial();

    console.log('🎉 [API-TUTORIAL-POST] Tutorial completado exitosamente');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ [API-TUTORIAL-POST] Error completando tutorial:', error);
    return NextResponse.json({ error: 'Error al completar tutorial' }, { status: 500 });
  }
}