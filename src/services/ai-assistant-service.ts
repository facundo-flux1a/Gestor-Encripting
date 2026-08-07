/**
 * Asistente unificado: FAQ del producto + consultas seguras sobre documentos del usuario.
 */

import { isAzureOpenAiConfigured } from '@/services/ingestion/azure-openai';
import { getAssistantKnowledgeBase } from '@/lib/assistant-knowledge-base';
import {
  looksLikeInternalJson,
  parseFirstJsonObject,
  sanitizeUserFacingResponse,
  tryFormatToolFallback,
} from '@/lib/ai-assistant-response';
import type { AgentDocumentSummary } from '@/lib/ai-document-sanitize';
import {
  executeAgentTool,
  formatToolResultForLlm,
  getAgentToolDefinitions,
  parseAgentToolCall,
  resolveScopeForUser,
  type AgentToolCall,
} from '@/services/ai-assistant-tools';
import {
  isAllBaseSupportConfigured,
  runAllBaseSupportChat,
} from '@/services/allbase-support-service';
import {
  formatSessionContextForPrompt,
  getAssistantSessionContext,
  saveAssistantSessionContext,
} from '@/lib/assistant-session-context';
import {
  appendConversationTurn,
  getConversationMessages,
  MAX_CONVERSATION_SESSIONS,
  MAX_LLM_CONTEXT_MESSAGES,
  resolveConversationForChat,
  truncateChatContent,
  type AssistantHistoryMessage,
} from '@/lib/assistant-conversations';
import { startNewAssistantConversation } from '@/lib/assistant-conversation-reset';
import {
  normalizeToValencianSpanish,
  VALENCIAN_LOCALE_PROMPT,
} from '@/lib/assistant-valencian-locale';

export { validateConversationAccess, isValidConversationIdFormat } from '@/lib/ai-assistant-session';
export {
  MAX_CONVERSATION_SESSIONS,
  MAX_LLM_CONTEXT_MESSAGES as MAX_CHAT_HISTORY_MESSAGES,
  startNewAssistantConversation,
  startNewAssistantConversation as resetAssistantConversation,
};

const MAX_TOOL_ROUNDS = 3;

function buildSystemPrompt(): string {
  return `Eres el asistente de Gestor Documental Muvail (Valencia, España): ayudas con el uso de la plataforma y con consultas sobre los documentos fiscales del usuario.

${VALENCIAN_LOCALE_PROMPT}

IMPORTANTE — SECCIONES DEPRECADAS (NO las menciones ni recomiendes):
- **Actividad** (/dashboard/actividad) ya NO existe. El progreso de subidas está en la **Cola de Subidas** del sidebar.
- Incidencias y salud documental están unificadas en **Centro de Seguridad** (/dashboard/auditoria).

IMPORTANTE: El usuario NUNCA debe ver JSON ni menciones de "action", "tool" o "args". Eso es protocolo interno.

DOS TIPOS DE CONSULTAS:

1) FAQ / USO DE LA PLATAFORMA → responde directo con {"action":"answer","text":"..."} usando la base de conocimiento.

2) DATOS DEL USUARIO (facturas, importes, proveedores, incidencias) → primero {"action":"tool","tool":"NOMBRE","args":{...}}, luego con el resultado genera {"action":"answer","text":"..."} en prosa natural.

Para incidencias pendientes usa: list_documents_summary con args {"solo_incidencias_pendientes": true}

CONTEXTO CONVERSACIONAL:
- Estás en UNA conversación del usuario (puede tener hasta ${MAX_CONVERSATION_SESSIONS} conversaciones guardadas).
- Recuerdas todos los mensajes de ESTA conversación; para el razonamiento usas los más recientes si el hilo es muy largo.
- "La primera", "la segunda", "esa factura", "mostrame el detalle" se refieren al listado o mensaje anterior.
- NUNCA preguntes "¿de qué listado?" si acabás de mostrar documentos numerados.
- Para detalle usa get_document_detail con documentId del contexto.

HERRAMIENTAS: ${getAgentToolDefinitions().map((t) => `${t.name}: ${t.description}`).join(' | ')}

BASE DE CONOCIMIENTO (FAQ):
${getAssistantKnowledgeBase()}`;
}

