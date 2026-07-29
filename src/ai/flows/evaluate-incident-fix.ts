'use server';

import { z } from 'zod';
import { callAzureOpenAiChat, assertAzureOpenAiConfigured, parseLlmJson } from '@/services/ingestion/azure-openai';

const EvaluateIncidentFixInputSchema = z.object({
  incidentDescription: z.string(),
  documentData: z.object({
    id_documento: z.number().optional(),
    numero_documento: z.string().nullable(),
    tipo_documento: z.string(),
    fecha_emision: z.string().nullable(),
    total: z.number(),
    base_imponible: z.number(),
    iva: z.number(),
    entidades: z.array(z.any()),
    lineas: z.array(z.any()),
    observaciones: z.string().nullable(),
  }),
  companyData: z.object({
    id: z.number(),
    name: z.string(),
    cif: z.string().nullable(),
    nombreFiscal: z.string().nullable().optional(),
  }).optional(),
});

export type EvaluateIncidentFixInput = z.infer<typeof EvaluateIncidentFixInputSchema>;

const EvaluateIncidentFixOutputSchema = z.object({
  resolved: z.boolean(),
  reason: z.string(),
});

export type EvaluateIncidentFixOutput = z.infer<typeof EvaluateIncidentFixOutputSchema>;

export async function evaluateIncidentFix(input: EvaluateIncidentFixInput): Promise<EvaluateIncidentFixOutput> {
  assertAzureOpenAiConfigured();
  const parsed = EvaluateIncidentFixInputSchema.parse(input);

  const prompt = `You are an expert tax auditor. Determine if the reported incident is fixed by the current document data.
Respond ONLY JSON: {"resolved":boolean,"reason":"..."}.

Incident: ${parsed.incidentDescription}

Current document:
${JSON.stringify(parsed.documentData, null, 2)}

Company:
${JSON.stringify(parsed.companyData || null, null, 2)}`;

  const { text } = await callAzureOpenAiChat({
    prompt,
    json: true,
    maxCompletionTokens: 1024,
  });

  const out = parseLlmJson(text) as EvaluateIncidentFixOutput;
  return EvaluateIncidentFixOutputSchema.parse(out);
}

export async function checkIncidentResolutionWithAI(
  input: EvaluateIncidentFixInput
): Promise<EvaluateIncidentFixOutput> {
  return evaluateIncidentFix(input);
}
