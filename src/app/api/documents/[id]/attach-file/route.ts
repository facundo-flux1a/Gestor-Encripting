import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/user-service';
import { prisma } from '@/lib/prisma';
import connection, { dbName } from '@/lib/db';
import { s3, getBucketName } from '@/lib/s3-client';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { RowDataPacket } from 'mysql2';

export const dynamic = 'force-dynamic';

/**
 * POST /api/documents/[id]/attach-file
 * Permite adjuntar un archivo físico (PDF o imagen) a un documento que no lo tenía
 * (por ejemplo, documentos cargados manualmente o vía API).
 */
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const documentId = parseInt(params.id, 10);
    if (isNaN(documentId)) {
      return NextResponse.json({ error: 'ID de documento inválido' }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'Archivo no proporcionado o inválido' }, { status: 400 });
    }

    // Buscar documento
    const doc = await prisma.documentos.findUnique({
      where: { id: BigInt(documentId) },
      select: { id: true, id_de_empresa: true },
    });

    if (!doc) {
      return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
    }

    // Verificar permisos de la empresa
    const [empresaCheck] = await connection.query<RowDataPacket[]>(
      `SELECT id FROM ${dbName}.empresas WHERE id = ? AND JSON_CONTAINS(id_de_usuario, CAST(? AS JSON))`,
      [Number(doc.id_de_empresa), user.id]
    );

    if (empresaCheck.length === 0) {
      return NextResponse.json({ error: 'Sin permisos sobre este documento' }, { status: 403 });
    }

    // Preparar archivo para MinIO
    const originalName = file.name || 'documento.pdf';
    const cleanFileName = originalName.replace(/ /g, '-').replace(/[^a-zA-Z0-9.\-_]/g, '');
    const ext = originalName.includes('.') ? originalName.split('.').pop()?.toLowerCase() || 'pdf' : 'pdf';
    const mimeType = file.type || (ext === 'pdf' ? 'application/pdf' : 'image/jpeg');

    const uniqueKey = `archivos/attach_${documentId}_${Date.now()}_${cleanFileName}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const bucket = getBucketName();

    console.log(`📤 [ATTACH-FILE] Subiendo archivo para documento #${documentId} a MinIO: ${uniqueKey}`);

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: uniqueKey,
        Body: fileBuffer,
        ContentType: mimeType,
      })
    );

    const endpoint = (process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT || 'https://minio.allbase.com.ar').replace(/\/$/, '');
    const publicUrl = `${endpoint}/${bucket}/${uniqueKey}`;

    // Registrar en archivos_documento
    const nuevoArchivo = await prisma.archivos_documento.create({
      data: {
        documento_id: BigInt(documentId),
        nombre_archivo: originalName,
        ruta_archivo: publicUrl,
        tipo_archivo: ext,
        id_de_empresa: doc.id_de_empresa,
      },
    });

    console.log(`✅ [ATTACH-FILE] Archivo adjuntado con éxito a documento #${documentId} (id: ${nuevoArchivo.id})`);

    return NextResponse.json({
      success: true,
      archivoId: Number(nuevoArchivo.id),
      rutaArchivo: publicUrl,
      nombreArchivo: originalName,
    });
  } catch (error) {
    console.error('❌ [ATTACH-FILE] Error al adjuntar archivo:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error interno al adjuntar el archivo',
      },
      { status: 500 }
    );
  }
}
