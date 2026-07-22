import mysql from 'mysql2/promise';

/**
 * Nombre de la base de datos activa.
 * Se toma de DB_NAME; si no está definida, se extrae del final de DATABASE_URL.
 */
function resolveDbName(): string {
  if (process.env.DB_NAME) return process.env.DB_NAME;
  try {
    const url = new URL(process.env.DATABASE_URL!);
    return url.pathname.replace(/^\//, '') || 'railway';
  } catch {
    return 'railway';
  }
}

export const dbName = resolveDbName();

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL no configurada');

  // Pool endurecido para proxies Railway (ETIMEDOUT / ECONNRESET)
  return mysql.createPool({
    uri: url,
    waitForConnections: true,
    connectionLimit: 8,
    maxIdle: 4,
    idleTimeout: 60000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    connectTimeout: 20000,
    // Railway TLS
    ssl: { rejectUnauthorized: false },
  });
}

const connection = createPool();

/** Query con 1 reintento ante ETIMEDOUT / ECONNRESET del proxy */
export async function queryWithRetry<T = any>(
  sql: string,
  params?: any[],
  retries = 1
): Promise<[T, any]> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return (await connection.query(sql, params)) as [T, any];
    } catch (err: any) {
      lastError = err;
      const code = err?.code || err?.errno;
      const retryable =
        code === 'ETIMEDOUT' ||
        code === 'ECONNRESET' ||
        code === 'PROTOCOL_CONNECTION_LOST' ||
        code === 'ECONNREFUSED';
      if (!retryable || attempt === retries) throw err;
      console.warn(`⚠️ [db] ${code} en query, reintento ${attempt + 1}/${retries}...`);
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  throw lastError;
}

export default connection;
