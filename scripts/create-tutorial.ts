/**
 * Tutorial locutado de Muvail: "Cómo funciona".
 *
 * Mismo molde que el tutorial de Azoteas Factory, con la identidad de Muvail:
 * cartel de paso, grabación del producto real, voz de ElevenLabs (Cristina),
 * subtítulos sincronizados por el alignment de la propia voz y una cámara que se
 * acerca a lo que la locución está nombrando.
 *
 * Cuatro cosas que lo separan de un recorte fijo:
 *
 * 1. La cámara es una lista de POSICIONES en el tiempo, y su destino se calcula
 *    midiendo el elemento en la página, no con coordenadas escritas a mano: si la
 *    interfaz cambia de sitio, el plano sigue encuadrando lo que debe.
 * 2. Los subtítulos salen del alignment de ElevenLabs, que dice a qué segundo
 *    empieza y termina cada carácter. No se reparten por regla de tres.
 * 3. Cada tramo de pantalla dura exactamente lo que dura su frase: si sobra
 *    metraje se acelera, y si falta se congela el último cuadro. Manda la locución.
 * 4. El audio no se pega, se COLOCA. Las uniones se disuelven con xfade y eso
 *    acorta el vídeo medio segundo por unión; cada locución se retrasa hasta el
 *    segundo exacto en que su tramo empieza a verse.
 *
 * Requiere el frontend en http://localhost:9002 y los workers corriendo.
 * Uso: npx tsx --env-file=.env scripts/create-tutorial.ts
 */
import { mkdir, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { prisma } from '../src/lib/prisma';
import {
  INVOICE_HTML, INVOICE_NUMBER, CLEAN_INVOICE_HTML, CLEAN_INVOICE_NUMBER,
  resetInvoice, waitForExtraction,
} from './lib/demo-data';
import {
  BASE, COMPANY_NAME, run, wait, record, writeRawClip, login, hideDevOverlay, glideHasta,
  dismissUploadPanel, settled, type Frame,
} from './lib/screen-recorder';

const root = process.cwd();
const workDir = '/tmp/muvail-tutorial';
// La caché de voz vive FUERA del directorio de trabajo, que se borra en cada
// corrida: es lo único de todo esto que se paga, y afinar la cámara son diez pruebas.
// Lo único que se paga son las locuciones, así que su caché NO vive en /tmp:
// una limpieza del sistema borraba el .json del alignment y la siguiente
// generación volvía a comprarle a ElevenLabs las seis voces sin cambiar el texto.
const voiceDir = join(homedir(), '.cache', 'muvail-tutorial-voz');
const outputDir = join(root, 'public', 'product-tour');
const outputPath = join(outputDir, 'muvail-tutorial.mp4');
const invoicePath = join(workDir, 'ALF-7781.pdf');
const cleanPath = join(workDir, 'NPS-2314.pdf');
const fonts = join(root, 'scripts', 'fonts');
const TITULAR = join(fonts, 'Manrope-ExtraBold.ttf');
const TEXTO = join(fonts, 'Inter-SemiBold.ttf');
const MARCA = join(root, 'public', 'branding');
const wordmarkPath = join(workDir, 'wordmark.png');
const simboloPath = join(MARCA, 'muvail-symbol-dark-source.png');

const QUARTER_LABEL = 'T3 2026';

// Cristina, la misma voz que narra el manual de Azoteas Factory.
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID_FEMALE ?? '1CeqBeXMOqCleeQjfYfO';

// Sin música: el único tema de la casa (Keys of Moon) está licenciado para uso
// NO comercial, y esto es el producto de un cliente. Se añade cuando haya un tema
// licenciado o lo aporte el cliente bajo su responsabilidad.
const MUSICA: string | null = null;

// Paleta de Muvail, no la de Azoteas.
const FONDO = '0x073f39';
const LIMA = '0xb5de57';
const CLARO = '0xeffaf6';
const APAGADO = '0xa9c6bd';

const CAPTURE = { width: 1920, height: 1080 };
const SCALE = 2;                                   // deviceScaleFactor de la ventana; el clip resultante se mide, no se supone
const OUT = { width: 1280, height: 720 };
const FPS = 30;
const XFADE = 0.5;
// El cierre va pegado al paso 5 sin cartel en medio. Con sólo XFADE de silencio las dos
// voces dejan de pisarse pero quedan al ras, sin aire: este respiro las separa de verdad.
const RESPIRO = 0.7;

type Step = {
  n: string;
  title: string;
  says: string;
  /**
   * Texto visible dentro del elemento al que se acerca la cámara.
   * `null` deja el plano general: hay pantallas cuyo valor está en ver las dos
   * mitades a la vez, y acercarse a una parte rompe justo lo que se quiere mostrar.
   */
  aim: string | null;
  /**
   * Fragmento de `says` en el que la cámara vuelve al plano general. Se resuelve
   * contra el alignment de la locución, así que sigue a la voz aunque el texto cambie.
   */
  abre?: string;
  /**
   * Alto mínimo que debe tener la caja antes de dejar de trepar al ancestro, y margen
   * del encuadre. El aviso de descuadre es una tira de 16 px: con el mínimo normal de 60
   * la cámara trepaba hasta la columna entera y el plano quedaba sin acercarse a nada.
   */
  minAlto?: number;
  margen?: number;
  /**
   * `fijar()` congela el encuadre en el instante en que se llama. Hace falta cuando
   * el elemento al que apunta la cámara no sigue en pantalla al terminar el plano:
   * el diálogo de subida, por ejemplo, se cierra en cuanto se pulsa Subir.
   */
  shoot: (page: Page, fijar: () => Promise<void>) => Promise<void>;
};

const PANTALLAS = [
  '/documents · diálogo de subida, dos facturas',
  '/dashboard/auditoria · Centro de Seguridad',
  '/documento/{id} · el aviso de descuadre debajo del total',
  '/incidents · Gestión de Incidencias',
  '/trimestres · T3 2026',
];

const CIERRE = 'Se sueltan los documentos, Muvail los lee, los cuadra y avisa de lo que no encaja. Muvail, gestión documental para asesorías y empresas.';

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, '’').replace(/%/g, '\\%');
const ff = (args: string[]) => run('ffmpeg', ['-v', 'error', ...args, '-y']);
const dur = (file: string) => Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]));

