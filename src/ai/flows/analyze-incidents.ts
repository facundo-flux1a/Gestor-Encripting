'use server';

/**
 * @fileOverview An AI agent for analyzing documents to find inconsistencies.
 *
 * - analyzeDocumentsForIncidents - A function that triggers the analysis process.
 * - IncidentAnalysisResult - The return type for the analysis function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { runDocumentAnalysis } from '@/services/document-service';

export const IncidentAnalysisResultSchema = z.object({
  newIncidentsFound: z.number().describe('The number of new incidents created.'),
  duplicates: z.number().describe('Number of duplicate documents found.'),
  calculationErrors: z.number().describe('Number of documents with calculation errors.'),
  message: z.string().describe('A summary message of the operation.'),
});

export type IncidentAnalysisResult = z.infer<typeof IncidentAnalysisResultSchema>;

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
