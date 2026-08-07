/** Helpers puros de sesión/conversación del asistente IA. */

import { userOwnsConversation } from '@/lib/assistant-conversations';

const CONVERSATION_ID_RE = /^conv-[0-9a-f-]{36}$/i;

export function isValidConversationIdFormat(conversationId: string): boolean {
  return CONVERSATION_ID_RE.test(conversationId);
}

/** @deprecated Usar conversationId por sesión (conv-uuid). */
export function conversationIdForUser(userId: number): string {
  return `gestor-user-${userId}`;
}

export async function validateConversationAccess(
  userId: number,
  conversationId?: string,
): Promise<boolean> {
  if (!conversationId) return true;
  if (!isValidConversationIdFormat(conversationId)) return false;
  return userOwnsConversation(userId, conversationId);
}

/** @deprecated Usar validateConversationAccess */
export function validateConversationId(userId: number, clientConversationId?: string): boolean {
  if (!clientConversationId) return true;
  if (isValidConversationIdFormat(clientConversationId)) return true;
  return clientConversationId === conversationIdForUser(userId);
}
