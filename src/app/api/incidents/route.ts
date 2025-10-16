// ============================================
// app/api/incidents/route.ts
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { getIncidents } from '@/services/document-service';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const empresaIdsParam = searchParams.getAll('empresaIds');
        
        const empresaIds = empresaIdsParam.length > 0 
            ? empresaIdsParam.map(id => parseInt(id, 10)).filter(id => !isNaN(id))
            : undefined;

        console.log('📥 [API /incidents] Request con empresas:', empresaIds);

        const incidents = await getIncidents(empresaIds);

        console.log('📤 [API /incidents] Respuesta:', incidents.length, 'incidencias');

        return NextResponse.json(incidents);
    } catch (error) {
        console.error('❌ [API /incidents] Error:', error);
        return NextResponse.json(
            { error: 'Error al obtener incidencias' },
            { status: 500 }
        );
    }
}

