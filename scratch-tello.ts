import * as dotenv from 'dotenv';
dotenv.config();

import { prisma } from './src/lib/prisma';

async function main() {
  const archivos = await prisma.archivos_documento.findMany({
    take: 100,
    orderBy: { id: 'desc' }
  });
  
  console.log("=== Archivos Recientes TELLO ===");
  for (const a of archivos) {
    if (a.nombre_archivo && a.nombre_archivo.toLowerCase().includes('tello')) {
      const doc = await prisma.documentos.findUnique({
        where: { id: a.documento_id },
        include: { incidencias_documento: true }
      });
      console.log(`Doc ID: ${a.documento_id} | Archivo: ${a.nombre_archivo} | Fecha: ${a.fecha_subida} | Tipo Doc: ${doc?.tipo_documento} | Incidencias: ${doc?.incidencias_documento.length}`);
      
      if (doc?.incidencias_documento.length) {
        doc.incidencias_documento.forEach((inc: any) => {
           console.log(`  -> Incidencia: ${inc.tipo_incidencia} - ${inc.descripcion}`);
        });
      }
    }
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
