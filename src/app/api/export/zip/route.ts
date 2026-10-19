/**
 * POST /api/export/zip
 *
 * Dispara la generación async de un ZIP con los documentos indicados.
 * Retorna inmediatamente con jobId + presigned URL pre-reservada.
 *
 * GET /api/export/zip?jobId=xxx
 * Consulta el estado del job.
 *
 * Body POST:
 * {
 *   documentIds: number[],      // IDs de documentos a incluir
 *   expiresInSec?: number,       // TTL de la URL (default 7 días, max 7 días)
 *   notifyEmail?: string,        // si se quiere mail al terminar
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/user-service';
import { prisma } from '@/lib/prisma';
import { getPresignedUrl } from '@/lib/s3-client';
import { randomBytes } from 'crypto';
import {
  triggerZipGeneration,
  getZipJobState,
  generateZipJobId,
} from '@/services/zip-export-service';

export const dynamic = 'force-dynamic';

// ─── GET — estado del job ─────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const jobId = request.nextUrl.searchParams.get('jobId');
  if (!jobId) {
    return NextResponse.json({ error: 'jobId requerido.' }, { status: 400 });
  }

  const state = await getZipJobState(jobId);
  if (!state) {
    return NextResponse.json({ error: 'Job no encontrado o expirado.' }, { status: 404 });
  }

  return NextResponse.json(state);
}

// ─── POST — disparar generación ───────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  let body: any = {};
  try { body = await request.json(); } catch { /* body vacío OK */ }

  const documentIds: number[] = Array.isArray(body.documentIds)
    ? body.documentIds.map(Number).filter((n: number) => !isNaN(n) && n > 0)
    : [];

  if (documentIds.length === 0) {
    return NextResponse.json({ error: 'documentIds es requerido y debe ser un array no vacío.' }, { status: 400 });
  }

  if (documentIds.length > 500) {
    return NextResponse.json({ error: 'Máximo 500 documentos por ZIP.' }, { status: 400 });
  }

  // Derivar empresaId del primer documento (evita tener que pasarlo desde el cliente)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const empresaIdFromSession = (user as any)?.empresaId;
  let empresaId: number;
  if (empresaIdFromSession) {
    empresaId = Number(empresaIdFromSession);
  } else {
    // Para usuarios con múltiples empresas (organization_rol), derivar del primer doc
    const primerDoc = await prisma.documentos.findUnique({
      where: { id: BigInt(documentIds[0]) },
      select: { id_de_empresa: true },
    });
    if (!primerDoc?.id_de_empresa) {
      return NextResponse.json({ error: 'No se pudo determinar la empresa.' }, { status: 400 });
    }
    empresaId = Number(primerDoc.id_de_empresa);
  }

  // TTL: default 7 días, máximo 7 días
  const expiresInSec = Math.min(
    Math.max(Number(body.expiresInSec || 0) || 604800, 3600),
    604800
  );

  // Email de notificación (opcional)
  const notifyEmail: string | null = body.notifyEmail ? String(body.notifyEmail).trim() : null;

  // Nombre de empresa para el mail
  const empresa = await prisma.empresas.findUnique({
    where: { id: empresaId },
    select: { nombre_de_empresa: true },
  });

  // Pre-reservar key en MinIO
  const zipFileName = `export_${Date.now()}_${randomBytes(4).toString('hex')}.zip`;
  const s3ZipKey = `exports/${empresaId}/${zipFileName}`;

  // Generar presigned URL (el objeto no existe todavía — se firmará antes de que esté disponible)
  const masterLinkUrl = await getPresignedUrl(s3ZipKey, expiresInSec);
  if (!masterLinkUrl) {
    return NextResponse.json({ error: 'No se pudo pre-reservar URL en MinIO.' }, { status: 500 });
  }

  // Disparar generación en background
  const jobId = generateZipJobId();
  triggerZipGeneration(jobId, {
    documentIds,
    empresaId,
    s3ZipKey,
    expiresInSec,
    notifyEmail,
    empresaNombre: empresa?.nombre_de_empresa || undefined,
  });

  return NextResponse.json({
    jobId,
    masterLink: masterLinkUrl,
    expiresInSec,
    documentCount: documentIds.length,
    message: 'ZIP en generación. Consultá el estado con GET /api/export/zip?jobId=xxx.',
  });
}
