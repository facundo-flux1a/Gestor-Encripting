import {
  countNumberedListItems,
  shouldSummarizeForVoice,
  stripMarkdownForSpeech,
  VOICE_DIRECT_MAX_CHARS,
} from '../src/lib/assistant-voice-text';
import {
  digitsToSpoken,
  normalizeToValencianSpanish,
  prepareTextForTts,
  smoothTtsPunctuation,
  speakifyNumbersAndDates,
} from '../src/lib/assistant-tts-prepare';

describe('assistant-voice-text', () => {
  it('stripMarkdownForSpeech removes markdown noise', () => {
    const plain = stripMarkdownForSpeech('**Hola** con `code` y\n\n1. Factura A\n2. Factura B');
    expect(plain).not.toContain('**');
    expect(plain).not.toContain('`');
  });

  it('shouldSummarizeForVoice on long document lists', () => {
    const list = Array.from({ length: 6 }, (_, i) => `${i + 1}. Factura ${i + 1} — 120 €`).join('\n');
    expect(countNumberedListItems(list)).toBe(6);
    expect(shouldSummarizeForVoice(list, ['list_documents_summary'])).toBe(true);
  });

  it('shouldSummarizeForVoice keeps short FAQ answers', () => {
    const short = 'Para subir facturas ve a Documentos y usa el botón Subir.';
    expect(short.length).toBeLessThan(VOICE_DIRECT_MAX_CHARS);
    expect(shouldSummarizeForVoice(short, [])).toBe(false);
  });
});

describe('assistant-tts-prepare', () => {
  it('normalizes rioplatense modisms to valencian', () => {
    expect(normalizeToValencianSpanish('Tenés una factura, mirá el detalle acá.')).toBe(
      'tienes una factura, mira el detalle aquí.',
    );
  });

  it('speaks long invoice numbers digit by digit without commas', () => {
    const out = speakifyNumbersAndDates('Factura 5004806579');
    expect(out).toContain('cinco cero cero cuatro ocho');
    expect(out).not.toContain('5004806579');
    expect(out).not.toMatch(/cinco,\s*cero/);
  });

  it('speaks amounts and dates naturally', () => {
    const out = speakifyNumbersAndDates('Importe 63,18 € emitida el 24/10/2024');
    expect(out).toContain('sesenta y tres euros con dieciocho céntimos');
    expect(out).toContain('veinticuatro de octubre de dos mil veinticuatro');
  });

  it('prepareTextForTts applies full pipeline', () => {
    const out = prepareTextForTts('Tenés la factura 5004806579 por 63,18 €');
    expect(out).toMatch(/tienes/i);
    expect(out).not.toMatch(/tenés/i);
    expect(out).toContain('céntimos');
  });

  it('digitsToSpoken uses spaces not commas', () => {
    expect(digitsToSpoken('509')).toBe('cinco cero nueve');
  });

  it('smoothTtsPunctuation removes gps-like colon pauses', () => {
    expect(smoothTtsPunctuation('Factura: número 123')).toBe('Factura. número 123');
  });
});
