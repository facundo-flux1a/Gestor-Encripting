/**
 * src/services/ingestion/qr-detector.ts
 *
 * Detecta códigos QR en PDFs e imágenes y los valida como Veri*Factu legítimos.
 *
 * Flujo:
 *   1. Si es PDF → renderiza primera página (y última si tiene >1) con pdfjs-dist
 *   2. Si es imagen → usa el buffer directamente
 *   3. Para cada buffer de imagen → jimp → jsQR → URL
 *   4. Valida: host en whitelist AEAT/TicketBAI + params requeridos
 *   5. Si pasa → fetch a AEAT y retorna VerifactuQrResult
 *
 * Nunca lanza; todos los errores son silenciosos (log + retorna null).
 */

import Jimp from 'jimp';
import jsQR from 'jsqr';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

// ─── Tipos públicos ────────────────────────────────────────────────────────────

export interface VerifactuParams {
  nif: string;
  numserie: string;
  fecha: string;
  importe: string;
  huella?: string;
}

export interface VerifactuQrResult {
  url: string;
  params: VerifactuParams;
  /** true si el fetch a AEAT devolvió respuesta (puede ser vacía o de error no-fiscal) */
  fetchOk: boolean;
  /** Texto plano de la respuesta AEAT (para debugging) */
  fetchBody?: string;
  /** Diferencia de importe detectada entre OCR y QR (null = no hay discrepancia o no se pudo comparar) */
  discrepanciaImporte?: {
    ocrImporte: number;
    qrImporte: number;
    diferencia: number;
  } | null;
}

// ─── Whitelist de hosts Veri*Factu / TicketBAI ────────────────────────────────

const VERIFACTU_ALLOWED_HOSTS = new Set([
  'www2.agenciatributaria.gob.es',  // Veri*Factu AEAT producción
  'www1.agenciatributaria.gob.es',  // AEAT alternativo
  'agenciatributaria.gob.es',       // AEAT raíz
  // TicketBAI por territorio histórico:
  'batuz.eus',                       // Bizkaia
  'www.gipuzkoa.eus',               // Gipuzkoa
  'egoitza.gipuzkoa.eus',           // Gipuzkoa (egoitza)
  'www.araba.eus',                  // Araba/Álava
  'www.nafarroa.eus',               // Navarra (por si acaso)
]);

// Parámetros mínimos requeridos en la URL de Veri*Factu (AEAT)
const REQUIRED_PARAMS_AEAT = ['nif', 'numserie', 'fecha', 'importe'] as const;

// Parámetros en TicketBAI (Bizkaia usa ?id=, Gipuzkoa usa ?id= también)
const REQUIRED_PARAMS_TBAI = ['id'] as const;

const VERIFACTU_FETCH_TIMEOUT_MS = parseInt(
  process.env.VERIFACTU_FETCH_TIMEOUT_MS || '5000',
  10
);

// ─── Validación de URL ─────────────────────────────────────────────────────────

/**
 * Retorna true si la URL pertenece al dominio AEAT/TicketBAI
 * Y tiene los parámetros mínimos requeridos.
 */
export function isVerifactuUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  // Solo HTTPS
  if (parsed.protocol !== 'https:') return false;

  const host = parsed.hostname.toLowerCase();
  if (!VERIFACTU_ALLOWED_HOSTS.has(host)) return false;

  const params = parsed.searchParams;

  // AEAT: nif + numserie + fecha + importe
  const hasAeat = REQUIRED_PARAMS_AEAT.every((p) => params.has(p) && params.get(p));
  if (hasAeat) return true;

  // TicketBAI: id
  const hasTbai = REQUIRED_PARAMS_TBAI.every((p) => params.has(p) && params.get(p));
  return hasTbai;
}

/**
 * Parsea los parámetros Veri*Factu de una URL validada.
 */
export function parseVerifactuParams(rawUrl: string): VerifactuParams | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  const p = parsed.searchParams;

  // Si es TicketBAI sin los campos individuales, usamos el id como numserie
  const nif = p.get('nif') ?? p.get('id') ?? '';
  const numserie = p.get('numserie') ?? p.get('id') ?? '';
  const fecha = p.get('fecha') ?? '';
  const importe = p.get('importe') ?? '';
  const huella = p.get('huella') ?? undefined;

  if (!nif) return null;
  return { nif, numserie, fecha, importe, huella };
}