// ── nivel ────────────────────────────────────────────────────────────────────
// loudnorm escribe su medición por STDERR, no por stdout: leyendo stdout salen
// los campos en `undefined` y la segunda pasada revienta sin decir por qué.
function normalizar(archivo: string, objetivo = -17) {
  const medida = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', archivo,
    '-af', `loudnorm=I=${objetivo}:TP=-1.5:LRA=11:print_format=json`, '-f', 'null', '-'],
    { encoding: 'utf8' });
  const medido = JSON.parse(medida.stderr.match(/\{[\s\S]*?\}/)?.[0] ?? '{}');
  if (!medido.input_i) throw new Error(`No se pudo medir el nivel de ${archivo}`);
  const salida = archivo.replace(/\.mp3$/, '-nivel.mp3');
  ff(['-i', archivo, '-af',
    `loudnorm=I=${objetivo}:TP=-1.5:LRA=11:measured_I=${medido.input_i}:measured_TP=${medido.input_tp}:` +
    `measured_LRA=${medido.input_lra}:measured_thresh=${medido.input_thresh}:offset=${medido.target_offset}:linear=true`,
    '-ar', '44100', salida]);
  return salida;
}

// ── voz ──────────────────────────────────────────────────────────────────────
type Alignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

/** La voz es lo único de todo esto que se paga, y afinar la cámara son diez pruebas. */
async function locutar(texto: string, salida: string): Promise<Alignment> {
  const cache = salida.replace(/\.mp3$/, '.json');
  // La caché se indexa por CONTENIDO, no por nombre de archivo. Indexada por nombre, al
  // reescribir el guion de un paso se reusaba la locución anterior: el vídeo salía con la
  // pantalla nueva y la voz vieja nombrando cosas que ya no estaban.
  const huella = createHash('sha256').update(`${VOICE_ID}|${texto}`).digest('hex');
  try {
    const guardado = JSON.parse(await readFile(cache, 'utf8'));
    if ((await stat(salida)).size > 1000 && guardado.huella === huella) return guardado.alignment;
    console.log(`🔁 El texto de ${salida.split('/').pop()} cambió: se vuelve a locutar.`);
  } catch { /* todavía no está generada */ }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('Falta ELEVENLABS_API_KEY en .env');

  const respuesta = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: texto,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0, use_speaker_boost: true },
      }),
    },
  );
  if (!respuesta.ok) throw new Error(`ElevenLabs ${respuesta.status}: ${(await respuesta.text()).slice(0, 200)}`);
  const cuerpo = await respuesta.json();
  await writeFile(salida, Buffer.from(cuerpo.audio_base64, 'base64'));
  await writeFile(cache, JSON.stringify({ huella, texto, alignment: cuerpo.alignment }));
  return cuerpo.alignment;
}

/**
 * Antepone silencio a una locución.
 *
 * El montaje coloca cada voz en el instante en que ARRANCA la disolvencia, no cuando
 * termina. Los carteles son mudos y por eso no se notaba en los pasos, pero el cierre
 * va pegado al paso 5 y las dos voces se pisaban medio segundo. Con este silencio cada
 * locución entra cuando su plano ya está entero en pantalla.
 */
function adelantar(archivo: string, segundos: number) {
  const salida = archivo.replace(/\.mp3$/, '-entrada.mp3');
  const ms = Math.round(segundos * 1000);
  ff(['-i', archivo, '-af', `adelay=${ms}|${ms}`, '-ar', '44100', salida]);
  return salida;
}

/** Instante en que la voz empieza a decir un fragmento, leído del alignment. */
function momento(alignment: Alignment, fragmento: string): number | null {
  const plano = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const indice = plano(alignment.characters.join('')).indexOf(plano(fragmento));
  return indice < 0 ? null : alignment.character_start_times_seconds[indice];
}

