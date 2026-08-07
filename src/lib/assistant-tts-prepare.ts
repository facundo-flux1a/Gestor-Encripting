/**
 * Prepara texto para TTS: español valenciano, números legibles, sin pausas tipo GPS.
 */

import { normalizeToValencianSpanish } from '@/lib/assistant-valencian-locale';

const DIGIT_WORDS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];

function numberToSpanishCardinal(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n);
  if (n <= 9) return DIGIT_WORDS[n];
  if (n < 100) {
    const tens = [
      '',
      '',
      'veinte',
      'treinta',
      'cuarenta',
      'cincuenta',
      'sesenta',
      'setenta',
      'ochenta',
      'noventa',
    ];
    const teens = [
      'diez',
      'once',
      'doce',
      'trece',
      'catorce',
      'quince',
      'dieciséis',
      'diecisiete',
      'dieciocho',
      'diecinueve',
    ];
    if (n < 20) return teens[n - 10];
    const t = Math.floor(n / 10);
    const u = n % 10;
    if (u === 0) return tens[t];
    if (t === 2) return `veinti${DIGIT_WORDS[u]}`;
    return `${tens[t]} y ${DIGIT_WORDS[u]}`;
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    const hundreds = [
      '',
      'ciento',
      'doscientos',
      'trescientos',
      'cuatrocientos',
      'quinientos',
      'seiscientos',
      'setecientos',
      'ochocientos',
      'novecientos',
    ];
    const hundred = h === 1 && r === 0 ? 'cien' : hundreds[h];
    return r === 0 ? hundred : `${hundred} ${numberToSpanishCardinal(r)}`;
  }
  if (n < 1_000_000) {
    const th = Math.floor(n / 1000);
    const r = n % 1000;
    const thousand = th === 1 ? 'mil' : `${numberToSpanishCardinal(th)} mil`;
    return r === 0 ? thousand : `${thousand} ${numberToSpanishCardinal(r)}`;
  }
  return String(n);
}

function yearToSpanish(year: number): string {
  if (year >= 2000 && year < 2010) {
    return `dos mil ${numberToSpanishCardinal(year - 2000)}`;
  }
  if (year >= 2010 && year < 2100) {
    const rest = year - 2000;
    if (rest === 0) return 'dos mil';
    return `dos mil ${numberToSpanishCardinal(rest)}`;
  }
  return numberToSpanishCardinal(year);
}

/** Dígitos separados por espacio (sin comas → evita entonación GPS). */
function digitsToSpoken(numStr: string): string {
  return numStr
    .split('')
    .map((d) => DIGIT_WORDS[parseInt(d, 10)] ?? d)
    .join(' ');
}

function parseEuropeanAmount(raw: string): number | null {
  const cleaned = raw.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function amountToSpeech(raw: string, currency = 'euros'): string {
  const value = parseEuropeanAmount(raw);
  if (value == null) return raw;

  const euros = Math.floor(value);
  const cents = Math.round((value - euros) * 100);

  if (cents === 0) {
    return `${numberToSpanishCardinal(euros)} ${currency}`;
  }
  return `${numberToSpanishCardinal(euros)} ${currency} con ${numberToSpanishCardinal(cents)} céntimos`;
}

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function dateToSpeech(day: number, month: number, year: number): string {
  const monthName = MONTHS[month - 1] ?? String(month);
  return `${numberToSpanishCardinal(day)} de ${monthName} de ${yearToSpanish(year)}`;
}

/** Convierte fechas, importes y números largos a forma hablable. */
export function speakifyNumbersAndDates(text: string): string {
  let out = text;

  out = out.replace(
    /(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})\s*€/g,
    (_, amount) => amountToSpeech(amount),
  );

  out = out.replace(
    /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/g,
    (_, d, m, y) => dateToSpeech(parseInt(d, 10), parseInt(m, 10), parseInt(y, 10)),
  );

  out = out.replace(
    /\b[Tt](\d)\s*(\d{4})\b/g,
    (_, q, y) =>
      `trimestre ${numberToSpanishCardinal(parseInt(q, 10))} de ${yearToSpanish(parseInt(y, 10))}`,
  );

  out = out.replace(/\b(\d{6,})\b/g, (_, num) => `número ${digitsToSpoken(num)}`);

  out = out.replace(
    /\bn[úu]mero\s+(\d{6,})\b/gi,
    (_, num) => `número ${digitsToSpoken(num)}`,
  );

  return out;
}

/**
 * Limpia puntuación que ElevenLabs interpreta como pausa fuerte (efecto GPS).
 * No añade comas artificiales.
 */
export function smoothTtsPunctuation(text: string): string {
  return text
    .replace(/:\s*/g, '. ')
    .replace(/;\s*/g, '. ')
    .replace(/\s—\s/g, ' ')
    .replace(/\s-\s/g, ' ')
    .replace(/,\s*,+/g, ', ')
    .replace(/\.{2,}/g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Pipeline completo antes de enviar a ElevenLabs. */
export function prepareTextForTts(text: string): string {
  const steps = [normalizeToValencianSpanish, speakifyNumbersAndDates, smoothTtsPunctuation];
  return steps.reduce((acc, fn) => fn(acc), text.trim());
}

export { digitsToSpoken, numberToSpanishCardinal, normalizeToValencianSpanish };
