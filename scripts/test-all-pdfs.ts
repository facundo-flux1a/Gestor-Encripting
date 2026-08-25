import 'dotenv/config';
import fs from 'fs';
import path from 'path';

async function testAll() {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const files = [
    'C:\\Users\\Facundo\\Downloads\\muvail\\01_lote_100_facturas.pdf',
    'C:\\Users\\Facundo\\Downloads\\muvail\\02_lote_200_facturas.pdf',
    'C:\\Users\\Facundo\\Downloads\\muvail\\03_lote_300_facturas.pdf'
  ];

  for (const f of files) {
    const data = new Uint8Array(fs.readFileSync(f));
    const loadingTask = pdfjsLib.getDocument({ data, useSystemFonts: true });
    const pdfDoc = await loadingTask.promise;
    console.log(`✅ ${path.basename(f)}: ${pdfDoc.numPages} páginas leídas OK`);
  }
}

testAll().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
