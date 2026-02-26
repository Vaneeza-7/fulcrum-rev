import Anthropic from '@anthropic-ai/sdk';
import { withRetry } from '@/lib/retry';

const globalForClaude = globalThis as unknown as { claude: Anthropic | undefined };

export const claude = globalForClaude.claude ?? new Anthropic({ baseUrl: "http://localhost:4034/v1/" });

if (process.env.NODE_ENV !== 'production') {
  globalForClaude.claude = claude;
}

/**
 * Send a message to Claude and get a text response.
 */
export async function askClaude(
  systemPrompt: string,
  userMessage: string,
  options?: { maxTokens?: number; model?: string }
): Promise<string> {
  const response = await withRetry(
    () => claude.messages.create({
      model: options?.model ?? 'claude-sonnet-4-20250514',
      max_tokens: options?.maxTokens ?? 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
    'askClaude'
  );

  const textBlock = response.content.find((block) => block.type === 'text');
  return textBlock?.text ?? '';
}

/**
 * Send a message to Claude and parse the response as JSON.
 */
export async function askClaudeJson<T>(
  systemPrompt: string,
  userMessage: string,
  options?: { maxTokens?: number; model?: string }
): Promise<T> {
  const response = await askClaude(
    systemPrompt + '\n\nRespond ONLY with valid JSON. No markdown, no explanation.',
    userMessage,
    options
  );

  // Strip any markdown code fences if present
  const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned) as T;
}

/**
 * Send a multi-turn conversation to Claude for context-aware responses.
 * Used by Huck agent for conversational interactions.
 */
export async function askClaudeConversation(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  options?: { maxTokens?: number; model?: string }
): Promise<string> {
  const response = await withRetry(
    () => claude.messages.create({
      model: options?.model ?? 'claude-sonnet-4-20250514',
      max_tokens: options?.maxTokens ?? 2048,
      system: systemPrompt,
      messages,
    }),
    'askClaudeConversation'
  );

  const textBlock = response.content.find((block) => block.type === 'text');
  return textBlock?.text ?? '';
}
