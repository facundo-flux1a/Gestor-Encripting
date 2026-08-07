/**
 * Fallback AllBase cuando Azure OpenAI no está disponible.
 */

const SUPPORT_CHAT_URL = process.env.ALLBASE_CHAT_URL;
const AGENT_ID =
  process.env.ALLBASE_SUPPORT_AGENT_ID ?? '715ca840-b142-44d3-a375-5bb3236679e8';
const API_KEY = process.env.ALLBASE_API_KEY;

export function isAllBaseSupportConfigured(): boolean {
  return Boolean(API_KEY && SUPPORT_CHAT_URL);
}

import { normalizeToValencianSpanish } from '@/lib/assistant-valencian-locale';

export function sanitizeAssistantText(text: string): string {
  return normalizeToValencianSpanish(
    text
      .replace(/\bAllBase\b/gi, 'Muvail')
      .replace(/\bRender\b/gi, '')
      .replace(/https?:\/\/[^\s]*allbase[^\s]*/gi, '')
      .replace(/https?:\/\/[^\s]*onrender\.com[^\s]*/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim(),
  );
}

export async function runAllBaseSupportChat(
  userId: number,
  message: string,
  conversationId: string,
): Promise<{ response: string; conversationId: string }> {
  if (!isAllBaseSupportConfigured()) {
    throw new Error('El asistente no está disponible en este momento. Prueba más tarde.');
  }

  const upstream = await fetch(SUPPORT_CHAT_URL!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY!,
    },
    body: JSON.stringify({
      agentId: AGENT_ID,
      message,
      conversationId,
      userId: String(userId),
      stream: false,
    }),
  });

  const data = await upstream.json().catch(() => ({}));

  if (!upstream.ok) {
    if (upstream.status === 503 || upstream.status === 502) {
      throw new Error('El asistente no está disponible ahora. Espera un momento e inténtalo de nuevo.');
    }
    if (upstream.status === 429) {
      throw new Error('Hay muchas consultas en este momento. Prueba de nuevo en unos segundos.');
    }
    throw new Error('No pudimos procesar tu consulta. Inténtalo de nuevo.');
  }

  const rawResponse =
    (data.response && String(data.response).trim()) ||
    '¡Hola! Soy el asistente de Gestor Documental Muvail. Pregúntame cómo usar la plataforma o sobre tus documentos.';

  return {
    response: sanitizeAssistantText(rawResponse),
    conversationId: data.conversationId ?? conversationId,
  };
}
