import { NextRequest, NextResponse } from 'next/server';
import { getUniqueDocumentTypes } from '@/services/document-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const empresaIdsParam = searchParams.get('empresaIds');
        const añoParam = searchParams.get('año');
        const trimestreParam = searchParams.get('trimestre');

        let empresaIds: number[] | undefined;
        if (empresaIdsParam) {
            try {
                empresaIds = JSON.parse(empresaIdsParam);
            } catch {
                empresaIds = undefined;
            }
        }

        const año = añoParam ? parseInt(añoParam, 10) : undefined;
        const trimestre = trimestreParam ? parseInt(trimestreParam, 10) : undefined;

        const tipos = await getUniqueDocumentTypes(empresaIds, año, trimestre);

        return NextResponse.json({ tipos });
    } catch (error) {
        console.error('❌ Error en /api/filters/tipos:', error);
        return NextResponse.json(
            { error: 'Error al obtener tipos de documento' },
            { status: 500 }
        );
    }
}
