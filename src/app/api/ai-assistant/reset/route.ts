import { NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import { startNewAssistantConversation } from '@/lib/assistant-conversation-reset';

export const dynamic = 'force-dynamic';

/** POST — alias de nueva conversación (compatibilidad con UI anterior). */
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
  });
}
