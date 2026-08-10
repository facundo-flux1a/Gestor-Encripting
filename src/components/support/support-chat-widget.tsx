'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useTutorial } from '@/context/tutorial-context';
import {
  HelpCircle,
  X,
  Send,
  Loader2,
  Plus,
  History,
  Trash2,
  Pencil,
  Search,
  Volume2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AssistantMessageBubble } from './assistant-message-bubble';
import { useAssistantVoice } from '@/hooks/use-assistant-voice';

const HIDDEN_PREFIXES = ['/auth', '/landing'];

const WELCOME =
  '¡Hola! Soy tu **asistente de Gestor Documental Muvail**. Pregúntame cómo usar la plataforma, sobre tus facturas, trimestres, proveedores o incidencias.';

const GENERIC_ERROR =
  'No pudimos conectar con el asistente. Prueba de nuevo en unos instantes.';

const CHAT_ENDPOINT = '/api/ai-assistant/chat';
const CONVERSATIONS_ENDPOINT = '/api/ai-assistant/conversations';
const HISTORY_ENDPOINT = '/api/ai-assistant/history';
const STATUS_ENDPOINT = '/api/ai-assistant/status';
const MAX_SESSIONS = 20;
const VOICE_AUTO_STORAGE_KEY = 'assistant-voice-auto';
const VOICE_GENDER_STORAGE_KEY = 'assistant-voice-gender';

type VoiceGender = 'male' | 'female';

type DataSourceKind = 'documents' | 'companies';

type ConversationSession = {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  spokenText?: string;
  hasDetail?: boolean;
  dataSource?: DataSourceKind;
  toolsUsed?: string[];
};

const DOCUMENT_TOOLS = new Set([
  'list_documents_summary',
  'get_document_detail',
  'search_documents',
  'get_quarter_summary',
]);

function newMessageId(): string {
  return crypto.randomUUID();
}

function resolveDataSource(toolsUsed: unknown): DataSourceKind | undefined {
  if (!Array.isArray(toolsUsed) || toolsUsed.length === 0) return undefined;
  if (toolsUsed.some((t) => typeof t === 'string' && DOCUMENT_TOOLS.has(t))) {
    return 'documents';
  }
  if (toolsUsed.includes('get_user_companies')) return 'companies';
  return undefined;
}

function filterSessionsByQuery(sessions: ConversationSession[], query: string): ConversationSession[] {
  const q = query.trim().toLowerCase();
  if (!q) return sessions;
  return sessions.filter((s) => s.title.toLowerCase().includes(q));
}

function formatSessionDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-AR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

type SupportChatWidgetProps = {
  enabled?: boolean;
};

function toUserFacingError(message: string): string {
  const safePrefixes = [
    'Tenés que iniciar sesión',
    'El asistente no está disponible',
    'Hay muchas consultas',
    'No pudimos procesar',
    'No pudimos conectar',
    'No pudimos enviar',
    'No pudimos leer',
    'Escribí un mensaje',
    'Conversación inválida',
    'No tienes empresas',
  ];
  if (safePrefixes.some((prefix) => message.startsWith(prefix))) return message;
  return GENERIC_ERROR;
}

function welcomeOnly(): ChatMessage[] {
  return [{ id: 'welcome', role: 'assistant', content: WELCOME }];
}

