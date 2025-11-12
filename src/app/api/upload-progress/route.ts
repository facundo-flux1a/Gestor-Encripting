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
// POST: Recibir callbacks de n8n
// ==========================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { 
      uploadId,      // ID único del upload
      status,        // processing | analyzing | completed | failed
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

    // Validación
    if (!uploadId) {
      return NextResponse.json({ error: 'uploadId requerido' }, { status: 400 });
    }

    // Crear objeto de progreso
    const progressData: UploadProgress = {
      status,
      step,
      progress,
      message,
      timestamp: Date.now(),
      data,
      // 🔥 Flag para indicar que debe cerrar la conexión
      shouldClose: status === 'completed' || status === 'failed'
    };

    // Guardar en Redis y notificar a subscribers via Pub/Sub
    await setUploadProgress(uploadId, progressData);

    console.log(`✅ [UPLOAD-PROGRESS] Guardado y publicado: ${uploadId} - ${step} (${progress}%)`);

    return NextResponse.json({ 
      success: true,
      uploadId,
      stored: true,
      shouldClose: progressData.shouldClose
    });

  } catch (error) {
    console.error('❌ [UPLOAD-PROGRESS] Error:', error);
    return NextResponse.json(
      { error: 'Error al procesar callback' },
      { status: 500 }
    );
  }
}

// ==========================================
// GET: Server-Sent Events para el frontend
// ==========================================
export async function GET(request: NextRequest) {
  const uploadId = request.nextUrl.searchParams.get('uploadId');

  if (!uploadId) {
    return NextResponse.json({ error: 'uploadId requerido' }, { status: 400 });
  }

  console.log('🔌 [SSE] Cliente conectado:', uploadId);

  // Crear stream de Server-Sent Events
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      // Crear subscriber de Redis
      const { subscriber, subscribe, unsubscribe } = createProgressSubscriber(uploadId);
      
      // Variable para trackear si el stream está cerrado
      let isClosed = false;
      let heartbeatInterval: NodeJS.Timeout | null = null;

      // Función helper para enviar datos al cliente
      const sendEvent = (data: UploadProgress) => {
        if (isClosed) return;
        
        try {
          const eventData = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(eventData));
          
          // 🔥 Si está completado o hay error, cerrar stream después de enviar
          if (data.status === 'completed' || data.status === 'failed') {
            console.log('🔌 [SSE] Cerrando stream por estado final:', uploadId, data.status);
            
            // Dar un pequeño delay para asegurar que el cliente reciba el mensaje
            setTimeout(() => {
              cleanup();
            }, 500);
          }
        } catch (error) {
          console.error('❌ [SSE] Error al enviar evento:', error);
          cleanup();
        }
      };

      // Función de cleanup
      const cleanup = async () => {
        if (isClosed) return;
        isClosed = true;
        
        try {
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
          }
          
          // Desuscribirse de Redis Pub/Sub
          await unsubscribe();
          
          // Cerrar el controller
          controller.close();
          console.log('🔌 [SSE] Cliente desconectado y limpiado:', uploadId);
        } catch (error) {
          // Ignorar error si el controller ya está cerrado
          if (error instanceof Error && !error.message.includes('already closed')) {
            console.error('❌ [SSE] Error en cleanup:', error);
          }
        }
      };

      try {
        // 1. Enviar estado inicial si existe
        const currentProgress = await getUploadProgress(uploadId);
        if (currentProgress) {
          sendEvent(currentProgress);
          
          // Si ya está completado o falló, cerrar inmediatamente
          if (currentProgress.status === 'completed' || currentProgress.status === 'failed') {
            return; // El cleanup se ejecutará en el setTimeout del sendEvent
          }
        }

        // 2. Suscribirse a updates en tiempo real via Redis Pub/Sub
        // ⚡ Esto es INSTANTÁNEO - no hay polling ni delays
        await subscribe((progress: UploadProgress) => {
          console.log(`📨 [SSE] Progreso recibido via Pub/Sub: ${uploadId} - ${progress.step} (${progress.progress}%)`);
          sendEvent(progress);
        });

        // 3. Heartbeat cada 15 segundos para mantener conexión viva
        heartbeatInterval = setInterval(() => {
          if (isClosed) {
            if (heartbeatInterval) {
              clearInterval(heartbeatInterval);
              heartbeatInterval = null;
            }
            return;
          }
          
          try {
            controller.enqueue(encoder.encode(': heartbeat\n\n'));
          } catch (error) {
            console.error('❌ [SSE] Error en heartbeat:', error);
            if (heartbeatInterval) {
              clearInterval(heartbeatInterval);
              heartbeatInterval = null;
            }
            cleanup();
          }
        }, 15000);

        // 4. Cleanup cuando el cliente cierra la conexión
        request.signal.addEventListener('abort', () => {
          console.log('🔌 [SSE] Cliente abortó conexión:', uploadId);
          cleanup();
        });

        // 5. Timeout de seguridad: cerrar después de 10 minutos
        const timeoutId = setTimeout(() => {
          console.log('⏰ [SSE] Timeout alcanzado (10 min):', uploadId);
          cleanup();
        }, 10 * 60 * 1000);

        // Limpiar timeout si se cierra antes
        request.signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
        });

      } catch (error) {
        console.error('❌ [SSE] Error al iniciar stream:', error);
        cleanup();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Deshabilitar buffering en nginx
    },
  });
}