/**
 * Español valenciano (castellano de Valencia): tono, normalización y reglas de voz.
 * No mezclar con voseo rioplatense.
 */

/** Bloque reutilizable para prompts del asistente (chat y voz). */
export const VALENCIAN_LOCALE_PROMPT = `IDIOMA OBLIGATORIO — ESPAÑOL DE VALENCIA (España):
- Castellano peninsular, tono cercano y profesional de Valencia.
- Usa "tú", "tienes", "puedes", "mira", "prueba", "aquí", "crea", "prueba de nuevo".
- NUNCA voseo rioplatense: prohibido "tenés", "podés", "mirá", "andá", "probá", "acá", "vos", "che", "boludo", "genial" (como muletilla), "Respondé", "Creá", "Esperá", "intentá", "Preguntame".
- Frases fluidas, naturales al hablar; evita listas con muchas comas.`;

const RIOPLATENSE_TO_VALENCIAN: Array<[RegExp, string]> = [
  [/tenés/gi, 'tienes'],
  [/tenè/gi, 'tienes'],
  [/podés/gi, 'puedes'],
  [/podè/gi, 'puedes'],
  [/querés/gi, 'quieres'],
  [/sabés/gi, 'sabes'],
  [/mirá/gi, 'mira'],
  [/andá/gi, 've'],
  [/probá/gi, 'prueba'],
  [/escribí/gi, 'escribe'],
  [/respondé/gi, 'responde'],
  [/creá/gi, 'crea'],
  [/esperá/gi, 'espera'],
  [/intentá/gi, 'intenta'],
  [/preguntame/gi, 'pregúntame'],
  [/preguntá/gi, 'pregunta'],
  [/acá/gi, 'aquí'],
  [/unite a/gi, 'únete a'],
  [/ayudás/gi, 'ayudas'],
  [/\bsos\b/gi, 'eres'],
  [/\busá\b/gi, 'usa'],
  [/\bvos\b/gi, 'tú'],
  [/\bche\b/gi, ''],
  [/\bboludo\b/gi, ''],
  [/\bgenial\b/gi, 'perfecto'],
];

/** Normaliza texto de chat o voz a español valenciano estándar. */
export function normalizeToValencianSpanish(text: string): string {
  let out = text;
  for (const [pattern, replacement] of RIOPLATENSE_TO_VALENCIAN) {
    out = out.replace(pattern, replacement);
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}

/** @deprecated Usar normalizeToValencianSpanish */
export const normalizeToPeninsularSpanish = normalizeToValencianSpanish;
