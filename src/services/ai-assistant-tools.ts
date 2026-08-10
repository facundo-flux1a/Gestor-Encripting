/**
 * Ejecutor de tools del agente IA — delega siempre al DocumentAccessGate.
 */

import {
  getDocumentFull,
  getQuarterSummary,
  getSecurityCenterSummary,
  listDocumentsSummary,
  resolveAgentScope,
  searchDocuments,
  type AgentDocumentScope,
  type ListDocumentsFilters,
} from '@/services/ai-document-access-gate';
import { truncateContextJson } from '@/lib/ai-document-sanitize';
import { formatSecurityCenterSummaryText } from '@/lib/ai-assistant-response';

export type AgentToolName =
  | 'list_documents_summary'
  | 'get_document_detail'
  | 'search_documents'
  | 'get_quarter_summary'
  | 'get_user_companies'
  | 'get_security_center_summary';

export type AgentToolCall = {
  tool: AgentToolName;
  args: Record<string, unknown>;
};

const TOOL_DEFINITIONS = [
  {
    name: 'list_documents_summary',
    description:
      'Lista documentos del usuario (máx 10). Filtros: trimestre, año, tipo (emitidas|recibidas|todas), proveedor, numero, solo_incidencias_pendientes (true para facturas con incidencias sin resolver).',
  },
  {
    name: 'get_document_detail',
    description: 'Detalle completo de UN documento por id: líneas, IVA, entidades, incidencias, sugerencias IA.',
  },
  {
    name: 'search_documents',
    description: 'Busca documentos por número de factura o nombre de proveedor/cliente.',
  },
  {
    name: 'get_quarter_summary',
    description: 'Resumen fiscal de un trimestre: ingresos, gastos, IVA repercutido/soportado, total documentos.',
  },
  {
    name: 'get_user_companies',
    description: 'Empresas a las que el usuario tiene acceso y cuáles están activas en su selección.',
  },
  {
    name: 'get_security_center_summary',
    description:
      'Resumen del Centro de Seguridad. documentos_pendientes = documentos únicos. Cada item en documentos incluye pendientes_detalle con todos los motivos agrupados (salud + incidencias).',
  },
] as const;

export function getAgentToolDefinitions() {
  return TOOL_DEFINITIONS;
}

export async function executeAgentTool(
  scope: AgentDocumentScope,
  call: AgentToolCall,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    switch (call.tool) {
      case 'list_documents_summary': {
        const filters: ListDocumentsFilters = {
          trimestre: numArg(call.args.trimestre),
          año: numArg(call.args.año ?? call.args.ano),
          tipo: strArg(call.args.tipo) as ListDocumentsFilters['tipo'],
          proveedor: strArg(call.args.proveedor),
          numero: strArg(call.args.numero),
          solo_incidencias_pendientes: boolArg(
            call.args.solo_incidencias_pendientes ?? call.args.incidencias_pendientes,
          ),
        };
        const data = await listDocumentsSummary(scope, filters);
        return { ok: true, data };
      }
      case 'get_document_detail': {
        const documentId = numArg(call.args.documentId ?? call.args.document_id);
        if (documentId == null) return { ok: false, error: 'documentId requerido' };
        const data = await getDocumentFull(scope, documentId);
        if (!data) return { ok: false, error: 'Documento no encontrado o sin acceso' };
        return { ok: true, data };
      }
      case 'search_documents': {
        const query = strArg(call.args.query ?? call.args.q);
        if (!query) return { ok: false, error: 'query requerido' };
        const data = await searchDocuments(scope, query);
        return { ok: true, data };
      }
      case 'get_quarter_summary': {
        const año = numArg(call.args.año ?? call.args.ano);
        const trimestre = numArg(call.args.trimestre);
        if (año == null || trimestre == null) {
          return { ok: false, error: 'año y trimestre requeridos' };
        }
        const data = await getQuarterSummary(scope, año, trimestre);
        if (!data) return { ok: false, error: 'Trimestre no disponible' };
        return { ok: true, data };
      }
      case 'get_user_companies': {
        return {
          ok: true,
          data: {
            empresas: scope.empresas,
            effective_empresa_ids: scope.effectiveEmpresaIds,
            allowed_empresa_ids: scope.allowedEmpresaIds,
          },
        };
      }
      case 'get_security_center_summary': {
        const data = await getSecurityCenterSummary(scope);
        return {
          ok: true,
          data: {
            ...data,
            mensaje_detallado: formatSecurityCenterSummaryText(data),
          },
        };
      }
      default:
        return { ok: false, error: 'Tool desconocida' };
    }
  } catch (err) {
    console.error('[ai-assistant-tools]', call.tool, err);
    return { ok: false, error: 'Error al ejecutar la consulta' };
  }
}

export async function resolveScopeForUser(userId: number) {
  return resolveAgentScope(userId);
}

export function formatToolResultForLlm(
  result: { ok: true; data: unknown } | { ok: false; error: string },
): string {
  if (!result.ok) return result.error;
  const data = result.data;
  if (data && typeof data === 'object' && 'mensaje_detallado' in data) {
    const msg = (data as { mensaje_detallado?: unknown }).mensaje_detallado;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  return truncateContextJson(result.data);
}

function boolArg(v: unknown): boolean | undefined {
  if (v === true || v === 1 || v === '1' || v === 'true') return true;
  if (v === false || v === 0 || v === '0' || v === 'false') return false;
  return undefined;
}

function numArg(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function strArg(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

export function parseAgentToolCall(raw: unknown): AgentToolCall | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const tool = obj.tool as AgentToolName;
  if (!TOOL_DEFINITIONS.some((t) => t.name === tool)) return null;
  return { tool, args: (obj.args as Record<string, unknown>) ?? {} };
}
