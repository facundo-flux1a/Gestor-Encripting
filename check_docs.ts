import { prisma } from './src/lib/prisma';

async function main() {
  const ids = [6891, 6907, 6901, 6889, 6910];
  
  for (const id of ids) {
    const doc = await prisma.documentos.findUnique({
      where: { id: BigInt(id) },
      include: {
        impuestos_documento: true,
      }
    });
    
    if (doc) {
      const impuestosSum = doc.impuestos_documento.reduce((acc, imp) => acc + Number(imp.cuota), 0);
      const diff = Math.abs(Number(doc.importe_total) - (Number(doc.importe_sin_impuestos) + impuestosSum));
      
      console.log(`\n--- Documento #${id} ---`);
      console.log(`Total: ${doc.importe_total}`);
      console.log(`Base Imponible (sin imp): ${doc.importe_sin_impuestos}`);
      console.log(`Suma de Cuotas (IVA, etc): ${impuestosSum}`);
      console.log(`Diff según BD: ${diff.toFixed(2)}`);
      
      const extra = typeof doc.datos_extra === 'string' ? JSON.parse(doc.datos_extra) : doc.datos_extra;
      console.log(`datos_extra.base_no_sujeta:`, (extra as any)?.base_no_sujeta);
      console.log(`datos_extra.descuento_global:`, (extra as any)?.descuento_global);
      console.log(`Impuestos detallados:`, doc.impuestos_documento.map(i => ({tipo: i.tipo_impuesto, cuota: i.cuota})));
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
