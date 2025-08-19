'use server';

/**
 * @fileOverview A conversational agent for answering questions about documents.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { MessageData, Part } from 'genkit';
import { documentTools } from '@/ai/tools/document-tools';

export const ChatInputSchema = z.object({
  history: z.array(z.custom<MessageData>()),
  message: z.string(),
});
export type ChatInput = z.infer<typeof ChatInputSchema>;

export const ChatOutputSchema = z.custom<Part>();
export type ChatOutput = z.infer<typeof ChatOutputSchema>;

const systemPrompt = `Eres un asistente experto en el análisis de datos de facturas y documentos de una empresa. Tu objetivo es responder a las preguntas del usuario de la forma más precisa y concisa posible, utilizando las herramientas a tu disposición.

- Analiza la pregunta del usuario para determinar qué información necesita.
- Utiliza una o más de las herramientas disponibles para obtener los datos necesarios.
- Basa tu respuesta únicamente en los datos devueltos por las herramientas. No inventes información.
- Si no puedes responder a la pregunta con las herramientas disponibles, informa al usuario de que no tienes acceso a esa información.
- Presenta los datos de forma clara y fácil de entender. Si la respuesta contiene una lista de elementos (como documentos o proveedores), preséntala en un formato de lista o tabla.
- Cuando muestres datos de documentos, proporciona siempre el número de factura y un enlace al documento si es posible.
- Responde siempre en español.`;

export async function chat(input: ChatInput): Promise<ChatOutput> {
  const { history, message } = input;
  console.log('Received chat history:', history);
  console.log('Received message:', message);

  const llm = ai.model('googleai/gemini-2.0-flash');
  const response = await llm.generate({
    system: systemPrompt,
    tools: documentTools,
    history: history,
    prompt: message,
    config: {
      temperature: 0.1,
    },
  });

  const output = response.output?.content;
  console.log('LLM response:', output);

  if (!output) {
    throw new Error('El modelo no ha devuelto ninguna respuesta.');
  }

  return output;
}
