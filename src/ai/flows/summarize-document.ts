
'use server';

/**
 * @fileOverview A document summarization AI agent.
 *
 * - summarizeDocument - A function that handles the document summarization process.
 * - SummarizeDocumentInput - The input type for the summarizeDocument function.
 * - SummarizeDocumentOutput - The return type for the summarizeDocument function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { DocumentEntitySchema, DocumentLineSchema, IvaDetailSchema } from '@/lib/types';


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
  })
});

export type SummarizeDocumentInput = z.infer<typeof SummarizeDocumentInputSchema>;

const SummarizeDocumentOutputSchema = z.object({
  summary: z.string().describe('A concise summary of the document.'),
});
export type SummarizeDocumentOutput = z.infer<typeof SummarizeDocumentOutputSchema>;

export async function summarizeDocument(input: SummarizeDocumentInput): Promise<SummarizeDocumentOutput> {
  return summarizeDocumentFlow(input);
}

const summarizeDocumentPrompt = ai.definePrompt({
  name: 'summarizeDocumentPrompt',
  input: {schema: SummarizeDocumentInputSchema},
  output: {schema: SummarizeDocumentOutputSchema },
  system: `Eres un asistente financiero experto. Tu tarea es resumir el siguiente documento JSON. 
  Proporciona un resumen conciso y claro en español.
  El resumen debe incluir:
  - Quién emite el documento (Emisor/Proveedor).
  - Quién recibe el documento (Receptor/Cliente).
  - El importe total.
  - La fecha de emisión y la fecha de vencimiento.
  Utiliza el PDF adjunto solo como referencia si es necesario.`,
  prompt: `
    Documento (JSON):
    \`\`\`json
    {{{json document}}}
    \`\`\`
    
    {{#if document.archivos.0.ruta_archivo}}
    Documento (PDF de referencia):
    {{media url=document.archivos.0.ruta_archivo}}
    {{/if}}
  `,
});

const summarizeDocumentFlow = ai.defineFlow(
  {
    name: 'summarizeDocumentFlow',
    inputSchema: SummarizeDocumentInputSchema,
    outputSchema: SummarizeDocumentOutputSchema,
  },
  async (input) => {
    
    const {output} = await summarizeDocumentPrompt(input, {
      config: {
        safetySettings: [
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'BLOCK_ONLY_HIGH',
          },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'BLOCK_NONE',
          },
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE',
          },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'BLOCK_LOW_AND_ABOVE',
          },
        ],
      },
    });

    if (!output) {
        throw new Error("The AI model did not return a summary.");
    }
    
    return {
      summary: output.summary,
    };
  }
);
