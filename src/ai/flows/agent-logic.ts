/**
 * @fileOverview This file contains the core logic for the conversational AI agent.
 * It is NOT a server action entrypoint and should not be marked with 'use server'.
 * This allows it to safely import and use Genkit tools and other server-side libraries.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { MessageData, Part } from 'genkit';
import { documentTools } from '@/ai/tools/document-tools';
import type { ChatInput } from './chat-agent';

// Define Zod schemas for input and output validation.
// These are not exported because they are only used within this flow.
const ChatInputSchema = z.object({
  history: z.array(z.custom<MessageData>()),
  message: z.string(),
});

const ChatOutputSchema = z.custom<Part>();

const systemPrompt = `Eres un asistente experto en el análisis de datos de facturas y documentos de una empresa. Tu objetivo es responder a las preguntas del usuario de la forma más precisa y concisa posible, utilizando las herramientas a tu disposición.

- Analiza la pregunta del usuario para determinar qué información necesita.
- Utiliza una o más de las herramientas disponibles para obtener los datos necesarios.
- Basa tu respuesta únicamente en los datos devueltos por las herramientas. No inventes información.
- Si no puedes responder a la pregunta con las herramientas disponibles, informa al usuario de que no tienes acceso a esa información.
- Presenta los datos de forma clara y fácil de entender. Si la respuesta contiene una lista de elementos (como documentos o proveedores), preséntala en un formato de lista o tabla.
- Cuando muestres datos de documentos, proporciona siempre el número de factura y un enlace al documento si es posible.
- Responde siempre en español.`;

/**
 * The core implementation of the chat agent.
 * @param input The user's message and the chat history.
 * @returns The AI model's response part.
 */
export async function runChatAgent(input: ChatInput): Promise<Part> {
  // Validate input against the schema
  const validatedInput = ChatInputSchema.parse(input);
  const { history, message } = validatedInput;

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

  // Validate and return the output
  return ChatOutputSchema.parse(output);
}
