// app/api/unrar/route.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * POST /api/unrar
 * Body: { fileUrl: string }
 * Returns: { files: Array<{ name, data, hash, size }> }
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await req.json();
    const { fileUrl } = body;
    
    if (!fileUrl) {
      return NextResponse.json(
        { error: 'fileUrl is required' },
        { status: 400 }
      );
    }

    console.log(`[UNRAR API] Descargando archivo desde: ${fileUrl}`);
    
    // Descargar el archivo RAR
    const response = await fetch(fileUrl);
    
    if (!response.ok) {
      throw new Error(`Error descargando archivo: ${response.status} ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log(`[UNRAR API] Archivo descargado: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

    // Extraer archivos usando node-unrar-js
    console.log(`[UNRAR API] Extrayendo archivos...`);
    
    // Importación dinámica para evitar problemas con Next.js
    const unrar = await import('node-unrar-js');
    
    const extractor = await unrar.createExtractorFromData({
      data: new Uint8Array(buffer)
    });
    
    const extracted = extractor.extract();
    const files = [];
    
    for (const file of [...extracted.files]) {
      if (file.extraction && !file.fileHeader.flags.directory) {
        const fileData = Buffer.from(file.extraction);
        const hash = crypto.createHash('sha256').update(fileData).digest('hex');
        
        files.push({
          name: file.fileHeader.name,
          data: fileData.toString('base64'),
          hash: hash,
          size: fileData.length
        });
        
        console.log(`[UNRAR API]   ✓ ${file.fileHeader.name} (${(fileData.length / 1024).toFixed(2)} KB)`);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[UNRAR API] ✅ Extraídos ${files.length} archivos en ${duration}ms`);

    return NextResponse.json({
      success: true,
      filesCount: files.length,
      files: files,
      duration: duration
    });

  } catch (error: any) {
    console.error('[UNRAR API] ❌ Error:', error.message);
    return NextResponse.json(
      {
        success: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'unrar-api',
    timestamp: new Date().toISOString()
  });
}