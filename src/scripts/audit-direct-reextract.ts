/**
 * Reparación auditada de páginas concretas de un lote ya almacenado.
 *
 * No pasa por BullMQ: usa la misma normalización, guardas y transacción del
 * worker, pero evita que un consumidor viejo de la cola descarte el resultado.
 * Está acotado al ZIP de validación de Espais de Dunes.
 */
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { prisma } from '@/lib/prisma';
import { FiscalStatus } from '@/lib/document-fiscal-status';
import { PROMPT_EXTRACTOR_FACTURABLE } from '@/services/ingestion/prompts_v2';
import { callAzureOpenAiChat, parseLlmJson } from '@/services/ingestion/azure-openai';
import { normalizeDocumento } from '@/services/ingestion/normalize';
import { runFiscalGuards } from '@/services/ingestion/fiscal-guards';
import { processDbWriterJob } from '@/workers/db-writer.worker';

const ROOT = 'validation_zip_1787548498638_8df2c499';
const COMPANY_CIF = 'B97376321';
const COMPANY_NAME = 'ESPAIS DE DUNES S.L.';
const SOURCE_PARENTS = [
  `${ROOT}_entry_1cfcc0975f0fb786bf02`,
  `${ROOT}_entry_20a6f3eed95040063391`,
  `${ROOT}_entry_f70eb3cdc001853ecadc`,
  `${ROOT}_entry_d64947460dd93001e5d4`,
];

const expected = new Map<string, { numero: string; total: number }>([
  ['04_sueltas_grupo_01.pdf - Pág 19', { numero: 'REC-2026-0619', total: 2200 }],
  ['01_lote_100_facturas.pdf - Pág 50', { numero: 'REC-2026-0050', total: 2080 }],
  ['02_lote_200_facturas.pdf - Pág 45', { numero: 'REC-2026-0145', total: 416 }],
  ['02_lote_200_facturas.pdf - Pág 132', { numero: 'REC-2026-0232', total: 1040 }],
  ['02_lote_200_facturas.pdf - Pág 150', { numero: 'REC-2026-0250', total: 320 }],
  ['03_lote_300_facturas.pdf - Pág 166', { numero: 'REC-2026-0466', total: 242 }],
  ['03_lote_300_facturas.pdf - Pág 176', { numero: 'REC-2026-0476', total: 674 }],
  ['03_lote_300_facturas.pdf - Pág 251', { numero: 'REC-2026-0551', total: 880 }],
  ['03_lote_300_facturas.pdf - Pág 255', { numero: 'REC-2026-0555', total: 832 }],
  ['03_lote_300_facturas.pdf - Pág 277', { numero: 'REC-2026-0577', total: 750 }],
]);

async function readObject(key: string): Promise<Buffer> {
  const s3 = new S3Client({
    region: process.env.MINIO_REGION || 'us-east-1',
    endpoint:
      process.env.MINIO_INTERNAL_ENDPOINT ||
      process.env.MINIO_ENDPOINT ||
      process.env.MINIO_PUBLIC_ENDPOINT,
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY!,
      secretAccessKey: process.env.MINIO_SECRET_KEY!,
    },
    forcePathStyle: true,
  });
  const response = await s3.send(
    new GetObjectCommand({ Bucket: process.env.MINIO_BUCKET_NAME!, Key: key })
  );
  const chunks: Buffer[] = [];
  for await (const chunk of response.Body as NodeJS.ReadableStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function pageFromName(name: string): number {
  const page = Number(name.match(/Pág (\d+)$/)?.[1]);
  if (!Number.isInteger(page) || page < 1) throw new Error(`Página inválida: ${name}`);
  return page;
}

function totalPages(fileName: string): number {
  if (fileName === '01_lote_100_facturas.pdf') return 100;
  if (fileName === '02_lote_200_facturas.pdf') return 200;
  if (fileName === '03_lote_300_facturas.pdf') return 300;
  return 50;
}

async function cropPage(sourceUrl: string, page: number, uploadId: string) {
  const response = await fetch(process.env.PDFTOOLS_URL || 'https://pdftools.allbase.com.ar/split', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.PDFTOOLS_API_KEY || 'pdf_tools_secret',
    },
    body: JSON.stringify({
      pdf_url: sourceUrl,
      page_start: page,
      page_end: page,
      filename: `audit_${uploadId}`,
    }),
  });
  if (!response.ok) throw new Error(`PDFTools ${response.status}: ${await response.text()}`);

  const data = (await response.json()) as { url?: string };
  if (!data.url) throw new Error('PDFTools no devolvió URL del recorte');

  const bucket = process.env.MINIO_BUCKET_NAME || 'gestor-documental';
  const key = new URL(data.url).pathname.replace(new RegExp(`^/${bucket}/`), '');
  return { buffer: await readObject(key), croppedUrl: data.url };
}

