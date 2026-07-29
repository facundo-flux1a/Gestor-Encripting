'use server';

/**
 * Análisis de incidencias — delega en document-service (sin Genkit/Gemini).
 */

import { runDocumentAnalysis } from '@/services/document-service';
import type { IncidentAnalysisResult } from '@/lib/types';

export async function analyzeDocumentsForIncidents(empresaIds?: number[]): Promise<IncidentAnalysisResult> {
  console.log('Starting document analysis...', { empresaIds });
  const result = await runDocumentAnalysis(empresaIds);
  console.log('Document analysis completed.', result);
  return result;
}
