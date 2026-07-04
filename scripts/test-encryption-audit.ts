import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function audit() {
  console.log("=== AUDITORÍA DE EMPRESAS ANTES DE ENCRIPTAR ===");
  const empresas = await prisma.$queryRawUnsafe<any[]>('SELECT id, nombre_de_empresa, mail_de_carga, cif_hash, mail_de_carga_hash, created_at FROM empresas LIMIT 5');
  
  empresas.forEach(emp => {
    console.log(`ID: ${emp.id}`);
    console.log(`Nombre: ${emp.nombre_de_empresa}`);
    console.log(`Email: ${emp.mail_de_carga}`);
    console.log(`CIF Hash: ${emp.cif_hash}`);
    console.log(`Email Hash: ${emp.mail_de_carga_hash}`);
    console.log(`Creado el: ${emp.created_at}`);
    console.log('-------------------------');
  });

  await prisma.$disconnect();
}

audit().catch(console.error);
