import { NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import { completeTutorialIndividual } from '@/services/auth-service';

export async function GET() {
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    console.log('📊 [GET /api/user/tutorial-individual] Session:', session);
    
    // tutorialIndividual: 1 = pendiente, 0 = completado
    const shouldShow = session.tutorialIndividual === 1;
    
    console.log('📊 [GET /api/user/tutorial-individual] shouldShow:', shouldShow);
    
    return NextResponse.json({ 
      tutorial: shouldShow,
      tutorialIndividual: session.tutorialIndividual 
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