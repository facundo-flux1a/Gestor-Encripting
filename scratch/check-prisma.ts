import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const incidents = await prisma.incidencias_documento.findMany({
    where: {
      descripcion: {
        contains: 'duplicado'
      }
    },
    select: {
      id: true,
      documento_id: true,
      descripcion: true,
      validado: true
    }
  });
  console.log('Incidentes encontrados:', incidents);
  process.exit(0);
}
main().catch(console.error);
