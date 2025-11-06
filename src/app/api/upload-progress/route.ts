import { NextRequest, NextResponse } from 'next/server';

// ⭐ Store en memoria para progress (en producción podrías usar Redis)
const progressStore = new Map<string, {
  status: 'processing' | 'analyzing' | 'completed' | 'error';
  step: string;
  progress: number;
  message: string;
  timestamp: number;
  data?: any;
}>();

export const dynamic = 'force-dynamic';

// POST - Recibir callback de n8n
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { 
      uploadId,      // ID único del upload
      status,        // processing | analyzing | completed | error
      step,          // nombre del paso actual
      progress,      // 0-100
      message,       // mensaje descriptivo
      data           // datos adicionales (opcional)
    } = body;

    console.log('📡 [UPLOAD-PROGRESS] Callback recibido:', {
      uploadId,
      status,
      step,
      progress,
      message
    });

    if (!uploadId) {
      return NextResponse.json({ error: 'uploadId requerido' }, { status: 400 });
    }

    // Guardar en store
    progressStore.set(uploadId, {
      status,
      step,
      progress,
      message,
      timestamp: Date.now(),
      data
    });

    // Auto-limpiar después de 5 minutos
    setTimeout(() => {
      progressStore.delete(uploadId);
      console.log('🧹 [UPLOAD-PROGRESS] Limpiado:', uploadId);
    }, 5 * 60 * 1000);

    return NextResponse.json({ 
      success: true,
      uploadId,
      stored: true
    });

  } catch (error) {
    console.error('❌ [UPLOAD-PROGRESS] Error:', error);
    return NextResponse.json(
      { error: 'Error al procesar callback' },
      { status: 500 }
    );
  }
}

// GET - Server-Sent Events para el frontend
export async function GET(request: NextRequest) {
  const uploadId = request.nextUrl.searchParams.get('uploadId');

  if (!uploadId) {
    return NextResponse.json({ error: 'uploadId requerido' }, { status: 400 });
  }

  console.log('🔌 [SSE] Cliente conectado:', uploadId);

  // Crear stream de Server-Sent Events
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    start(controller) {
      // Enviar estado inicial si existe
      const currentProgress = progressStore.get(uploadId);
      if (currentProgress) {
        const data = `data: ${JSON.stringify(currentProgress)}\n\n`;
        controller.enqueue(encoder.encode(data));
      }

      // Polling cada 500ms para detectar cambios
      const interval = setInterval(() => {
        const progress = progressStore.get(uploadId);
        
        if (progress) {
          const data = `data: ${JSON.stringify(progress)}\n\n`;
          controller.enqueue(encoder.encode(data));

          // Si está completado o hay error, cerrar stream
          if (progress.status === 'completed' || progress.status === 'error') {
            clearInterval(interval);
            controller.close();
            console.log('🔌 [SSE] Stream cerrado (completed/error):', uploadId);
          }
        }
      }, 500);

      // Cleanup al cerrar conexión
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
        console.log('🔌 [SSE] Cliente desconectado:', uploadId);
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}