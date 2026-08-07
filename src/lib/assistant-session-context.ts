import { upstash } from '@/lib/upstash';
import type { AssistantSessionContext } from '@/lib/assistant-context-prompt';

export type { AssistantSessionContext } from '@/lib/assistant-context-prompt';
export { formatSessionContextForPrompt } from '@/lib/assistant-context-prompt';
export { CONVERSATION_TTL_SECONDS as CONTEXT_TTL_SECONDS } from '@/lib/assistant-conversations';

function contextKey(userId: number, conversationId: string): string {
  return `assistant-context:${userId}:${conversationId}`;
}

export async function getAssistantSessionContext(
  userId: number,
  conversationId: string,
): Promise<AssistantSessionContext | null> {
  try {
    return await upstash.get<AssistantSessionContext>(contextKey(userId, conversationId));
  } catch {
    return null;
  }
}

export async function saveAssistantSessionContext(
  userId: number,
  conversationId: string,
  patch: Partial<Pick<AssistantSessionContext, 'lastDocuments' | 'lastDocumentId'>>,
): Promise<void> {
  try {
    const prev = (await getAssistantSessionContext(userId, conversationId)) ?? {
      userId,
      updatedAt: new Date().toISOString(),
    };
    const next: AssistantSessionContext = {
      ...prev,
      userId,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await upstash.set(contextKey(userId, conversationId), next, {
      ex: 60 * 60 * 24 * 7,
    });
  } catch (err) {
    console.warn('[assistant-session-context] No se pudo guardar contexto:', err);
  }
}

export async function clearAssistantSessionContext(
  userId: number,
  conversationId: string,
): Promise<void> {
  try {
    await upstash.del(contextKey(userId, conversationId));
  } catch (err) {
    console.warn('[assistant-session-context] No se pudo borrar contexto:', err);
  }
}
