import { NextRequest, NextResponse } from 'next/server';
import { confirmHealthCheckDocument } from '@/services/document-service';
import { getCurrentUser } from '@/services/user-service';

export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const { documentId } = await request.json();
        if (!documentId) return NextResponse.json({ error: 'documentId requerido' }, { status: 400 });

        await confirmHealthCheckDocument(Number(documentId));
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('❌ Error confirmando health check:', error);
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
    }
}
