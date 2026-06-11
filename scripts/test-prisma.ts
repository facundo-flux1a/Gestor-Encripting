import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { fieldEncryptionExtension } from 'prisma-field-encryption';

async function main() {
  const { user, password, host, port, database } = {
    user: 'root',
    password: 'DGlmTbzZEIVNjCsdNcnADJdDxotXpndV',
    host: 'crossover.proxy.rlwy.net',
    port: 54935,
    database: 'railway',
  };

  const adapter = new PrismaMariaDb({
    host, port, user, password, database,
    ssl: { rejectUnauthorized: false },
    connectTimeout: 20000,
    connectionLimit: 5,
  });

  const base = new PrismaClient({ adapter, log: ['error'] });

  // Prueba con fieldEncryptionExtension
  const prisma = base.$extends(
    fieldEncryptionExtension({
      encryptionKey: process.env.PRISMA_FIELD_ENCRYPTION_KEY!,
    })
  );

  console.log('🔌 Probando con fieldEncryptionExtension...');
  const n = await prisma.documentos.count();
  console.log('✅ Prisma + Encryption OK! Documentos:', n);

  // Prueba lectura de usuario (campo encriptado)
  const user2 = await prisma.usuarios.findFirst({ select: { id: true, email: true } });
  console.log('✅ Usuario (email encriptado):', user2?.id, '- email:', user2?.email ? 'presente' : 'null');

  await base.$disconnect();
}

main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
