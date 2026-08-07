/** Texto plano para TTS: sin markdown ni ruido visual. */
export function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+[^\n]+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export const VOICE_DIRECT_MAX_CHARS = 380;
export const VOICE_OUTPUT_MAX_CHARS = 680;

const DOCUMENT_TOOLS = new Set([
  'list_documents_summary',
  'get_document_detail',
  'search_documents',
  'get_quarter_summary',
]);

export function countNumberedListItems(text: string): number {
  return (text.match(/^\s*\d+\.\s+/gm) ?? []).length;
}

export function shouldSummarizeForVoice(
  text: string,
  toolsUsed: string[] = [],
): boolean {
  const plain = stripMarkdownForSpeech(text);
  if (plain.length > VOICE_DIRECT_MAX_CHARS) return true;
  if (countNumberedListItems(text) >= 4) return true;
  if ((plain.match(/€/g) ?? []).length >= 4) return true;

  const usedDocuments = toolsUsed.some((t) => DOCUMENT_TOOLS.has(t));
  if (usedDocuments) return true;
  if (/incidencia/i.test(plain)) return true;

  return false;
}

export function clampVoiceText(text: string, max = VOICE_OUTPUT_MAX_CHARS): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}
