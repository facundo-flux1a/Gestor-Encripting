'use client';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineMarkdown(text: string): string {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>');
}

/** Renderiza markdown básico: negritas, listas numeradas y párrafos. */
export function SupportChatMarkdown({ content }: { content: string }) {
  const blocks = content.split(/\n{2,}/);

  return (
    <div className="space-y-2.5 text-[13px] leading-relaxed">
      {blocks.map((block, bi) => {
        const lines = block.split('\n').filter((l) => l.trim());
        const isOrderedList = lines.length > 0 && lines.every((l) => /^\d+\.\s/.test(l.trim()));

        if (isOrderedList) {
          return (
            <ol key={bi} className="ml-1 list-decimal space-y-1.5 pl-4 marker:text-violet-400">
              {lines.map((line, li) => {
                const item = line.replace(/^\d+\.\s*/, '');
                return (
                  <li
                    key={li}
                    dangerouslySetInnerHTML={{ __html: inlineMarkdown(item) }}
                  />
                );
              })}
            </ol>
          );
        }

        return (
          <p
            key={bi}
            className="whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: inlineMarkdown(block) }}
          />
        );
      })}
    </div>
  );
}
