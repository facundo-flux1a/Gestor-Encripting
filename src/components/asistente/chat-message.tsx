'use client';

import { Part } from 'genkit';
import { Bot, User, Clipboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { memo } from 'react';

interface ChatMessageProps {
  message: Part;
  role: 'user' | 'model';
}

const MemoizedChatMessage = memo(({ message, role }: ChatMessageProps) => {
  const { toast } = useToast();
  const isModel = role === 'model';

  const copyToClipboard = () => {
    if (message.text) {
      navigator.clipboard.writeText(message.text);
      toast({
        title: 'Copiado',
        description: 'El mensaje se ha copiado al portapapeles.',
      });
    }
  };

  const renderContent = () => {
    if (message.text) {
      // Basic markdown-like formatting for lists
      const formattedText = message.text.split('\n').map((line, index) => {
        if (line.trim().startsWith('- ')) {
          return <li key={index} className="ml-4 list-disc">{line.substring(2)}</li>;
        }
        if (/^\d+\.\s/.test(line.trim())) {
          const parts = line.split('. ');
          return <li key={index} value={parseInt(parts[0])} className="ml-4 list-decimal">{parts.slice(1).join('. ')}</li>
        }
        return <p key={index} className="mb-2 last:mb-0">{line}</p>;
      });
      return <div>{formattedText}</div>;
    }
    if (message.toolRequest) {
      return (
        <div className="text-xs text-muted-foreground italic">
          Buscando en herramientas: {message.toolRequest.name}(
          {JSON.stringify(message.toolRequest.input)})
        </div>
      );
    }
    return null;
  };

  return (
    <div
      className={cn('group relative flex items-start md:-ml-12', {
        'justify-end': !isModel,
      })}
    >
      <div
        className={cn('flex size-10 shrink-0 select-none items-center justify-center rounded-full border', {
          'bg-primary/10 border-primary text-primary': isModel,
          'bg-muted': !isModel,
        })}
      >
        {isModel ? <Bot /> : <User />}
      </div>
      <div className="ml-4 flex-1 space-y-2 overflow-hidden px-1">
        <div
          className={cn('prose text-sm break-words max-w-none', {
            'bg-muted rounded-xl p-4': isModel,
            'p-4': !isModel,
          })}
        >
          {renderContent()}
        </div>
        {isModel && message.text && (
          <Button
            onClick={copyToClipboard}
            size="icon"
            variant="ghost"
            className="absolute right-4 top-4 h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <Clipboard className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
});

MemoizedChatMessage.displayName = 'MemoizedChatMessage';

export const ChatMessage = MemoizedChatMessage;