async function main() {
  const targets: any[] = await prisma.actividad.findMany({
    where: {
      parent_upload_id: { in: SOURCE_PARENTS },
      documento_nombre: { in: [...expected.keys()] },
    },
    select: {
      upload_id: true,
      parent_upload_id: true,
      documento_nombre: true,
      file_hash: true,
      documento_id: true,
    },
  });

  if (targets.length !== expected.size) {
    throw new Error(`Se esperaban ${expected.size} páginas pendientes y se encontraron ${targets.length}`);
  }

  const parentIds = [...new Set(targets.map((target) => target.parent_upload_id).filter(Boolean))] as string[];
  const parents: any[] = await prisma.actividad.findMany({
    where: { upload_id: { in: parentIds } },
    select: {
      upload_id: true,
      documento_nombre: true,
      file_path: true,
      id_de_empresa: true,
      dashboard_correo: true,
    },
  });
  const parentById = new Map(parents.map((parent) => [parent.upload_id, parent]));

  const endpoint = (process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT || 'https://minio.allbase.com.ar').replace(/\/$/, '');
  const bucket = process.env.MINIO_BUCKET_NAME || 'gestor-documental';
  const results: Array<Record<string, unknown>> = [];

  for (const target of targets.sort((a, b) => a.documento_nombre!.localeCompare(b.documento_nombre!))) {
    const name = target.documento_nombre!;
    const check = expected.get(name)!;

    // Una página puede haberse guardado correctamente mientras se resolvía
    // una carrera previa de colas. La validamos y preservamos; sólo se vuelve
    // a extraer lo que aún no tiene documento.
    if (target.documento_id) {
      const document = await prisma.documentos.findUnique({
        where: { id: target.documento_id },
        select: { numero_documento: true, importe_total: true, tipo_documento: true },
      });
      const actualTotal = document ? Number(document.importe_total) : NaN;
      results.push({
        page: name,
        expected: check,
        actual: document && { numero: document.numero_documento, total: actualTotal, tipo: document.tipo_documento },
        persisted: true,
        reusedValidatedDocument: true,
        matches:
          document?.numero_documento === check.numero &&
          Number.isFinite(actualTotal) &&
          (Math.abs(actualTotal - check.total) < 0.005 ||
            (document?.tipo_documento?.includes('ABONO') === true &&
              Math.abs(Math.abs(actualTotal) - check.total) < 0.005)),
      });
      continue;
    }

    const parent = parentById.get(target.parent_upload_id!);
    if (!parent?.file_path || !parent.documento_nombre || !target.file_hash) {
      throw new Error(`Faltan datos de origen para ${name}`);
    }

    const page = pageFromName(name);
    await prisma.actividad.update({
      where: { upload_id: target.upload_id },
      data: {
        status: 'procesando',
        step: 'Auditoría: extracción directa de página',
        progress: 60,
        mensaje: 'Analizando sólo el recorte de la página fuente.',
        error_detalle: null,
        completed_at: null,
      },
    });

    const sourceUrl = `${endpoint}/${bucket}/${parent.file_path}`;
    const { buffer, croppedUrl } = await cropPage(sourceUrl, page, target.upload_id);
    const prompt = `${PROMPT_EXTRACTOR_FACTURABLE
      .replace(/\{\{CIF_EMPRESA\}\}/g, COMPANY_CIF)
      .replace(/\{\{NOMBRE_EMPRESA\}\}/g, COMPANY_NAME)
      .replace(/\{\{RECARGO_EMPRESA\}\}/g, 'false')}

AUDITORÍA DE REEXTRACCIÓN: analiza únicamente esta página recortada. Extrae sólo los valores impresos en ella; no reutilices datos de otras facturas. Devuelve el JSON completo.`;
    const llm = await callAzureOpenAiChat({ prompt, fileBuffer: buffer, mimeType: 'application/pdf' });
    const normalized = normalizeDocumento(parseLlmJson(llm.text));
    const guard = runFiscalGuards(normalized, { empresaCif: COMPANY_CIF });
    const ingestion = {
      uploadId: target.upload_id,
      parentUploadId: parent.upload_id,
      empresaId: String(parent.id_de_empresa),
      cif: COMPANY_CIF,
      nombreEmpresa: COMPANY_NAME,
      recargo: false,
      text: parent.file_path,
      fileName: parent.documento_nombre,
      originalFileName: parent.documento_nombre,
      fileHash: target.file_hash,
      publicUrl: croppedUrl,
      mimeType: 'application/pdf',
      normalizedFileType: 'pdf',
      fileExtension: 'pdf',
      fileSize: buffer.length,
      isCompressedFile: false,
      fechaSubida: new Date().toISOString(),
      origen: parent.dashboard_correo === 'correo' ? ('correo' as const) : ('dashboard' as const),
      documentoIndex: page,
      totalDocumentos: totalPages(parent.documento_nombre),
      pageStart: page,
      pageEnd: page,
    };

    await processDbWriterJob({
      id: `audit-direct-${target.upload_id}`,
      data: {
        ingestion,
        aiResult: normalized,
        fiscalStatus: guard.ok ? FiscalStatus.VALIDADO : FiscalStatus.REVISION,
        fiscalRevisionReasons: guard.ok ? undefined : guard.failures,
      },
    } as any);

    const activity = await prisma.actividad.findUnique({
      where: { upload_id: target.upload_id },
      select: { documento_id: true, status: true },
    });
    const document = activity?.documento_id
      ? await prisma.documentos.findUnique({
          where: { id: activity.documento_id },
          select: { numero_documento: true, importe_total: true, tipo_documento: true },
        })
      : null;
    const actualTotal = document ? Number(document.importe_total) : NaN;
    const matches =
      document?.numero_documento === check.numero &&
      Number.isFinite(actualTotal) &&
      (Math.abs(actualTotal - check.total) < 0.005 ||
        (document?.tipo_documento?.includes('ABONO') === true &&
          Math.abs(Math.abs(actualTotal) - check.total) < 0.005));

    results.push({
      page: name,
      expected: check,
      actual: document && { numero: document.numero_documento, total: actualTotal, tipo: document.tipo_documento },
      fiscalGuardOk: guard.ok,
      incidenceReasons: guard.failures.map((failure) => failure.code),
      persisted: Boolean(activity?.documento_id),
      matches,
    });
  }

  console.log(JSON.stringify(results, null, 2));
  if (results.some((result) => result.matches !== true)) {
    throw new Error('La reextracción directa no coincidió con todos los valores esperados');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
