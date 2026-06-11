import { prisma } from '../src/lib/prisma';
async function main() {
  const doc = await prisma.documentos.findFirst({
    where: { id_de_empresa: 64 }
  });
  console.log(doc);
}
main().finally(() => process.exit(0));
