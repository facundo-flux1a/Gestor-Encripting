import db from '../src/lib/db';

async function run() {
  for (const docId of [7527, 7528]) {
    console.log(`\n=== DOCUMENTO ${docId} ===`);

    // Ver datos_extra del documento para saber qué extractor usó
    const [docs] = await db.query<any[]>(
      `SELECT id, numero_documento, datos_extra FROM documentos WHERE id = ?`,
      [docId]
    );
    if (docs[0]) {
      const extra = docs[0].datos_extra ? JSON.parse(docs[0].datos_extra) : {};
      console.log(`Nro: ${docs[0].numero_documento}`);
      console.log(`Extractor: ${extra.extractor || extra.extraction_method || 'N/A'}`);
      console.log(`DI model: ${extra.di_model || 'N/A'}`);
      console.log(`Modo: ${extra.modo || 'N/A'}`);
    }

    // Ver las líneas del documento
    const [lineas] = await db.query<any[]>(
      `SELECT codigo, descripcion, cantidad, unidad, precio_unitario, importe_linea FROM lineas_documento WHERE documento_id = ? ORDER BY id`,
      [docId]
    );
    console.log('Lineas:');
    for (const l of lineas) {
      console.log(`  [${l.codigo || '-'}] ${(l.descripcion || '').substring(0, 50).padEnd(50)} | cant: ${String(l.cantidad).padStart(5)} | p.unit: ${String(l.precio_unitario).padStart(8)} | importe: ${l.importe_linea}`);
    }
  }
  process.exit(0);
}
run().catch(console.error);
