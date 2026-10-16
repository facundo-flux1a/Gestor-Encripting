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

import { spawn } from 'child_process';
import { Jimp } from 'jimp';
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

/** Estado semántico del resultado de la consulta a AEAT */
export type VerifactuAeatEstado =
  | 'ENCONTRADA'        // resultado: '00' — AEAT confirmó la factura
  | 'NO_ENCONTRADA'     // resultado: '01' — AEAT no la tiene (anulada o no registrada)
  | 'NO_CONTRASTABLE'   // resultado: '02' — sistema No Veri*Factu, custodia propia
  | 'ERROR_CONSULTA';   // error de red, timeout, KO de AEAT o rate-limit (3002)

export interface VerifactuQrResult {
  url: string;
  params: VerifactuParams;
  /** true si HTTP respondió OK (no implica que la factura esté registrada en AEAT) */
  fetchOk: boolean;
  /** Texto plano de la respuesta AEAT (para debugging) */
  fetchBody?: string;
  /** Estado semántico del resultado AEAT */
  aeatEstado?: VerifactuAeatEstado;
  /** Código crudo devuelto por AEAT: '00', '01', '02', o null si no hubo JSON */
  aeatCodigo?: '00' | '01' | '02' | null;
  /** Código de error AEAT en caso de KO (ej: '3002', '1003.1004') */
  aeatError?: string | null;
  /** ISO timestamp del momento de la consulta */
  aeatFechaConsulta?: string;
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

export function isVerifactuAllowedHost(host: string): boolean {
  if (VERIFACTU_ALLOWED_HOSTS.has(host)) return true;
  // Sandbox/preproducción AEAT — se activa dinámicamente si VERIFACTU_ALLOW_SANDBOX=true
  if (process.env.VERIFACTU_ALLOW_SANDBOX === 'true') {
    if (host === 'prewww2.aeat.es' || host === 'prewww1.aeat.es' || host === 'prewww.aeat.es') {
      return true;
    }
  }
  return false;
}

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
  if (!isVerifactuAllowedHost(host)) return false;

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

    const clampedData = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length);
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
        else if (!isVerifactuAllowedHost(parsed.hostname.toLowerCase())) failReason = `host no en whitelist (${parsed.hostname})`;
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

// ─── Renderizado de PDF a imagen ──────────────────────────────────────────────

/**
 * Renderiza una página de un PDF a buffer PNG usando pdftoppm (nativo, rápido, 100% fiel).
 * Retorna null si falla o si pdftoppm no está disponible en el sistema.
 */
async function renderPdfPageWithPdftoppm(
  pdfBuffer: Buffer,
  pageNumber: number
): Promise<Buffer | null> {
  return new Promise((resolve) => {
    try {
      const child = spawn('pdftoppm', [
        '-png',
        '-r', '200',
        '-f', String(pageNumber),
        '-l', String(pageNumber),
      ]);
      const chunks: Buffer[] = [];
      child.stdout.on('data', (chunk) => chunks.push(chunk));
      child.stderr.on('data', () => {});
      child.on('error', () => resolve(null));
      child.on('close', (code) => {
        if (code === 0 && chunks.length > 0) {
          resolve(Buffer.concat(chunks));
        } else {
          resolve(null);
        }
      });
      child.stdin.write(pdfBuffer);
      child.stdin.end();
    } catch {
      resolve(null);
    }
  });
}

/**
 * Renderiza una página de un PDF a un buffer PNG.
 * 1. Intenta pdftoppm (Poppler / nativo en Linux, 100% fiel con vectores/QR).
 * 2. Fallback a pdfjs-dist / canvas / extracción de imagen embebida.
 * Retorna null si falla.
 */
