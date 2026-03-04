import Anthropic from '@anthropic-ai/sdk'
import { withRetry } from '@/lib/retry'
import { env } from '@/lib/config'
import { recordAnthropicUsage, type BillableUsageContext } from '@/lib/billing/provider-usage'

const globalForClaude = globalThis as unknown as { claude: Anthropic | undefined }

export const claude = globalForClaude.claude ?? new Anthropic()

if (process.env.NODE_ENV !== 'production') {
  globalForClaude.claude = claude
}

export interface ClaudeCallResult {
  text: string
  usage: {
    inputTokens: number
    outputTokens: number
  }
  model: string
}

export interface ClaudeRequestOptions {
  maxTokens?: number
  model?: string
  apiKey?: string
  timeoutMs?: number
  signal?: AbortSignal
  billingContext?: BillableUsageContext
}

function getClaudeClient(apiKey?: string) {
  if (!apiKey || apiKey === env.ANTHROPIC_API_KEY) {
    return claude
  }

  return new Anthropic({ apiKey })
}

function isTenantOwnedAnthropicKey(apiKey?: string) {
  return Boolean(apiKey && apiKey !== env.ANTHROPIC_API_KEY)
}

async function sendClaudeMessage(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  options?: ClaudeRequestOptions,
): Promise<ClaudeCallResult> {
  const client = getClaudeClient(options?.apiKey)
  const requestOptions: { timeout?: number; signal?: AbortSignal } = {}
  if (typeof options?.timeoutMs === 'number' && Number.isInteger(options.timeoutMs) && options.timeoutMs > 0) {
    requestOptions.timeout = options.timeoutMs
  }
  if (options?.signal) {
    requestOptions.signal = options.signal
  }
  const response = await withRetry(
    () => client.messages.create(
      {
        model: options?.model ?? 'claude-sonnet-4-20250514',
        max_tokens: options?.maxTokens ?? 2048,
        system: systemPrompt,
        messages,
      },
      requestOptions,
    ),
    'askClaude',
  )

  const textBlock = response.content.find((block) => block.type === 'text')
  const result = {
    text: textBlock?.text ?? '',
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    },
    model: response.model,
  }

  if (options?.billingContext) {
    try {
      await recordAnthropicUsage({
        context: options.billingContext,
        model: response.model,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        tenantOwnedCredentialUsed: isTenantOwnedAnthropicKey(options.apiKey),
      })
    } catch (error) {
      console.error('Anthropic billing capture failed:', error)
    }
  }

  return result
}

export async function askClaude(
  systemPrompt: string,
  userMessage: string,
  options?: ClaudeRequestOptions,
): Promise<string> {
  const response = await askClaudeWithUsage(systemPrompt, userMessage, options)
  return response.text
}

export async function askClaudeWithUsage(
  systemPrompt: string,
  userMessage: string,
  options?: ClaudeRequestOptions,
): Promise<ClaudeCallResult> {
  return sendClaudeMessage(systemPrompt, [{ role: 'user', content: userMessage }], options)
}

export async function askClaudeJson<T>(
  systemPrompt: string,
  userMessage: string,
  options?: ClaudeRequestOptions,
): Promise<T> {
  const response = await askClaude(
    systemPrompt + '\n\nRespond ONLY with valid JSON. No markdown, no explanation.',
    userMessage,
    options,
  )

  const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return JSON.parse(cleaned) as T
}

export async function askClaudeJsonWithUsage<T>(
  systemPrompt: string,
  userMessage: string,
  options?: ClaudeRequestOptions,
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

export async function askClaudeConversation(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  options?: ClaudeRequestOptions,
): Promise<string> {
  const response = await askClaudeConversationWithUsage(systemPrompt, messages, options)
  return response.text
}

export async function askClaudeConversationWithUsage(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  options?: ClaudeRequestOptions,
): Promise<ClaudeCallResult> {
  return sendClaudeMessage(systemPrompt, messages, options)
}
