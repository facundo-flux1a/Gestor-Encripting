
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

const analyzeDocumentsFlow = ai.defineFlow(
  {
    name: 'analyzeDocumentsForIncidentsFlow',
    inputSchema: z.void(),
    outputSchema: IncidentAnalysisResultSchema,
  },
  async () => {
    console.log('Starting document analysis flow...');
    const result = await runDocumentAnalysis();
    console.log('Document analysis flow completed.', result);
    return result;
  }
);

export async function analyzeDocumentsForIncidents(): Promise<IncidentAnalysisResult> {
  return await analyzeDocumentsFlow();
}
