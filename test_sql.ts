import { prisma } from './src/lib/prisma';

async function main() {
  const result = await prisma.$queryRawUnsafe(`
    SELECT 
      d.id,
      d.importe_total,
      d.importe_sin_impuestos,
      COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(d.datos_extra, '$.base_no_sujeta')) AS DECIMAL(10,2)), 0) as base_ns,
      COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(d.datos_extra, '$.descuento_global')) AS DECIMAL(10,2)), 0) as desc_global,
      COALESCE((SELECT SUM(di2.cuota) FROM impuestos_documento di2 WHERE di2.documento_id = d.id), 0) as suma_impuestos,
      ABS(d.importe_total - (
        d.importe_sin_impuestos + 
        COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(d.datos_extra, '$.base_no_sujeta')) AS DECIMAL(10,2)), 0) -
        COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(d.datos_extra, '$.descuento_global')) AS DECIMAL(10,2)), 0) +
        COALESCE((SELECT SUM(di2.cuota) FROM impuestos_documento di2 WHERE di2.documento_id = d.id), 0)
      )) as diff_con_descuento
    FROM documentos d
    WHERE d.id IN (6891, 6907, 6901, 6889, 6910)
  `);
  console.log(JSON.stringify(result, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
