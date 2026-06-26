import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import crypto from 'crypto';

function normalizeEntityName(name: string): string {
  if (!name) return '';
  return name
    .normalize("NFD") 
    .replace(/[\u0300-\u036f]/g, "") 
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ""); 
}

async function main() {
  console.log('🔄 Iniciando backfill de nombre_hash en entidades_documento...');

  // 1. Obtener todas las entidades que no tienen nombre_hash pero sí tienen nombre
  const entidades = await prisma.entidades_documento.findMany({
    where: {
      nombre_hash: null,
      nombre: { not: null },
    },
    select: {
      id: true,
      nombre: true,
    },
  });

  console.log(`📊 Encontradas ${entidades.length} entidades para actualizar.`);

  if (entidades.length === 0) {
    console.log('✅ Nada que actualizar.');
    return;
  }

  let actualizadas = 0;

  // 2. Procesar secuencialmente (sin transacción) para evitar timeouts de red
  for (const entidad of entidades) {
    const normalizedName = normalizeEntityName(entidad.nombre!);
    const hash = crypto.createHash('sha256').update(normalizedName).digest('hex');
    
    await prisma.entidades_documento.update({
      where: { id: entidad.id },
      data: { nombre_hash: hash },
    });

    actualizadas++;
    if (actualizadas % 50 === 0) {
      console.log(`⏱️ Progreso: ${actualizadas} / ${entidades.length} entidades procesadas.`);
    }
  }

  console.log('🎉 Backfill de nombre_hash completado exitosamente.');
}

main()
  .catch(e => {
    console.error('❌ Error fatal en el backfill:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
