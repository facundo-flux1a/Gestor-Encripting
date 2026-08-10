/**
 * Formateo de respuestas del asistente cuando el LLM devuelve JSON crudo o falla.
 */

import type { AgentDocumentSummary } from '@/lib/ai-document-sanitize';
import type { SecurityCenterSummary } from '@/services/ai-document-access-gate';

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
    const issues =
      d.pendientes_detalle?.length
        ? d.pendientes_detalle.join(' · ')
        : d.incidencia_razon ?? '';
    const inc = issues ? ` — _${issues}_` : '';
    return `- **${num}** · ${d.proveedor} · ${d.total.toFixed(2)} ${d.moneda} · ${fecha}${inc}`;
  });

  return `${header}\n\n${rows.join('\n')}`;
}

export function formatSecurityCenterSummaryText(s: SecurityCenterSummary): string {
  if (s.documentos_pendientes === 0) {
    return 'No tienes pendientes en el Centro de Seguridad para las empresas seleccionadas.';
  }

  const empresas =
    s.empresas_consultadas.length > 1
      ? ` (${s.empresas_consultadas.length} empresas en tu selección)`
      : '';

  const lines = [
    `Centro de Seguridad${empresas}:`,
    `- ${s.documentos_pendientes} documento(s) pendiente(s) de revisión (cada documento cuenta una sola vez)`,
    `- Descuadres matemáticos: ${s.descuadres_matematicos} · Alertas lógicas: ${s.alertas_logicas}`,
    `- Incidencias abiertas: ${s.registros_incidencias_abiertas} registro(s) repartidos en ${s.documentos_con_incidencia} documento(s)`,
    '',
    'Detalle por documento (todos los motivos de cada uno en la misma línea):',
  ];

  s.documentos.forEach((d, index) => {
    lines.push(formatSecurityDocumentLine(d, index + 1));
  });

  if (s.documentos_listados < s.documentos_pendientes) {
    lines.push(
      '',
      `Nota: se listan ${s.documentos_listados} de ${s.documentos_pendientes} pendientes (límite ${s.limite_listado}). El resto está en la tabla de Centro de Seguridad.`,
    );
  } else if (s.documentos_listados === 0) {
    lines.push(
      '',
      'No pude cargar el detalle de los documentos, pero el total pendiente es el indicado arriba. Consulta la tabla en Centro de Seguridad.',
    );
  }

  return lines.join('\n');
}

function formatSecurityDocumentLine(d: AgentDocumentSummary, index: number): string {
  const num = d.numero_documento || `#${d.id}`;
  const fecha = d.fecha_emision ?? 'sin fecha';
  const tipo = d.tipo_documento ? ` [${d.tipo_documento}]` : '';
  const issues =
    d.pendientes_detalle?.length
      ? d.pendientes_detalle.join(' · ')
      : d.incidencia_razon || 'Pendiente de revisión';
  return `${index}. ${num}${tipo} · ${d.proveedor} · ${d.total.toFixed(2)} ${d.moneda} · ${fecha} — ${issues}`;
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

  if (toolName === 'get_security_center_summary') {
    const s = toolResult.data as SecurityCenterSummary;
    if (!s || typeof s !== 'object') return null;
    return formatSecurityCenterSummaryText(s);
  }

  return null;
}
