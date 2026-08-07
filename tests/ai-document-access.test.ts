jest.mock('../src/lib/upstash', () => ({
  upstash: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  },
}));

import {
  intersectEmpresaIds,
  parseEmpresaUserIds,
  resolveEffectiveEmpresaIds,
  userHasEmpresaAccess,
} from '../src/lib/empresa-access';
import {
  documentToSummary,
  pickFiscalDatosExtra,
  truncateContextJson,
} from '../src/lib/ai-document-sanitize';
import {
  sanitizeUserFacingResponse,
  looksLikeInternalJson,
  parseFirstJsonObject,
} from '../src/lib/ai-assistant-response';
import { validateConversationId, isValidConversationIdFormat } from '../src/lib/ai-assistant-session';
import {
  MAX_CHAT_MESSAGE_CHARS,
  trimChatMessages,
  truncateChatContent,
} from '../src/lib/assistant-chat-history';
import {
  MAX_CONVERSATION_SESSIONS,
  MAX_LLM_CONTEXT_MESSAGES,
  buildConversationTitle,
  filterSessionsByTitle,
  sanitizeConversationTitle,
  trimSessionsForLimit,
} from '../src/lib/assistant-conversations';
import type { Document } from '../src/lib/types';

describe('empresa-access', () => {
  it('parseEmpresaUserIds handles JSON array', () => {
    expect(parseEmpresaUserIds([1, 2, 3])).toEqual([1, 2, 3]);
    expect(parseEmpresaUserIds('[42,99]')).toEqual([42, 99]);
  });

  it('userHasEmpresaAccess checks membership', () => {
    expect(userHasEmpresaAccess(42, [41, 42])).toBe(true);
    expect(userHasEmpresaAccess(42, [1, 2])).toBe(false);
  });

  it('intersectEmpresaIds drops unauthorized ids', () => {
    expect(intersectEmpresaIds([7, 99], [7, 12])).toEqual([7]);
  });

  it('resolveEffectiveEmpresaIds uses all allowed when no selection', () => {
    expect(resolveEffectiveEmpresaIds([7, 12], null)).toEqual([7, 12]);
    expect(resolveEffectiveEmpresaIds([7, 12], [])).toEqual([7, 12]);
  });

  it('resolveEffectiveEmpresaIds intersects selected with allowed', () => {
    expect(resolveEffectiveEmpresaIds([7, 12], [7, 99])).toEqual([7]);
  });
});

describe('ai-document-sanitize', () => {
  const baseDoc: Document = {
    id_documento: 1,
    numero_documento: 'F-001',
    tipo_documento: 'Factura',
    fecha_emision: '2025-03-01',
    fecha_vencimiento: null,
    fecha_creacion: '2025-03-02',
    moneda: 'EUR',
    observaciones: null,
    datos_extra: { descuento_global: 10, internal_debug: 'secret' },
    base_imponible: 100,
    iva: 21,
    total: 121,
    is_new: 0,
    entidades: [],
    lineas: [],
    iva_details: [],
    archivos: [{ tipo_archivo: 'pdf', nombre_archivo: 'f.pdf', ruta_archivo: '/internal', hash_archivo: 'abc', fecha_subida: null }],
    incidencias: [],
    proveedor: 'Proveedor SA',
    cif: 'B123',
    incidencia: false,
    verificado: true,
    empresa_id: 7,
    empresa_nombre: 'Mi Empresa',
    is_issued: 0,
  };

  it('pickFiscalDatosExtra excludes internal keys', () => {
    const picked = pickFiscalDatosExtra(baseDoc.datos_extra);
    expect(picked).toEqual({ descuento_global: 10 });
    expect(picked).not.toHaveProperty('internal_debug');
  });

  it('documentToSummary excludes file paths', () => {
    const summary = documentToSummary(baseDoc);
    expect(summary.tiene_adjunto).toBe(true);
    expect(summary).not.toHaveProperty('ruta_archivo');
    expect(JSON.stringify(summary)).not.toContain('/internal');
  });

  it('truncateContextJson limits size', () => {
    const long = { data: 'x'.repeat(20000) };
    const out = truncateContextJson(long, 100);
    expect(out.length).toBeLessThan(200);
    expect(out).toContain('[truncado]');
  });
});

