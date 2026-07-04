import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/services/api-key-service';
import { uploadDocumentFromApi } from '@/services/upload-service';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/documents/upload
 * 
 * Ingesta de documentos asíncrona vía URL.
 * 
 * Autenticación (header obligatorio):
 *   X-Api-Key: flux_xxxxx
 *
 * Body JSON:
 * {
 *   "fileUrl": "https://url-publica-del-archivo.pdf"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const rawKey = request.headers.get('x-api-key') || '';

    if (!rawKey) {
      return NextResponse.json(
        { error: 'Header X-Api-Key requerido.' },
        { status: 401 }
      );
    }

    const authResult = await validateApiKey(rawKey);
    if (!authResult.valid || !authResult.empresa_id) {
      return NextResponse.json(
        { error: 'API Key inválida o revocada.' },
        { status: 401 }
      );
    }

    const empresaId = authResult.empresa_id;
    let body: any = {};
    
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'El cuerpo de la petición debe ser JSON válido.' },
        { status: 400 }
      );
    }

    const fileUrl = body.fileUrl;

    if (!fileUrl || typeof fileUrl !== 'string' || !fileUrl.startsWith('http')) {
      return NextResponse.json(
        { error: 'Debe proporcionar un "fileUrl" válido (http/https).' },
        { status: 400 }
      );
    }

    const uploadId = `api_${crypto.randomBytes(6).toString('hex')}`;

    // Lanzar procesamiento en segundo plano sin bloquear la respuesta
    uploadDocumentFromApi(
      fileUrl, 
      empresaId.toString(), 
      uploadId, 
      authResult.nombre, 
      authResult.usuario_id
    ).catch(err => {
      console.error(`❌ [UploadAPI Route] Error fatal no capturado:`, err);
    });

    // Responder inmediatamente (HTTP 202 Accepted)
    return NextResponse.json(
      {
        status: 'procesando',
        mensaje: 'Archivo recibido correctamente. El análisis se realizará en segundo plano.',
        upload_id: uploadId
      },
      { status: 202 }
    );

  } catch (error: any) {
    console.error('❌ [POST /api/v1/documents/upload] Error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor.' },
      { status: 500 }
    );
  }
}
