import { isAzureOpenAiConfigured } from '@/services/ingestion/azure-openai';
import {
  clampVoiceText,
  countNumberedListItems,
  stripMarkdownForSpeech,
  VOICE_OUTPUT_MAX_CHARS,
} from '@/lib/assistant-voice-text';
import { prepareTextForTts } from '@/lib/assistant-tts-prepare';
import { VALENCIAN_LOCALE_PROMPT } from '@/lib/assistant-valencian-locale';

async function callAzureForVoiceSummary(prompt: string): Promise<string> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/$/, '');
  const key = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-05-01-preview';

  if (!endpoint || !key || !deployment) {
    throw new Error('Azure OpenAI no configurado para resumen de voz');
  }

  const url = endpoint.includes('/openai/deployments/')
    ? `${endpoint}/chat/completions?api-version=${apiVersion}`
    : endpoint.endsWith('/models')
      ? `${endpoint}/chat/completions?api-version=${apiVersion}`
      : `${endpoint}/models/chat/completions?api-version=${apiVersion}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': key },
    body: JSON.stringify({
      model: deployment,
      messages: [{ role: 'user', content: prompt }],
      max_completion_tokens: 500,
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`LLM resumen voz ${res.status}: ${raw.slice(0, 200)}`);
  }

  const parsed = JSON.parse(raw);
  return parsed.choices?.[0]?.message?.content?.trim() ?? '';
}

function heuristicVoiceSummary(plain: string, listCount = 0): string {
  const euroMatches = plain.match(/[\d.,]+\s*€/g) ?? [];
  const firstSentence = plain.split(/(?<=[.!?])\s+/)[0]?.trim() ?? plain.slice(0, 120);

  if (listCount >= 4) {
    return clampVoiceText(
      `${firstSentence}. Hay un listado de ${listCount} documentos. ` +
        'Te dejo el detalle completo en pantalla para que lo revises con calma.',
    );
  }

  if (euroMatches.length >= 3) {
    return clampVoiceText(
      `${firstSentence}. Hay varios importes en la respuesta; mira el chat para ver cada factura con su detalle.`,
    );
  }

  return clampVoiceText(plain.slice(0, VOICE_OUTPUT_MAX_CHARS));
}

const DOCUMENT_TOOLS = new Set([
  'list_documents_summary',
  'get_document_detail',
  'search_documents',
  'get_quarter_summary',
]);

/** Resume o adapta respuestas para lectura en voz alta y pantalla conversacional. */
export async function summarizeTextForVoice(
  markdownText: string,
  toolsUsed: string[] = [],
): Promise<string> {
  const plain = stripMarkdownForSpeech(markdownText);
  if (!plain) return '';

  const listCount = countNumberedListItems(markdownText);
  const usedDocs = toolsUsed.some((t) => DOCUMENT_TOOLS.has(t));
  const mentionsIncidence = /incidencia/i.test(plain);

  const prompt = `Eres la voz del asistente de Gestor Documental Muvail (Valencia, España).
Reescribe el mensaje para mostrárselo al usuario de forma CONVERSACIONAL y FLUIDA al hablar.

${VALENCIAN_LOCALE_PROMPT}

REGLAS DE VOZ (breve y natural — muy importante):
- Sé breve y conversacional. No recites listas interminables ni dictes números de factura dígito a dígito si son varios.
- Di los totales principales y los proveedores principales.
- Si hay más de 2 facturas, da el total y menciona los proveedores principales, indicando que el detalle completo en tabla está en la pantalla.
- Escribe frases corridas y fluidas. Evita dos puntos, punto y coma, guiones y comas innecesarias.
- Sin markdown. Máximo ${VOICE_OUTPUT_MAX_CHARS} caracteres.
${usedDocs ? '- Datos de documentos: sé específico.\n' : ''}
${mentionsIncidence ? '- Explica el MOTIVO de cada incidencia.\n' : ''}

MENSAJE ORIGINAL:
${plain.slice(0, 6000)}

Responde SOLO con el texto hablado en español de Valencia.`;

  if (isAzureOpenAiConfigured()) {
    try {
      const summary = await callAzureForVoiceSummary(prompt);
      if (summary) return prepareTextForTts(clampVoiceText(summary));
    } catch (err) {
      console.warn('[assistant-voice-summary] Fallback heurístico:', err);
    }
  }

  return prepareTextForTts(heuristicVoiceSummary(plain, listCount));
}