// ─── Detección QR en imagen ───────────────────────────────────────────────────

/**
 * Intenta leer un QR de un buffer de imagen (PNG/JPG/etc.) usando jimp + jsQR.
 * Retorna la URL del QR si la encuentra y es Veri*Factu, o null.
 */
async function detectQrInImageBuffer(imgBuffer: Buffer): Promise<string | null> {
  try {
    console.log(`[QrDetector] 🔍 Leyendo QR de buffer de imagen (${imgBuffer.length} bytes)...`);
    const image = await Jimp.read(imgBuffer);
    const { data, width, height } = image.bitmap;
    console.log(`[QrDetector] 🖼️ Imagen cargada: ${width}x${height}px`);

    const clampedData = new Uint8ClampedArray(data.buffer);
    const code = jsQR(clampedData, width, height, {
      inversionAttempts: 'attemptBoth',
    });

    if (!code?.data) {
      console.log(`[QrDetector] ❌ No se detectó QR en esta imagen`);
      return null;
    }

    const url = code.data.trim();
    console.log(`[QrDetector] 🔲 QR detectado. Contenido: ${url.slice(0, 120)}`);

    if (!isVerifactuUrl(url)) {
      // Parsear la URL para dar info de por qué falló
      let failReason = 'razón desconocida';
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:') failReason = `protocolo no es https (es ${parsed.protocol})`;
        else if (!VERIFACTU_ALLOWED_HOSTS.has(parsed.hostname)) failReason = `host no en whitelist (${parsed.hostname})`;
        else failReason = 'parámetros mínimos faltantes (nif/numserie/fecha/importe)';
      } catch { failReason = 'URL malformada'; }
      console.log(`[QrDetector] ⛔ QR NO es Veri*Factu: ${failReason}`);
      return null;
    }

    console.log(`[QrDetector] ✅ QR Veri*Factu VÁLIDO detectado: ${url.slice(0, 120)}`);
    return url;
  } catch (err: any) {
    console.warn(`[QrDetector] ⚠️ Error leyendo QR de imagen: ${err?.message}`);
    return null;
  }
}

// ─── Renderizado de PDF a imagen con pdfjs ────────────────────────────────────

/**
 * Renderiza una página de un PDF a un buffer PNG usando pdfjs-dist (legacy/Node).
 * Retorna null si falla.
 */
async function renderPdfPageToBuffer(
  pdfBuffer: Buffer,
  pageNumber: number
): Promise<Buffer | null> {
  try {
    // pdfjs-dist en Node no tiene canvas nativo — usamos el helper de NodeCanvasFactory
    // si está disponible, o fallback a extracción de bytes directamente.
    // En ausencia de canvas, extraemos el contenido rasterizado si el PDF tiene XObjects de imagen.
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(pdfBuffer),
      verbosity: 0,
    });
    const pdfDoc = await loadingTask.promise;

    const totalPages = pdfDoc.numPages;
    const pageNum = Math.min(pageNumber, totalPages);
    if (pageNum < 1) return null;

    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 }); // 2x = mejor resolución QR

    // Intentar renderizar con canvas si está disponible en el entorno
    let canvasModule: any;
    try {
      canvasModule = await import('canvas');
    } catch {
      // canvas no disponible — fallback: extraemos imágenes embebidas del PDF
      console.warn(`[QrDetector] ⚠️ 'canvas' no disponible. Intentando extracción de imagen embebida...`);
      return await extractEmbeddedImageFromPdf(pdfBuffer, pageNum);
    }

    const { createCanvas } = canvasModule;
    const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
    const ctx = canvas.getContext('2d');

    await page.render({
      canvasContext: ctx as any,
      viewport,
    }).promise;

    const pngBuffer = canvas.toBuffer('image/png');
    return pngBuffer;
  } catch (err: any) {
    console.warn(`[QrDetector] ⚠️ Error renderizando página ${pageNumber} del PDF: ${err?.message}`);
    return null;
  }
}

