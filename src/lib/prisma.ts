import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { fieldEncryptionExtension } from 'prisma-field-encryption';

// Patrón Singleton para evitar múltiples instancias en desarrollo con HMR
const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

function parseDatabaseUrl(url: string) {
  // Parsea mysql://user:pass@host:port/database
  const match = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  if (!match) throw new Error('Invalid DATABASE_URL format');
  return {
    user: match[1],
    password: decodeURIComponent(match[2]),
    host: match[3],
    port: parseInt(match[4], 10),
    database: match[5].split('?')[0],
  };
}

function createPrismaClient() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL environment variable is not set');

  const { user, password, host, port, database } = parseDatabaseUrl(dbUrl);

  // Prisma 7+ requiere un driver adapter (el nuevo engine client reemplaza al binario nativo)
  // @prisma/adapter-mariadb soporta tanto MariaDB como MySQL
  const adapter = new PrismaMariaDb({
    host,
    port,
    user,
    password,
    database,
    ssl: { rejectUnauthorized: false }, // necesario para Railway/cloud con TLS
    connectTimeout: 20000,              // timeout generoso para proxies remotos
    connectionLimit: 15,                // pool aumentado para soportar workers concurrentes sin saturar
  });

  const base = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  // Patch DMMF for Prisma 5+ which removes comments at runtime
  const Prisma = require('@prisma/client').Prisma;
  const encryptedFields: Record<string, string[]> = {
    "usuarios": ["nombre", "email", "phone"],
    "empresas": ["nombre_de_empresa", "nombre_fiscal", "mail_de_carga"],
    "entidades_documento": ["nombre", "direccion", "identificador_fiscal", "telefono", "email"],
    "invitaciones_empresa": ["email"],
    "archivos_documento": ["nombre_archivo", "ruta_archivo"],
    "documentos_auditoria": ["detalle", "usuario"],
    "eventos_sistema": ["metadata", "usuario"]
  };

  Prisma.dmmf.datamodel.models.forEach((model: any) => {
    const fields = encryptedFields[model.name];
    if (fields) {
      model.fields.forEach((field: any) => {
        if (fields.includes(field.name)) {
          field.documentation = '@encrypted';
        }
      });
    }
  });

  // prisma-field-encryption v1.6+ usa $extends (API de extensiones de Prisma)
  return base.$extends(
    fieldEncryptionExtension({
      encryptionKey: process.env.PRISMA_FIELD_ENCRYPTION_KEY!,
      dmmf: Prisma.dmmf
    })
  );
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