/** El alignment viene por carácter: se agrupa en trozos que quepan y corten donde corta la frase. */
function trozos(alignment: Alignment, max = 42, desfase = 0) {
  const { characters, character_start_times_seconds: inicio, character_end_times_seconds: fin } = alignment;
  const salida: Array<{ text: string; from: number; to: number }> = [];
  let actual = { text: '', from: -1, to: 0 };
  const cerrar = () => {
    if (actual.text.trim()) salida.push({ text: actual.text.trim(), from: actual.from + desfase, to: actual.to + desfase });
    actual = { text: '', from: -1, to: 0 };
  };
  for (let i = 0; i < characters.length; i += 1) {
    if (actual.from < 0) actual.from = inicio[i];
    actual.text += characters[i];
    actual.to = fin[i];
    if (/[.,;:!?]/.test(characters[i]) || (actual.text.length >= max && characters[i] === ' ')) cerrar();
  }
  cerrar();
  return salida.filter((c) => c.text.length > 1);
}

const banda = `drawbox=x=0:y=${OUT.height - 96}:w=${OUT.width}:h=96:color=${FONDO}@0.92:t=fill`;
const subtitulos = (trs: ReturnType<typeof trozos>) => trs.map((c) =>
  `drawtext=fontfile=${TEXTO}:text='${esc(c.text)}':x=(w-tw)/2:y=${OUT.height - 62}:fontsize=27:fontcolor=${CLARO}:` +
  `enable='between(t,${c.from.toFixed(2)},${c.to.toFixed(2)})'`).join(',');

// ── la cámara ────────────────────────────────────────────────────────────────
// De una lista de [instante, valor] sale una expresión que ffmpeg evalúa en cada
// fotograma. El suavizado (t·t·(3−2t)) hace que el movimiento arranque y frene
// solo: sin él la cámara sale disparada y se clava de golpe.
type Vista = { x: number; y: number; w: number };

function trayecto(claves: Array<{ f: number; v: number }>) {
  let expresion = String(claves[claves.length - 1].v);
  for (let i = claves.length - 2; i >= 0; i -= 1) {
    const a = claves[i];
    const b = claves[i + 1];
    if (b.f <= a.f) continue;
    const p = `clip((on-${a.f})/${b.f - a.f},0,1)`;
    expresion = `if(lt(on,${b.f}),(${a.v}+(${b.v - a.v})*(${p}*${p}*(3-2*${p}))),${expresion})`;
  }
  return expresion;
}

// Las vistas se expresan en píxeles CSS de la ventana. El clip grabado NO tiene por
// qué medir eso: Chrome entrega el screencast al tamaño que quiere, y con
// deviceScaleFactor 2 devolvió 1920x1080 y no 3840x2160. Dar por hecho el doble
// desplazaba cada encuadre justo el doble de lejos, a otra tarjeta.
const TODO: Vista = { x: 0, y: 0, w: CAPTURE.width };

/**
 * Un capítulo, un zoom. La cámara abre entera y SE QUEDA QUIETA, se acerca una vez
 * a lo que la voz nombra, se queda quieta ahí la mayor parte del paso, y vuelve a
 * abrir. Encadenar posiciones sin parar en ninguna marea.
 */
const unZoom = (vista: Vista): Array<[number, Vista]> =>
  [[0, TODO], [0.15, TODO], [0.32, vista], [0.86, vista], [0.97, TODO], [1, TODO]];

/**
 * Como `unZoom`, pero la cámara vuelve al plano general en el instante EXACTO en que
 * la voz nombra algo que no cabe en el encuadre cerrado. Al decir "las facturas del
 * día" hay que ver la carga entera, y el rótulo del diálogo no la muestra.
 */
const unZoomHasta = (vista: Vista, abre: number, segundos: number): Array<[number, Vista]> => {
  // Se empieza a abrir ANTES de la frase. Arrancando justo en la palabra, la maniobra
  // dura un segundo largo y el plano general recién llega cuando la frase ya pasó.
  const ANTICIPO = 1.0;
  const p = Math.min(Math.max((abre - ANTICIPO) / segundos, 0.05), 0.95);
  const apertura = Math.min(1.1 / segundos, (1 - p) * 0.8);
  const llegada = Math.min(0.26, p - 0.15);
  // Si la frase llega antes de que dé tiempo a acercarse y volver, no se acerca:
  // media maniobra a mitad de camino es justo lo que se ve como temblor.
  if (llegada <= 0.06) return [[0, TODO], [1, TODO]];
  return [[0, TODO], [llegada * 0.35, TODO], [llegada, vista], [p, vista], [p + apertura, TODO], [1, TODO]];
};

/**
 * Para los planos que no se acercan: la cámara se queda quieta.
 *
 * La versión anterior les daba un empuje muy lento, y era justo el caso peor: a un
 * cuarto de píxel por fotograma ningún redondeo se disimula, y el plano temblaba
 * los trece segundos. Aquí el movimiento lo pone el contenido de la pantalla.
 */
