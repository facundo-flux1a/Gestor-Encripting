import { readFileSync } from 'fs';
import { join } from 'path';

const KB_PATH = join(process.cwd(), 'docs/FAQ_GESTOR_DOCUMENTAL_KB.md');
const MAX_KB_CHARS = 14000;

let cachedKb: string | null = null;

/** FAQ del producto para respuestas sin consultar documentos del usuario. */
export function getAssistantKnowledgeBase(): string {
  if (cachedKb !== null) return cachedKb;
  try {
    const raw = readFileSync(KB_PATH, 'utf-8');
    cachedKb =
      raw.length > MAX_KB_CHARS
        ? raw.slice(0, MAX_KB_CHARS) + '\n\n[… documentación truncada …]'
        : raw;
    return cachedKb;
  } catch {
    cachedKb =
      'Gestor Documental Muvail: sube PDF/imágenes en Documentos, revisa incidencias en Centro de Seguridad (/dashboard/auditoria), sigue subidas en la Cola de Subidas del sidebar, cierra trimestres Q1-Q4, API con X-Api-Key en Ajustes. La página Actividad ya no existe.';
    return cachedKb;
  }
}

/** Solo desarrollo: limpiar caché en hot reload. */
export function clearAssistantKnowledgeBaseCache(): void {
  cachedKb = null;
}
