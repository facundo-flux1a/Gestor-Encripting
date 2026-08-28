import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import {
  isAssistantAvailable,
  runAssistantChat,
} from '@/services/ai-assistant-service';
import { validateConversationAccess } from '@/lib/ai-assistant-session';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CONNECTION_ERROR =
  'No pudimos conectar con el asistente. Verifica tu conexión e inténtalo de nuevo.';

/** @deprecated Usar /api/ai-assistant/chat — redirige al asistente unificado. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json(
      { error: 'Tienes que iniciar sesión para usar el asistente.' },
      { status: 401 },
    );
  }

  if (!isAssistantAvailable()) {
    return NextResponse.json(
      { error: 'El asistente no está disponible en este momento. Prueba más tarde.' },
      { status: 503 },
    );
  }

  let body: { message?: string; conversationId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'No pudimos leer tu mensaje. Inténtalo de nuevo.' },
      { status: 400 },
    );
  }

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json(
      { error: 'Escribe un mensaje para continuar.' },
      { status: 400 },
    );
  }

  if (!(await validateConversationAccess(session.userId, body.conversationId))) {
    return NextResponse.json({ error: 'Conversación inválida.' }, { status: 403 });
  }

  try {
    const result = await runAssistantChat(
      session.userId,
      message,
      session.nombre,
      body.conversationId,
    );
    return NextResponse.json({
      response: result.response,
      conversationId: result.conversationId,
      toolsUsed: result.toolsUsed,
    });
  } catch (error) {
    console.error('[support-chat]', error);
    return NextResponse.json({ error: CONNECTION_ERROR }, { status: 502 });
  }
}