const quieta = (): Array<[number, Vista]> => [[0, TODO], [1, TODO]];
// Se probó un acercamiento leve al 88 % para que estos planos no quedaran inmóviles,
// pero recorta un 6 % por lado y el total del PDF vive pegado al borde derecho: en el
// plano que sostiene todo el paso 2 se veía "1.472,8" cortado. Un cuadro fijo no
// recorta nada y además no tiembla; el movimiento lo ponen los subtítulos.

/**
 * El temblor de la cámara no viene del suavizado: `zoompan` redondea la posición a
 * píxeles ENTEROS de su entrada en cada fotograma. Con la grabación a 1920 y la
 * salida a 1280, un píxel de entrada vale 0,67 de salida, así que un movimiento
 * lento avanza a saltos visibles en lugar de deslizarse.
 *
 * Se arregla ampliando la entrada antes de mover la cámara: el mismo redondeo pasa
 * a valer un tercio de píxel de salida y el movimiento se vuelve continuo. Cuesta
 * memoria y nada más; no se inventa detalle, sólo se le da a la cámara dónde pisar.
 */
const AMPLIA = 2;

function camara(pasos: Array<[number, Vista]>, segundos: number, fuente: { width: number; height: number }) {
  const n = Math.max(1, Math.round(segundos * FPS));
  const factor = (fuente.width / CAPTURE.width) * AMPLIA;
  const claves = (elegir: (v: Vista) => number) => pasos.map(([p, v]) => ({ f: Math.round(p * n), v: elegir(v) }));
  return `scale=iw*${AMPLIA}:ih*${AMPLIA}:flags=bicubic,zoompan=` +
    `z='${trayecto(claves((v) => Number((CAPTURE.width / v.w).toFixed(4))))}':` +
    `x='${trayecto(claves((v) => Math.round(v.x * factor)))}':` +
    `y='${trayecto(claves((v) => Math.round(v.y * factor)))}':` +
    `d=1:s=${OUT.width}x${OUT.height}:fps=${FPS}`;
}

/**
 * Calcula el encuadre midiendo el elemento en la página en lugar de escribir las
 * coordenadas a mano: si la interfaz se mueve, el plano la sigue.
 */
async function apuntar(page: Page, texto: string, margen = 60, reintentos = 3, minAlto = 60): Promise<Vista> {
  // Como en `glide`, se envía como cadena: esbuild envuelve las funciones nombradas
  // en un helper `__name` que dentro del navegador no existe.
  const caja = await page.evaluate(`(() => {
    // Se compara sin mayúsculas ni acentos: media interfaz se escribe en minúsculas
    // y se muestra en mayúsculas por CSS, así que buscar el texto tal como se ve en
    // pantalla no encuentra nada en el DOM.
    const objetivo = ${JSON.stringify(texto)}
      .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const contiene = (element) =>
      (element.textContent || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(objetivo);

    // El elemento más pequeño que todavía lo contiene: los antecesores lo contienen
    // todos, y quedarse con el primero devolvería el documento entero.
    const candidatos = [...document.querySelectorAll('*')].filter(
      (element) => contiene(element) && ![...element.children].some(contiene),
    );
    const visible = candidatos.find((element) => {
      const r = element.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (!visible) return null;

    // Se sube a la tarjeta que lo envuelve: encuadrar sólo el rótulo deja el dato fuera.
    // Se sube hasta algo con cuerpo de tarjeta: un rótulo mide 20 px de alto, y
    // encuadrarlo deja el número que lo acompaña fuera del plano.
    let marco = visible;
    for (let i = 0; i < 8 && marco.parentElement; i += 1) {
      const r = marco.getBoundingClientRect();
      if (r.width >= 220 && r.height >= ${minAlto}) break;
      marco = marco.parentElement;
    }
    const r = marco.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`) as { x: number; y: number; w: number; h: number } | null;

  if (!caja || caja.w < 40) {
    if (reintentos > 0) {
      // Las pantallas con gráficos repintan y el elemento desaparece un instante.
      await wait(1500);
      return apuntar(page, texto, margen, reintentos - 1, minAlto);
    }
    console.warn(`⚠️ No encontré "${texto}" en pantalla: ese paso se queda en plano general.`);
    return TODO;
  }

  // El recuadro se lleva a píxeles de la grabación y se ajusta a 16:9 sin salirse.
  // El encuadre CONTIENE la tarjeta con un margen corto. Antes partía de un mínimo
  // del 45 % del ancho, y al estirarlo a 16:9 el alto se comía la sección siguiente:
  // por eso el paso 3 mezclaba las tarjetas de arriba con las de abajo.
  const cx = caja.x + caja.w / 2;
  const cy = caja.y + caja.h / 2;
  const ancho = Math.min(
    CAPTURE.width,
    Math.max(caja.w + margen * 2, (caja.h + margen * 2) * OUT.width / OUT.height, CAPTURE.width * 0.32),
  );
  const alto = ancho * OUT.height / OUT.width;
  return {
    w: ancho,
    x: Math.max(0, Math.min(CAPTURE.width - ancho, Math.round(cx - ancho / 2))),
    y: Math.max(0, Math.min(CAPTURE.height - alto, Math.round(cy - alto / 2))),
  };
}

