import { prisma } from '../src/lib/prisma';
async function main() {
  const allDocs = await prisma.documentos.count({
    where: { id_de_empresa: 64 }
  });
  
  const docsSinIncidencias = await prisma.documentos.count({
    where: { 
      id_de_empresa: 64,
      incidencias_documento: { none: { validado: false } }
    }
  });

  console.log("Total docs de empresa 64:", allDocs);
  console.log("Docs SIN incidencias (los que se ven en la tabla):", docsSinIncidencias);
}
main().finally(() => process.exit(0));
