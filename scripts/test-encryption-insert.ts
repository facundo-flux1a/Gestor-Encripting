import { prisma } from '../src/lib/prisma';
async function main() {
  // Let's create a test entity to not mess up production data
  const result = await prisma.entidades_documento.create({
    data: {
      documento_id: 4145n,
      rol: 'test',
      nombre: "TEXTO DE PRUEBA ENCRIPTADO"
    }
  });
  console.log("Created via Prisma:", result);
  
  // Read raw from DB to see if it's encrypted
  const [rows] = await require('../src/lib/db').default.query('SELECT nombre FROM railway.entidades_documento WHERE id = ?', [result.id]);
  console.log("Raw from DB:", rows[0]);
  
  // Clean up
  await prisma.entidades_documento.delete({ where: { id: result.id } });
}
main().finally(() => process.exit(0));
