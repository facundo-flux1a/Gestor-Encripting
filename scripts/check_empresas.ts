import { prisma } from '../src/lib/prisma';

async function main() {
  const empresas = await prisma.empresa.findMany({
    select: { id: true, nombre: true, cif: true }
  });
  console.log('--- EMPRESAS REGISTRADAS EN BASE DE DATOS ---');
  console.table(empresas);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