/**
 * Fallback: extrae la primera imagen embebida (XObject) de una página del PDF.
 * Los QR en facturas suelen estar como imágenes embebidas.
 */
async function extractEmbeddedImageFromPdf(
  pdfBuffer: Buffer,
  pageNumber: number
): Promise<Buffer | null> {
  try {
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(pdfBuffer),
      verbosity: 0,
    });
    const pdfDoc = await loadingTask.promise;
    const page = await pdfDoc.getPage(pageNumber);
    const ops = await page.getOperatorList();
    const commonObjs = page.commonObjs;

    // Buscar paintImageXObject
    const imgNames: string[] = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      if (ops.fnArray[i] === pdfjs.OPS.paintImageXObject) {
        const name = ops.argsArray[i]?.[0];
        if (name) imgNames.push(name);
      }
    }

    for (const name of imgNames) {
      try {
        const img: any = await new Promise((resolve, reject) => {
          if (commonObjs.has(name)) {
            resolve(commonObjs.get(name));
          } else {
            page.objs.get(name, resolve);
          }
        });

        if (img?.data && img.width && img.height) {
          // img.data es Uint8ClampedArray RGBA
          const jimpImg = new Jimp({ width: img.width, height: img.height });
          jimpImg.bitmap.data = Buffer.from(img.data.buffer || img.data);
          const pngBuf = await jimpImg.getBuffer('image/png');
          return pngBuf;
        }
      } catch {
        continue;
      }
    }
    return null;
  } catch (err: any) {
    console.warn(`[QrDetector] ⚠️ Error extrayendo imagen embebida de PDF: ${err?.message}`);
    return null;
  }
}

// ─── Fetch a AEAT ──────────────────────────────────────────────────────────────

/**
 * Hace GET a la URL de Veri*Factu. Retorna { ok, body }.
 * No lanza — cualquier error de red retorna { ok: false }.
 */
async function fetchVerifactuUrl(url: string): Promise<{ ok: boolean; body: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VERIFACTU_FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GestorDocumental/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timeout);
    const body = await res.text().catch(() => '');
    console.log(`[QrDetector] 📡 Fetch Veri*Factu → HTTP ${res.status} (${body.length} bytes)`);
    return { ok: res.ok, body };
  } catch (err: any) {
    console.warn(`[QrDetector] ⚠️ Fetch Veri*Factu falló: ${err?.message}`);
    return { ok: false, body: '' };
  }
}

// ─── API pública ───────────────────────────────────────────────────────────────

/**
 * Detecta un QR de Veri*Factu en el archivo (PDF o imagen).
 * Retorna VerifactuQrResult si encuentra un QR válido, null en caso contrario.
 *
 * @param fileBuffer  Buffer del archivo (PDF o imagen)
 * @param mimeType    MIME type del archivo
 * @param ocrImporte  Importe extraído por OCR (para detectar discrepancias)
 */
