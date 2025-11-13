// src/app/api/upload-progress/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  setUploadProgress,
  getUploadProgress,
  createProgressSubscriber,
  checkRedisConnection,
  type UploadProgress,
} from '@/lib/redis';

// ==========================================
// Test de conexión Redis al cargar el módulo
// ==========================================
checkRedisConnection().then(ok => {
  if (ok) {
    console.log('🎯 [Upload-Progress-Route] Redis conectado correctamente');
  } else {
    console.error('❌ [Upload-Progress-Route] Redis NO conectado - SSE no funcionará');
  }
});

// Deshabilitar caché en Vercel
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
      status,
      step,
      progress,
      message,
      data
    } = body;

    console.log('📡 [POST] Callback recibido:', {
      uploadId,
      status,
      step,
      progress,
      message
    });

    if (!uploadId) {
      return NextResponse.json({ error: 'uploadId requerido' }, { status: 400 });
    }

    const progressData: UploadProgress = {
      status,
      step,
      progress,
      message,
      timestamp: Date.now(),
      data,
      shouldClose: status === 'completed' || status === 'failed'
    };

    // Guardar en Redis Y publicar para subscribers activos
    await setUploadProgress(uploadId, progressData);

    console.log(`✅ [POST] Guardado y publicado: ${uploadId} - ${step} (${progress}%)`);

    return NextResponse.json({ 
      success: true,
      uploadId,
      stored: true,
      shouldClose: progressData.shouldClose
    });

  } catch (error) {
    console.error('❌ [POST] Error:', error);
    return NextResponse.json(
      { error: 'Error al procesar callback' },
      { status: 500 }
    );
  }
}

// ==========================================
// GET: Retornar estado actual (NO SSE)
// ==========================================
export async function GET(request: NextRequest) {
  const uploadId = request.nextUrl.searchParams.get('uploadId');

  if (!uploadId) {
    return NextResponse.json({ error: 'uploadId requerido' }, { status: 400 });
  }

  try {
    console.log('🔍 [GET] Solicitando estado de:', uploadId);
    
    // Simplemente retornar el estado actual de Redis
    const progress = await getUploadProgress(uploadId);
    
    if (!progress) {
      console.log('⚠️ [GET] No hay datos para:', uploadId);
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
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          }
        }
      );
    }

    console.log(`✅ [GET] Retornando: ${uploadId} - ${progress.step} (${progress.progress}%)`);
    
    return NextResponse.json(progress, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    });

  } catch (error) {
    console.error('❌ [GET] Error:', error);
    return NextResponse.json(
      { error: 'Error al obtener progreso' },
      { status: 500 }
    );
  }
}