async function renderPdfPageToBuffer(
  pdfBuffer: Buffer,
  pageNumber: number
): Promise<Buffer | null> {
  // 1. Intentar primero con pdftoppm
  try {
    const popplerBuffer = await renderPdfPageWithPdftoppm(pdfBuffer, pageNumber);
    if (popplerBuffer && popplerBuffer.length > 0) {
      console.log(`[QrDetector] 📄 Página ${pageNumber} renderizada exitosamente con pdftoppm (${popplerBuffer.length} bytes)`);
      return popplerBuffer;
    }
  } catch (err: any) {
    console.warn(`[QrDetector] ⚠️ pdftoppm no disponible o falló: ${err?.message}`);
  }

  // 2. Fallback con pdfjs-dist
  try {
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(pdfBuffer),
      verbosity: 0,
    });
    const pdfDoc = await loadingTask.promise;

    const totalPages = pdfDoc.numPages;
    const pageNum = Math.min(pageNumber, totalPages);
    if (pageNum < 1) return null;

    const page = await pdfDoc.getPage(pageNum);
    const unscaledViewport = page.getViewport({ scale: 1.0 });
    // Limitar dimensiones a máx 2048px para evitar que @napi-rs/canvas (Skia) consuma memoria excesiva o haga panic
    const maxDimension = 2048;
    const computedScale = Math.min(2.0, maxDimension / Math.max(unscaledViewport.width, unscaledViewport.height, 1));
    const viewport = page.getViewport({ scale: Math.max(computedScale, 0.5) });

    let canvasModule: any;
    try {
      canvasModule = await import('canvas');
    } catch {
      console.warn(`[QrDetector] ⚠️ 'canvas' no disponible. Intentando extracción de imagen embebida...`);
      return await extractEmbeddedImageFromPdf(pdfBuffer, pageNum);
    }

    const { createCanvas } = canvasModule;
    const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
    const ctx = canvas.getContext('2d');

    await page.render({
      canvasContext: ctx as any,
      viewport,
      canvas: canvas as any,
    } as any).promise;

    const pngBuffer = canvas.toBuffer('image/png');
    try {
      await page.cleanup();
      await (pdfDoc as any).cleanup?.();
      await loadingTask.destroy?.();
    } catch { /* ignorar cleanup errors */ }

    return pngBuffer;
  } catch (err: any) {
    console.warn(`[QrDetector] ⚠️ Error renderizando página ${pageNumber} del PDF con pdfjs: ${err?.message}`);
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

/** Resultado parseado de la respuesta JSON de la AEAT */
interface AeatJsonResponse {
  fetchOk: boolean;
  fetchBody: string;
  aeatEstado: VerifactuAeatEstado;
  aeatCodigo: '00' | '01' | '02' | null;
  aeatError: string | null;
}

/**
 * Hace GET a la URL de Veri*Factu con &formato=json.
 * Parsea la respuesta de la AEAT y mapea el campo `resultado` al estado semántico.
 * No lanza — cualquier error de red o parseo retorna ERROR_CONSULTA.
 */
async function fetchVerifactuUrl(url: string): Promise<AeatJsonResponse> {
  const aeatFechaConsulta = new Date().toISOString();
  // Construir URL con formato=json (nunca va en el QR impreso, solo en consultas automáticas)
  const jsonUrl = url.includes('formato=') ? url : `${url}&formato=json`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VERIFACTU_FETCH_TIMEOUT_MS);
    const res = await fetch(jsonUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GestorDocumental/1.0)',
        'Accept': 'application/json,text/html',
      },
    });
    clearTimeout(timeout);
    const body = await res.text().catch(() => '');
    console.log(`[QrDetector] 📡 Fetch Veri*Factu → HTTP ${res.status} (${body.length} bytes)`);

    // Intentar parsear el JSON de respuesta de la AEAT
    let aeatEstado: VerifactuAeatEstado = 'ERROR_CONSULTA';
    let aeatCodigo: '00' | '01' | '02' | null = null;
    let aeatError: string | null = null;

    if (res.ok && body) {
      try {
        const json = JSON.parse(body);
        if (json?.status === 'OK' && json?.respuesta?.resultado) {
          const resultado = String(json.respuesta.resultado);
          if (resultado === '00') {
            aeatEstado = 'ENCONTRADA';
            aeatCodigo = '00';
          } else if (resultado === '01') {
            aeatEstado = 'NO_ENCONTRADA';
            aeatCodigo = '01';
          } else if (resultado === '02') {
            aeatEstado = 'NO_CONTRASTABLE';
            aeatCodigo = '02';
          } else {
            // Resultado desconocido — tratamos como ERROR_CONSULTA
            aeatEstado = 'ERROR_CONSULTA';
            aeatError = `resultado_desconocido:${resultado}`;
          }
        } else if (json?.status === 'KO') {
          aeatEstado = 'ERROR_CONSULTA';
          aeatError = json?.codigo_error ? String(json.codigo_error) : 'KO_sin_codigo';
          if (aeatError?.includes('3002')) {
            console.error('[QrDetector] 🚨 AEAT rate-limit excedido (3002). Se recomienda no consultar más hoy.');
          }
        } else {
          // Respuesta inesperada (HTML u otro formato) — no sabemos el resultado
          aeatEstado = 'ERROR_CONSULTA';
          aeatError = 'respuesta_no_json';
        }
      } catch {
        // JSON.parse falló — la AEAT devolvió HTML u otro formato
        aeatEstado = 'ERROR_CONSULTA';
        aeatError = 'parse_error';
      }
    } else if (!res.ok) {
      aeatEstado = 'ERROR_CONSULTA';
      aeatError = `http_${res.status}`;
    }

    console.log(`[QrDetector] 🔎 AEAT estado=${aeatEstado} | codigo=${aeatCodigo ?? '—'} | error=${aeatError ?? 'ninguno'}`);
    return { fetchOk: res.ok, fetchBody: body.slice(0, 500), aeatEstado, aeatCodigo, aeatError };
  } catch (err: any) {
    console.warn(`[QrDetector] ⚠️ Fetch Veri*Factu falló: ${err?.message}`);
    return { fetchOk: false, fetchBody: '', aeatEstado: 'ERROR_CONSULTA', aeatCodigo: null, aeatError: err?.message ?? 'network_error' };
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
        try { await loadingTask.destroy?.(); } catch { /* ignore */ }
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

  return await processVerifactuUrl(qrUrl, ocrImporte);
}

