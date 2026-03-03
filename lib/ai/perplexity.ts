import OpenAI from 'openai'
import { env } from '@/lib/config'
import { recordPerplexityUsage, type BillableUsageContext } from '@/lib/billing/provider-usage'

const globalForPerplexity = globalThis as unknown as { perplexity: OpenAI | undefined }

function createPerplexity(apiKey = env.PERPLEXITY_API_KEY ?? '') {
  return new OpenAI({
    apiKey,
    baseURL: 'https://api.perplexity.ai',
  })
}

export const perplexity = globalForPerplexity.perplexity ?? createPerplexity()

if (process.env.NODE_ENV !== 'production') {
  globalForPerplexity.perplexity = perplexity
}

export interface PerplexityCallResult {
  text: string
  usage: {
    inputTokens: number
    outputTokens: number
    searchQueries: number
  }
  providerCostUsdMicros: number | null
  model: string
}

interface PerplexityRequestOptions {
  apiKey?: string
  billingContext?: BillableUsageContext
  model?: string
}

function getPerplexityClient(apiKey?: string) {
  if (!apiKey || apiKey === env.PERPLEXITY_API_KEY) {
    return perplexity
  }

  return createPerplexity(apiKey)
}

function isTenantOwnedPerplexityKey(apiKey?: string) {
  return Boolean(apiKey && apiKey !== env.PERPLEXITY_API_KEY)
}

function extractTextContent(content: unknown) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
          return part.text
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

function extractProviderCostUsdMicros(response: any) {
  const totalCost = response?.usage?.cost?.total_cost ?? response?.usage?.cost?.totalCost ?? null
  const parsed = typeof totalCost === 'string' ? Number(totalCost) : totalCost
  return typeof parsed === 'number' && Number.isFinite(parsed) ? Math.round(parsed * 1_000_000) : null
}

export async function searchWebWithUsage(
  query: string,
  options?: PerplexityRequestOptions,
): Promise<PerplexityCallResult> {
  const client = getPerplexityClient(options?.apiKey)
  const response: any = await client.chat.completions.create({
    model: options?.model ?? 'sonar',
    messages: [
      {
        role: 'system',
        content:
          'You are a research assistant. Provide factual, concise information with specific data points (funding amounts, employee counts, dates). Focus on B2B company intelligence.',
      },
      {
        role: 'user',
        content: query,
      },
    ],
  })

  const result: PerplexityCallResult = {
    text: extractTextContent(response.choices?.[0]?.message?.content),
    usage: {
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      searchQueries: 1,
    },
    providerCostUsdMicros: extractProviderCostUsdMicros(response),
    model: response.model ?? options?.model ?? 'sonar',
  }

  if (options?.billingContext) {
    try {
      await recordPerplexityUsage({
        context: options.billingContext,
        model: result.model,
        requestCount: 1,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        searchQueries: result.usage.searchQueries,
        directCostUsdMicros: result.providerCostUsdMicros,
        tenantOwnedCredentialUsed: isTenantOwnedPerplexityKey(options.apiKey),
      })
    } catch (error) {
      console.error('Perplexity billing capture failed:', error)
    }
  }

  return result
}

export async function searchWeb(query: string, options?: PerplexityRequestOptions): Promise<string> {
  const response = await searchWebWithUsage(query, options)
  return response.text
}

export async function researchCompany(
  companyName: string,
  personName: string,
  personTitle: string,
  options?: { apiKey?: string },
): Promise<{
  raw: string
  fundingInfo: string
  companySize: string
  recentNews: string
  usage: {
    inputTokens: number
    outputTokens: number
    searchQueries: number
  }
  providerCostUsdMicros: number | null
  model: string
}> {
  const queries = [
    `${companyName} funding rounds investors valuation 2024 2025 2026`,
    `${companyName} company size employees revenue industry`,
    `${companyName} ${personName} ${personTitle} recent news announcements`,
  ]

  const results = await Promise.all(
    queries.map((query) => searchWebWithUsage(query, { apiKey: options?.apiKey })),
  )

  const directCostAvailable = results.every((result) => typeof result.providerCostUsdMicros === 'number')

  return {
    raw: results.map((result) => result.text).join('\n\n---\n\n'),
    fundingInfo: results[0]?.text ?? '',
    companySize: results[1]?.text ?? '',
    recentNews: results[2]?.text ?? '',
    usage: {
      inputTokens: results.reduce((sum, result) => sum + result.usage.inputTokens, 0),
      outputTokens: results.reduce((sum, result) => sum + result.usage.outputTokens, 0),
      searchQueries: results.reduce((sum, result) => sum + result.usage.searchQueries, 0),
    },
    providerCostUsdMicros: directCostAvailable
      ? results.reduce((sum, result) => sum + (result.providerCostUsdMicros ?? 0), 0)
      : null,
    model: results[0]?.model ?? 'sonar',
  }
}
