'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { HelpCircle, X, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SupportChatMarkdown } from './support-chat-markdown';

const HIDDEN_PREFIXES = ['/auth', '/landing'];
const WELCOME =
  '¡Hola! Soy tu asistente de **Gestor Documental Muvail**. Preguntame sobre subidas, incidencias, trimestres o la API.';
const GENERIC_ERROR =
  'No pudimos conectar con el asistente. Probá de nuevo en unos instantes.';

/** Solo mostramos mensajes de error pensados para el usuario final. */
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
  ];
  if (safePrefixes.some((prefix) => message.startsWith(prefix))) return message;
  return GENERIC_ERROR;
}

type ChatMessage = { role: 'user' | 'assistant'; content: string };

type SupportChatWidgetProps = {
  enabled?: boolean;
};

export function SupportChatWidget({ enabled = true }: SupportChatWidgetProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: WELCOME },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open, loading]);

  if (!enabled) return null;
  if (pathname === '/') return null;
  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    try {
      const res = await fetch('/api/support-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, conversationId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No pudimos enviar tu mensaje. Intentá de nuevo.');

      if (data.conversationId) setConversationId(data.conversationId);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.response || 'Sin respuesta.' },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            err instanceof Error
              ? toUserFacingError(err.message)
              : GENERIC_ERROR,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pointer-events-none fixed bottom-6 right-24 z-[70] flex flex-col items-end gap-3">
      <AnimatePresence>
        {open && (
          <motion.div
            key="support-chat-panel"
            initial={{ opacity: 0, y: 20, scale: 0.94, transformOrigin: 'bottom right' }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.85 }}
            className="pointer-events-auto flex h-[min(68vh,640px)] w-[min(calc(100vw-1.5rem),440px)] flex-col overflow-hidden rounded-2xl border border-violet-500/25 bg-card/95 shadow-2xl shadow-violet-950/20 backdrop-blur-md"
          >
            <div className="flex shrink-0 items-center justify-between bg-gradient-to-r from-[#6600A3] to-[#7c3aed] px-5 py-4 text-white">
              <div>
                <p className="text-base font-semibold tracking-tight">Ayuda Gestor Documental</p>
                <p className="text-xs text-violet-100/90">Asistente Muvail</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-1.5 transition-colors hover:bg-white/15"
                aria-label="Cerrar chat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div
              ref={scrollRef}
              className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5"
            >
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  className={cn(
                    'max-w-[92%] rounded-2xl px-4 py-3',
                    msg.role === 'user'
                      ? 'ml-auto bg-[#6600A3] text-white shadow-md shadow-violet-900/20'
                      : 'border border-border/60 bg-muted/80 text-foreground',
                  )}
                >
                  {msg.role === 'assistant' ? (
                    <SupportChatMarkdown content={msg.content} />
                  ) : (
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
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
                  placeholder="Ej: ¿Cómo subo facturas en PDF?"
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
        animate={{ rotate: open ? 0 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 28 }}
        className={cn(
          'pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition-colors duration-300',
          open
            ? 'border-2 border-violet-600 bg-background text-violet-600'
            : 'bg-[#6600A3] text-white hover:bg-[#7c3aed]',
        )}
        aria-label={open ? 'Cerrar asistente' : 'Abrir asistente de ayuda'}
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
