import * as dotenv from 'dotenv';
dotenv.config();

import { prisma } from './src/lib/prisma';

async function main() {
  const archivos = await prisma.archivos_documento.findMany({
    where: { id_de_empresa: 117 },
    take: 6,
    orderBy: { id: 'desc' }
  });
  
  console.log("=== Últimos Archivos Subidos para Empresa 117 ===");
  for (const a of archivos) {
    if (!a.nombre_archivo) continue;
    
    const doc = await prisma.documentos.findUnique({
      where: { id: a.documento_id },
      include: { 
        incidencias_documento: true,
        entidades_documento: true
      }
    });

    if (!doc) continue;

    console.log(`\nDoc ID: ${doc.id} | Archivo: ${a.nombre_archivo}`);
    console.log(`  -> Tipo: ${doc.tipo_documento} | Num: ${doc.numero_documento}`);
    
    // Entidades
    const emisor = doc.entidades_documento.find(e => e.rol === 'emisor');
    const cliente = doc.entidades_documento.find(e => e.rol === 'cliente');
    console.log(`  -> Emisor (Guardado): ${emisor?.nombre} (CIF: ${emisor?.identificador_fiscal})`);
    console.log(`  -> Cliente (Guardado): ${cliente?.nombre} (CIF: ${cliente?.identificador_fiscal})`);

    // Incidencias
    console.log(`  -> Incidencias DB: ${doc.incidencias_documento.length}`);
    if (doc.incidencias_documento.length) {
      doc.incidencias_documento.forEach((inc: any) => {
         console.log(`       - [${inc.tipo_incidencia}] ${inc.descripcion}`);
      });
    }

    // Try to find the audit log for extraction
    const audit = await prisma.documentos_auditoria.findFirst({
      where: { documento_id: doc.id, accion: 'extract-success' },
      orderBy: { id: 'desc' }
    });
    
    if (audit && audit.detalle) {
      try {
        const details = JSON.parse(audit.detalle as string);
        if (details.rawJson) {
           const parsedJson = typeof details.rawJson === 'string' ? JSON.parse(details.rawJson) : details.rawJson;
           console.log(`  -> LLM Extracción (CIF Emisor): ${parsedJson.empresa_emisora?.cif}`);
           console.log(`  -> LLM Extracción (CIF Cliente): ${parsedJson.cliente?.cif}`);
           console.log(`  -> LLM Incidencia Flag: ${parsedJson.incidencia}`);
           if (parsedJson.incidencia) {
             console.log(`  -> LLM Incidencia Desc: ${parsedJson.descripcion_incidencia}`);
           }
        }
      } catch (e) {
        console.log("  -> (No se pudo parsear rawJson del LLM)");
      }
    }
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
