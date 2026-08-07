import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import {
  deleteConversationSession,
  getConversationMessages,
  listConversationSessions,
  setActiveConversation,
  updateConversationTitle,
} from '@/lib/assistant-conversations';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

/** GET — mensajes de una conversación. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const { id } = await params;
  const { sessions } = await listConversationSessions(session.userId);
  const meta = sessions.find((s) => s.id === id);
  if (!meta) {
    return NextResponse.json({ error: 'Conversación no encontrada.' }, { status: 404 });
  }

  await setActiveConversation(session.userId, id);
  const messages = await getConversationMessages(session.userId, id);

  return NextResponse.json({
    conversationId: id,
    title: meta.title,
    messages,
    count: messages.length,
  });
}

/** DELETE — elimina una conversación del historial. */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const { id } = await params;
  const deleted = await deleteConversationSession(session.userId, id);
  if (!deleted) {
    return NextResponse.json({ error: 'Conversación no encontrada.' }, { status: 404 });
  }

  const { sessions, activeConversationId } = await listConversationSessions(session.userId);

  return NextResponse.json({
    success: true,
    activeConversationId,
    sessions,
  });
}

/** PATCH — renombrar conversación. */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  let body: { title?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }

  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: 'El título no puede estar vacío.' }, { status: 400 });
  }

  const { id } = await params;
  const updated = await updateConversationTitle(session.userId, id, title);
  if (!updated) {
    return NextResponse.json({ error: 'Conversación no encontrada.' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    session: updated,
  });
}