export function SupportChatWidget({ enabled = true }: SupportChatWidgetProps) {
  const pathname = usePathname();
  const { isTutorialActive } = useTutorial();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const checkTutorialState = () => {
      const isDriverActive = isTutorialActive || (typeof document !== 'undefined' && !!document.querySelector('.driver-popover, .driver-overlay'));
      if (isDriverActive) {
        setOpen(false);
      }
    };

    checkTutorialState();
    const interval = setInterval(checkTutorialState, 300);
    return () => clearInterval(interval);
  }, [isTutorialActive]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceOptions, setVoiceOptions] = useState<Partial<Record<VoiceGender, { name: string }>>>({});
  const [voiceGender, setVoiceGender] = useState<VoiceGender>('male');
  const [voiceAutoMode, setVoiceAutoMode] = useState(false);
  const [expandedDetailIds, setExpandedDetailIds] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<ChatMessage[]>(welcomeOnly);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bootstrappedRef = useRef(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const enrichingRef = useRef<Set<string>>(new Set());

  const activeVoiceName = voiceOptions[voiceGender]?.name ?? null;

  const { speakingMessageId, loadingVoiceId, fetchSpokenText, playMessage, stop, isSpeaking } =
    useAssistantVoice(voiceGender);

  const filteredSessions = useMemo(
    () => filterSessionsByQuery(sessions, historySearch),
    [sessions, historySearch],
  );

  const refreshSessions = useCallback(async () => {
    const res = await fetch(CONVERSATIONS_ENDPOINT);
    if (!res.ok) return null;
    const data = await res.json();
    setSessions(data.sessions ?? []);
    return data as {
      sessions: ConversationSession[];
      activeConversationId: string | null;
    };
  }, []);

  const enrichAssistantMessage = useCallback(
    async (msg: ChatMessage, autoPlay = false) => {
      if (msg.role !== 'assistant' || msg.content === WELCOME || msg.spokenText) return;
      if (enrichingRef.current.has(msg.id)) return;
      enrichingRef.current.add(msg.id);

      try {
        const spoken = await fetchSpokenText(msg.content, msg.toolsUsed);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id
              ? {
                  ...m,
                  spokenText: spoken.spokenText,
                  hasDetail: spoken.hasDetail,
                }
              : m,
          ),
        );
        if (autoPlay && voiceEnabled && voiceAutoMode) {
          playMessage(msg.id, msg.content, msg.toolsUsed);
        }
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id ? { ...m, spokenText: msg.content, hasDetail: false } : m,
          ),
        );
        if (autoPlay && voiceEnabled && voiceAutoMode) {
          playMessage(msg.id, msg.content, msg.toolsUsed);
        }
      } finally {
        enrichingRef.current.delete(msg.id);
      }
    },
    [fetchSpokenText, playMessage, voiceEnabled, voiceAutoMode],
  );

  const loadConversation = useCallback(async (id: string | null) => {
    if (!id) {
      setConversationId(null);
      setMessages(welcomeOnly());
      return;
    }

    const res = await fetch(`${HISTORY_ENDPOINT}?conversationId=${encodeURIComponent(id)}`);
    if (!res.ok) return;

    const data = await res.json();
    setConversationId(data.conversationId ?? id);
    if (data.messages?.length) {
      setMessages([
        { id: 'welcome', role: 'assistant', content: WELCOME },
        ...data.messages.map((m: { role: string; content: string }, idx: number) => ({
          id: `hist-${idx}-${Date.now()}`,
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ]);
    } else {
      setMessages(welcomeOnly());
    }
  }, []);

  useEffect(() => {
    try {
      setVoiceAutoMode(localStorage.getItem(VOICE_AUTO_STORAGE_KEY) === '1');
      const savedGender = localStorage.getItem(VOICE_GENDER_STORAGE_KEY);
      if (savedGender === 'female' || savedGender === 'male') {
        setVoiceGender(savedGender);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!open) {
      bootstrappedRef.current = false;
      setShowHistory(false);
      setHistorySearch('');
      setEditingSessionId(null);
      stop();
      return;
    }
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    (async () => {
      const [index, statusRes] = await Promise.all([
        refreshSessions(),
        fetch(STATUS_ENDPOINT).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (statusRes?.voiceEnabled) {
        setVoiceEnabled(true);
        const voices = statusRes.voices as Partial<
          Record<VoiceGender, { name: string } | null>
        >;
        const opts: Partial<Record<VoiceGender, { name: string }>> = {};
        if (voices?.male?.name) opts.male = { name: voices.male.name };
        if (voices?.female?.name) opts.female = { name: voices.female.name };
        setVoiceOptions(opts);

        const savedGender = localStorage.getItem(VOICE_GENDER_STORAGE_KEY) as VoiceGender | null;
        if (savedGender === 'female' && opts.female) setVoiceGender('female');
        else if (savedGender === 'male' && opts.male) setVoiceGender('male');
        else if (opts.male) setVoiceGender('male');
        else if (opts.female) setVoiceGender('female');
      }
      const activeId = index?.activeConversationId ?? null;
      await loadConversation(activeId);
    })().catch(() => {});
  }, [open, refreshSessions, loadConversation, stop]);

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open, loading, isSpeaking]);

  useEffect(() => {
    for (const msg of messages) {
      if (
        msg.role === 'assistant' &&
        msg.content !== WELCOME &&
        !msg.spokenText &&
        msg.id.startsWith('hist-')
      ) {
        void enrichAssistantMessage(msg, false);
      }
    }
  }, [messages, enrichAssistantMessage]);

  const toggleVoiceAutoMode = () => {
    setVoiceAutoMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(VOICE_AUTO_STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      if (!next) stop();
      return next;
    });
  };

  const selectVoiceGender = (gender: VoiceGender) => {
    if (!voiceOptions[gender]) return;
    setVoiceGender(gender);
    try {
      localStorage.setItem(VOICE_GENDER_STORAGE_KEY, gender);
    } catch {
      /* ignore */
    }
  };

  const toggleDetail = (id: string) => {
    setExpandedDetailIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!enabled) return null;
  if (pathname === '/') return null;
  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { id: newMessageId(), role: 'user', content: text }]);
    setLoading(true);

    try {
      const res = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, conversationId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No pudimos enviar tu mensaje. Intentá de nuevo.');

      if (data.conversationId) setConversationId(data.conversationId);

      const assistantMsg: ChatMessage = {
        id: newMessageId(),
        role: 'assistant',
        content: data.response || 'Sin respuesta.',
        dataSource: resolveDataSource(data.toolsUsed),
        toolsUsed: Array.isArray(data.toolsUsed) ? data.toolsUsed : undefined,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      await refreshSessions();
      await enrichAssistantMessage(assistantMsg, true);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: newMessageId(),
          role: 'assistant',
          content:
            err instanceof Error ? toUserFacingError(err.message) : GENERIC_ERROR,
          spokenText:
            err instanceof Error ? toUserFacingError(err.message) : GENERIC_ERROR,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const startNewConversation = async () => {
    if (loading) return;
    stop();
    setLoading(true);
    try {
      const res = await fetch(CONVERSATIONS_ENDPOINT, { method: 'POST' });
      const data = await res.json();
      if (data.conversationId) setConversationId(data.conversationId);
      setMessages(welcomeOnly());
      setExpandedDetailIds(new Set());
      setInput('');
      setShowHistory(false);
      await refreshSessions();
    } catch {
      setConversationId(null);
      setMessages(welcomeOnly());
    } finally {
      setLoading(false);
    }
  };

  const switchConversation = async (id: string) => {
    if (loading || id === conversationId) {
      setShowHistory(false);
      return;
    }
    stop();
    setLoading(true);
    try {
      await loadConversation(id);
      setExpandedDetailIds(new Set());
      setShowHistory(false);
      await refreshSessions();
    } finally {
      setLoading(false);
    }
  };

  const deleteConversation = async (id: string) => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`${CONVERSATIONS_ENDPOINT}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) return;

      setSessions(data.sessions ?? []);
      if (conversationId === id) {
        await loadConversation(data.activeConversationId ?? null);
      }
      if (editingSessionId === id) setEditingSessionId(null);
    } finally {
      setLoading(false);
    }
  };

  const startRename = (session: ConversationSession) => {
    setEditingSessionId(session.id);
    setEditingTitle(session.title);
    setTimeout(() => renameInputRef.current?.focus(), 0);
  };

  const cancelRename = () => {
    setEditingSessionId(null);
    setEditingTitle('');
  };

  const saveRename = async () => {
    if (!editingSessionId || loading) return;
    const title = editingTitle.trim();
    if (!title) {
      cancelRename();
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `${CONVERSATIONS_ENDPOINT}/${encodeURIComponent(editingSessionId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        },
      );
      const data = await res.json();
      if (!res.ok) return;

      setSessions((prev) =>
        prev.map((s) => (s.id === editingSessionId ? { ...s, title: data.session.title } : s)),
      );
      cancelRename();
    } finally {
      setLoading(false);
    }
  };

  const activeTitle =
    sessions.find((s) => s.id === conversationId)?.title ?? 'Nueva conversación';

  return (
    <div className="pointer-events-none fixed inset-y-0 right-24 z-[70] flex flex-col items-end">
      <AnimatePresence>
        {open && (
          <motion.div
            key="support-chat-panel"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.85 }}
            className="pointer-events-auto flex h-full w-[min(calc(100vw-1.5rem),440px)] flex-col overflow-hidden border-l border-violet-500/25 bg-card/95 shadow-2xl shadow-violet-950/20 backdrop-blur-md"
          >
            <div className="flex shrink-0 items-center justify-between bg-gradient-to-r from-[#6600A3] to-[#7c3aed] px-5 py-4 text-white">
              <div className="min-w-0 pr-2">
                <p className="text-base font-semibold tracking-tight">Asistente Muvail</p>
                <p className="truncate text-xs text-violet-100/90" title={activeTitle}>
                  {activeTitle}
                  {sessions.length > 0 && (
                    <span className="text-violet-200/80">
                      {' '}
                      · {sessions.length}/{MAX_SESSIONS} conversaciones
                    </span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {conversationId && (
                  <button
                    type="button"
                    onClick={() => {
                      const current = sessions.find((s) => s.id === conversationId);
                      if (current) startRename(current);
                      setShowHistory(true);
                    }}
                    disabled={loading}
                    className="rounded-full p-1.5 transition-colors hover:bg-white/15 disabled:opacity-40"
                    aria-label="Renombrar conversación"
                    title="Renombrar conversación"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowHistory((v) => !v)}
                  className={cn(
                    'rounded-full p-1.5 transition-colors hover:bg-white/15',
                    showHistory && 'bg-white/15',
                  )}
                  aria-label="Historial de conversaciones"
                  title="Historial de conversaciones"
                >
                  <History className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={startNewConversation}
                  disabled={loading}
                  className="rounded-full p-1.5 transition-colors hover:bg-white/15 disabled:opacity-40"
                  aria-label="Nueva conversación"
                  title="Nueva conversación"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full p-1.5 transition-colors hover:bg-white/15"
                  aria-label="Cerrar chat"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {voiceEnabled && (
              <div className="shrink-0 space-y-2 border-b border-violet-500/15 bg-violet-950/10 px-5 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-violet-100/95">
                    <Volume2 className="h-3.5 w-3.5 shrink-0" />
                    <span>Escuchar respuestas</span>
                    {activeVoiceName && (
                      <span className="text-violet-300/70">· {activeVoiceName}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={voiceAutoMode}
                    onClick={toggleVoiceAutoMode}
                    className={cn(
                      'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                      voiceAutoMode ? 'bg-violet-500' : 'bg-violet-900/40',
                      isSpeaking && 'ring-2 ring-violet-300/50',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                        voiceAutoMode ? 'left-[22px]' : 'left-0.5',
                      )}
                    />
                  </button>
                </div>
                {(voiceOptions.male || voiceOptions.female) && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-violet-200/80">Voz:</span>
                    <div className="inline-flex rounded-lg border border-violet-500/25 bg-violet-950/30 p-0.5">
                      {voiceOptions.female && (
                        <button
                          type="button"
                          onClick={() => selectVoiceGender('female')}
                          className={cn(
                            'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                            voiceGender === 'female'
                              ? 'bg-violet-500 text-white'
                              : 'text-violet-200/80 hover:text-white',
                          )}
                        >
                          Femenina
                        </button>
                      )}
                      {voiceOptions.male && (
                        <button
                          type="button"
                          onClick={() => selectVoiceGender('male')}
                          className={cn(
                            'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                            voiceGender === 'male'
                              ? 'bg-violet-500 text-white'
                              : 'text-violet-200/80 hover:text-white',
                          )}
                        >
                          Masculina
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <AnimatePresence>
              {showHistory && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="shrink-0 overflow-hidden border-b border-border/60 bg-muted/40"
                >
                  <div className="border-b border-border/40 px-3 py-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <input
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        placeholder="Buscar conversación…"
                        className="w-full rounded-lg border border-border/60 bg-background py-1.5 pl-8 pr-2 text-xs outline-none focus:ring-2 focus:ring-violet-500/30"
                      />
                    </div>
                  </div>
                  <div className="max-h-44 overflow-y-auto px-3 py-2">
                    {sessions.length === 0 ? (
                      <p className="px-2 py-3 text-xs text-muted-foreground">
                        Todavía no hay conversaciones guardadas.
                      </p>
                    ) : filteredSessions.length === 0 ? (
                      <p className="px-2 py-3 text-xs text-muted-foreground">
                        Ninguna conversación coincide con &quot;{historySearch}&quot;.
                      </p>
                    ) : (
                      <ul className="space-y-1">
                        {filteredSessions.map((session) => (
                          <li key={session.id}>
                            <div
                              className={cn(
                                'flex items-center gap-1 rounded-lg px-2 py-1.5',
                                session.id === conversationId && 'bg-violet-500/10',
                              )}
                            >
                              {editingSessionId === session.id ? (
                                <input
                                  ref={renameInputRef}
                                  value={editingTitle}
                                  onChange={(e) => setEditingTitle(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') void saveRename();
                                    if (e.key === 'Escape') cancelRename();
                                  }}
                                  onBlur={() => void saveRename()}
                                  className="min-w-0 flex-1 rounded border border-violet-500/40 bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-violet-500/30"
                                  maxLength={80}
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => switchConversation(session.id)}
                                  className="min-w-0 flex-1 text-left"
                                >
                                  <p className="truncate text-xs font-medium text-foreground">
                                    {session.title}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {formatSessionDate(session.updatedAt)}
                                    {session.messageCount > 0 &&
                                      ` · ${session.messageCount} msgs`}
                                  </p>
                                </button>
                              )}
                              {editingSessionId !== session.id && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => startRename(session)}
                                    className="rounded p-1 text-muted-foreground hover:bg-violet-500/10 hover:text-violet-600"
                                    aria-label={`Renombrar ${session.title}`}
                                    title="Renombrar"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteConversation(session.id)}
                                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                    aria-label={`Eliminar ${session.title}`}
                                    title="Eliminar conversación"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div
              ref={scrollRef}
              className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5"
            >
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                >
                  {msg.role === 'assistant' ? (
                    msg.content === WELCOME ? (
                      <div className="max-w-[92%] rounded-2xl border border-border/60 bg-muted/80 px-4 py-3">
                        <p className="text-[13px] leading-relaxed whitespace-pre-wrap">
                          {WELCOME.replace(/\*\*/g, '')}
                        </p>
                      </div>
                    ) : !msg.spokenText ? (
                      <div className="max-w-[92%] rounded-2xl border border-border/60 bg-muted/80 px-4 py-3">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />
                          Preparando respuesta…
                        </div>
                      </div>
                    ) : (
                      <AssistantMessageBubble
                        spokenText={msg.spokenText ?? msg.content}
                        technicalContent={msg.content}
                        hasDetail={Boolean(msg.hasDetail)}
                        showDetail={expandedDetailIds.has(msg.id)}
                        onToggleDetail={() => toggleDetail(msg.id)}
                        dataSource={msg.dataSource}
                        isSpeaking={speakingMessageId === msg.id}
                        isLoadingVoice={loadingVoiceId === msg.id}
                      />
                    )
                  ) : (
                    <div className="ml-auto max-w-[92%] rounded-2xl bg-[#6600A3] px-4 py-3 text-white shadow-md shadow-violet-900/20">
                      <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  )}
                </motion.div>
              ))}
              {loading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 px-1 text-xs text-muted-foreground"
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />
                  Pensando…
                </motion.div>
              )}
            </div>

            <div className="pointer-events-auto shrink-0 border-t bg-background/80 p-3 sm:p-4">
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
                  placeholder="Ej: ¿Cómo subo facturas? ¿Cuánto gasté en T3?"
                  className="flex-1 rounded-xl border border-border/80 bg-background px-4 py-2.5 text-sm outline-none transition-shadow focus:ring-2 focus:ring-violet-500/35"
                  disabled={loading}
                />
                <Button
                  size="icon"
                  onClick={send}
                  disabled={loading || !input.trim()}
                  className="h-11 w-11 shrink-0 rounded-xl bg-[#6600A3] hover:bg-[#7c3aed]"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        className={cn(
          'pointer-events-auto absolute bottom-6 flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition-colors duration-300',
          open
            ? 'border-2 border-violet-600 bg-background text-violet-600'
            : 'bg-[#6600A3] text-white hover:bg-[#7c3aed]',
        )}
        aria-label={open ? 'Cerrar asistente' : 'Abrir asistente'}
        aria-expanded={open}
      >
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.span
              key="close"
              initial={{ opacity: 0, rotate: -90, scale: 0.6 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 90, scale: 0.6 }}
              transition={{ duration: 0.18 }}
            >
              <X className="h-6 w-6" />
            </motion.span>
          ) : (
            <motion.span
              key="help"
              initial={{ opacity: 0, rotate: 90, scale: 0.6 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: -90, scale: 0.6 }}
              transition={{ duration: 0.18 }}
            >
              <HelpCircle className="h-7 w-7" strokeWidth={2.25} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
