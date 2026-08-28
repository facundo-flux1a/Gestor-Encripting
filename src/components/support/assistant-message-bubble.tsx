'use client';

import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SupportChatMarkdown } from './support-chat-markdown';

type DataSourceKind = 'documents' | 'companies';

type AssistantMessageBubbleProps = {
  spokenText: string;
  technicalContent: string;
  hasDetail: boolean;
  showDetail: boolean;
  onToggleDetail: () => void;
  dataSource?: DataSourceKind;
  isSpeaking: boolean;
  isLoadingVoice: boolean;
};

function DataSourceChip({ kind }: { kind: DataSourceKind }) {
  const label =
    kind === 'documents' ? 'Consultó tus documentos' : 'Consultó tus empresas';
  return (
    <span className="mb-2 inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
      {label}
    </span>
  );
}

export function AssistantMessageBubble({
  spokenText,
  technicalContent,
  hasDetail,
  showDetail,
  onToggleDetail,
  dataSource,
  isSpeaking,
  isLoadingVoice,
}: AssistantMessageBubbleProps) {
  const displayText = spokenText || technicalContent;

  return (
    <motion.div
      animate={
        isSpeaking
          ? {
              borderRadius: ['16px', '22px', '14px', '20px', '16px'],
              boxShadow: [
                '0 0 12px rgba(45, 207, 177, 0.35)',
                '0 0 26px rgba(45, 207, 177, 0.7)',
                '0 0 14px rgba(45, 207, 177, 0.4)',
                '0 0 24px rgba(45, 207, 177, 0.65)',
                '0 0 12px rgba(45, 207, 177, 0.35)',
              ],
            }
          : { borderRadius: '16px', boxShadow: '0 0 0 rgba(0,0,0,0)' }
      }
      transition={isSpeaking ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
      className={cn(
        'max-w-[92%] border px-4 py-3 transition-colors',
        isSpeaking
          ? 'border-primary/50 bg-muted/90'
          : 'border-border/60 bg-muted/80',
        isLoadingVoice && !isSpeaking && 'border-primary/30',
      )}
    >
      {dataSource && <DataSourceChip kind={dataSource} />}

      <button
        type="button"
        onClick={hasDetail ? onToggleDetail : undefined}
        className={cn('w-full text-left', hasDetail && 'cursor-pointer')}
        disabled={!hasDetail}
      >
        <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{displayText}</p>
        {hasDetail && (
          <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary">
            {showDetail ? (
              <>
                <ChevronUp className="h-3 w-3" /> Ocultar detalle
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" /> Ver detalle técnico
              </>
            )}
          </span>
        )}
      </button>

      {hasDetail && showDetail && (
        <div className="mt-3 border-t border-border/50 pt-3">
          <SupportChatMarkdown content={technicalContent} />
        </div>
      )}
    </motion.div>
  );
}
