import db from '../src/lib/db';

async function run() {
  for (const docId of [7527, 7528]) {
    console.log(`\n=== DOCUMENTO ${docId} ===`);

    const [docs] = await db.query<any[]>(
      `SELECT id, numero_documento, datos_extra FROM documentos WHERE id = ?`,
      [docId]
    );
    if (docs[0]) {
      // datos_extra may be a Buffer or object, not a plain string
      let extra: any = {};
      try {
        const raw = docs[0].datos_extra;
        if (raw && typeof raw === 'object' && !Buffer.isBuffer(raw)) {
          extra = raw;
        } else {
          extra = JSON.parse(raw?.toString() || '{}');
        }
      } catch { extra = {}; }
      console.log(`Nro: ${docs[0].numero_documento}`);
      console.log(`Extractor: ${extra.extractor || extra.extraction_method || 'N/A'}`);
      console.log(`DI model: ${extra.di_model || 'N/A'}`);
      console.log(`Raw extra keys: ${Object.keys(extra).join(', ')}`);
    }

    const [lineas] = await db.query<any[]>(
      `SELECT codigo, descripcion, cantidad, unidad, precio_unitario, importe_linea FROM lineas_documento WHERE documento_id = ? ORDER BY id`,
      [docId]
    );
    console.log('Lineas:');
    for (const l of lineas) {
      console.log(`  [${(l.codigo||'-').padEnd(12)}] ${(l.descripcion||'').substring(0,45).padEnd(45)} cant:${String(l.cantidad).padStart(5)} p.unit:${String(l.precio_unitario).padStart(8)}`);
    }
  }
  process.exit(0);
}
run().catch(console.error);
