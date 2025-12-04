import { NextRequest, NextResponse } from 'next/server';
import { createExtractorFromData } from 'unrar-js';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
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

    // Extraer con unrar-js
    const extractor = await createExtractorFromData({ data: buffer });
    const list = extractor.getFileList();
    const extracted = extractor.extract();

    // Procesar archivos extraídos
    const fileHashes: { [fileName: string]: string } = {};
    const uploadIds: { [fileName: string]: string } = {};

    for (const file of extracted.files) {
      if (file.extraction) {
        const fileData = file.extraction;
        const hash = crypto.createHash('sha256');
        hash.update(fileData);
        const fileHash = hash.digest('hex');

        const fileName = file.fileHeader.name;
        fileHashes[fileName] = fileHash;

        // Generar uploadId individual
        const childUploadId = `${parentUploadId}_file_${crypto.randomBytes(4).toString('hex')}`;
        uploadIds[fileName] = childUploadId;

        console.log(`[API Extract-RAR] ${fileName} → Hash: ${fileHash.substring(0, 8)}... → UploadId: ${childUploadId}`);
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
  }
}