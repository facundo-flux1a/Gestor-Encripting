
'use server';

/**
 * @fileOverview An AI agent for analyzing a single document for inconsistencies.
 *
 * - analyzeSingleDocument - A function that triggers the analysis process for one document.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { runSingleDocumentAnalysis } from '@/services/document-service';
import { IncidentAnalysisResultSchema, type IncidentAnalysisResult } from '@/lib/types';

const AnalyzeSingleDocumentInputSchema = z.object({
  documentId: z.number(),
});
export type AnalyzeSingleDocumentInput = z.infer<typeof AnalyzeSingleDocumentInputSchema>;


const analyzeDocumentFlow = ai.defineFlow(
  {
    name: 'analyzeSingleDocumentFlow',
    inputSchema: AnalyzeSingleDocumentInputSchema,
    outputSchema: IncidentAnalysisResultSchema,
  },
  async ({ documentId }) => {
    console.log(`Starting single document analysis flow for ID: ${documentId}...`);
    const result = await runSingleDocumentAnalysis(documentId);
    console.log('Single document analysis flow completed.', result);
    return result;
  }
);

export async function analyzeSingleDocument(input: AnalyzeSingleDocumentInput): Promise<IncidentAnalysisResult> {
  return await analyzeDocumentFlow(input);
}
