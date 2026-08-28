/**
 * Revisa el tutorial cruzando lo que SE DICE con lo que SE VE, segundo a segundo.
 *
 * Mirar fotogramas sueltos no es revisar: el fallo típico de este vídeo no es que un
 * plano esté feo, es que la voz nombre algo que no está en pantalla. Esta herramienta
 * saca un fotograma por segundo, le pega al lado la frase que suena en ese instante
 * según el manifiesto del montaje, y monta una hoja de contactos por paso.
 *
 * Uso: npx tsx scripts/review-tutorial.ts [segundoInicio] [segundoFin]
 */
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const workDir = '/tmp/muvail-tutorial';
const voiceDir = '/tmp/muvail-tutorial-voz';
const outDir = '/tmp/muvail-tutorial-revision';
const fuente = join(process.cwd(), 'scripts', 'fonts', 'Inter-SemiBold.ttf');

function run(command: string, args: string[]) {
  const r = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${command} falló: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, '’').replace(/%/g, '\\%');

type Alignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

/** Qué se está diciendo en el segundo `t` del vídeo montado. */
function frase(alignments: Array<{ inicio: number; al: Alignment }>, t: number) {
  for (const { inicio, al } of alignments) {
    const rel = t - inicio;
    if (rel < 0 || rel > al.character_end_times_seconds[al.characters.length - 1]) continue;
    // Se devuelve la frase completa que contiene ese instante, no las sílabas sueltas.
    let desde = 0;
    let hasta = al.characters.length - 1;
    for (let i = 0; i < al.characters.length; i += 1) {
      if (al.character_end_times_seconds[i] < rel && /[.,;:!?]/.test(al.characters[i])) desde = i + 1;
      if (al.character_start_times_seconds[i] > rel && /[.,;:!?]/.test(al.characters[i])) { hasta = i; break; }
    }
    return al.characters.slice(desde, hasta + 1).join('').trim();
  }
  return '';
}

async function main() {
  const manifiesto = JSON.parse(await readFile(join(workDir, 'manifest.json'), 'utf8'));
  const video = manifiesto.output as string;
  const total = Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', video]));

  const desde = Number(process.argv[2] ?? 0);
  const hasta = Number(process.argv[3] ?? Math.floor(total));

  // Las locuciones, colocadas en la línea de tiempo igual que en el montaje.
  const conVoz = manifiesto.partes.filter((p: any) => /^tramo|^fin/.test(p.archivo));
  const alignments: Array<{ inicio: number; al: Alignment }> = [];
  for (const [orden, parte] of conVoz.entries()) {
    const archivo = parte.archivo.startsWith('fin') ? 'vozfin.json' : `voz${orden}.json`;
    try {
      alignments.push({ inicio: parte.empieza, al: JSON.parse(await readFile(join(voiceDir, archivo), 'utf8')) });
    } catch { /* ese tramo no lleva voz */ }
  }

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const filas: string[] = [];
  const laminas: string[] = [];
  for (let t = desde; t <= hasta; t += 1) {
    const dicho = frase(alignments, t);
    const paso = manifiesto.pasos.find((p: any) => t >= p.empieza && t < p.empieza + p.dura);
    const etiqueta = paso ? `${paso.n} · ${paso.pantalla}` : 'cartel / cierre';
    const png = join(outDir, `t${String(t).padStart(3, '0')}.png`);
    run('ffmpeg', ['-y', '-v', 'error', '-ss', String(t), '-i', video, '-frames:v', '1',
      '-vf', [
        'scale=520:-1',
        `drawbox=x=0:y=0:w=520:h=46:color=0x101314@0.92:t=fill`,
        `drawtext=fontfile=${fuente}:text='${esc(`${t}s · ${etiqueta}`)}':x=8:y=6:fontsize=13:fontcolor=0xb5de57`,
        `drawtext=fontfile=${fuente}:text='${esc(dicho.slice(0, 74))}':x=8:y=26:fontsize=13:fontcolor=0xffffff`,
      ].join(','), png]);
    laminas.push(png);
    filas.push(`${String(t).padStart(3)}s | ${etiqueta.padEnd(42)} | ${dicho}`);
  }

  // Hoja de contactos: seis por fila, para poder mirarlas juntas.
  const hoja = join(outDir, 'hoja.png');
  run('ffmpeg', ['-y', '-v', 'error', ...laminas.flatMap((f) => ['-i', f]),
    '-filter_complex', `tile=6x${Math.ceil(laminas.length / 6)}:padding=6:color=0x101314`, hoja]);

  await writeFile(join(outDir, 'revision.txt'), filas.join('\n'));
  console.log(filas.join('\n'));
  console.log(`\nhoja de contactos: ${hoja}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
