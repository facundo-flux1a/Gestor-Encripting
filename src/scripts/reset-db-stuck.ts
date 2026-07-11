import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Limpiando actividades atascadas en la base de datos...');
  
  const result = await prisma.actividad.updateMany({
    where: {
      status: {
        in: ['procesando', 'waiting', 'Reintentando', 'esperando']
      }
    },
    data: {
      status: 'Fallido',
      mensaje: 'Cancelado manualmente por limpieza de colas.',
      updated_at: new Date()
    }
  });

  console.log(`✅ Se actualizaron ${result.count} registros atascados a estado 'Fallido'.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
