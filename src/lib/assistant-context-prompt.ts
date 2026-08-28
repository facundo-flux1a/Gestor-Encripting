import type { AgentDocumentSummary } from '@/lib/ai-document-sanitize';

export type AssistantSessionContext = {
  userId: number;
  lastDocuments?: AgentDocumentSummary[];
  lastDocumentId?: number;
  updatedAt: string;
};

export function formatSessionContextForPrompt(ctx: AssistantSessionContext | null): string | null {
  if (!ctx) return null;

  const parts: string[] = [];

  if (ctx.lastDocuments && ctx.lastDocuments.length > 0) {
    const lines = ctx.lastDocuments.map((d, i) => {
      const num = d.numero_documento ?? `#${d.id}`;
      const trim =
        d.num_trimestre && d.año_trimestre
          ? `T${d.num_trimestre} ${d.año_trimestre}`
          : '';
      return `${i + 1}. documentId=${d.id}, numero="${num}", proveedor="${d.proveedor}", total=${d.total} ${d.moneda}${trim ? `, ${trim}` : ''}`;
    });
    parts.push(
      'ÚLTIMO LISTADO MOSTRADO AL USUARIO (orden preservado):\n' +
        lines.join('\n') +
        '\nSi dice "la primera", "la segunda", "esa", "el detalle de la primera" → usa get_document_detail con el documentId correspondiente. NO preguntes de qué listado.',
    );
  }

  if (ctx.lastDocumentId != null) {
    parts.push(`ÚLTIMO DOCUMENTO DETALLADO: documentId=${ctx.lastDocumentId}`);
  }

  return parts.length > 0 ? parts.join('\n\n') : null;
}
