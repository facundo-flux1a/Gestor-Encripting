import mysql from 'mysql2/promise';

const connection = mysql.createPool(process.env.DATABASE_URL!);

/**
 * Nombre de la base de datos activa.
 * Se toma de DB_NAME; si no está definida, se extrae del final de DATABASE_URL.
 * Para cambiar de base de datos, solo modificar DB_NAME en el .env.
 */
function resolveDbName(): string {
  if (process.env.DB_NAME) return process.env.DB_NAME;
  try {
    const url = new URL(process.env.DATABASE_URL!);
    // El pathname es "/railway" → quitamos la barra inicial
    return url.pathname.replace(/^\//, '') || 'railway';
  } catch {
    return 'railway';
  }
}

export const dbName = resolveDbName();

export default connection;
