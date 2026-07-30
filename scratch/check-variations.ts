import db from '../src/lib/db';
import { prisma } from '../src/lib/prisma';

async function run() {
  // Let's get the most recent document
  const recentDoc = await prisma.documentos.findFirst({
    orderBy: { fecha_creacion: 'desc' },
    include: {
      lineas_documento: true,
      entidades_documento: true
    }
  });

  if (!recentDoc) {
    console.log("No recent doc found");
    return;
  }

  console.log(`Documento reciente ID: ${recentDoc.id}, Numero: ${recentDoc.numero_documento}, Fecha: ${recentDoc.fecha_emision}`);

  const emisor = recentDoc.entidades_documento.find(e => e.rol === 'emisor' || e.rol === 'proveedor');
  if (!emisor || !emisor.identificador_fiscal_hash) {
    console.log("No emisor or hash found");
    return;
  }

  console.log(`Proveedor Hash: ${emisor.identificador_fiscal_hash}`);

  for (const linea of recentDoc.lineas_documento) {
    console.log(`\nLinea actual: "${linea.descripcion}" | Precio: ${linea.precio_unitario}`);
    
    // Search past
    const pastLine = await prisma.lineas_documento.findFirst({
      where: {
        id_de_empresa: recentDoc.id_de_empresa,
        descripcion: linea.descripcion,
        documentos: {
          entidades_documento: {
            some: {
              identificador_fiscal_hash: emisor.identificador_fiscal_hash,
              rol: { in: ['emisor', 'proveedor'] }
            }
          },
          fecha_emision: {
            lt: recentDoc.fecha_emision
          }
        }
      },
      orderBy: { documentos: { fecha_emision: 'desc' } }
    });

    if (pastLine) {
      console.log(`  -> ENCONTRADO en ID ${pastLine.documento_id}: "${pastLine.descripcion}" | Precio anterior: ${pastLine.precio_unitario}`);
      if (Number(pastLine.precio_unitario) !== Number(linea.precio_unitario)) {
        console.log(`  -> VARIACIÓN DE PRECIO DEBE NOTIFICAR`);
      } else {
        console.log(`  -> Mismo precio, no notifica`);
      }
    } else {
      console.log(`  -> NO SE ENCONTRÓ NINGUNA LÍNEA ANTERIOR CON ESA DESCRIPCIÓN EXACTA`);
      
      // Let's do a fuzzy search to see if it was slightly different
      const fuzzy = await prisma.lineas_documento.findFirst({
        where: {
          id_de_empresa: recentDoc.id_de_empresa,
          documentos: {
            entidades_documento: {
              some: {
                identificador_fiscal_hash: emisor.identificador_fiscal_hash,
                rol: { in: ['emisor', 'proveedor'] }
              }
            },
            fecha_emision: { lt: recentDoc.fecha_emision }
          }
        },
        orderBy: { documentos: { fecha_emision: 'desc' } }
      });
      if (fuzzy) {
        console.log(`  -> (Solo para comparar) La factura anterior tiene, por ejemplo, linea: "${fuzzy.descripcion}"`);
      }
    }
  }
}

run().catch(console.error).finally(() => process.exit(0));
