import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

function getSha256(text: string | null | undefined): string | null {
  if (!text) return null;
  const cleanText = text.toLowerCase().replace(/[^a-z0-9]/g, '');
  return crypto.createHash('sha256').update(cleanText).digest('hex');
}

async function migrateHashes() {
  console.log('🔄 Iniciando migración de hashes...');
  let updatedEntidades = 0;
  
  const entidades = await prisma.entidades_documento.findMany({
    select: { id: true, nombre: true, identificador_fiscal: true }
  });

  for (const e of entidades) {
    const newNombreHash = getSha256(e.nombre);
    const newCifHash = getSha256(e.identificador_fiscal);
    await prisma.entidades_documento.update({
      where: { id: e.id },
      data: {
        nombre_hash: newNombreHash,
        identificador_fiscal_hash: newCifHash
      }
    });
    updatedEntidades++;
    if (updatedEntidades % 100 === 0) console.log(`Procesadas ${updatedEntidades} entidades...`);
  }
  
  console.log(`✅ Migradas ${updatedEntidades} entidades_documento.`);
  
  let updatedConfig = 0;
  const config = await prisma.entidades_config.findMany({
    select: { id: true, identificador_fiscal: true }
  });
  
  for (const c of config) {
    const newCifHash = getSha256(c.identificador_fiscal);
    await prisma.entidades_config.update({
      where: { id: c.id },
      data: {
        identificador_fiscal_hash: newCifHash
      }
    });
    updatedConfig++;
  }
  
  console.log(`✅ Migradas ${updatedConfig} entidades_config.`);
  console.log('🎉 Migración completada.');
}

migrateHashes()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
