import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/services/api-key-service';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/documents/status/[uploadId]
 * 
 * Permite consultar el estado de un documento en proceso.
 * 
 * Autenticación (header obligatorio):
 *   X-Api-Key: flux_xxxxx
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> }
) {
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

    const resolvedParams = await params;
    const uploadId = resolvedParams.uploadId;
    const empresaId = authResult.empresa_id;

    // Consultar el estado en la tabla de actividad
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT upload_id, documento_nombre, documento_tipo, status, step, mensaje, created_at as fecha_creacion, updated_at
       FROM actividad 
       WHERE upload_id = ? AND id_de_empresa = ?`,
      [uploadId, empresaId]
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No se encontró ningún proceso con el ID proporcionado o no pertenece a su empresa.' },
        { status: 404 }
      );
    }

    const actividad = rows[0];

    // Verificar si el documento ya está en la tabla `documentos` usando el upload_id si lo guardamos (en este caso el microservicio lo vincula luego).
    // Para simplificar, devolvemos el estado reportado en `actividad`.

    return NextResponse.json(
      {
        upload_id: actividad.upload_id,
        nombre_archivo: actividad.documento_nombre,
        estado: actividad.status,
        paso_actual: actividad.step,
        mensaje: actividad.mensaje,
        fecha_inicio: actividad.fecha_creacion,
        ultima_actualizacion: actividad.updated_at
      },
      { status: 200 }
    );

  } catch (error: any) {
    console.error(`❌ [GET /api/v1/documents/status] Error:`, error);
    return NextResponse.json(
      { error: 'Error interno del servidor.' },
      { status: 500 }
    );
  }
}
