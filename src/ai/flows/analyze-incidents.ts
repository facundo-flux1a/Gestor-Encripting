'use server';

/**
 * @fileOverview An AI agent for analyzing documents to find inconsistencies.
 *
 * - analyzeDocumentsForIncidents - A function that triggers the analysis process.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { runDocumentAnalysis } from '@/services/document-service';
import type { IncidentAnalysisResult } from '@/lib/types';
import { IncidentAnalysisResultSchema } from '@/lib/types';

// ✅ CAMBIO: Ahora acepta empresaIds como input
const analyzeDocumentsFlow = ai.defineFlow(
  {
    name: 'analyzeDocumentsForIncidentsFlow',
    inputSchema: z.object({
      empresaIds: z.array(z.number()).optional(),
    }),
    outputSchema: IncidentAnalysisResultSchema,
  },
  async (input) => {
    console.log('Starting document analysis flow...', input);
    const result = await runDocumentAnalysis(input.empresaIds);
    console.log('Document analysis flow completed.', result);
    return result;
  }
);

// ✅ CAMBIO: Ahora acepta empresaIds como parámetro
export async function analyzeDocumentsForIncidents(empresaIds?: number[]): Promise<IncidentAnalysisResult> {
  return await analyzeDocumentsFlow({ empresaIds });
}