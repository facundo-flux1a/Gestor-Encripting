import { getSession } from '@/services/auth-service';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const session = await getSession();
    
    console.log('🔍 [API-TUTORIAL-ACTIVIDAD-GET] Session completa:', session);
    
    if (!session) {
      console.log('❌ [API-TUTORIAL-ACTIVIDAD-GET] No hay sesión');
      return NextResponse.json({ tutorial: false }, { status: 401 });
    }
    
    console.log('👤 [API-TUTORIAL-ACTIVIDAD-GET] Usuario ID:', session.userId);
    console.log('📊 [API-TUTORIAL-ACTIVIDAD-GET] Valor tutorial_actividad en session:', session.tutorialActividad);
    console.log('🔢 [API-TUTORIAL-ACTIVIDAD-GET] Tipo de dato:', typeof session.tutorialActividad);
    
    // Si tutorial_actividad es 1 o true, mostrar tutorial
    // Si es 0 o undefined, NO mostrar
    const shouldShow = session.tutorialActividad === 1 || session.tutorialActividad === true;
    
    console.log('✨ [API-TUTORIAL-ACTIVIDAD-GET] shouldShow:', shouldShow);
    
    const response = { 
      tutorial: shouldShow,
      userId: session.userId 
    };
    
    console.log('📤 [API-TUTORIAL-ACTIVIDAD-GET] Devolviendo:', response);
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('❌ [API-TUTORIAL-ACTIVIDAD-GET] Error:', error);
    return NextResponse.json({ tutorial: false }, { status: 500 });
  }
}

export async function POST() {
  try {
    const session = await getSession();
    
    console.log('🔍 [API-TUTORIAL-ACTIVIDAD-POST] Session:', session);
    
    if (!session) {
      console.log('❌ [API-TUTORIAL-ACTIVIDAD-POST] No hay sesión');
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    
    console.log('✅ [API-TUTORIAL-ACTIVIDAD-POST] Completando tutorial actividad para usuario:', session.userId);
    
    // Llamar a la función completeTutorialActividad del auth-service
    const { completeTutorialActividad } = await import('@/services/auth-service');
    await completeTutorialActividad();
    
    console.log('🎉 [API-TUTORIAL-ACTIVIDAD-POST] Tutorial actividad completado exitosamente');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ [API-TUTORIAL-ACTIVIDAD-POST] Error completando tutorial:', error);
    return NextResponse.json({ error: 'Error al completar tutorial' }, { status: 500 });
  }
}