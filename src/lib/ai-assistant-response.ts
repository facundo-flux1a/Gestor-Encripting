/**
 * Formateo de respuestas del asistente cuando el LLM devuelve JSON crudo o falla.
 */

import type { AgentDocumentSummary } from '@/lib/ai-document-sanitize';

const JSON_ACTION_RE = /^\s*\{[\s\S]*"action"\s*:\s*"(tool|answer)"[\s\S]*\}\s*$/;

/** Detecta JSON de protocolo interno que no debe mostrarse al usuario. */
export function looksLikeInternalJson(text: string): boolean {
  const t = text.trim();
  if (!t.startsWith('{')) return false;
  try {
    const obj = JSON.parse(t);
    return obj.action === 'tool' || obj.action === 'answer' || Boolean(obj.tool);
  } catch {
    return JSON_ACTION_RE.test(t);
  }
}

/** Extrae el primer JSON válido de una respuesta (puede venir duplicado o multilínea). */
export function parseFirstJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim().replace(/```json\n?|```/g, '').trim();
  const candidates = [
    trimmed,
    ...trimmed.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('{')),
  ];
  for (const candidate of candidates) {
    try {
      const obj = JSON.parse(candidate);
      if (obj && typeof obj === 'object') return obj as Record<string, unknown>;
    } catch {
      /* siguiente */
    }
  }
  return null;
}

export function sanitizeUserFacingResponse(text: string): string {
  const lines = text
    .split('\n')
    .filter((line) => !looksLikeInternalJson(line.trim()))
    .join('\n')
    .trim();

  if (lines && !looksLikeInternalJson(lines)) return lines;

  return '';
}

export function formatDocumentListFallback(
  docs: AgentDocumentSummary[],
  context?: string,
): string {
  if (docs.length === 0) {
    return context
      ? `No encontré documentos con esos criterios (${context}).`
      : 'No encontré documentos con esos criterios.';
  }

  const header = context
    ? `Encontré **${docs.length}** documento(s) ${context}:`
    : `Encontré **${docs.length}** documento(s):`;

  const rows = docs.map((d) => {
    const num = d.numero_documento || `#${d.id}`;
    const fecha = d.fecha_emision ?? 'sin fecha';
    const inc = d.incidencia_razon ? ` — _${d.incidencia_razon}_` : '';
    return `- **${num}** · ${d.proveedor} · ${d.total.toFixed(2)} ${d.moneda} · ${fecha}${inc}`;
  });

  return `${header}\n\n${rows.join('\n')}`;
}

export function tryFormatToolFallback(
  toolName: string,
  toolResult: { ok: true; data: unknown } | { ok: false; error: string },
): string | null {
  if (!toolResult.ok) {
    return `No pude obtener esa información: ${toolResult.error}`;
  }

  if (toolName === 'list_documents_summary' || toolName === 'search_documents') {
    const docs = toolResult.data as AgentDocumentSummary[];
    if (!Array.isArray(docs)) return null;
    const ctx =
      toolName === 'search_documents' ? 'para tu búsqueda' : undefined;
    return formatDocumentListFallback(docs, ctx);
  }

  if (toolName === 'get_quarter_summary') {
    const q = toolResult.data as {
      trimestre: number;
      año: number;
      total_documentos: number;
      total_ingresos: number;
      total_gastos: number;
      iva_repercutido: number;
      iva_soportado: number;
    };
    if (!q || typeof q !== 'object') return null;
    return (
      `**T${q.trimestre} ${q.año}** · ${q.total_documentos} documentos\n\n` +
      `- Ingresos: **${q.total_ingresos.toFixed(2)} €**\n` +
      `- Gastos: **${q.total_gastos.toFixed(2)} €**\n` +
      `- IVA repercutido: **${q.iva_repercutido.toFixed(2)} €**\n` +
      `- IVA soportado: **${q.iva_soportado.toFixed(2)} €**`
    );
  }

  return null;
}