type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };

export type AssistantChatResult = {
  response: string;
  conversationId: string;
  toolsUsed: string[];
};

async function callLlm(
  messages: ChatMessage[],
  opts: { jsonMode?: boolean } = {},
): Promise<string> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/$/, '');
  const key = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-05-01-preview';

  if (!endpoint || !key || !deployment) {
    throw new Error('Azure OpenAI no configurado para el asistente');
  }

  const url = endpoint.includes('/openai/deployments/')
    ? `${endpoint}/chat/completions?api-version=${apiVersion}`
    : endpoint.endsWith('/models')
      ? `${endpoint}/chat/completions?api-version=${apiVersion}`
      : `${endpoint}/models/chat/completions?api-version=${apiVersion}`;

  const body: Record<string, unknown> = {
    model: deployment,
    messages,
    max_completion_tokens: 4096,
  };

  if (opts.jsonMode !== false) {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': key },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`LLM ${res.status}: ${raw.slice(0, 200)}`);
  }

  const parsed = JSON.parse(raw);
  return parsed.choices?.[0]?.message?.content || '';
}

function parseLlmAction(
  text: string,
): { action: 'tool'; call: AgentToolCall } | { action: 'answer'; text: string } | null {
  const obj = parseFirstJsonObject(text);
  if (!obj) return null;

  if (obj.action === 'answer' && typeof obj.text === 'string') {
    return { action: 'answer', text: obj.text };
  }
  if (obj.action === 'tool' || obj.tool) {
    const call = parseAgentToolCall(obj);
    if (call) return { action: 'tool', call };
  }
  return null;
}

function extractAnswerText(text: string): string {
  const action = parseLlmAction(text);
  if (action?.action === 'answer') return action.text;

  const sanitized = sanitizeUserFacingResponse(text);
  if (sanitized) return sanitized;

  const obj = parseFirstJsonObject(text);
  if (obj && typeof obj.text === 'string') return obj.text;

  return text.trim();
}

async function synthesizeNaturalAnswer(messages: ChatMessage[]): Promise<string> {
  const synthesisMessages: ChatMessage[] = [
    ...messages,
    {
      role: 'system',
      content:
        'Genera la respuesta final para el usuario en español claro de Valencia, en prosa o markdown. ' +
        'NO uses JSON. NO menciones tools, actions ni args. Solo datos del resultado anterior.',
    },
  ];
  return callLlm(synthesisMessages, { jsonMode: false });
}

