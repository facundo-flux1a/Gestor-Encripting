import { NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import { completeTutorialProveedores } from '@/services/auth-service';

export async function GET() {
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const shouldShow = session.tutorialProveedores === 1;
    
    return NextResponse.json({ 
      shouldShow,
      tutorialProveedores: session.tutorialProveedores 
    });

  } catch (error) {
    console.error('❌ [GET /api/user/tutorial-proveedores] Error:', error);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

export async function POST() {
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    await completeTutorialProveedores();
    
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('❌ [POST /api/user/tutorial-proveedores] Error:', error);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}