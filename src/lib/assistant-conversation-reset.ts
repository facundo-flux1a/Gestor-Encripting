import { createConversationSession } from '@/lib/assistant-conversations';

/** Inicia una conversación nueva (la sesión anterior queda en el historial). */
export async function startNewAssistantConversation(userId: number) {
  return createConversationSession(userId);
}

/** @deprecated Usar startNewAssistantConversation */
export async function resetAssistantConversation(userId: number) {
  return startNewAssistantConversation(userId);
}
