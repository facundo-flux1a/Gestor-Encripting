import { NextRequest, NextResponse } from 'next/server';
import { Extract } from 'node-rar';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  let tempDir: string | null = null;
  let tempRarPath: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const parentUploadId = formData.get('parentUploadId') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No se proporcionó ningún archivo' },
        { status: 400 }
      );
    }

    if (!parentUploadId) {
      return NextResponse.json(
        { error: 'No se proporcionó parentUploadId' },
        { status: 400 }
      );
    }

    console.log(`[API Extract-RAR] Procesando: ${file.name}`);
    console.log(`[API Extract-RAR] Parent Upload ID: ${parentUploadId}`);

    // Leer archivo
    const fileBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(fileBuffer);

    // Crear directorios temporales
    tempDir = path.join(
      os.tmpdir(),
      `rar_extract_${Date.now()}_${Math.random().toString(36).substring(7)}`
    );
    tempRarPath = path.join(os.tmpdir(), `${Date.now()}_${file.name}`);

    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(tempRarPath, buffer);

    console.log(`[API Extract-RAR] Archivo temporal: ${tempRarPath}`);
    console.log(`[API Extract-RAR] Directorio extracción: ${tempDir}`);

    // Extraer archivos
    const archive = new Extract({
      file: tempRarPath,
      dest: tempDir,
    });

    await new Promise<void>((resolve, reject) => {
      archive.extract((err, entries) => {
        if (err) {
          console.error(`[API Extract-RAR] Error extrayendo:`, err);
          reject(err);
        } else {
          console.log(`[API Extract-RAR] Extraídos ${entries?.length || 0} archivos`);
          resolve();
        }
      });
    });

    // Leer archivos extraídos y calcular hashes
    const fileHashes: { [fileName: string]: string } = {};
    const uploadIds: { [fileName: string]: string } = {};
    const extractedFiles = await fs.readdir(tempDir, { recursive: true });

    for (const file of extractedFiles) {
      const filePath = path.join(tempDir, file.toString());
      const stats = await fs.stat(filePath);

      if (stats.isFile()) {
        const fileData = await fs.readFile(filePath);
        const hash = crypto.createHash('sha256');
        hash.update(fileData);
        const fileHash = hash.digest('hex');

        // Nombre relativo del archivo
        const relativePath = path.relative(tempDir, filePath);
        fileHashes[relativePath] = fileHash;

        // Generar uploadId individual
        const childUploadId = `${parentUploadId}_file_${crypto.randomBytes(4).toString('hex')}`;
        uploadIds[relativePath] = childUploadId;

        console.log(`[API Extract-RAR] ${relativePath} → Hash: ${fileHash.substring(0, 8)}... → UploadId: ${childUploadId}`);
      }
    }

    console.log(`[API Extract-RAR] ✅ Procesados ${Object.keys(fileHashes).length} archivos`);

    return NextResponse.json({
      success: true,
      fileHashes,
      uploadIds,
      fileCount: Object.keys(fileHashes).length,
      parentUploadId,
    });
  } catch (error: any) {
    console.error('[API Extract-RAR] ❌ Error:', error);
    return NextResponse.json(
      { 
        error: 'Error al procesar archivo RAR',
        details: error.message 
      },
      { status: 500 }
    );
  } finally {
    // Limpiar archivos temporales
    try {
      if (tempDir) {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
      if (tempRarPath) {
        await fs.unlink(tempRarPath);
      }
      console.log(`[API Extract-RAR] 🧹 Archivos temporales eliminados`);
    } catch (cleanupError) {
      console.warn('[API Extract-RAR] ⚠️ Error limpiando temporales:', cleanupError);
    }
  }
}