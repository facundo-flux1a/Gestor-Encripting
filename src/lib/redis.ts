// src/lib/redis.ts
import Redis from 'ioredis';

// ==========================================
// Cliente Redis Principal (Railway)
// ==========================================
const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.error('❌ [Redis] REDIS_URL no está configurada');
  throw new Error('REDIS_URL no configurada en variables de entorno');
}

console.log('🚂 [Redis] Inicializando conexión a Railway...');
console.log('🔗 [Redis] Host:', redisUrl.replace(/:[^:@]*@/, ':***@')); // Oculta password

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    console.log(`🔄 [Redis] Reintento ${times} en ${delay}ms`);
    return delay;
  },
  reconnectOnError(err) {
    console.error('⚠️ [Redis] Error de reconexión:', err.message);
    return true; // Siempre reintentar
  },
});

// ==========================================
// Eventos de Conexión
// ==========================================
redis.on('connect', () => {
  console.log('🔌 [Redis] Conectando a Railway...');
});

redis.on('ready', () => {
  console.log('✅ [Redis] Conectado y listo');
});

redis.on('error', (err) => {
  console.error('❌ [Redis] Error:', err.message);
});

redis.on('close', () => {
  console.log('🔌 [Redis] Conexión cerrada');
});

redis.on('reconnecting', () => {
  console.log('🔄 [Redis] Reconectando...');
});

// ==========================================
// Tipos
// ==========================================
export interface UploadProgress {
  status: 'processing' | 'analyzing' | 'saving' | 'completed' | 'failed';
  step: string;
  progress: number;
  message: string;
  timestamp: number;
  data?: any;
  shouldClose?: boolean;
}

// ==========================================
// Constantes
// ==========================================
const CACHE_DURATION = 60 * 60; // 1 hora

// ==========================================
// Funciones CRUD
// ==========================================

/**
 * Guardar progreso de upload en Redis
 */
export async function setUploadProgress(
  uploadId: string,
  progress: UploadProgress
): Promise<void> {
  const key = `upload:${uploadId}`;
  const channel = `upload:${uploadId}:progress`;
  
  try {
    // 1. Guardar en Redis con expiración
    await redis.setex(key, CACHE_DURATION, JSON.stringify(progress));
    console.log(`💾 [Redis] Guardado: ${key} - ${progress.step} (${progress.progress}%)`);
    
    // 2. Publicar evento para subscribers
    const subscribers = await redis.publish(channel, JSON.stringify(progress));
    console.log(`📡 [Redis] Publicado a ${subscribers} subscriber(s)`);
  } catch (error) {
    console.error('❌ [Redis] Error en setUploadProgress:', error);
    throw error;
  }
}

/**
 * Obtener progreso actual de un upload
 */
export async function getUploadProgress(
  uploadId: string
): Promise<UploadProgress | null> {
  const key = `upload:${uploadId}`;
  
  try {
    const data = await redis.get(key);
    
    if (!data) {
      return null;
    }
    
    const progress = JSON.parse(data);
    console.log(`📬 [Redis] Recuperado: ${key} - ${progress.step}`);
    return progress;
  } catch (error) {
    console.error('❌ [Redis] Error en getUploadProgress:', error);
    return null;
  }
}

/**
 * Eliminar progreso de upload
 */
export async function deleteUploadProgress(uploadId: string): Promise<void> {
  const key = `upload:${uploadId}`;
  
  try {
    await redis.del(key);
    console.log(`🗑️ [Redis] Eliminado: ${key}`);
  } catch (error) {
    console.error('❌ [Redis] Error en deleteUploadProgress:', error);
  }
}

// ==========================================
// Pub/Sub en Tiempo Real
// ==========================================

/**
 * Crear subscriber para updates en tiempo real
 */
export function createProgressSubscriber(uploadId: string) {
  console.log(`📻 [Redis] Creando subscriber para: ${uploadId}`);
  
  // Instancia SEPARADA para subscriber (requerimiento de Redis)
  const subscriber = new Redis(redisUrl!, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  });

  const channel = `upload:${uploadId}:progress`;
  let isSubscribed = false;
  let messageHandler: ((channel: string, message: string) => void) | null = null;

  return {
    subscriber,
    
    async subscribe(callback: (progress: UploadProgress) => void) {
      if (isSubscribed) {
        console.warn('⚠️ [Redis] Ya suscrito a:', channel);
        return;
      }

      try {
        // Handler para mensajes
        messageHandler = (ch: string, message: string) => {
          if (ch === channel) {
            try {
              const progress: UploadProgress = JSON.parse(message);
              console.log(`📨 [Redis] Mensaje: ${progress.step} (${progress.progress}%)`);
              callback(progress);
            } catch (error) {
              console.error('❌ [Redis] Error parseando mensaje:', error);
            }
          }
        };

        // Registrar handler
        subscriber.on('message', messageHandler);

        // Suscribirse
        await subscriber.subscribe(channel);
        isSubscribed = true;
        console.log(`✅ [Redis] Suscrito a: ${channel}`);

      } catch (error) {
        console.error('❌ [Redis] Error suscribiéndose:', error);
        throw error;
      }
    },

    async unsubscribe() {
      if (!isSubscribed) return;

      try {
        if (messageHandler) {
          subscriber.off('message', messageHandler);
          messageHandler = null;
        }

        await subscriber.unsubscribe(channel);
        await subscriber.quit();
        isSubscribed = false;
        console.log(`🔌 [Redis] Desuscrito de: ${channel}`);
      } catch (error) {
        console.error('❌ [Redis] Error al desuscribirse:', error);
        subscriber.disconnect();
      }
    }
  };
}

// ==========================================
// Health Check
// ==========================================

export async function checkRedisConnection(): Promise<boolean> {
  try {
    const result = await redis.ping();
    console.log('🏥 [Redis] Health check:', result === 'PONG' ? '✅ OK' : '❌ FAIL');
    return result === 'PONG';
  } catch (error) {
    console.error('❌ [Redis] Health check failed:', error);
    return false;
  }
}

// ==========================================
// Cleanup al cerrar
// ==========================================

const gracefulShutdown = async () => {
  console.log('🛑 [Redis] Cerrando conexiones...');
  try {
    await redis.quit();
    console.log('✅ [Redis] Cerrado correctamente');
  } catch (error) {
    console.error('❌ [Redis] Error al cerrar:', error);
    redis.disconnect();
  }
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// ==========================================
// Inicialización al importar
// ==========================================

// Test de conexión al cargar el módulo
(async () => {
  try {
    await checkRedisConnection();
  } catch (error) {
    console.error('❌ [Redis] Falló la conexión inicial:', error);
  }
})();