import { NextRequest, NextResponse } from 'next/server';
import { getDocuments } from '@/services/document-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    console.log('🚀 [API-DOCUMENTS] Iniciando...');
    
    const { searchParams } = new URL(req.url);
    const companyIdParams = searchParams.getAll('companyId');

    console.log('📥 [API-DOCUMENTS] companyIdParams recibidos:', companyIdParams);

    if (!companyIdParams || companyIdParams.length === 0) {
      console.warn('⚠️ [API-DOCUMENTS] No se proporcionaron IDs');
      return NextResponse.json([]);
    }

    const empresaIds = companyIdParams
      .map(id => parseInt(id, 10))
      .filter(id => !isNaN(id));
    
    console.log('🔢 [API-DOCUMENTS] IDs parseados:', empresaIds);

    if (empresaIds.length === 0) {
      console.warn('⚠️ [API-DOCUMENTS] IDs inválidos');
      return NextResponse.json([]);
    }

    console.log('🔍 [API-DOCUMENTS] Llamando getDocuments...');
    
    const documents = await getDocuments(empresaIds);
    
    console.log('✅ [API-DOCUMENTS] Documentos obtenidos:', documents.length);
    
    return NextResponse.json(documents);
    
  } catch (error) {
    console.error('❌ [API-DOCUMENTS] Error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Error desconocido' 
    }, { status: 500 });
  }
}