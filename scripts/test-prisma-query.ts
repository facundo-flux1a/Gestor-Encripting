import { prisma } from '../src/lib/prisma';
async function main() {
  const docs = await prisma.documentos.findMany({
    where: {
      empresas: { id_de_usuario: { array_contains: 6 } },
      id_de_empresa: { in: [64] }
    },
    take: 2
  });
  console.log("Docs via array_contains:", docs.length);

  const docs2 = await prisma.documentos.findMany({
    where: { id_de_empresa: { in: [64] } },
    take: 2
  });
  console.log("Docs without array_contains:", docs2.length);
}
main().finally(() => process.exit(0));