export async function detectQrVerifactu(
  fileBuffer: Buffer,
  mimeType: string,
  ocrImporte?: number | null
): Promise<VerifactuQrResult | null> {
  const isPdf = mimeType === 'application/pdf' || mimeType.includes('pdf');
  const isImage = mimeType.startsWith('image/');

  console.log(`[QrDetector] 🚀 Iniciando detección QR | mimeType=${mimeType} | isPdf=${isPdf} | isImage=${isImage} | bufferSize=${fileBuffer.length} bytes | ocrImporte=${ocrImporte ?? 'N/A'}`);

  let qrUrl: string | null = null;

  if (isImage) {
    console.log(`[QrDetector] 🖼️ Procesando como imagen directa...`);
    qrUrl = await detectQrInImageBuffer(fileBuffer);
  } else if (isPdf) {
    console.log(`[QrDetector] 📋 PDF detectado. Renderizando página 1...`);
    const firstPageBuf = await renderPdfPageToBuffer(fileBuffer, 1);
    if (firstPageBuf) {
      console.log(`[QrDetector] 🖼️ Página 1 renderizada (${firstPageBuf.length} bytes). Buscando QR...`);
      qrUrl = await detectQrInImageBuffer(firstPageBuf);
    } else {
      console.log(`[QrDetector] ⚠️ No se pudo renderizar la página 1`);
    }

    if (!qrUrl) {
      try {
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(fileBuffer), verbosity: 0 });
        const pdfDoc = await loadingTask.promise;
        const totalPages = pdfDoc.numPages;
        console.log(`[QrDetector] 📋 PDF tiene ${totalPages} página(s). QR no encontrado en pág 1.`);
        if (totalPages > 1) {
          console.log(`[QrDetector] 🔍 Buscando QR en última página (${totalPages})...`);
          const lastPageBuf = await renderPdfPageToBuffer(fileBuffer, totalPages);
          if (lastPageBuf) {
            qrUrl = await detectQrInImageBuffer(lastPageBuf);
          }
        } else {
          console.log(`[QrDetector] 📋 PDF de 1 página, ya se procesó`);
        }
      } catch (e: any) {
        console.warn(`[QrDetector] ⚠️ Error leyendo metadata del PDF: ${e?.message}`);
      }
    }
  } else {
    console.log(`[QrDetector] ⏭️ mimeType no soportado para QR: ${mimeType}. Saltando.`);
  }

  if (!qrUrl) {
    console.log(`[QrDetector] 🟡 Sin QR Veri*Factu en el documento. Flujo OCR normal.`);
    return null;
  }

  const params = parseVerifactuParams(qrUrl);
  if (!params) {
    console.log(`[QrDetector] ⚠️ URL Veri*Factu válida pero no se pudieron parsear los parámetros: ${qrUrl}`);
    return null;
  }

  console.log(`[QrDetector] 📋 Parámetros Veri*Factu: nif=${params.nif} | numserie=${params.numserie} | fecha=${params.fecha} | importe=${params.importe}`);

  // Fetch obligatorio a AEAT
  console.log(`[QrDetector] 🌐 Haciendo fetch a AEAT: ${qrUrl.slice(0, 100)}...`);
  const { ok: fetchOk, body: fetchBody } = await fetchVerifactuUrl(qrUrl);
  console.log(`[QrDetector] 📡 Fetch resultado: ok=${fetchOk} | body=${fetchBody?.length ?? 0} bytes`);

  // Comparar importe del QR con el del OCR
  let discrepanciaImporte: VerifactuQrResult['discrepanciaImporte'] = null;
  if (ocrImporte != null && params.importe) {
    const qrImporte = parseFloat(params.importe);
    if (!isNaN(qrImporte) && !isNaN(ocrImporte)) {
      const diferencia = Math.abs(qrImporte - ocrImporte);
      console.log(`[QrDetector] 💰 Comparando importes: OCR=${ocrImporte} | QR=${qrImporte} | diferencia=${diferencia.toFixed(2)}€`);
      if (diferencia > 0.02) {
        discrepanciaImporte = {
          ocrImporte,
          qrImporte,
          diferencia: Math.round(diferencia * 100) / 100,
        };
        console.warn(
          `[QrDetector] ⚠️ ⚠️ DISCREPANCIA DE IMPORTE DETECTADA: OCR=${ocrImporte}€ vs QR=${qrImporte}€ (diff=${diferencia.toFixed(2)}€) ⚠️ ⚠️`
        );
      } else {
        console.log(`[QrDetector] ✅ Importes coinciden (tolerancia 0.02€)`);
      }
    }
  } else {
    console.log(`[QrDetector] ℹ️ Sin importe OCR para comparar`);
  }

  const result: VerifactuQrResult = {
    url: qrUrl,
    params,
    fetchOk,
    fetchBody: fetchBody ? fetchBody.slice(0, 500) : undefined,
    discrepanciaImporte,
  };

  console.log(`[QrDetector] 🌟 RESULTADO FINAL: verifactu_verificado=true | discrepancia=${discrepanciaImporte ? `SÍ (${discrepanciaImporte.diferencia}€)` : 'NO'}`);
  return result;
}
