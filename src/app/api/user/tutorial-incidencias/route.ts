import { NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import { completeTutorialIncidencias } from '@/services/auth-service';

export async function GET() {
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    console.log('📊 [GET /api/user/tutorial-incidencias] Session:', session);
    
    // tutorialIncidencias: 1 = pendiente, 0 = completado
    const shouldShow = session.tutorialIncidencias === 1;
    
    console.log('📊 [GET /api/user/tutorial-incidencias] shouldShow:', shouldShow);
    
    return NextResponse.json({ 
      tutorial: shouldShow,
      tutorialIncidencias: session.tutorialIncidencias 
    });
    
  } catch (error) {
    console.error('❌ [GET /api/user/tutorial-incidencias] Error:', error);
    return NextResponse.json({ error: 'Error al obtener estado del tutorial' }, { status: 500 });
  }
}

export async function POST() {
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    console.log('✅ [POST /api/user/tutorial-incidencias] Marcando tutorial como completado');
    
    await completeTutorialIncidencias();
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('❌ [POST /api/user/tutorial-incidencias] Error:', error);
    return NextResponse.json({ error: 'Error al completar tutorial' }, { status: 500 });
  }
}