/**
 * Procesa una URL de Veri*Factu ya detectada (ej: vía Azure DI o externa):
 * Valida la URL, consulta a la AEAT y compara importes con el OCR.
 */
export async function processVerifactuUrl(
  qrUrl: string,
  ocrImporte?: number | null
): Promise<VerifactuQrResult | null> {
  const url = qrUrl.trim();
  if (!isVerifactuUrl(url)) {
    console.log(`[QrDetector] ⛔ URL no es Veri*Factu válida: ${url.slice(0, 100)}`);
    return null;
  }

  const params = parseVerifactuParams(url);
  if (!params) {
    console.log(`[QrDetector] ⚠️ URL Veri*Factu válida pero no se pudieron parsear los parámetros: ${url}`);
    return null;
  }

  console.log(`[QrDetector] 📋 Parámetros Veri*Factu: nif=${params.nif} | numserie=${params.numserie} | fecha=${params.fecha} | importe=${params.importe}`);

  // Fetch obligatorio a AEAT (con &formato=json para obtener respuesta estructurada)
  console.log(`[QrDetector] 🌐 Haciendo fetch a AEAT: ${url.slice(0, 100)}...`);
  const aeatFechaConsulta = new Date().toISOString();
  const { fetchOk, fetchBody, aeatEstado, aeatCodigo, aeatError } = await fetchVerifactuUrl(url);

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
    url,
    params,
    fetchOk,
    fetchBody,
    aeatEstado,
    aeatCodigo,
    aeatError,
    aeatFechaConsulta,
    discrepanciaImporte,
  };

  console.log(`[QrDetector] 🌟 RESULTADO FINAL: estado=${aeatEstado} | codigo=${aeatCodigo ?? '—'} | verificado=${aeatCodigo === '00'} | discrepancia=${discrepanciaImporte ? `SÍ (${discrepanciaImporte.diferencia}€)` : 'NO'}`);
  return result;
}
