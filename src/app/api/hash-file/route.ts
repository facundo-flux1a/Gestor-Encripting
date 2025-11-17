// app/api/hash-file/route.ts
// Endpoint para calcular hashes SHA-256 desde n8n

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import JSZip from 'jszip';

/**
 * Calcula el hash SHA-256 del archivo
 */
async function calculateFileHash(fileBuffer: ArrayBuffer): Promise<string> {
  const hash = crypto.createHash('sha256');
  hash.update(Buffer.from(fileBuffer));
  return hash.digest('hex');
}

/**
 * Descomprime un ZIP y calcula el hash SHA-256 de cada archivo individual
 */
async function extractAndHashZipFiles(fileBuffer: ArrayBuffer): Promise<{ [fileName: string]: string }> {
  const zip = new JSZip();
  const zipContent = await zip.loadAsync(Buffer.from(fileBuffer));
  const fileHashes: { [fileName: string]: string } = {};

  for (const [fileName, zipEntry] of Object.entries(zipContent.files)) {
    if (!zipEntry.dir) {
      const fileData = await zipEntry.async('arraybuffer');
      const hash = crypto.createHash('sha256');
      hash.update(Buffer.from(fileData));
      const fileHash = hash.digest('hex');
      fileHashes[fileName] = fileHash;
      console.log(`  [ZIP] ${fileName} → Hash: ${fileHash}`);
    }
  }

  return fileHashes;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No se proporcionó ningún archivo' },
        { status: 400 }
      );
    }

    const fileName = file.name;
    const fileSize = file.size;
    const fileExtension = fileName.toLowerCase().split('.').pop() || '';

    console.log(`[Hash API] Procesando: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

    // Convertir archivo a buffer
    const fileBuffer = await file.arrayBuffer();

    // Calcular hash del archivo completo
    const mainFileHash = await calculateFileHash(fileBuffer);
    console.log(`[Hash API] Hash principal: ${mainFileHash}`);

    const response: any = {
      fileName: fileName,
      fileSize: fileSize,
      fileHash: mainFileHash,
      isCompressedFile: fileExtension === 'zip',
      individualFileHashes: null
    };

    // Si es ZIP, extraer y hashear archivos individuales
    if (fileExtension === 'zip') {
      try {
        console.log(`[Hash API] Extrayendo contenido del ZIP...`);
        const individualHashes = await extractAndHashZipFiles(fileBuffer);
        response.individualFileHashes = individualHashes;
        console.log(`[Hash API] ✅ Procesado ZIP con ${Object.keys(individualHashes).length} archivos`);
      } catch (zipError: any) {
        console.error('[Hash API] Error al procesar ZIP:', zipError.message);
        response.zipError = zipError.message;
      }
    }

    console.log(`[Hash API] ✅ Proceso completado para: ${fileName}`);

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('[Hash API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al procesar el archivo' },
      { status: 500 }
    );
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'hash-api',
    version: '1.0.0'
  });
}