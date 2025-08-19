'use client';

import { useState, useRef, useEffect } from 'react';
import type { MessageData } from 'genkit';
import { chat } from '@/ai/flows/chat-agent';
import { ChatInput } from './chat-input';
import { ChatMessage } from './chat-message';
import { Bot, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function ChatPanel() {
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (messageText: string) => {
    setIsLoading(true);
    const userMessage: MessageData = {
      role: 'user',
      content: [{ text: messageText }],
    };
    const currentMessages = [...messages, userMessage];
    setMessages(currentMessages);

    try {
      const response = await chat({
        history: messages,
        message: messageText,
      });

      const modelMessage: MessageData = {
        role: 'model',
        content: [response],
      };
      setMessages([...currentMessages, modelMessage]);
    } catch (error: any) {
      toast({
        title: 'Error del Asistente',
        description:
          error.message ||
          'No se pudo obtener una respuesta. Por favor, inténtalo de nuevo.',
        variant: 'destructive',
      });
      // Remove the user message if the API call fails to allow retry
      setMessages(messages);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Bot className="w-16 h-16 text-primary" />
            <h2 className="mt-4 text-2xl font-semibold">
              Asistente de IA
            </h2>
            <p className="mt-2 text-muted-foreground max-w-md">
              Puedes hacerme preguntas sobre tus documentos, proveedores o finanzas.
              Por ejemplo: "¿Cuál es mi gasto total este año?" o "Muéstrame las facturas con incidencias".
            </p>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div key={index}>
              {msg.content.map((part, partIndex) => (
                <ChatMessage
                  key={`${index}-${partIndex}`}
                  message={part}
                  role={msg.role}
                />
              ))}
            </div>
          ))
        )}
         {isLoading && (
            <div className="flex items-center justify-center">
                <Loader2 className="h-6 w-6 text-primary animate-spin" />
            </div>
        )}
      </div>
      <div className="p-4 bg-background/80 border-t">
        <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
      </div>
    </div>
  );
}
