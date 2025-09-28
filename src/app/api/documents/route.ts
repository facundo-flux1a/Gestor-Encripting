import { NextRequest, NextResponse } from 'next/server';
import { getDocuments } from '@/services/document-service'; 

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const companyIdParam = searchParams.get('companyId'); 

    console.log('🚀 [API-DOCUMENTS] Solicitud recibida con companyId:', companyIdParam);

    const empresaId = companyIdParam ? parseInt(companyIdParam, 10) : undefined;
    
    if (companyIdParam && isNaN(empresaId as number)) {
        console.warn('⚠️ [API-DOCUMENTS] ID de empresa inválido:', companyIdParam);
        return NextResponse.json([]); 
    }

    console.log('🔍 [API-DOCUMENTS] Llamando getDocuments con empresaId:', empresaId);
    
    const documents = await getDocuments(empresaId);
    
    console.log('📄 [API-DOCUMENTS] getDocuments retornó:', documents.length, 'documentos');
    if (documents.length > 0) {
      console.log('📄 [API-DOCUMENTS] Primer documento:', documents[0]);
    }
    
    return NextResponse.json(documents);
    
  } catch (error) {
    console.error('❌ [API-DOCUMENTS] Error fatal:', error); 
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}