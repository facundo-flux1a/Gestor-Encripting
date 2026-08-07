/**
 * Re-export de utilidades de conversaciones (compatibilidad).
 * @see assistant-conversations.ts
 */
export {
  MAX_LLM_CONTEXT_MESSAGES as MAX_CHAT_HISTORY_MESSAGES,
  MAX_CHAT_MESSAGE_CHARS,
  CONVERSATION_TTL_SECONDS as CHAT_HISTORY_TTL_SECONDS,
  truncateChatContent,
  trimChatMessages,
  type AssistantHistoryMessage,
  type StoredChatMessage,
} from '@/lib/assistant-conversations';
