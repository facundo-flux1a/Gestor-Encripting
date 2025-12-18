import { getSession } from '@/services/auth-service';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const session = await getSession();
    
    console.log('🔍 [API-TUTORIAL-DOCUMENTOS-GET] Session completa:', session);
    
    if (!session) {
      console.log('❌ [API-TUTORIAL-DOCUMENTOS-GET] No hay sesión');
      return NextResponse.json({ tutorial: false }, { status: 401 });
    }
    
    console.log('👤 [API-TUTORIAL-DOCUMENTOS-GET] Usuario ID:', session.userId);
    console.log('📊 [API-TUTORIAL-DOCUMENTOS-GET] Valor tutorial_documentos en session:', session.tutorialDocumentos);
    console.log('🔢 [API-TUTORIAL-DOCUMENTOS-GET] Tipo de dato:', typeof session.tutorialDocumentos);
    
    // Si tutorial_documentos es 1 o true, mostrar tutorial
    // Si es 0 o undefined, NO mostrar
    const shouldShow = session.tutorialDocumentos === 1 || session.tutorialDocumentos === true;
    
    console.log('✨ [API-TUTORIAL-DOCUMENTOS-GET] shouldShow:', shouldShow);
    
    const response = { 
      tutorial: shouldShow,
      userId: session.userId 
    };
    
    console.log('📤 [API-TUTORIAL-DOCUMENTOS-GET] Devolviendo:', response);
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('❌ [API-TUTORIAL-DOCUMENTOS-GET] Error:', error);
    return NextResponse.json({ tutorial: false }, { status: 500 });
  }
}

export async function POST() {
  try {
    const session = await getSession();
    
    console.log('🔍 [API-TUTORIAL-DOCUMENTOS-POST] Session:', session);
    
    if (!session) {
      console.log('❌ [API-TUTORIAL-DOCUMENTOS-POST] No hay sesión');
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    
    console.log('✅ [API-TUTORIAL-DOCUMENTOS-POST] Completando tutorial documentos para usuario:', session.userId);
    
    // Llamar a la función completeTutorialDocumentos del auth-service
    const { completeTutorialDocumentos } = await import('@/services/auth-service');
    await completeTutorialDocumentos();
    
    console.log('🎉 [API-TUTORIAL-DOCUMENTOS-POST] Tutorial documentos completado exitosamente');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ [API-TUTORIAL-DOCUMENTOS-POST] Error completando tutorial:', error);
    return NextResponse.json({ error: 'Error al completar tutorial' }, { status: 500 });
  }
}