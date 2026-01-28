import { NextRequest, NextResponse } from 'next/server';
import { updateDocumentField } from '@/services/document-service';
import { getCurrentUser } from '@/services/user-service';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const { ids, fieldName, value } = await request.json();

        if (!Array.isArray(ids) || !fieldName) {
            return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
        }

        console.log(`📦 [BulkUpdate] Updating ${ids.length} documents: ${fieldName} = ${value}`);

        const results = await Promise.all(
            ids.map(id => updateDocumentField(id, fieldName, value).catch(err => ({ success: false, error: err.message })))
        );

        const failures = results.filter(r => !r.success);

        if (failures.length > 0) {
            return NextResponse.json({
                success: false,
                message: `Se actualizaron ${ids.length - failures.length} documentos, pero fallaron ${failures.length}.`,
                failures
            }, { status: 207 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('❌ [BulkUpdate] Error:', error);
        return NextResponse.json({ error: 'Error al procesar actualización masiva' }, { status: 500 });
    }
}
