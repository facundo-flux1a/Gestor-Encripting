'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const EvaluateIncidentFixInputSchema = z.object({
  incidentDescription: z.string().describe('The original description of the incident/error reported.'),
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
  }).describe('The current state of the document after user updates.'),
  companyData: z.object({
    id: z.number(),
    name: z.string(),
    cif: z.string().nullable(),
    nombreFiscal: z.string().nullable().optional()
  }).optional().describe('The current data of the Company that owns this document.')
});

export type EvaluateIncidentFixInput = z.infer<typeof EvaluateIncidentFixInputSchema>;

const EvaluateIncidentFixOutputSchema = z.object({
  resolved: z.boolean().describe('True if the incident is logically resolved by the current data.'),
  reason: z.string().describe('Explanation of why it is considered resolved or not.'),
});

export type EvaluateIncidentFixOutput = z.infer<typeof EvaluateIncidentFixOutputSchema>;

export const evaluateIncidentFixPrompt = ai.definePrompt({
  name: 'evaluateIncidentFixPrompt',
  input: { schema: EvaluateIncidentFixInputSchema },
  output: { schema: EvaluateIncidentFixOutputSchema },
  system: `You are an expert tax auditor and data validator. 
  Your ONLY goal is to determine if a reported "Incident" (error) in a document has been fixed by the documented changes.
  
  CONTEXT:
  - You will receive an 'Incident Report' describing what was wrong.
  - You will receive the 'Current Document State' (JSON).
  - You may receive 'Company Data' (context about the company owning the document).
  
  LOGIC:
  - If the incident was about a mismatch in CIF/NIF, check the 'entidades' in the document AND the 'companyData'. If they now match or are consistent, return resolved: true.
  - If the incident was about missing fields (e.g. Total = 0), check if the field now has a valid value.
  - If the incident was about calculation errors (Total != Sum), assume MATH checks are done separately, but if asked, verify logic.
  - Be strict but fair. If the user fixed the specific complaint, mark it as resolved.
  
  EXAMPLE 1:
  Incident: "Missing Invoice Number"
  Document: { numero_documento: "INV-2024-001", ... }
  Result: { resolved: true, reason: "The document now has a valid invoice number." }
  
  EXAMPLE 2:
  Incident: "CIF mismatch between Company and Emisor"
  Document: { entidades: [{ rol: 'emisor', identificador_fiscal: 'B123' }] }
  Company: { cif: 'B123' }
  Result: { resolved: true, reason: "The Company CIF now matches the Emisor CIF." }
  `,
  prompt: `
  INCIDENT REPORT:
  {{incidentDescription}}
  
  CURRENT DOCUMENT STATE:
  {{json documentData}}
  
  {{#if companyData}}
  COMPANY CONTEXT:
  {{json companyData}}
  {{/if}}
  `
});

export const evaluateIncidentFixFlow = ai.defineFlow(
  {
    name: 'evaluateIncidentFixFlow',
    inputSchema: EvaluateIncidentFixInputSchema,
    outputSchema: EvaluateIncidentFixOutputSchema,
  },
  async (input) => {
    console.log('🧠 [Genkit] Iniciando evaluación de incidencia con Gemini...');
    console.log('🧠 [Genkit] Input:', JSON.stringify(input, null, 2).substring(0, 500) + '...');

    const { output } = await evaluateIncidentFixPrompt(input);

    console.log('🧠 [Genkit] Respuesta de Gemini recibida:', output);

    if (!output) {
      console.error('❌ [Genkit] ERROR: La IA no devolvió un veredicto');
      throw new Error("AI did not return a verdict.");
    }

    console.log('✅ [Genkit] Evaluación completada exitosamente');
    return output;
  }
);

export async function checkIncidentResolutionWithAI(input: EvaluateIncidentFixInput): Promise<EvaluateIncidentFixOutput> {
  return await evaluateIncidentFixFlow(input);
}