// ── los pasos ────────────────────────────────────────────────────────────────
// La locución es la del guion aprobado. Cada `shoot` deja en pantalla lo que la
// frase está nombrando, y `aim` es el texto por el que la cámara lo busca.
let documentId = 0;

const PASOS: Step[] = [
  {
    n: 'PASO 1',
    title: 'Se sueltan y ya está',
    says: 'En esta demostración vas a ver por qué Muvail es el gestor de facturas y documentos predilecto de las empresas. Se usa soltando archivos: las facturas del día, del mes, del trimestre o las que necesites. El asistente las lee y las coloca en su sitio.',
    aim: 'Subir Nuevos Documentos',
    // Al nombrar las facturas la cámara abre: el rótulo del diálogo no enseña la carga.
    abre: 'las facturas del día',
    shoot: async (page, fijar) => {
      await page.locator('button[data-tutorial=upload-button]').click();
      await wait(1500);
      await fijar();
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
      await wait(1200);
      const input = await page.$('#file-upload');
      if (!input) throw new Error('No encontré el input de archivos.');
      // Las dos de la tanda: la que cuadra y la que no. El contraste es el producto.
      await (input as unknown as { uploadFile: (...paths: string[]) => Promise<void> })
        .uploadFile(cleanPath, invoicePath);
      await wait(1600);
      await page.evaluate(() => {
        const button = [...document.querySelectorAll('button')]
          .find((element) => /^Subir \d+ archivo/.test(element.textContent?.trim() ?? ''));
        (button as HTMLElement | undefined)?.click();
      });
      // La cámara ya está abierta cuando la voz nombra las facturas, así que la carga
      // se ve entera: este plano tiene que seguir vivo hasta que termine la locución.
      await wait(9000);
    },
  },
  {
    n: 'PASO 2',
    title: 'Una pasa, la otra no',
    // La grilla de documentos NO sirve para esto: la factura retenida no aparece en el
    // listado (se comprobó, ALF-7781 no está en el DOM), así que la pantalla nunca podría
    // enseñar el contraste que la voz nombra. El Centro de Seguridad sí lo cuenta.
    says: 'Las dos entraron en la misma tanda, y Muvail no las trata igual. Comprueba las cuentas de cada documento y aparta el que no cierra. De todo lo analizado, un solo descuadre.',
    aim: 'DESCUADRES',
    shoot: async () => { await wait(2500); },
  },
  {
    n: 'PASO 3',
    title: 'Por qué esta no pasa',
    says: 'Muvail suma la base, la cuota de cada impuesto y los descuentos, y lo compara con el total impreso. Aquí la suma da mil cuatrocientos veintisiete con ochenta, y el documento dice mil cuatrocientos setenta y dos con ochenta. Cuarenta y cinco euros de diferencia, avisados justo debajo del total.',
    // El aviso vive pegado a la tabla de totales, así que encuadrarlo trae el total dentro.
    aim: 'Totales no cuadran',
    minAlto: 24,
    margen: 90,
    shoot: async () => { await wait(2500); },
  },
  {
    n: 'PASO 4',
    title: 'Se avisa a la empresa',
    says: 'La factura descuadrada se le notifica a la empresa y queda en incidencias pendientes de revisión, para que la revise y decida cómo proceder con el proveedor para corregir el error.',
    aim: 'Pendientes de Revisión',
    // La pantalla no se mueve: el movimiento lo pone la cámara. Desplazarla aquí
    // generaría fotogramas a un ritmo irregular y el plano temblaría.
    shoot: async () => { await wait(2500); },
  },
  {
    n: 'PASO 5',
    title: 'El trimestre cierra',
    // Sin recuento cantado: la tanda añade documentos al período y un número fijo en la
    // voz se delata solo. Si el de pantalla resulta redondo, se dice en una segunda pasada.
    says: 'El resto sigue su curso. El trimestre reúne los documentos del período con el IVA repercutido, el soportado y el neto a pagar, y debajo el consolidado del ejercicio.',
    aim: 'Total Documentos',
    // La pantalla no se mueve: el movimiento lo pone la cámara. Desplazarla aquí
    // generaría fotogramas a un ritmo irregular y el plano temblaría.
    shoot: async () => { await wait(2500); },
  },
];

