/**
 * Script de auditoría de calidad de datos para la empresa 117.
 * Extrae toda la información guardada para los 39 documentos y sus entidades,
 * formateándola en una tabla detallada para verificar si los valores son correctos.
 */
import { prisma } from '@/lib/prisma';

const EMPRESA_ID = 117n;

async function main() {
  console.log('Obteniendo documentos...');
  
  // 1. Obtener todos los documentos
  const docs = await prisma.documentos.findMany({
    where: { id_de_empresa: EMPRESA_ID },
    orderBy: { fecha_emision: 'asc' }, // Ordenar por fecha de emisión para que sea más fácil seguir
    include: {
      entidades_documento: true,
      impuestos_documento: true,
      incidencias_documento: true,
    },
  });

  // 2. Obtener configuraciones de proveedores únicos en la empresa
  const configs = await prisma.entidades_config.findMany({
    where: { empresa_id: EMPRESA_ID },
  });

  console.log(`Documentos encontrados: ${docs.length}`);
  console.log(`Configuraciones de proveedores (entidades_config): ${configs.length}`);

  const lines: string[] = [];
  lines.push('# Reporte de Control de Extracción - Empresa 117');
  lines.push('');
  lines.push(`Total de documentos procesados en la Base de Datos: **${docs.length}**`);
  lines.push('');
  lines.push('## 👥 Proveedores Únicos Registrados (entidades_config)');
  lines.push('| ID | Nombre de Referencia | CIF | Cuenta Compra | Cuenta Venta |');
  lines.push('|---|---|---|---|---|');
  
  for (const c of configs) {
    lines.push(`| ${c.id} | ${c.nombre_referencia ?? '(sin nombre)'} | ${c.identificador_fiscal ?? '(encriptado/vacío)'} | ${c.cuenta_compra} | ${c.cuenta_venta} |`);
  }
  
  lines.push('');
  lines.push('## 📄 Listado Detallado de Facturas Procesadas');
  lines.push('| ID | Tipo | Nº Factura | Fecha Emisión | Proveedor (CIF) | Base Imponible | IVA (%) | Cuota IVA | Total | Estado / Incidencias |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');

  for (const d of docs) {
    const tipo = d.tipo_documento === 'FACTURA RECIBIDA' ? 'Recibida' : 'Emitida';
    const num = d.numero_documento ?? '(no detectado)';
    const fecha = d.fecha_emision ? new Date(d.fecha_emision).toISOString().slice(0, 10) : '(sin fecha)';
    
    // Entidades del documento
    const prov = d.entidades_documento.find(e => e.rol === 'proveedor');
    const provStr = prov ? `${prov.nombre} (${prov.identificador_fiscal})` : '(sin proveedor)';
    
    // Impuestos
    const imp = d.impuestos_documento[0];
    const base = d.importe_sin_impuestos != null ? Number(d.importe_sin_impuestos) : 0;
    const total = d.importe_total != null ? Number(d.importe_total) : 0;
    const cuota = imp ? Number(imp.cuota) : 0;
    const pct = imp ? Number(imp.porcentaje) : 0;
    
    // Incidencias
    const incs = d.incidencias_documento.filter(i => i.incidencia && !i.validado);
    const estado = incs.length > 0 
      ? incs.map(i => `⚠️ ${i.descripcion}`).join('<br>') 
      : '✅ OK';

    lines.push(`| ${d.id} | ${tipo} | \`${num}\` | \`${fecha}\` | ${provStr} | ${base.toFixed(2)} € | ${pct}% | ${cuota.toFixed(2)} € | ${total.toFixed(2)} € | ${estado} |`);
  }

  // Guardar reporte
  const fs = require('fs');
  const outputPath = 'C:\\Users\\Facundo\\.gemini\\antigravity-ide\\brain\\9ccd0d56-3992-4916-8e78-c9b04fe9373e\\reporte_completo_empresa_117.md';
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');
  console.log(`Reporte detallado escrito en: ${outputPath}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
