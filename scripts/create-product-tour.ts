/**
 * Graba el loop de portada de Muvail: cuatro beats de producto real, sin voz.
 *
 * El hero de la landing reproduce el video en bucle, mudo y con autoplay, así que no
 * lleva narración ni subtítulos: cada beat tiene que entenderse solo por lo que se ve
 * moverse en pantalla. Beats: entra el documento, se lee, no cuadra, cierra el trimestre.
 *
 * La carga y la extracción se graban de verdad, así que requiere el frontend en
 * http://localhost:9002 y los workers corriendo (`npm run workers`).
 *
 * Uso: npx tsx --env-file=.env scripts/create-product-tour.ts
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import puppeteer, { type Page } from 'puppeteer';
import { prisma } from '../src/lib/prisma';

const root = process.cwd();
const workDir = '/tmp/muvail-product-tour';
const outputDir = join(root, 'public', 'product-tour');
const outputPath = join(outputDir, 'muvail-product-tour.mp4');
const posterPath = join(outputDir, 'muvail-product-tour.jpg');
const invoicePath = join(workDir, 'ALF-7781.pdf');

const BASE = 'http://localhost:9002';
const CREDENTIALS = { email: 'marta.ferrer@lumen-estudio.es', password: 'TestGestor2026!' };
const COMPANY_ID = BigInt(127);
const COMPANY_NAME = 'Lumen Estudio S.L.';
const INVOICE_NUMBER = 'ALF-7781';
const QUARTER_LABEL = 'T3 2026';

// Se captura más ancho de lo que se publica: a 1600px el resumen del trimestre no entra
// y los importes salen truncados con puntos suspensivos.
const CAPTURE_WIDTH = 1920;
const CAPTURE_HEIGHT = 1080;
const WIDTH = 1600;
const HEIGHT = 900;
const FPS = 30;

/** Cuánto dura cada beat dentro del loop. El total es lo que ve el visitante antes de que reinicie. */
const BEATS = { entra: 4, lee: 5, descuadre: 4.5, cierra: 4.5 };

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command} falló: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** La factura de demostración no cuadra a propósito: base 1.180 + IVA 247,80, pero el total dice 1.472,80. */
const INVOICE_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
@page { size: A4; margin: 0; }
body { font-family: "DejaVu Sans", Arial, sans-serif; margin: 0; padding: 48px 56px; color: #1a1a1a; font-size: 11pt; }
.top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a4f8a; padding-bottom: 18px; }
.brand { font-size: 20pt; font-weight: 700; color: #1a4f8a; letter-spacing: -0.5px; }
.brand small { display: block; font-size: 8.5pt; font-weight: 400; color: #666; letter-spacing: 0; margin-top: 4px; }
.doc { text-align: right; } .doc h1 { font-size: 15pt; margin: 0 0 6px; letter-spacing: 1px; }
.doc div { font-size: 9.5pt; color: #444; line-height: 1.7; }
.parties { display: flex; gap: 40px; margin: 32px 0 28px; } .parties section { flex: 1; }
.parties h2 { font-size: 8pt; text-transform: uppercase; letter-spacing: 1.2px; color: #888; margin: 0 0 8px; font-weight: 600; }
.parties p { margin: 0; line-height: 1.65; font-size: 10pt; }
table { width: 100%; border-collapse: collapse; margin-top: 8px; }
th { background: #f2f5f9; text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.8px; color: #445; padding: 9px 10px; border-bottom: 1px solid #d8dee7; }
th.r, td.r { text-align: right; } td { padding: 11px 10px; border-bottom: 1px solid #eceff3; font-size: 10pt; }
.totals { margin-top: 24px; margin-left: auto; width: 300px; }
.totals tr td { border: none; padding: 6px 10px; font-size: 10.5pt; }
.totals tr.grand td { border-top: 2px solid #1a4f8a; padding-top: 12px; font-size: 13pt; font-weight: 700; color: #1a4f8a; }
footer { margin-top: 56px; padding-top: 16px; border-top: 1px solid #eceff3; font-size: 8.5pt; color: #777; line-height: 1.7; }
</style></head><body>
<div class="top"><div class="brand">Alfa Cloud Iberia<small>Servicios de infraestructura en la nube</small></div>
<div class="doc"><h1>FACTURA</h1><div>Nº <strong>ALF-7781</strong><br>Fecha: 07/08/2026<br>Vencimiento: 06/09/2026</div></div></div>
<div class="parties">
<section><h2>Emisor</h2><p><strong>Alfa Cloud Iberia S.L.</strong><br>CIF B89650412<br>Calle Sepúlveda 118, 3º<br>08015 Barcelona</p></section>
<section><h2>Cliente</h2><p><strong>Lumen Estudio S.L.</strong><br>CIF B76184293<br>Avenida del Puerto 42<br>46023 Valencia</p></section></div>
<table><thead><tr><th>Concepto</th><th class="r">Cant.</th><th class="r">Precio</th><th class="r">Importe</th></tr></thead><tbody>
<tr><td>Infraestructura cloud, plan Business (agosto 2026)</td><td class="r">1</td><td class="r">940,00 €</td><td class="r">940,00 €</td></tr>
<tr><td>Copias de seguridad gestionadas, 500 GB</td><td class="r">1</td><td class="r">180,00 €</td><td class="r">180,00 €</td></tr>
<tr><td>Soporte técnico prioritario</td><td class="r">1</td><td class="r">60,00 €</td><td class="r">60,00 €</td></tr>
</tbody></table>
<table class="totals"><tr><td>Base imponible</td><td class="r">1.180,00 €</td></tr>
<tr><td>IVA 21 %</td><td class="r">247,80 €</td></tr>
<tr class="grand"><td>TOTAL</td><td class="r">1.472,80 €</td></tr></table>
<footer>Forma de pago: transferencia bancaria a ES21 0182 4471 3902 0157 8834 · Vencimiento a 30 días.<br>
Alfa Cloud Iberia S.L. · Inscrita en el Registro Mercantil de Barcelona, Tomo 44.812, Folio 91, Hoja B-471.203.</footer>
</body></html>`;

/** La subida se graba en vivo, así que el documento de la toma anterior tiene que desaparecer antes. */
async function resetInvoice() {
  const documents = await prisma.documentos.findMany({
    where: { id_de_empresa: COMPANY_ID, numero_documento: INVOICE_NUMBER },
    select: { id: true },
  });
  for (const document of documents) {
    await prisma.$transaction([
      prisma.impuestos_documento.deleteMany({ where: { documento_id: document.id } }),
      prisma.lineas_documento.deleteMany({ where: { documento_id: document.id } }),
      prisma.entidades_documento.deleteMany({ where: { documento_id: document.id } }),
      prisma.incidencias_documento.deleteMany({ where: { documento_id: document.id } }),
      prisma.health_check_status.deleteMany({ where: { documento_id: Number(document.id) } }),
      prisma.documentos.delete({ where: { id: document.id } }),
    ]);
  }
  return documents.length;
}

async function waitForExtraction(timeoutMs = 240_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const document = await prisma.documentos.findFirst({
      where: { id_de_empresa: COMPANY_ID, numero_documento: INVOICE_NUMBER },
      select: { id: true },
      orderBy: { id: 'desc' },
    });
    if (document) return Number(document.id);
    await wait(3000);
  }
  throw new Error('La extracción no terminó a tiempo. ¿Están corriendo los workers?');
}

type Frame = { data: string; time: number };

/** Chrome sólo emite un frame cuando algo cambia en pantalla, de ahí que se guarde el instante de cada uno. */
async function record(page: Page, action: () => Promise<void>): Promise<Frame[]> {
  const client = await page.createCDPSession();
  const frames: Frame[] = [];
  client.on('Page.screencastFrame', async ({ data, sessionId, metadata }: any) => {
    frames.push({ data, time: metadata.timestamp });
    try { await client.send('Page.screencastFrameAck', { sessionId }); } catch { /* sesión cerrada */ }
  });
  await client.send('Page.startScreencast', {
    format: 'jpeg', quality: 92, maxWidth: CAPTURE_WIDTH * 2, maxHeight: CAPTURE_HEIGHT * 2, everyNthFrame: 1,
  });
  await action();
  await client.send('Page.stopScreencast').catch(() => {});
  await client.detach().catch(() => {});
  return frames;
}

/**
 * Convierte un beat en un clip de duración exacta.
 *
 * Chrome emite frames de forma irregular y el material dura mucho más que el beat
 * (la extracción tarda minutos y en el loop ocupa cinco segundos), así que se remuestrea:
 * para cada frame de salida se toma el último frame capturado que ya había ocurrido en
 * ese punto de la línea de tiempo. Comprimir alargando duraciones no sirve, porque el
 * mínimo de un frame es 1/FPS y el beat nunca bajaría de su duración real.
 */
async function writeBeat(frames: Frame[], name: string, targetSeconds: number) {
  if (frames.length === 0) throw new Error(`El beat "${name}" no capturó ningún frame.`);
  const beatDir = join(workDir, name);
  await mkdir(beatDir, { recursive: true });

  const start = frames[0].time;
  const span = Math.max(frames[frames.length - 1].time - start, 0.001);
  const paths: string[] = [];
  for (let index = 0; index < frames.length; index += 1) {
    const file = join(beatDir, `f${String(index).padStart(4, '0')}.jpg`);
    await writeFile(file, Buffer.from(frames[index].data, 'base64'));
    paths.push(file);
  }

  const totalOut = Math.max(Math.round(targetSeconds * FPS), 2);
  const lines: string[] = [];
  let cursor = 0;
  for (let out = 0; out < totalOut; out += 1) {
    const moment = start + (out / (totalOut - 1)) * span;
    while (cursor + 1 < frames.length && frames[cursor + 1].time <= moment) cursor += 1;
    lines.push(`file '${paths[cursor]}'`, `duration ${(1 / FPS).toFixed(5)}`);
  }
  // El demuxer concat descarta la duración del último frame si el archivo no se repite.
  lines.push(`file '${paths[paths.length - 1]}'`);
  const listPath = join(workDir, `${name}.txt`);
  await writeFile(listPath, lines.join('\n'));

  const clipPath = join(workDir, `${name}.mp4`);
  run('ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
    '-vf', `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},format=yuv420p`,
    '-r', String(FPS), '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-an', clipPath,
  ]);
  console.log(`🎬 ${name}: ${frames.length} frames, ${span.toFixed(1)}s reales → ${targetSeconds}s`);
  return clipPath;
}

/** El panel de subidas queda flotando tras la carga y sale en todos los planos siguientes. */
async function dismissUploadPanel(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('button[title="Cerrar"]').forEach((button) => (button as HTMLElement).click());
  });
  await wait(900);
}

/** Espera a que la pantalla tenga datos, no esqueletos: grabar la carga desperdicia el beat. */
async function settled(page: Page, ready: string, timeoutMs = 60_000) {
  await page.waitForFunction(
    (needle: string) => {
      const text = document.body.innerText;
      return text.includes(needle) && !/Cargando|Cargando el período/.test(text);
    },
    { timeout: timeoutMs, polling: 400 },
    ready,
  );
  await wait(2500);
}

/**
 * Movimiento propio del beat: revela contenido sin depender de que la página esté cargando.
 *
 * Busca el contenedor que realmente scrollea, porque varias pantallas dejan la ventana
 * fija y desplazan un panel interno; scrollear `window` ahí no mueve un solo píxel y el
 * beat queda congelado en un frame.
 *
 * Se envía como cadena a propósito: tsx compila con esbuild, que envuelve las funciones
 * nombradas en un helper `__name` inexistente dentro del navegador, y `page.evaluate`
 * serializa la función tal cual.
 */
async function glide(page: Page, distance: number, seconds: number) {
  const moved = await page.evaluate(`(async () => {
    const scroller = [...document.querySelectorAll('*')].find((element) =>
      element.scrollHeight > element.clientHeight + 40 && element.clientHeight > 200
    );
    const usesWindow = !scroller;
    const from = usesWindow ? window.scrollY : scroller.scrollTop;
    const limit = usesWindow
      ? document.documentElement.scrollHeight - window.innerHeight
      : scroller.scrollHeight - scroller.clientHeight;
    const target = Math.min(from + ${distance}, Math.max(limit, 0));
    const duration = ${seconds} * 1000;
    const started = performance.now();
    for (;;) {
      const progress = Math.min((performance.now() - started) / duration, 1);
      const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      const position = from + (target - from) * eased;
      if (usesWindow) window.scrollTo(0, position); else scroller.scrollTop = position;
      if (progress >= 1) break;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return Math.round(target - from);
  })()`);
  if (Number(moved) < 20) console.warn(`⚠️ El beat apenas se movió (${moved}px): quedará casi congelado.`);
}

/**
 * El servidor de desarrollo dibuja el indicador de Next.js flotando abajo a la izquierda.
 * No es parte del producto (en producción no existe) pero sí sale en todos los planos.
 */
async function hideDevOverlay(page: Page) {
  await page.evaluateOnNewDocument(`
    const style = document.createElement('style');
    style.textContent = 'nextjs-portal,[data-nextjs-dev-tools-button],#__next-build-watcher{display:none !important}';
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
  `);
}

async function login(page: Page) {
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle0' });
  await page.locator('input[type=email]').fill(CREDENTIALS.email);
  await page.locator('input[type=password]').fill(CREDENTIALS.password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.locator('button[type=submit]').click(),
  ]);
}

async function main() {
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });

  const removed = await resetInvoice();
  console.log(`🧹 Documentos ${INVOICE_NUMBER} retirados antes de grabar: ${removed}`);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT, deviceScaleFactor: 2 });

  try {
    const invoicePage = await browser.newPage();
    await invoicePage.setContent(INVOICE_HTML, { waitUntil: 'load' });
    await invoicePage.pdf({ path: invoicePath, format: 'A4', printBackground: true });
    await invoicePage.close();

    await hideDevOverlay(page);
    await login(page);

    // ── Beat 1: entra ──────────────────────────────────────────────────────────
    await page.goto(`${BASE}/documents`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.body.innerText.includes('Cargando documentos'), { timeout: 40_000 }).catch(() => {});
    await wait(2500);

    const entra = await record(page, async () => {
      await page.locator('button[data-tutorial=upload-button]').click();
      await wait(1400);
      await page.evaluate(() => {
        const trigger = [...document.querySelectorAll('[role=combobox], button')]
          .find((element) => /Selecciona una empresa/i.test(element.textContent ?? ''));
        (trigger as HTMLElement | undefined)?.click();
      });
      await wait(1100);
      await page.evaluate((company: string) => {
        const option = [...document.querySelectorAll('[role=option]')]
          .find((element) => element.textContent?.includes(company));
        (option as HTMLElement | undefined)?.click();
      }, COMPANY_NAME);
      await wait(900);

      const input = await page.$('#file-upload');
      if (!input) throw new Error('No encontré el input de archivos.');
      await (input as unknown as { uploadFile: (path: string) => Promise<void> }).uploadFile(invoicePath);
      await wait(1600);

      await page.evaluate(() => {
        const button = [...document.querySelectorAll('button')]
          .find((element) => /^Subir \d+ archivo/.test(element.textContent?.trim() ?? ''));
        (button as HTMLElement | undefined)?.click();
      });
      await wait(4500);
    });
    await writeBeat(entra, 'beat-1-entra', BEATS.entra);

    // ── Beat 2: se lee ─────────────────────────────────────────────────────────
    const documentId = await waitForExtraction();
    console.log(`📄 Documento extraído: #${documentId}`);

    await page.goto(`${BASE}/documento/${documentId}`, { waitUntil: 'domcontentloaded' });
    await settled(page, 'Revisar factura');
    await dismissUploadPanel(page);
    // El visor del PDF es un iframe servido por MinIO y ocupa media pantalla: sin él
    // el mejor plano del loop sale con la mitad derecha en negro.
    await page.waitForFunction(
      () => {
        const frame = document.querySelector('iframe');
        return Boolean(frame) && (frame as HTMLIFrameElement).clientHeight > 200;
      },
      { timeout: 45_000, polling: 500 },
    ).catch(() => {});
    await wait(9000);
    const lee = await record(page, async () => {
      await wait(1200);
      await glide(page, 520, 2.4);
      await wait(1200);
    });
    await writeBeat(lee, 'beat-2-lee', BEATS.lee);

    // ── Beat 3: no cuadra ──────────────────────────────────────────────────────
    await page.goto(`${BASE}/dashboard/auditoria`, { waitUntil: 'domcontentloaded' });
    await settled(page, 'Integridad matemática');
    await dismissUploadPanel(page);
    const descuadre = await record(page, async () => {
      await wait(2000);
      await glide(page, 380, 2.2);
      await wait(1000);
    });
    await writeBeat(descuadre, 'beat-3-descuadre', BEATS.descuadre);

    // ── Beat 4: cierra el trimestre ────────────────────────────────────────────
    await page.goto(`${BASE}/trimestres`, { waitUntil: 'domcontentloaded' });
    await settled(page, QUARTER_LABEL);
    await dismissUploadPanel(page);
    // Los períodos son botones que alternan y T1 viene activo de fábrica: si sólo se
    // añade T3 el resumen queda con dos trimestres sumados y el rótulo lo delata.
    await page.evaluate((labels: string[]) => {
      for (const label of labels) {
        const button = [...document.querySelectorAll('button')]
          .find((element) => element.textContent?.trim() === label);
        (button as HTMLElement | undefined)?.click();
      }
    }, [QUARTER_LABEL, 'T1 2026']);
    // Los importes del período llegan después del clic; sin ellos el beat muestra ceros.
    await page.waitForFunction(
      () => !/Cargando el período/.test(document.body.innerText) && !/Total Docum[^0-9]*0\s/.test(document.body.innerText),
      { timeout: 60_000, polling: 400 },
    ).catch(() => {});
    await wait(3000);
    const cierra = await record(page, async () => {
      await wait(1800);
      await glide(page, 300, 2.0);
      await wait(1000);
    });
    await writeBeat(cierra, 'beat-4-cierra', BEATS.cierra);

  } finally {
    await browser.close();
  }

  // ── Montaje del loop ─────────────────────────────────────────────────────────
  const clips = ['beat-1-entra', 'beat-2-lee', 'beat-3-descuadre', 'beat-4-cierra'];
  const concatPath = join(workDir, 'loop.txt');
  await writeFile(concatPath, clips.map((name) => `file '${join(workDir, `${name}.mp4`)}'`).join('\n'));

  run('ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0', '-i', concatPath,
    // Sin pista de audio: el hero reproduce en mudo y el audio sólo suma peso.
    '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '23',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-g', String(FPS * 2),
    outputPath,
  ]);
  run('ffmpeg', ['-y', '-i', outputPath, '-frames:v', '1', '-q:v', '3', posterPath]);

  const size = Number(run('stat', ['-c', '%s', outputPath]));
  const duration = Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', outputPath]));
  console.log(JSON.stringify({
    output: outputPath,
    poster: posterPath,
    seconds: Number(duration.toFixed(2)),
    megabytes: Number((size / 1024 / 1024).toFixed(2)),
  }, null, 2));
}

main()
  .catch((error) => { console.error(error); process.exit(1); })
  .finally(async () => prisma.$disconnect());
