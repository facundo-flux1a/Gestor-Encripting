import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SUPPORT_CHAT_URL = process.env.ALLBASE_CHAT_URL;
const AGENT_ID =
  process.env.ALLBASE_SUPPORT_AGENT_ID ?? '715ca840-b142-44d3-a375-5bb3236679e8';
const API_KEY = process.env.ALLBASE_API_KEY;

const ASSISTANT_UNAVAILABLE =
  'El asistente no está disponible en este momento. Probá más tarde.';
const ASSISTANT_BUSY =
  'Hay muchas consultas en este momento. Probá de nuevo en unos segundos.';
const ASSISTANT_RETRY =
  'No pudimos procesar tu consulta. Intentá de nuevo.';
const ASSISTANT_OFFLINE =
  'El asistente no está disponible ahora. Esperá un momento e intentá de nuevo.';
const ASSISTANT_CONNECTION =
  'No pudimos conectar con el asistente. Verificá tu conexión e intentá de nuevo.';

/** Evita filtrar nombres de proveedores internos en respuestas del upstream. */
function sanitizeAssistantText(text: string): string {
  return text
    .replace(/\bAllBase\b/gi, 'Muvail')
    .replace(/\bRender\b/gi, '')
    .replace(/https?:\/\/[^\s]*allbase[^\s]*/gi, '')
    .replace(/https?:\/\/[^\s]*onrender\.com[^\s]*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function upstreamErrorMessage(status: number): string {
  if (status === 503 || status === 502) return ASSISTANT_OFFLINE;
  if (status === 429) return ASSISTANT_BUSY;
  return ASSISTANT_RETRY;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json(
      { error: 'Tenés que iniciar sesión para usar el asistente.' },
      { status: 401 },
    );
  }

  if (!API_KEY || !SUPPORT_CHAT_URL) {
    return NextResponse.json({ error: ASSISTANT_UNAVAILABLE }, { status: 503 });
  }

  let body: { message?: string; conversationId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'No pudimos leer tu mensaje. Intentá de nuevo.' },
      { status: 400 },
    );
  }

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json(
      { error: 'Escribí un mensaje para continuar.' },
      { status: 400 },
    );
  }

  const conversationId =
    body.conversationId ?? `gestor-user-${session.userId}`;

  try {
    const upstream = await fetch(SUPPORT_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
      body: JSON.stringify({
        agentId: AGENT_ID,
        message,
        conversationId,
        userId: String(session.userId),
        stream: false,
      }),
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      return NextResponse.json(
        { error: upstreamErrorMessage(upstream.status) },
        { status: upstream.status },
      );
    }

    const rawResponse =
      (data.response && String(data.response).trim()) ||
      '¡Hola! Soy el asistente de Gestor Documental Muvail. Preguntame cómo subir facturas, qué es una incidencia, trimestres o la API.';

    return NextResponse.json({
      response: sanitizeAssistantText(rawResponse),
      conversationId: data.conversationId ?? conversationId,
    });
  } catch (error) {
    console.error('[support-chat]', error);
    return NextResponse.json({ error: ASSISTANT_CONNECTION }, { status: 502 });
  }
}
