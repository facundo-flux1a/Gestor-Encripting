import { randomUUID } from 'crypto';
import { upstash } from '@/lib/upstash';

/** Máximo de conversaciones guardadas por usuario. */
export const MAX_CONVERSATION_SESSIONS = 20;

/** Mensajes recientes que el LLM recibe como contexto dentro de una sesión. */
export const MAX_LLM_CONTEXT_MESSAGES = 40;

/** Caracteres máximos por mensaje guardado. */
export const MAX_CHAT_MESSAGE_CHARS = 3000;

/** TTL de inactividad (7 días). */
export const CONVERSATION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type StoredChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  at: string;
};

export type ConversationSessionMeta = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

export type ConversationsIndexStore = {
  userId: number;
  activeConversationId: string | null;
  sessions: ConversationSessionMeta[];
  updatedAt: string;
};

export type ConversationStore = {
  id: string;
  userId: number;
  messages: StoredChatMessage[];
  createdAt: string;
  updatedAt: string;
};

export type AssistantHistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const LEGACY_HISTORY_KEY = (userId: number) => `assistant-chat-history:${userId}`;

function indexKey(userId: number): string {
  return `assistant-conversations-index:${userId}`;
}

function conversationKey(userId: number, conversationId: string): string {
  return `assistant-conversation:${userId}:${conversationId}`;
}

export function generateConversationId(): string {
  return `conv-${randomUUID()}`;
}

/** Caracteres máximos en el título de una conversación. */
export const MAX_CONVERSATION_TITLE_CHARS = 80;

export function buildConversationTitle(firstMessage: string): string {
  return sanitizeConversationTitle(firstMessage, 48);
}

export function sanitizeConversationTitle(
  title: string,
  maxLen = MAX_CONVERSATION_TITLE_CHARS,
): string {
  const t = title.trim().replace(/\s+/g, ' ');
  if (!t) return 'Nueva conversación';
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen);
}

export function filterSessionsByTitle(
  sessions: ConversationSessionMeta[],
  query: string,
): ConversationSessionMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return sessions;
  return sessions.filter((s) => s.title.toLowerCase().includes(q));
}

export function trimSessionsForLimit(
  sessions: ConversationSessionMeta[],
  max = MAX_CONVERSATION_SESSIONS,
): { kept: ConversationSessionMeta[]; removed: ConversationSessionMeta[] } {
  const sorted = [...sessions].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  return {
    kept: sorted.slice(0, max),
    removed: sorted.slice(max),
  };
}

export function trimChatMessages(
  messages: StoredChatMessage[],
  max = MAX_LLM_CONTEXT_MESSAGES,
): StoredChatMessage[] {
  return messages.slice(-max);
}

export function truncateChatContent(content: string): string {
  const t = content.trim();
  if (t.length <= MAX_CHAT_MESSAGE_CHARS) return t;
  return `${t.slice(0, MAX_CHAT_MESSAGE_CHARS)}…`;
}

async function deleteConversationData(
  userId: number,
  conversationId: string,
): Promise<void> {
  await Promise.all([
    upstash.del(conversationKey(userId, conversationId)),
    upstash.del(`assistant-context:${userId}:${conversationId}`),
  ]);
}

async function migrateLegacyHistory(userId: number): Promise<ConversationsIndexStore | null> {
  try {
    const legacy = await upstash.get<{
      userId: number;
      messages: StoredChatMessage[];
      updatedAt: string;
    }>(LEGACY_HISTORY_KEY(userId));

    if (!legacy?.messages?.length) {
      await upstash.del(LEGACY_HISTORY_KEY(userId));
      return null;
    }

    const id = generateConversationId();
    const now = new Date().toISOString();
    const firstUser = legacy.messages.find((m) => m.role === 'user');
    const meta: ConversationSessionMeta = {
      id,
      title: firstUser ? buildConversationTitle(firstUser.content) : 'Conversación anterior',
      createdAt: legacy.messages[0]?.at ?? now,
      updatedAt: legacy.updatedAt ?? now,
      messageCount: legacy.messages.length,
    };

    const store: ConversationStore = {
      id,
      userId,
      messages: legacy.messages,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    };

    const index: ConversationsIndexStore = {
      userId,
      activeConversationId: id,
      sessions: [meta],
      updatedAt: now,
    };

    await Promise.all([
      upstash.set(conversationKey(userId, id), store, { ex: CONVERSATION_TTL_SECONDS }),
      upstash.set(indexKey(userId), index, { ex: CONVERSATION_TTL_SECONDS }),
      upstash.del(LEGACY_HISTORY_KEY(userId)),
    ]);

    return index;
  } catch (err) {
    console.warn('[assistant-conversations] Migración legacy falló:', err);
    return null;
  }
}

export async function getConversationsIndex(
  userId: number,
): Promise<ConversationsIndexStore> {
  try {
    const existing = await upstash.get<ConversationsIndexStore>(indexKey(userId));
    if (existing) return existing;

    const migrated = await migrateLegacyHistory(userId);
    if (migrated) return migrated;

    const now = new Date().toISOString();
    return {
      userId,
      activeConversationId: null,
      sessions: [],
      updatedAt: now,
    };
  } catch {
    const now = new Date().toISOString();
    return {
      userId,
      activeConversationId: null,
      sessions: [],
      updatedAt: now,
    };
  }
}

async function saveConversationsIndex(index: ConversationsIndexStore): Promise<void> {
  await upstash.set(indexKey(index.userId), index, { ex: CONVERSATION_TTL_SECONDS });
}

