// ============================================
// app/api/incidents/analytics/route.ts
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { getIncidentsAnalytics } from '@/services/document-service';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const empresaIdsParam = searchParams.getAll('empresaIds');
        
        const empresaIds = empresaIdsParam.length > 0 
            ? empresaIdsParam.map(id => parseInt(id, 10)).filter(id => !isNaN(id))
            : undefined;

        console.log('📥 [API /incidents/analytics] Request con empresas:', empresaIds);

        const analytics = await getIncidentsAnalytics(empresaIds);

        console.log('📤 [API /incidents/analytics] Respuesta:', analytics);

        return NextResponse.json(analytics);
    } catch (error) {
        console.error('❌ [API /incidents/analytics] Error:', error);
        return NextResponse.json(
            { error: 'Error al obtener analytics de incidencias' },
            { status: 500 }
        );
    }
}