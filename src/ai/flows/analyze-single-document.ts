'use server';

/**
 * Análisis de un documento — sin Genkit/Gemini.
 * Reutiliza el servicio de auditoría Azure OpenAI.
 */

import { diagnoseDocument } from '@/services/vertex-ai-service';

export async function analyzeSingleDocument(documentId: number) {
  return diagnoseDocument(documentId);
}