async function runInternalAssistantChat(
  userId: number,
  conversationId: string,
  userMessage: string,
  userName?: string,
  history: AssistantHistoryMessage[] = [],
): Promise<AssistantChatResult> {
  const scope = await resolveScopeForUser(userId);
  const sessionContext = await getAssistantSessionContext(userId, conversationId);
  const toolsUsed: string[] = [];
  let lastToolName: string | null = null;
  let lastToolResult: Awaited<ReturnType<typeof executeAgentTool>> | null = null;

  const empresasLabel = scope
    ? scope.empresas
        .filter((e) => scope.effectiveEmpresaIds.includes(e.id))
        .map((e) => e.nombre)
        .join(', ') || 'ninguna seleccionada'
    : 'sin empresas asociadas';

  const contextBlock = formatSessionContextForPrompt(sessionContext);

  const trimmedHistory = history
    .filter((m) => m.content?.trim())
    .slice(-MAX_LLM_CONTEXT_MESSAGES)
    .map((m) => ({
      role: m.role,
      content: truncateChatContent(m.content),
    }));

  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt() },
    {
      role: 'system',
      content: `Sesión: usuario=${userName ?? 'Usuario'} (id ${userId}). Empresas activas: ${empresasLabel}.`,
    },
    ...(contextBlock ? [{ role: 'system' as const, content: contextBlock }] : []),
    ...trimmedHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  let llmText = await callLlm(messages, { jsonMode: true });
  let action = parseLlmAction(llmText);

  for (let round = 0; round < MAX_TOOL_ROUNDS && action?.action === 'tool'; round++) {
    if (!scope) {
      return {
        response:
          'No tienes empresas asociadas todavía. Crea una o únete a una empresa para consultar tus documentos. Mientras tanto, puedo ayudarte con el uso de la plataforma.',
        conversationId,
        toolsUsed: [],
      };
    }

    toolsUsed.push(action.call.tool);
    lastToolName = action.call.tool;
    lastToolResult = await executeAgentTool(scope, action.call);

    if (lastToolResult.ok) {
      if (
        action.call.tool === 'list_documents_summary' ||
        action.call.tool === 'search_documents'
      ) {
        const docs = lastToolResult.data as AgentDocumentSummary[];
        if (Array.isArray(docs) && docs.length > 0) {
          await saveAssistantSessionContext(userId, conversationId, { lastDocuments: docs });
        }
      }
      if (action.call.tool === 'get_document_detail') {
        const detail = lastToolResult.data as { id?: number };
        if (detail?.id != null) {
          await saveAssistantSessionContext(userId, conversationId, {
            lastDocumentId: detail.id,
          });
        }
      }
    }

    messages.push({ role: 'assistant', content: llmText });
    messages.push({
      role: 'user',
      content: `Resultado de ${action.call.tool}:\n${formatToolResultForLlm(lastToolResult)}`,
    });
    messages.push({
      role: 'system',
      content:
        'Responde al usuario en JSON: {"action":"answer","text":"..."}. El text debe ser prosa natural en español de Valencia, sin JSON anidado.',
    });

    llmText = await callLlm(messages, { jsonMode: true });
    action = parseLlmAction(llmText);
  }

  let response: string;

  if (action?.action === 'answer') {
    response = action.text;
  } else {
    const extracted = extractAnswerText(llmText);
    const clean = sanitizeUserFacingResponse(extracted);
    if (clean) {
      response = clean;
    } else {
      response = await synthesizeNaturalAnswer(messages);
    }
  }

  response = sanitizeUserFacingResponse(response) || response;

  if (!response.trim() || looksLikeInternalJson(response)) {
    const fallback =
      lastToolName && lastToolResult
        ? tryFormatToolFallback(lastToolName, lastToolResult)
        : null;
    response =
      fallback ||
      'No pude armar una respuesta clara. Prueba a reformular la pregunta.';
  }

  return {
    response: response.trim(),
    conversationId,
    toolsUsed,
  };
}

export function isAssistantAvailable(): boolean {
  return isAzureOpenAiConfigured() || isAllBaseSupportConfigured();
}

export function isFullAssistantAvailable(): boolean {
  return isAzureOpenAiConfigured();
}

/** Punto de entrada único: Azure (FAQ + documentos) o fallback AllBase (solo FAQ). */
export async function runAssistantChat(
  userId: number,
  userMessage: string,
  userName?: string,
  clientConversationId?: string,
): Promise<AssistantChatResult> {
  const conversationId = await resolveConversationForChat(userId, clientConversationId);
  const history = await getConversationMessages(userId, conversationId);

  let result: AssistantChatResult;

  if (isAzureOpenAiConfigured()) {
    result = await runInternalAssistantChat(
      userId,
      conversationId,
      userMessage,
      userName,
      history,
    );
  } else if (isAllBaseSupportConfigured()) {
    const fallback = await runAllBaseSupportChat(userId, userMessage, conversationId);
    result = { ...fallback, toolsUsed: [] };
  } else {
    throw new Error('El asistente no está disponible en este momento. Prueba más tarde.');
  }

  result.response = normalizeToValencianSpanish(result.response);

  await appendConversationTurn(userId, conversationId, userMessage, result.response);
  return { ...result, conversationId };
}
