import { NextResponse } from 'next/server';
import connection, { dbName } from '@/lib/db';
import { getSession } from '@/services/auth-service';
import { ActivityService } from '@/services/activity-service';
import { RowDataPacket } from 'mysql2';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const activityId = parseInt(id);
    if (isNaN(activityId)) {
      return NextResponse.json({ error: 'ID de actividad inválido' }, { status: 400 });
    }

    console.log(`🔌 [API] Recibida solicitud de reintento para ID: ${activityId}`);
    
    // Leer si es manual desde el body (el RetryMonitor NO envía isManual, así que será false = auto)
    let isManual = false;
    try {
      const body = await request.json();
      isManual = body?.isManual === true;
    } catch {
      // Sin body = automático
    }
    console.log(`🔌 [API] isManual: ${isManual}`);
    
    const result = await ActivityService.retryActivity(activityId, isManual);

    if (!result.success) {
      console.warn(`⚠️ [API] Reintento fallido para ID ${activityId}: ${result.message}`);
      return NextResponse.json({ 
        error: result.message,
        details: result.details
      }, { status: 502 });
    }

    console.log(`✅ [API] Reintento procesado con éxito para ID: ${activityId}`);
    return NextResponse.json(result);

  } catch (error: any) {
    console.error('❌ [API RETRY] Error:', error);
    return NextResponse.json(
      {
        error: 'Error al reintentar',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    );
  }
}

// Manejar GET para obtener estado de reintento (opcional)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) return new NextResponse('Unauthorized', { status: 401 });

    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT id, status, retry_count, error_detalle, updated_at 
       FROM ${dbName}.actividad WHERE id = ?`,
      [parseInt(id)]
    );

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'Actividad no encontrada' }, { status: 404 });
    }

    return NextResponse.json(rows[0]);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Manejar DELETE para cancelar reintentos si fuera necesario
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) return new NextResponse('Unauthorized', { status: 401 });

    await connection.query(`UPDATE ${dbName}.actividad SET retry_count = 3 WHERE id = ?`, [parseInt(id)]);
    return NextResponse.json({ success: true, message: 'Reintentos automáticos cancelados para esta actividad' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}