/** Deja cada pantalla lista ANTES de empezar a grabar: los esqueletos de carga no son producto. */
const PREPARAR: Array<(page: Page) => Promise<void>> = [
  async (page) => {
    await page.goto(`${BASE}/documents`, { waitUntil: 'domcontentloaded' });
    // No basta con que desaparezca el rótulo de carga: el primer plano del vídeo salía
    // con la grilla vacía y el spinner detrás del diálogo. Se espera a que haya filas.
    await page.waitForFunction(
      () => /\d+\s+documento\(s\)/.test(document.body.innerText) && !/Cargando/.test(document.body.innerText),
      { timeout: 90_000, polling: 500 },
    );
    await wait(3500);
  },
  async (page) => {
    // Las dos de la tanda tienen que estar extraídas antes de contar el descuadre.
    documentId = await waitForExtraction(INVOICE_NUMBER);
    await waitForExtraction(CLEAN_INVOICE_NUMBER);
    await page.goto(`${BASE}/dashboard/auditoria`, { waitUntil: 'domcontentloaded' });
    await settled(page, 'Integridad matemática');
    await dismissUploadPanel(page);
    await wait(2500);
  },
  async (page) => {
    await page.goto(`${BASE}/documento/${documentId}`, { waitUntil: 'domcontentloaded' });
    await settled(page, 'Revisar factura');
    await dismissUploadPanel(page);
    // El visor del PDF es un iframe de MinIO y ocupa media pantalla.
    await page.waitForFunction(
      () => Boolean(document.querySelector('iframe')) && (document.querySelector('iframe') as HTMLIFrameElement).clientHeight > 200,
      { timeout: 45_000, polling: 500 },
    ).catch(() => {});
    await wait(9000);
    // El aviso de descuadre está DEBAJO de la tabla de totales y su altura depende del
    // texto del motivo. Se desplaza hasta verlo, no a una altura fija: el scroll de 560
    // píxeles que había antes lo dejaba fuera y la ficha parecía una factura normal.
    // 320 y no la holgura por defecto: la banda de subtítulos tapa los 144 píxeles de
    // abajo del cuadro, y con 120 el aviso quedaba justo debajo de ella, invisible.
    await glideHasta(page, 'Totales no cuadran', 2.5, 320);
    await wait(2500);
  },
  async (page) => {
    await page.goto(`${BASE}/incidents`, { waitUntil: 'domcontentloaded' });
    await settled(page, 'Pendientes de Revisión');
    await dismissUploadPanel(page);
  },
  async (page) => {
    await page.goto(`${BASE}/trimestres`, { waitUntil: 'domcontentloaded' });
    await settled(page, QUARTER_LABEL);
    await dismissUploadPanel(page);
    // Los períodos alternan y T1 viene activo: sumar T3 dejaría dos trimestres.
    await page.evaluate((labels: string[]) => {
      for (const label of labels) {
        const button = [...document.querySelectorAll('button')]
          .find((element) => element.textContent?.trim() === label);
        (button as HTMLElement | undefined)?.click();
      }
    }, [QUARTER_LABEL, 'T1 2026']);
    await page.waitForFunction(() => !/Cargando el período/.test(document.body.innerText), { timeout: 60_000, polling: 400 }).catch(() => {});
    await wait(3500);
  },
];

// ── montaje ──────────────────────────────────────────────────────────────────
type Parte = { archivo: string; segundos: number; voz?: string };

/**
 * Rasteriza un recurso de marca al ancho que haga falta.
 *
 * Se usa el SVG aprobado en vez de reescribir "Muvail" con una tipografía parecida:
 * el wordmark tiene letterforms propias y una tipografía de sustitución se nota.
 */
async function rasterizar(browser: Browser, archivo: string, ancho: number, destino: string) {
  const svg = await readFile(join(MARCA, archivo), 'utf8');
  const hoja = await browser.newPage();
  await hoja.setViewport({ width: ancho, height: 400, deviceScaleFactor: 2 });
  await hoja.setContent(
    `<body style="margin:0;background:transparent"><div style="width:${ancho}px">${svg.replace('<svg', '<svg style="width:100%;height:auto;display:block"')}</div></body>`,
    { waitUntil: 'load' },
  );
  const caja = await hoja.$('div');
  await caja!.screenshot({ path: destino as `${string}.png`, omitBackground: true });
  await hoja.close();
}