describe('conversation isolation', () => {
  it('validateConversationId accepts conv- uuid sessions', () => {
    const id = 'conv-550e8400-e29b-41d4-a716-446655440000';
    expect(isValidConversationIdFormat(id)).toBe(true);
    expect(validateConversationId(42, id)).toBe(true);
  });

  it('validateConversationId rejects mismatched legacy ids', () => {
    expect(validateConversationId(42, 'gestor-user-42')).toBe(true);
    expect(validateConversationId(42, 'gestor-user-99')).toBe(false);
    expect(validateConversationId(42, undefined)).toBe(true);
    expect(isValidConversationIdFormat('gestor-user-42')).toBe(false);
  });
});

describe('assistant-conversations', () => {
  it('trimSessionsForLimit keeps at most 20 sessions', () => {
    const sessions = Array.from({ length: 25 }, (_, i) => ({
      id: `conv-${i}`,
      title: `S${i}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date(Date.now() - i * 1000).toISOString(),
      messageCount: 1,
    }));
    const { kept, removed } = trimSessionsForLimit(sessions);
    expect(kept).toHaveLength(MAX_CONVERSATION_SESSIONS);
    expect(removed).toHaveLength(5);
  });

  it('buildConversationTitle truncates long first messages', () => {
    const title = buildConversationTitle('a'.repeat(80));
    expect(title.length).toBe(48);
  });

  it('sanitizeConversationTitle rejects empty titles', () => {
    expect(sanitizeConversationTitle('   ')).toBe('Nueva conversación');
  });

  it('filterSessionsByTitle matches case-insensitively', () => {
    const sessions = [
      {
        id: '1',
        title: 'Facturas T3',
        createdAt: '',
        updatedAt: '',
        messageCount: 2,
      },
      {
        id: '2',
        title: 'Proveedores',
        createdAt: '',
        updatedAt: '',
        messageCount: 1,
      },
    ];
    expect(filterSessionsByTitle(sessions, 'facturas')).toHaveLength(1);
    expect(filterSessionsByTitle(sessions, '')).toHaveLength(2);
  });
});

describe('ai-assistant-response', () => {
  it('sanitizeUserFacingResponse strips tool JSON', () => {
    const raw = '{"action":"tool","tool":"list_documents_summary","args":{"tipo":"todas"}}';
    expect(looksLikeInternalJson(raw)).toBe(true);
    expect(sanitizeUserFacingResponse(raw)).toBe('');
  });

  it('parseFirstJsonObject handles duplicate lines', () => {
    const raw =
      '{"action":"tool","tool":"list_documents_summary","args":{"tipo":"todas"}}\n{"action":"tool","tool":"list_documents_summary","args":{"tipo":"todas"}}';
    const obj = parseFirstJsonObject(raw);
    expect(obj?.tool).toBe('list_documents_summary');
  });
});

describe('assistant-chat-history', () => {
  it('trimChatMessages keeps recent LLM context window', () => {
    const msgs = Array.from({ length: 50 }, (_, i) => ({
      role: 'user' as const,
      content: `m${i}`,
      at: new Date().toISOString(),
    }));
    expect(trimChatMessages(msgs)).toHaveLength(MAX_LLM_CONTEXT_MESSAGES);
    expect(trimChatMessages(msgs)[0].content).toBe('m10');
  });

  it('truncateChatContent caps long messages', () => {
    const long = 'x'.repeat(MAX_CHAT_MESSAGE_CHARS + 100);
    expect(truncateChatContent(long).length).toBeLessThanOrEqual(MAX_CHAT_MESSAGE_CHARS + 1);
  });
});

describe('assistant-session-context', () => {
  it('formatSessionContextForPrompt includes document ids for follow-ups', () => {
    const { formatSessionContextForPrompt } = require('../src/lib/assistant-context-prompt');
    const text = formatSessionContextForPrompt({
      userId: 1,
      updatedAt: new Date().toISOString(),
      lastDocuments: [
        {
          id: 101,
          numero_documento: 'A/04341',
          proveedor: 'ESCRIVÁ',
          total: 427.7,
          moneda: 'EUR',
          num_trimestre: 4,
          año_trimestre: 2026,
        },
      ],
    });
    expect(text).toContain('documentId=101');
    expect(text).toContain('la primera');
  });
});
