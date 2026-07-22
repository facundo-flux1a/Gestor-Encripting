import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import { createActivityBatch } from '@/services/upload-service';

export const dynamic = 'force-dynamic';

/**
 * Reserva uploadIds de un lote (sin crear actividad hasta que lleguen los bytes).
 * Ver docs/CONTRATO_UPLOAD_BATCH.md — actividad nace en POST /api/uploads/file.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const empresaId = body.empresaId != null ? String(body.empresaId) : '';
    const files = Array.isArray(body.files) ? body.files : [];

    if (!empresaId) {
      return NextResponse.json({ error: 'empresaId requerido' }, { status: 400 });
    }
    if (files.length === 0) {
      return NextResponse.json({ error: 'files[] requerido' }, { status: 400 });
    }

    const result = await createActivityBatch(
      empresaId,
      files.map((f: { fileName?: string; name?: string; size?: number; mimeType?: string; type?: string }) => ({
        fileName: f.fileName || f.name || '',
        size: f.size,
        mimeType: f.mimeType || f.type,
      }))
    );

    return NextResponse.json({
      success: true,
      batchId: result.batchId,
      items: result.items,
    });
  } catch (error) {
    console.error('❌ [API-UPLOADS-BATCH]', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error al crear lote',
      },
      { status: 500 }
    );
  }
}
