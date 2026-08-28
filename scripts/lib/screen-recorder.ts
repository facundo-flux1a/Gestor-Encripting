/**
 * Grabación de pantalla del producto para las piezas de vídeo.
 *
 * Lo usan dos guiones: el loop mudo de la portada (`create-product-tour.ts`) y el
 * tutorial locutado (`create-tutorial.ts`). Ambos graban el producto de verdad
 * contra el servidor local, así que lo que se ve en pantalla existe.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Browser, Page } from 'puppeteer';

export const BASE = 'http://localhost:9002';
export const CREDENTIALS = { email: 'marta.ferrer@lumen-estudio.es', password: 'TestGestor2026!' };
export const COMPANY_NAME = 'Lumen Estudio S.L.';

export function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command} falló: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type Frame = { data: string; time: number };

/**
 * El indicador de Next.js en desarrollo flota abajo a la izquierda. No es parte
 * del producto (en producción no existe) pero sale en todos los planos.
 */
export async function hideDevOverlay(page: Page) {
  await page.evaluateOnNewDocument(`
    const style = document.createElement('style');
    style.textContent = 'nextjs-portal,[data-nextjs-dev-tools-button],#__next-build-watcher{display:none !important}';
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
  `);
}

export async function login(page: Page) {
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle0' });
  await page.locator('input[type=email]').fill(CREDENTIALS.email);
  await page.locator('input[type=password]').fill(CREDENTIALS.password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.locator('button[type=submit]').click(),
  ]);
}

/** El panel de subidas queda flotando tras la carga y saldría en los planos siguientes. */
export async function dismissUploadPanel(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('button[title="Cerrar"]').forEach((button) => (button as HTMLElement).click());
  });
  await wait(900);
}

/** Espera a que la pantalla tenga datos y no esqueletos: grabar la carga desperdicia el plano. */
export async function settled(page: Page, ready: string, timeoutMs = 60_000) {
  await page.waitForFunction(
    (needle: string) => {
      const text = document.body.innerText;
      return text.includes(needle) && !/Cargando/.test(text);
    },
    { timeout: timeoutMs, polling: 400 },
    ready,
  );
  await wait(2500);
}

/**
 * Desplaza el contenedor que realmente scrollea. Varias pantallas dejan la ventana
 * fija y mueven un panel interno: scrollear `window` ahí no mueve un píxel.
 *
 * Se envía como cadena a propósito. tsx compila con esbuild, que envuelve las
 * funciones nombradas en un helper `__name` que no existe dentro del navegador, y
 * `page.evaluate` serializa la función tal cual.
 */
export async function glide(page: Page, distance: number, seconds: number) {
  const moved = await page.evaluate(`(async () => {
    const scroller = [...document.querySelectorAll('*')].find((element) =>
      element.scrollHeight > element.clientHeight + 40 && element.clientHeight > 200
    );
    const usesWindow = !scroller;
    const from = usesWindow ? window.scrollY : scroller.scrollTop;
    const limit = usesWindow
      ? document.documentElement.scrollHeight - window.innerHeight
      : scroller.scrollHeight - scroller.clientHeight;
    const target = Math.max(0, Math.min(from + ${distance}, Math.max(limit, 0)));
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
  return Number(moved);
}

/** Chrome sólo emite un frame cuando cambia algo, de ahí que se guarde el instante de cada uno. */
/**
 * Desplaza hasta dejar un texto a la vista, en lugar de a una altura fija en píxeles.
 *
 * El aviso de incidencia vive DEBAJO de la tabla de totales, y su altura depende de lo
 * largo que sea el motivo: un scroll fijo lo dejaba fuera de cuadro y la ficha parecía
 * una factura normal. Devuelve los píxeles recorridos, o 0 si no encontró el texto.
 */
export async function glideHasta(page: Page, texto: string, seconds: number, holgura = 120) {
  const falta = await page.evaluate(`(() => {
    const objetivo = ${JSON.stringify(texto)}
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const contiene = (element) =>
      (element.textContent || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(objetivo);
    const candidatos = [...document.querySelectorAll('*')].filter(
      (element) => contiene(element) && ![...element.children].some(contiene),
    );
    const visible = candidatos.find((element) => {
      const r = element.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (!visible) return null;
    const r = visible.getBoundingClientRect();
    // Se deja el texto en el tercio inferior: lo que lo explica está justo encima.
    return Math.round(r.bottom - (window.innerHeight - ${holgura}));
  })()`);
  if (falta === null) {
    console.warn(`⚠️ No encontré "${texto}" para desplazar: la pantalla se queda donde está.`);
    return 0;
  }
  // Si ya está a la vista, `falta` sale negativo y no se toca la pantalla: un
  // desplazamiento de dos píxeles es justo lo que se ve como temblor en el plano.
  const distancia = Number(falta);
  return distancia > 8 ? glide(page, distancia, seconds) : 0;
}

export async function record(
  page: Page,
  size: { width: number; height: number },
  action: () => Promise<void>,
): Promise<Frame[]> {
  const client = await page.createCDPSession();
  const frames: Frame[] = [];
  client.on('Page.screencastFrame', async ({ data, sessionId, metadata }: any) => {
    frames.push({ data, time: metadata.timestamp });
    try { await client.send('Page.screencastFrameAck', { sessionId }); } catch { /* sesión cerrada */ }
  });
  await client.send('Page.startScreencast', {
    format: 'jpeg', quality: 92, maxWidth: size.width * 2, maxHeight: size.height * 2, everyNthFrame: 1,
  });
  await action();
  await client.send('Page.stopScreencast').catch(() => {});
  await client.detach().catch(() => {});
  return frames;
}

/**
 * Escribe los frames como clip a su velocidad real, conservando la duración de cada uno.
 * Quien lo consuma decide después si lo acelera para que encaje con una locución.
 */
export async function writeRawClip(frames: Frame[], dir: string, name: string, fps = 30) {
  if (frames.length === 0) throw new Error(`El plano "${name}" no capturó ningún frame.`);
  const frameDir = join(dir, name);
  await mkdir(frameDir, { recursive: true });

  const paths: string[] = [];
  for (let index = 0; index < frames.length; index += 1) {
    const file = join(frameDir, `f${String(index).padStart(4, '0')}.jpg`);
    await writeFile(file, Buffer.from(frames[index].data, 'base64'));
    paths.push(file);
  }

  const span = Math.max(frames[frames.length - 1].time - frames[0].time, 0.001);
  const lines: string[] = [];
  for (let index = 0; index < frames.length; index += 1) {
    const next = frames[index + 1];
    const seconds = next ? next.time - frames[index].time : span / frames.length;
    lines.push(`file '${paths[index]}'`, `duration ${Math.max(seconds, 1 / 120).toFixed(5)}`);
  }
  lines.push(`file '${paths[paths.length - 1]}'`);
  const listPath = join(dir, `${name}.txt`);
  await writeFile(listPath, lines.join('\n'));

  const clipPath = join(dir, `${name}.mp4`);
  run('ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
    '-vf', `fps=${fps},format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-an', clipPath,
  ]);
  return { clipPath, seconds: span, frames: frames.length };
}

export async function openBrowser(puppeteer: any, size: { width: number; height: number }): Promise<{ browser: Browser; page: Page }> {
  const browser: Browser = await puppeteer.launch({
    headless: true,
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: size.width, height: size.height, deviceScaleFactor: 2 });
  await hideDevOverlay(page);
  return { browser, page };
}
