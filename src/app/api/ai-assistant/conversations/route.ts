import { NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import {
  listConversationSessions,
  MAX_CONVERSATION_SESSIONS,
} from '@/lib/assistant-conversations';
import { startNewAssistantConversation } from '@/lib/assistant-conversation-reset';

export const dynamic = 'force-dynamic';

/** GET — lista de conversaciones guardadas (máx 20). */
export async function GET() {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const { sessions, activeConversationId } = await listConversationSessions(session.userId);

  return NextResponse.json({
    sessions,
    activeConversationId,
    count: sessions.length,
    maxSessions: MAX_CONVERSATION_SESSIONS,
  });
}

/** POST — nueva conversación (la anterior queda en el historial). */
export async function POST() {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const created = await startNewAssistantConversation(session.userId);

  return NextResponse.json({
    success: true,
    conversationId: created.id,
    session: created,
    maxSessions: MAX_CONVERSATION_SESSIONS,
  });
}
