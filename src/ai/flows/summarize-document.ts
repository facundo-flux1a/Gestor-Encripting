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

const SummarizeDocumentInputSchema = z.object({
  documentText: z.string().describe('The text content of the document to summarize.'),
});
export type SummarizeDocumentInput = z.infer<typeof SummarizeDocumentInputSchema>;

const SummarizeDocumentOutputSchema = z.object({
  summary: z.string().describe('A concise summary of the document.'),
  canSummarize: z.boolean().describe('Whether the document is suitable for summarization.'),
});
export type SummarizeDocumentOutput = z.infer<typeof SummarizeDocumentOutputSchema>;

export async function summarizeDocument(input: SummarizeDocumentInput): Promise<SummarizeDocumentOutput> {
  return summarizeDocumentFlow(input);
}

const canSummarizeTool = ai.defineTool({
  name: 'canSummarizeTool',
  description: 'Determines if a document can be meaningfully summarized.',
  inputSchema: z.object({
    documentText: z.string().describe('The text content of the document.'),
  }),
  outputSchema: z.boolean(),
  async resolve(input) {
    // Implement logic to determine if the document can be summarized.
    // This could be based on length, content type, etc.
    return input.documentText.length > 100; // Example: only summarize if the document is longer than 100 characters
  },
});

const summarizeDocumentPrompt = ai.definePrompt({
  name: 'summarizeDocumentPrompt',
  input: {schema: SummarizeDocumentInputSchema},
  output: {schema: SummarizeDocumentOutputSchema},
  tools: [canSummarizeTool],
  system: `You are an AI assistant tasked with summarizing documents. Before summarizing, use the canSummarizeTool tool to check if the document is suitable for summarization. If it is, provide a concise summary. If the document is not summarizable, explain why.`,
  prompt: `Document: {{{documentText}}}`,
});

const summarizeDocumentFlow = ai.defineFlow(
  {
    name: 'summarizeDocumentFlow',
    inputSchema: SummarizeDocumentInputSchema,
    outputSchema: SummarizeDocumentOutputSchema,
  },
  async input => {
    const canSummarize = await canSummarizeTool(input);

    if (!canSummarize) {
      return {
        summary: 'This document is not suitable for summarization.',
        canSummarize: false,
      };
    }

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
    return {
      summary: output!.summary,
      canSummarize: true,
    };
  }
);
