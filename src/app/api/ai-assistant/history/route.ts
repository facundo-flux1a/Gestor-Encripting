import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import {
  getConversationMessages,
  listConversationSessions,
  MAX_CONVERSATION_SESSIONS,
} from '@/lib/assistant-conversations';

export const dynamic = 'force-dynamic';

/** GET — conversación activa o la indicada por query ?conversationId= */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const requestedId = req.nextUrl.searchParams.get('conversationId');
  const { sessions, activeConversationId } = await listConversationSessions(session.userId);
  const conversationId =
    requestedId && sessions.some((s) => s.id === requestedId)
      ? requestedId
      : activeConversationId;

  if (!conversationId) {
    return NextResponse.json({
      messages: [],
      conversationId: null,
      count: 0,
      maxSessions: MAX_CONVERSATION_SESSIONS,
    });
  }

  const messages = await getConversationMessages(session.userId, conversationId);
  const meta = sessions.find((s) => s.id === conversationId);

  return NextResponse.json({
    messages,
    conversationId,
    title: meta?.title ?? 'Conversación',
    count: messages.length,
    maxSessions: MAX_CONVERSATION_SESSIONS,
  });
}
