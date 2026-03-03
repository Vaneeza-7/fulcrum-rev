import Anthropic from '@anthropic-ai/sdk';
import { withRetry } from '@/lib/retry';

const globalForClaude = globalThis as unknown as { claude: Anthropic | undefined };

export const claude = globalForClaude.claude ?? new Anthropic();

if (process.env.NODE_ENV !== 'production') {
  globalForClaude.claude = claude;
}

export interface ClaudeCallResult {
  text: string
  usage: {
    inputTokens: number
    outputTokens: number
  }
  model: string
}

function getClaudeClient(apiKey?: string) {
  if (!apiKey || apiKey === process.env.ANTHROPIC_API_KEY) {
    return claude
  }

  return new Anthropic({ apiKey })
}

async function sendClaudeMessage(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  options?: { maxTokens?: number; model?: string; apiKey?: string },
): Promise<ClaudeCallResult> {
  const client = getClaudeClient(options?.apiKey)
  const response = await withRetry(
    () => client.messages.create({
      model: options?.model ?? 'claude-sonnet-4-20250514',
      max_tokens: options?.maxTokens ?? 2048,
      system: systemPrompt,
      messages,
    }),
    'askClaude'
  )

  const textBlock = response.content.find((block) => block.type === 'text');
  return {
    text: textBlock?.text ?? '',
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    },
    model: response.model,
  }
}

/**
 * Send a message to Claude and get a text response.
 */
export async function askClaude(
  systemPrompt: string,
  userMessage: string,
  options?: { maxTokens?: number; model?: string; apiKey?: string }
): Promise<string> {
  const response = await askClaudeWithUsage(systemPrompt, userMessage, options)
  return response.text
}

export async function askClaudeWithUsage(
  systemPrompt: string,
  userMessage: string,
  options?: { maxTokens?: number; model?: string; apiKey?: string }
): Promise<ClaudeCallResult> {
  return sendClaudeMessage(systemPrompt, [{ role: 'user', content: userMessage }], options)
}

/**
 * Send a message to Claude and parse the response as JSON.
 */
export async function askClaudeJson<T>(
  systemPrompt: string,
  userMessage: string,
  options?: { maxTokens?: number; model?: string; apiKey?: string }
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

export async function askClaudeJsonWithUsage<T>(
  systemPrompt: string,
  userMessage: string,
  options?: { maxTokens?: number; model?: string; apiKey?: string }
): Promise<{ data: T; usage: ClaudeCallResult['usage']; model: string }> {
  const response = await askClaudeWithUsage(
    systemPrompt + '\n\nRespond ONLY with valid JSON. No markdown, no explanation.',
    userMessage,
    options,
  )

  const cleaned = response.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return {
    data: JSON.parse(cleaned) as T,
    usage: response.usage,
    model: response.model,
  }
}

/**
 * Send a multi-turn conversation to Claude for context-aware responses.
 * Used by Huck agent for conversational interactions.
 */
export async function askClaudeConversation(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  options?: { maxTokens?: number; model?: string; apiKey?: string }
): Promise<string> {
  const response = await askClaudeConversationWithUsage(systemPrompt, messages, options)
  return response.text
}

export async function askClaudeConversationWithUsage(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  options?: { maxTokens?: number; model?: string; apiKey?: string }
): Promise<ClaudeCallResult> {
  return sendClaudeMessage(systemPrompt, messages, options)
}