/** Un cartel: fondo de marca, el logotipo, y el texto del paso. */
function cartel(destino: string, arriba: string, grande: string, logo: string, logoAncho: number, logoY: number, pie?: string) {
  const capas = [
    `drawtext=fontfile=${TITULAR}:text='${esc(arriba)}':x=(w-tw)/2:y=318:fontsize=30:fontcolor=${LIMA}`,
    `drawtext=fontfile=${TITULAR}:text='${esc(grande)}':x=(w-tw)/2:y=372:fontsize=50:fontcolor=${CLARO}`,
  ];
  if (pie) capas.push(`drawtext=fontfile=${TEXTO}:text='${esc(pie)}':x=(w-tw)/2:y=456:fontsize=26:fontcolor=${APAGADO}`);
  ff(['-f', 'lavfi', '-i', `color=c=${FONDO}:s=${OUT.width}x${OUT.height}:d=2.2:r=${FPS}`,
    '-i', logo,
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-filter_complex',
    `[1:v]scale=${logoAncho}:-1[lg];[0:v][lg]overlay=x=(W-w)/2:y=${logoY}[bg];[bg]${capas.join(',')}[v]`,
    '-map', '[v]', '-map', '2:a', '-shortest',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-c:a', 'aac', '-ar', '44100', destino]);
  return 2.2;
}

async function main() {
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });
  await mkdir(voiceDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });

  const retirados = await resetInvoice();
  console.log(`🧹 Documentos de la tanda (${INVOICE_NUMBER}, ${CLEAN_INVOICE_NUMBER}) retirados antes de grabar: ${retirados}`);

  const browser = await puppeteer.launch({
    headless: true, executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: CAPTURE.width, height: CAPTURE.height, deviceScaleFactor: SCALE });

  const crudos: Array<{ clip: string; segundos: number; vista: Vista | null; fuente: { width: number; height: number } }> = [];
  try {
    const hoja = await browser.newPage();
    for (const [html, destino] of [[INVOICE_HTML, invoicePath], [CLEAN_INVOICE_HTML, cleanPath]] as const) {
      await hoja.setContent(html, { waitUntil: 'load' });
      await hoja.pdf({ path: destino, format: 'A4', printBackground: true });
    }
    await hoja.close();

    // El logotipo se rasteriza del SVG aprobado, aprovechando el navegador ya abierto.
    await rasterizar(browser, 'muvail-wordmark-dark.svg', 520, wordmarkPath);
    await hideDevOverlay(page);
    await login(page);

    for (const [indice, paso] of PASOS.entries()) {
      await PREPARAR[indice](page);
      let fijada: Vista | null = null;
      const fijar = async () => { if (paso.aim) fijada = await apuntar(page, paso.aim, paso.margen ?? 60, 3, paso.minAlto ?? 60); };
      const frames: Frame[] = await record(page, CAPTURE, () => paso.shoot(page, fijar));
      // Si el paso no fijó el encuadre en su momento, se mide con la pantalla ya quieta.
      const vista: Vista | null = paso.aim
        ? (fijada ?? await apuntar(page, paso.aim, paso.margen ?? 60, 3, paso.minAlto ?? 60))
        : null;
      const { clipPath, seconds } = await writeRawClip(frames, workDir, `crudo-${indice}`, FPS);
      const [ancho, alto] = run('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries',
        'stream=width,height', '-of', 'csv=p=0:s=x', clipPath]).split('x').map(Number);
      const fuente = { width: ancho, height: alto };
      crudos.push({ clip: clipPath, segundos: seconds, vista, fuente });
      console.log(`📹 ${paso.n} · ${frames.length} frames · ${seconds.toFixed(1)}s · clip ${ancho}x${alto}`);
    }
  } finally {
    await browser.close();
  }

  const partes: Parte[] = [];

  const portada = join(workDir, 'portada.mp4');
  partes.push({ archivo: portada, segundos: cartel(portada, 'GESTIÓN DOCUMENTAL', 'Cómo funciona', wordmarkPath, 300, 168) });

  for (const [indice, paso] of PASOS.entries()) {
    const crudoVoz = join(voiceDir, `voz${indice}.mp3`);
    const alignment = await locutar(paso.says, crudoVoz);
    const voz = adelantar(normalizar(crudoVoz), XFADE);
    const segundos = dur(voz);
    const trs = trozos(alignment, 42, XFADE);
    // El instante se mide sobre la locución cruda, y el silencio de entrada la corre.
    const abre = paso.abre ? momento(alignment, paso.abre) : null;
    if (paso.abre && abre === null) {
      console.warn(`⚠️  ${paso.n}: no encontré "${paso.abre}" en la locución; la cámara se queda con el zoom normal.`);
    }

    const tarjeta = join(workDir, `cartel${indice}.mp4`);
    partes.push({ archivo: tarjeta, segundos: cartel(tarjeta, paso.n, paso.title, simboloPath, 78, 190) });

    // Manda la locución: si sobra metraje se acelera, y si falta se congela el último cuadro.
    const crudo = crudos[indice];
    const velocidad = Math.max(crudo.segundos / segundos, 1);
    const relleno = Math.max(segundos - crudo.segundos / velocidad, 0) + 0.4;
    const tramo = join(workDir, `tramo${indice}.mp4`);
    ff(['-i', crudo.clip, '-i', voz,
      '-vf', [
        `setpts=PTS/${velocidad.toFixed(4)}`,
        `tpad=stop_mode=clone:stop_duration=${relleno.toFixed(2)}`,
        camara(
          crudo.vista
            ? (abre === null ? unZoom(crudo.vista) : unZoomHasta(crudo.vista, abre + XFADE, segundos))
            : quieta(),
          segundos, crudo.fuente),
        banda,
        subtitulos(trs),
      ].join(','),
      '-map', '0:v', '-map', '1:a', '-shortest',
      '-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-r', String(FPS),
      '-c:a', 'aac', '-ar', '44100', tramo]);
    partes.push({ archivo: tramo, segundos, voz });
    console.log(`🎬 ${paso.n} · voz ${segundos.toFixed(1)}s · pantalla x${velocidad.toFixed(2)} · ${trs.length} subtítulos`);
  }

  {
    const crudoVoz = join(voiceDir, 'vozfin.mp3');
    const alignment = await locutar(CIERRE, crudoVoz);
    const voz = adelantar(normalizar(crudoVoz), XFADE + RESPIRO);
    const segundos = dur(voz) + 0.8;
    const fin = join(workDir, 'fin.mp4');
    ff(['-f', 'lavfi', '-i', `color=c=${FONDO}:s=${OUT.width}x${OUT.height}:d=${segundos.toFixed(2)}:r=${FPS}`, '-i', voz,
      '-vf', [
        `drawtext=fontfile=${TITULAR}:text='En resumen':x=(w-tw)/2:y=300:fontsize=50:fontcolor=${CLARO}`,
        banda, subtitulos(trozos(alignment, 42, XFADE + RESPIRO)),
      ].join(','),
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-c:a', 'aac', '-ar', '44100', fin]);
    partes.push({ archivo: fin, segundos, voz });

    // La marca, en silencio y fundiéndose: la última frase ya se dijo.
    const marca = join(workDir, 'marca.mp4');
    ff(['-f', 'lavfi', '-i', `color=c=${FONDO}:s=${OUT.width}x${OUT.height}:d=4:r=${FPS}`,
      '-i', wordmarkPath,
      '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
      '-filter_complex',
      `[1:v]scale=420:-1[lg];[0:v][lg]overlay=x=(W-w)/2:y=248[bg];` +
      `[bg]drawtext=fontfile=${TEXTO}:text='${esc('Gestión documental para asesorías y empresas')}':x=(w-tw)/2:y=418:fontsize=26:fontcolor=${APAGADO},` +
      `fade=t=in:st=0:d=0.6,fade=t=out:st=2.6:d=1.4[v]`,
      '-map', '[v]', '-map', '2:a', '-shortest',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-c:a', 'aac', '-ar', '44100', marca]);
    partes.push({ archivo: marca, segundos: 4 });
  }

  // ── el pegado ──────────────────────────────────────────────────────────────
  // La disolvencia SOLAPA los trozos, así que el vídeo se acorta medio segundo por
  // unión y la voz se iría corriendo. Por eso el audio no se pega: se COLOCA. Cada
  // locución se retrasa hasta el segundo exacto en que su trozo empieza a verse, y
  // esos segundos son los mismos que usa el xfade.
  const inicios: number[] = [];
  let acumulado = 0;
  for (const [indice, parte] of partes.entries()) {
    inicios.push(indice === 0 ? 0 : acumulado - XFADE * indice);
    acumulado += parte.segundos;
  }

  const filtros: string[] = [];
  let video = '0:v';
  for (let i = 1; i < partes.length; i += 1) {
    const salida = `v${i}`;
    filtros.push(`[${video}][${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${inicios[i].toFixed(3)}[${salida}]`);
    video = salida;
  }

  const conVoz = partes.map((parte, indice) => ({ parte, indice })).filter((x) => x.parte.voz);
  const entradasAudio = conVoz.map((x, orden) => {
    const entrada = partes.length + orden;
    filtros.push(`[${entrada}:a]adelay=${Math.round(inicios[x.indice] * 1000)}|${Math.round(inicios[x.indice] * 1000)}[a${orden}]`);
    return `[a${orden}]`;
  });
  const total = acumulado - XFADE * (partes.length - 1);
  filtros.push(`${entradasAudio.join('')}amix=inputs=${entradasAudio.length}:normalize=0:dropout_transition=0[mezcla]`);
  filtros.push(`[mezcla]afade=t=out:st=${(total - 2).toFixed(2)}:d=2[audio]`);

  run('ffmpeg', [
    '-y',
    ...partes.flatMap((parte) => ['-i', parte.archivo]),
    ...conVoz.flatMap((x) => ['-i', x.parte.voz as string]),
    '-filter_complex', filtros.join(';'),
    '-map', `[${video}]`, '-map', '[audio]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart',
    outputPath,
  ]);

  // Manifiesto de revisión: permite cruzar cada segundo del vídeo con lo que se está
  // diciendo en ese momento. Sin esto, revisar el montaje es mirar fotogramas sueltos.
  await writeFile(join(workDir, 'manifest.json'), JSON.stringify({
    output: outputPath,
    partes: partes.map((parte, indice) => ({
      archivo: parte.archivo.split('/').pop(),
      empieza: Number(inicios[indice].toFixed(3)),
      dura: Number(parte.segundos.toFixed(3)),
    })),
    pasos: PASOS.map((paso, indice) => ({
      n: paso.n, titulo: paso.title, dice: paso.says,
      pantalla: PANTALLAS[indice], encuadre: paso.aim ?? 'plano general',
      // El tramo de pantalla es la parte impar siguiente a su cartel.
      empieza: Number(inicios[2 + indice * 2].toFixed(3)),
      dura: Number(partes[2 + indice * 2].segundos.toFixed(3)),
    })),
    cierre: CIERRE,
  }, null, 2));

  const tamaño = Number(run('stat', ['-c', '%s', outputPath]));
  console.log(JSON.stringify({
    output: outputPath,
    seconds: Number(dur(outputPath).toFixed(2)),
    megabytes: Number((tamaño / 1024 / 1024).toFixed(2)),
    musica: MUSICA ?? 'sin música (el tema disponible no tiene licencia comercial)',
  }, null, 2));
}

main()
  .catch((error) => { console.error(error); process.exit(1); })
  .finally(async () => prisma.$disconnect());
