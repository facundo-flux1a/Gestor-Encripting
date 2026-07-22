import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import { uploadDocument } from '@/services/upload-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * POST /api/uploads/file
 * Multipart: file + empresaId + uploadId
 * Persistente vía fetch (no server-action) para que la cola cliente pueda reanudar tras refresh.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, message: 'No autorizado' }, { status: 401 });
    }

    const formData = await req.formData();
    const result = await uploadDocument(formData);
    return NextResponse.json(result, { status: result.success === false ? 400 : 200 });
  } catch (error: any) {
    console.error('❌ [api/uploads/file]', error);
    const message = error?.message || 'Error al subir el archivo';
    const isDup = /duplicado/i.test(message);
    return NextResponse.json(
      { success: false, message, isDuplicate: isDup },
      { status: isDup ? 409 : 500 }
    );
  }
}
