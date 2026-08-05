import { prisma } from '../src/lib/prisma';

async function main() {
  const doc = await prisma.archivos_documento.findFirst({
    orderBy: { fecha_subida: 'desc' }
  });
  if (doc) {
    console.log("Documento:", doc.nombre_original);
    if (doc.texto_ocr) {
      console.log("--- OCR TEXT ---");
      const lines = doc.texto_ocr.split('\n');
      for (const line of lines) {
        if (line.includes('23,7') || line.includes('4,99')) {
          console.log(line);
        }
      }
    } else {
      console.log("No OCR text stored.");
    }
  }
}
main().catch(console.error).finally(async () => await prisma.$disconnect());
