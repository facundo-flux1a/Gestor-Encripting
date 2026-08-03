const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const result = await prisma.$queryRaw`SELECT id, CAST(documento_id AS CHAR) as doc_id, descripcion, validado FROM incidencias_documento WHERE descripcion LIKE '%factura duplicado:%'`;
  console.log(result);
  process.exit(0);
}
run().catch(console.error);
