import 'dotenv/config';
import fs from 'fs';
import path from 'path';

async function test() {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  console.log('PDFJS Loaded successfully:', typeof pdfjsLib.getDocument);

  const testFile = 'C:\\Users\\Facundo\\Downloads\\muvail\\01_lote_100_facturas.pdf';
  if (fs.existsSync(testFile)) {
    const data = new Uint8Array(fs.readFileSync(testFile));
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdfDoc = await loadingTask.promise;
    console.log(`PDF ${path.basename(testFile)} tiene ${pdfDoc.numPages} páginas.`);

    const page1 = await pdfDoc.getPage(1);
    const textContent = await page1.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(' ');
    console.log('\n--- Texto extraído de la Página 1 ---');
    console.log(pageText.substring(0, 500));
  } else {
    console.log('Archivo no encontrado:', testFile);
  }
}

test().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
