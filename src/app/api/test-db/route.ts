import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/user-service';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    console.log('🧪 [TEST] Iniciando test de BD...');
    
    // Test 1: Usuario actual
    const user = await getCurrentUser();
    console.log('👤 [TEST] Usuario:', user);
    
    if (!user) {
      return NextResponse.json({ 
        error: 'No hay usuario autenticado',
        user: null 
      });
    }

    // Test 2: Empresas del usuario
    console.log('🏢 [TEST] Buscando empresas...');
    const [empresas] = await db.query(
      'DESCRIBE empresas'
    );
    console.log('📋 [TEST] Estructura tabla empresas:', empresas);

    const [empresasData] = await db.query(
      'SELECT * FROM empresas WHERE usuario_id = ?',
      [user.id]
    );
    console.log('🏢 [TEST] Empresas del usuario:', empresasData);

    // Test 3: Documentos
    const [documentos] = await db.query(
      'SELECT COUNT(*) as total FROM documentos'
    );
    console.log('📄 [TEST] Total documentos:', documentos);

    const [docsConEmpresa] = await db.query(
      'SELECT COUNT(*) as total FROM documentos WHERE id_de_empresa IS NOT NULL'
    );
    console.log('📄 [TEST] Documentos con empresa:', docsConEmpresa);

    return NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email },
      estructuraEmpresas: empresas,
      empresasDelUsuario: empresasData,
      totalDocumentos: documentos,
      documentosConEmpresa: docsConEmpresa
    });

  } catch (error) {
    console.error('❌ [TEST] Error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Error desconocido',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}