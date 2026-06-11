import { prisma } from '../src/lib/prisma';
async function main() {
  const count = await prisma.incidencias_documento.count({ where: { validado: false } });
  console.log("Unvalidated incidents:", count);
}
main().finally(() => process.exit(0));
