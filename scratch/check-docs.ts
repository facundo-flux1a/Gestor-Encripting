import db from '../src/lib/db';

async function run() {
  for (const docId of [7527, 7528]) {
    console.log(`\n=== DOCUMENTO ${docId} ===`);

    // Check extraction method from archivos_documento
    const [archivos] = await db.query<any[]>(
      `SELECT id, nombre_original, mime_type, datos_extra FROM archivos_documento WHERE documento_id = ?`,
      [docId]
    );
    for (const a of archivos) {
      const extra = a.datos_extra ? JSON.parse(a.datos_extra) : {};
      console.log(`Archivo: ${a.nombre_original} | MIME: ${a.mime_type} | extractor: ${extra.extractor || 'N/A'} | method: ${extra.extraction_method || 'N/A'}`);
    }

    const [lineas] = await db.query<any[]>(
      `SELECT codigo, descripcion, cantidad, unidad, precio_unitario, importe_linea FROM lineas_documento WHERE documento_id = ? ORDER BY id`,
      [docId]
    );
    console.log('Lineas:');
    for (const l of lineas) {
      console.log(`  [${l.codigo || '-'}] ${(l.descripcion || '').substring(0, 60)} | cant: ${l.cantidad} | p.unit: ${l.precio_unitario} | importe: ${l.importe_linea}`);
    }
  }
  process.exit(0);
}
run().catch(console.error);
