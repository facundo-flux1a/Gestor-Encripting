import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { fieldEncryptionExtension } from 'prisma-field-encryption';
import mysql from 'mysql2/promise';

async function main() {
  const pool = mysql.createPool(process.env.DATABASE_URL!);
  const adapter = new PrismaMariaDb(pool);
  const base = new PrismaClient({ adapter });

  // Initialize the extension
  const ext = fieldEncryptionExtension({
      encryptionKey: process.env.PRISMA_FIELD_ENCRYPTION_KEY!,
  });
  
  // The extension attaches to operations.
  // There is no public API to see its config easily, but maybe we can see it in the debug logs?
}
main();
