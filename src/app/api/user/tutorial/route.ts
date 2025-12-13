import { getSession } from '@/services/auth-service';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const session = await getSession();
    
    console.log('🔍 [API-TUTORIAL-GET] Session completa:', session);
    
    if (!session) {
      console.log('❌ [API-TUTORIAL-GET] No hay sesión');
      return NextResponse.json({ tutorial: false }, { status: 401 });
    }
    
    console.log('👤 [API-TUTORIAL-GET] Usuario ID:', session.userId);
    console.log('📊 [API-TUTORIAL-GET] Valor tutorial en session:', session.tutorial);
    console.log('🔢 [API-TUTORIAL-GET] Tipo de dato:', typeof session.tutorial);
    
    // ✅ ARREGLO: Convertir correctamente
    // Si tutorial es 1 o true, mostrar tutorial
    // Si tutorial es 0 o undefined, NO mostrar tutorial
    const shouldShow = session.tutorial === 1 || session.tutorial === true;
    
    console.log('✨ [API-TUTORIAL-GET] shouldShow:', shouldShow);
    
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