export async function listConversationSessions(
  userId: number,
): Promise<{ sessions: ConversationSessionMeta[]; activeConversationId: string | null }> {
  const index = await getConversationsIndex(userId);
  const sessions = [...index.sessions].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  return { sessions, activeConversationId: index.activeConversationId };
}

export async function userOwnsConversation(
  userId: number,
  conversationId: string,
): Promise<boolean> {
  const index = await getConversationsIndex(userId);
  return index.sessions.some((s) => s.id === conversationId);
}

export async function getConversationMessages(
  userId: number,
  conversationId: string,
): Promise<AssistantHistoryMessage[]> {
  try {
    const data = await upstash.get<ConversationStore>(
      conversationKey(userId, conversationId),
    );
    if (!data?.messages?.length) return [];
    return data.messages.map(({ role, content }) => ({ role, content }));
  } catch {
    return [];
  }
}

export async function setActiveConversation(
  userId: number,
  conversationId: string,
): Promise<void> {
  const index = await getConversationsIndex(userId);
  if (!index.sessions.some((s) => s.id === conversationId)) return;

  index.activeConversationId = conversationId;
  index.updatedAt = new Date().toISOString();
  await saveConversationsIndex(index);
}

export async function createConversationSession(
  userId: number,
): Promise<ConversationSessionMeta> {
  const index = await getConversationsIndex(userId);
  const now = new Date().toISOString();
  const id = generateConversationId();

  const meta: ConversationSessionMeta = {
    id,
    title: 'Nueva conversación',
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
  };

  const store: ConversationStore = {
    id,
    userId,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };

  const nextSessions = [meta, ...index.sessions];
  const { kept, removed } = trimSessionsForLimit(nextSessions);

  index.sessions = kept;
  index.activeConversationId = id;
  index.updatedAt = now;

  await Promise.all([
    upstash.set(conversationKey(userId, id), store, { ex: CONVERSATION_TTL_SECONDS }),
    saveConversationsIndex(index),
    ...removed.map((s) => deleteConversationData(userId, s.id)),
  ]);

  return meta;
}

export async function resolveConversationForChat(
  userId: number,
  conversationId?: string,
): Promise<string> {
  if (conversationId) {
    const owns = await userOwnsConversation(userId, conversationId);
    if (!owns) throw new Error('Conversación inválida.');
    await setActiveConversation(userId, conversationId);
    return conversationId;
  }

  const index = await getConversationsIndex(userId);
  if (index.activeConversationId) {
    const owns = index.sessions.some((s) => s.id === index.activeConversationId);
    if (owns) return index.activeConversationId;
  }

  const created = await createConversationSession(userId);
  return created.id;
}

export async function appendConversationTurn(
  userId: number,
  conversationId: string,
  userMessage: string,
  assistantMessage: string,
): Promise<void> {
  const userContent = truncateChatContent(userMessage);
  const assistantContent = truncateChatContent(assistantMessage);
  if (!userContent || !assistantContent) return;

  try {
    const key = conversationKey(userId, conversationId);
    const existing =
      (await upstash.get<ConversationStore>(key)) ?? {
        id: conversationId,
        userId,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

    const now = new Date().toISOString();
    const nextMessages = [
      ...existing.messages,
      { role: 'user' as const, content: userContent, at: now },
      { role: 'assistant' as const, content: assistantContent, at: now },
    ];

    await upstash.set(
      key,
      {
        ...existing,
        messages: nextMessages,
        updatedAt: now,
      } satisfies ConversationStore,
      { ex: CONVERSATION_TTL_SECONDS },
    );

    const index = await getConversationsIndex(userId);
    const sessionIdx = index.sessions.findIndex((s) => s.id === conversationId);
    if (sessionIdx >= 0) {
      const session = index.sessions[sessionIdx];
      if (session.title === 'Nueva conversación' && userContent) {
        session.title = buildConversationTitle(userContent);
      }
      session.updatedAt = now;
      session.messageCount = nextMessages.length;
      index.sessions[sessionIdx] = session;
    } else {
      index.sessions.unshift({
        id: conversationId,
        title: buildConversationTitle(userContent),
        createdAt: existing.createdAt,
        updatedAt: now,
        messageCount: nextMessages.length,
      });
    }

    index.activeConversationId = conversationId;
    index.updatedAt = now;

    const { kept, removed } = trimSessionsForLimit(index.sessions);
    index.sessions = kept;
    await saveConversationsIndex(index);
    await Promise.all(removed.map((s) => deleteConversationData(userId, s.id)));
  } catch (err) {
    console.warn('[assistant-conversations] No se pudo guardar turno:', err);
  }
}

export async function deleteConversationSession(
  userId: number,
  conversationId: string,
): Promise<boolean> {
  const index = await getConversationsIndex(userId);
  const before = index.sessions.length;
  index.sessions = index.sessions.filter((s) => s.id !== conversationId);

  if (index.sessions.length === before) return false;

  if (index.activeConversationId === conversationId) {
    index.activeConversationId = index.sessions[0]?.id ?? null;
  }
  index.updatedAt = new Date().toISOString();

  await Promise.all([
    deleteConversationData(userId, conversationId),
    saveConversationsIndex(index),
  ]);

  return true;
}

export async function updateConversationTitle(
  userId: number,
  conversationId: string,
  title: string,
): Promise<ConversationSessionMeta | null> {
  const index = await getConversationsIndex(userId);
  const sessionIdx = index.sessions.findIndex((s) => s.id === conversationId);
  if (sessionIdx < 0) return null;

  const nextTitle = sanitizeConversationTitle(title);
  const session = { ...index.sessions[sessionIdx], title: nextTitle };
  index.sessions[sessionIdx] = session;
  index.updatedAt = new Date().toISOString();

  await saveConversationsIndex(index);
  return session;
}
