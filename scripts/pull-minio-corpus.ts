/**
 * Descarga corpus de evaluación desde MinIO.
 * SOLO ListObjectsV2 + GetObject. Nunca Put/Delete/Copy.
 *
 * Usage: npm run corpus:pull
 */
import 'dotenv/config';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { writeFileSync, existsSync, mkdirSync, statSync } from 'fs';
import path from 'path';

const endpoint = (process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT || '').replace(/\/$/, '');
const bucket = process.env.MINIO_BUCKET_NAME!;
const outDir = path.resolve('tests/fixtures/documents/raw');
mkdirSync(outDir, { recursive: true });

const client = new S3Client({
  region: process.env.MINIO_REGION || 'us-east-1',
  endpoint,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY!,
    secretAccessKey: process.env.MINIO_SECRET_KEY!,
  },
  forcePathStyle: true,
});

console.log('🔒 MODE: READ-ONLY (ListObjectsV2 + GetObject only). No writes to MinIO.');

async function main() {
  const all: Array<{ key: string; size: number; name: string }> = [];
  let token: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: 'archivos/',
        ContinuationToken: token,
        MaxKeys: 1000,
      })
    );
    for (const o of res.Contents || []) {
      if (!o.Key || o.Key.endsWith('/')) continue;
      all.push({ key: o.Key, size: o.Size || 0, name: o.Key.split('/').pop()! });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  const selected = pickDiverse(all);
  const manifest: unknown[] = [];

  for (const item of selected) {
    const safe = item.name.replace(/[^\w.\-()]+/g, '_').slice(0, 100);
    const localName = `${item.archetype}__${safe}`;
    const localPath = path.join(outDir, localName);
    if (existsSync(localPath) && statSync(localPath).size > 0) {
      manifest.push({ ...item, localName, skippedExisting: true });
      continue;
    }
    console.log('GET', item.key);
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: item.key }));
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as AsyncIterable<Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buf = Buffer.concat(chunks);
    writeFileSync(localPath, buf);
    manifest.push({
      ...item,
      localName,
      localPath: `tests/fixtures/documents/raw/${localName}`,
      bytesWritten: buf.length,
      downloadedAt: new Date().toISOString(),
      source: 'minio-readonly-get',
    });
  }

  writeFileSync(
    path.resolve('tests/fixtures/documents/manifest.json'),
    JSON.stringify(
      {
        mode: 'minio-readonly',
        note: 'Only List+Get from MinIO. Never write/delete MinIO.',
        bucket,
        endpoint,
        count: manifest.length,
        files: manifest,
      },
      null,
      2
    )
  );
  console.log('DONE', manifest.length, 'files → tests/fixtures/documents/raw/');
}

function pickDiverse(items: Array<{ key: string; size: number; name: string }>) {
  const picked: Array<{ key: string; size: number; name: string; archetype: string }> = [];
  const used = new Set<string>();
  const add = (obj: { key: string; size: number; name: string } | undefined, archetype: string) => {
    if (!obj || used.has(obj.key)) return false;
    if (obj.size > 5 * 1024 * 1024) return false;
    if (obj.name.includes('=?utf-8')) return false;
    if (/lote_?\d+_facturas/i.test(obj.name)) return false;
    used.add(obj.key);
    picked.push({ ...obj, archetype });
    return true;
  };

  const pdfs = items.filter((i) => /\.pdf$/i.test(i.name));
  const imgs = items.filter((i) => /\.(jpe?g|png)$/i.test(i.name));
  const bands: Array<[string, typeof pdfs, number]> = [
    ['pdf_digital_small', pdfs.filter((i) => i.size > 3e3 && i.size < 40e3), 12],
    ['pdf_medium', pdfs.filter((i) => i.size >= 40e3 && i.size < 200e3), 10],
    [
      'pdf_large_or_scanlike',
      pdfs.filter((i) => i.size >= 200e3 && i.size < 1.5e6 && !/finiquito|nomin/i.test(i.name)),
      6,
    ],
    ['pdf_sueltas', pdfs.filter((i) => /suelta/i.test(i.name) && i.size < 2e6), 6],
    [
      'pdf_single',
      pdfs.filter(
        (i) =>
          !/lote|sueltas|RESUMEN|grupo_/i.test(i.name) &&
          i.size > 5e3 &&
          i.size < 500e3 &&
          !/finiquito|nomin/i.test(i.name)
      ),
      10,
    ],
  ];

  for (const [arch, list, n] of bands) {
    let count = 0;
    const step = Math.max(1, Math.floor(list.length / Math.max(n, 1)));
    for (let i = 0; i < list.length && count < n; i += step) {
      if (add(list[i], arch)) count++;
    }
  }
  let imgCount = 0;
  for (const img of imgs) {
    if (imgCount >= 8) break;
    if (img.size < 500 || img.size > 4e6) continue;
    if (add(img, img.size > 500e3 ? 'image_scan_heavy' : 'image_scan')) imgCount++;
  }
  return picked.slice(0, 50);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
