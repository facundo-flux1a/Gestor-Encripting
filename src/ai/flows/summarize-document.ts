'use server';

/**
 * Resumen de documento vía Azure OpenAI (sin Genkit/Gemini).
 */

import { z } from 'zod';
import { DocumentEntitySchema, DocumentLineSchema, IvaDetailSchema } from '@/lib/types';
import { callAzureOpenAiChat, assertAzureOpenAiConfigured, parseLlmJson } from '@/services/ingestion/azure-openai';

const SummarizeDocumentInputSchema = z.object({
  document: z.object({
    id_documento: z.number(),
    numero_factura: z.string(),
    tipo_documento: z.string(),
    fecha_emision: z.string(),
    fecha_vencimiento: z.string().nullable(),
    moneda: z.string(),
    base_imponible: z.number(),
    iva: z.number(),
    total: z.number(),
    entidades: z.array(DocumentEntitySchema),
    lineas: z.array(DocumentLineSchema),
    iva_details: z.array(IvaDetailSchema),
    archivos: z.array(z.object({
      ruta_archivo: z.string().nullable(),
    })),
  }),
});

export type SummarizeDocumentInput = z.infer<typeof SummarizeDocumentInputSchema>;

const SummarizeDocumentOutputSchema = z.object({
  summary: z.string(),
});
export type SummarizeDocumentOutput = z.infer<typeof SummarizeDocumentOutputSchema>;

export async function summarizeDocument(input: SummarizeDocumentInput): Promise<SummarizeDocumentOutput> {
  assertAzureOpenAiConfigured();
  const parsed = SummarizeDocumentInputSchema.parse(input);

  const prompt = `Eres un asistente financiero experto. Resumí el siguiente documento JSON en español de forma concisa.
Incluí: emisor/proveedor, receptor/cliente, importe total, fecha de emisión y vencimiento.
Respondé SOLO JSON: {"summary":"..."}.

Documento:
\`\`\`json
${JSON.stringify(parsed.document, null, 2)}
\`\`\``;

  const { text } = await callAzureOpenAiChat({
    prompt,
    json: true,
    maxCompletionTokens: 1024,
  });

  const out = parseLlmJson(text) as { summary?: string };
  if (!out?.summary) {
    throw new Error('The AI model did not return a summary.');
  }
  return SummarizeDocumentOutputSchema.parse({ summary: out.summary });
}
