// src/app/api/upload-progress/route.ts
import { NextRequest, NextResponse } from 'next/server';
import connection from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ==========================================
// POST: Recibir callbacks del flujo
// ==========================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { 
      uploadId,
      parentUploadId,  // 🆕 NUEVO
      status,
      step,
      progress,
      message,
      data
    } = body;

    console.log('📡 [POST] Callback recibido:', {
      uploadId,
      parentUploadId,
      status,
      step,
      progress,
      message
    });

    if (!uploadId) {
      return NextResponse.json({ error: 'uploadId requerido' }, { status: 400 });
    }

    // 🆕 ACTUALIZAR EN LA BASE DE DATOS
    await connection.query(
      `UPDATE actividad 
       SET status = ?, step = ?, progress = ?, mensaje = ?, updated_at = NOW()
       WHERE upload_id = ?`,
      [status, step, progress, message, uploadId]
    );

    console.log(`✅ [POST] Actualizado: ${uploadId} - ${step} (${progress}%)`);

    // 🆕 SI TIENE PARENT, ACTUALIZAR EL PROGRESO DEL PADRE
    if (parentUploadId) {
      await updateParentProgress(parentUploadId);
    }

    return NextResponse.json({ 
      success: true,
      uploadId,
      stored: true
    });

  } catch (error) {
    console.error('❌ [POST] Error:', error);
    return NextResponse.json(
      { error: 'Error al procesar callback' },
      { status: 500 }
    );
  }
}

// 🆕 FUNCIÓN PARA CALCULAR Y ACTUALIZAR EL PROGRESO DEL PADRE
async function updateParentProgress(parentUploadId: string) {
  try {
    // Obtener todos los hijos
    const [children] = await connection.query(
      `SELECT status, progress FROM actividad WHERE parent_upload_id = ?`,
      [parentUploadId]
    ) as any;

    if (children.length === 0) return;

    // Calcular progreso promedio
    const totalProgress = children.reduce((sum: number, child: any) => sum + (child.progress || 0), 0);
    const averageProgress = Math.round(totalProgress / children.length);

    // Determinar estado del padre
    const allCompleted = children.every((child: any) => child.status === 'Completado');
    const anyFailed = children.some((child: any) => child.status === 'Fallido');
    
    let parentStatus = 'procesando';
    let parentStep = 'Procesando archivos...';
    let parentMessage = `${children.length} archivos en proceso`;

    if (allCompleted) {
      parentStatus = 'Completado';
      parentStep = 'Completado';
      parentMessage = `✅ ${children.length} archivos procesados exitosamente`;
    } else if (anyFailed) {
      parentStatus = 'Fallido';
      parentStep = 'Error';
      parentMessage = `Algunos archivos fallaron en el procesamiento`;
    }

    // Actualizar el padre
    await connection.query(
      `UPDATE actividad 
       SET status = ?, step = ?, progress = ?, mensaje = ?, updated_at = NOW()
       WHERE upload_id = ?`,
      [parentStatus, parentStep, averageProgress, parentMessage, parentUploadId]
    );

    console.log(`✅ [Parent Update] ${parentUploadId} - ${averageProgress}% (${children.length} hijos)`);
  } catch (error) {
    console.error('❌ [Parent Update] Error:', error);
  }
}

// ==========================================
// GET: Retornar estado actual + archivos hijos
// ==========================================
export async function GET(request: NextRequest) {
  const uploadId = request.nextUrl.searchParams.get('uploadId');

  if (!uploadId) {
    return NextResponse.json({ error: 'uploadId requerido' }, { status: 400 });
  }

  try {
    console.log('🔍 [GET] Solicitando estado de:', uploadId);
    
    // Obtener el registro principal
    const [rows] = await connection.query(
      `SELECT * FROM actividad WHERE upload_id = ? LIMIT 1`,
      [uploadId]
    ) as any;

    if (rows.length === 0) {
      return NextResponse.json(
        { 
          status: 'waiting',
          step: 'Iniciando',
          progress: 0,
          message: 'Esperando procesamiento...',
          timestamp: Date.now()
        },
        { 
          status: 200,
          headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
        }
      );
    }

    const mainRecord = rows[0];

    // 🆕 SI ES UN PADRE (archivo comprimido), obtener sus hijos
    let children = [];
    if (mainRecord.parent_upload_id === null) {
      const [childRows] = await connection.query(
        `SELECT * FROM actividad WHERE parent_upload_id = ? ORDER BY created_at ASC`,
        [uploadId]
      ) as any;
      children = childRows;
    }

    const response = {
      status: mainRecord.status,
      step: mainRecord.step,
      progress: mainRecord.progress,
      message: mainRecord.mensaje,
      timestamp: Date.now(),
      isCompressed: children.length > 0,  // 🆕 Indica si es un ZIP
      children: children.map((child: any) => ({  // 🆕 Lista de archivos hijos
        uploadId: child.upload_id,
        fileName: child.documento_nombre,
        status: child.status,
        step: child.step,
        progress: child.progress,
        message: child.mensaje
      }))
    };

    console.log(`✅ [GET] Retornando: ${uploadId} - ${mainRecord.step} (${mainRecord.progress}%)${children.length > 0 ? ` + ${children.length} hijos` : ''}`);
    
    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
    });

  } catch (error) {
    console.error('❌ [GET] Error:', error);
    return NextResponse.json(
      { error: 'Error al obtener progreso' },
      { status: 500 }
    );
  }
}