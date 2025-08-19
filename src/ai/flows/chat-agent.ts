'use server';

/**
 * @fileOverview Server action entrypoint for the chat agent.
 * This file acts as a secure gateway for the client to interact
 * with the AI chat functionality.
 */

import { MessageData } from 'genkit';
import { runChatAgent } from './agent-logic';

// The input type is defined here for clarity, but the schema is in the logic file.
export type ChatInput = {
  history: MessageData[];
  message: string;
};

/**
 * Server Action: Receives a chat request from the client and passes it
 * to the core agent logic.
 * @param input The user's message and the chat history.
 * @returns The AI model's response part.
 */
export async function chat(input: ChatInput) {
  // This function simply calls the actual implementation, which is NOT
  // directly exposed to the client as a server action.
  return await runChatAgent(input);
}
