import { getSession } from '@/services/auth-service';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const session = await getSession();
    
    console.log('🔍 [API-TUTORIAL-TRIMESTRES-GET] Session completa:', session);
    
    if (!session) {
      console.log('❌ [API-TUTORIAL-TRIMESTRES-GET] No hay sesión');
      return NextResponse.json({ tutorial: false }, { status: 401 });
    }
    
    console.log('👤 [API-TUTORIAL-TRIMESTRES-GET] Usuario ID:', session.userId);
    console.log('📊 [API-TUTORIAL-TRIMESTRES-GET] Valor tutorial_trimestres en session:', session.tutorialTrimestres);
    console.log('🔢 [API-TUTORIAL-TRIMESTRES-GET] Tipo de dato:', typeof session.tutorialTrimestres);
    
    // Si tutorial_trimestres es 1 o true, mostrar tutorial
    // Si es 0 o undefined, NO mostrar
    const shouldShow = session.tutorialTrimestres === 1 || session.tutorialTrimestres === true;
    
    console.log('✨ [API-TUTORIAL-TRIMESTRES-GET] shouldShow:', shouldShow);
    
    const response = { 
      tutorial: shouldShow,
      userId: session.userId 
    };
    
    console.log('📤 [API-TUTORIAL-TRIMESTRES-GET] Devolviendo:', response);
    
    return NextResponse.json(response);
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