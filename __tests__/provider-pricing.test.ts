import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test'
  vi.resetModules()
})

describe('provider pricing defaults', () => {
  it('calculates Anthropic Sonnet cost from token usage', async () => {
    const { calculateAnthropicCostUsdMicros } = await import('@/lib/billing/provider-pricing')
    const fakeDb = {
      providerPricingConfig: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as any

    const result = await calculateAnthropicCostUsdMicros(
      'claude-sonnet-4-20250514',
      { inputTokens: 1000, outputTokens: 500 },
      fakeDb,
    )

    expect(result).toEqual({
      providerCostUsdMicros: 10500,
      pricingSource: 'official_default',
    })
  }, 10000)

  it('prefers Perplexity direct response cost when available', async () => {
    const { calculatePerplexityCostUsdMicros } = await import('@/lib/billing/provider-pricing')

    const result = await calculatePerplexityCostUsdMicros(
      {
        model: 'sonar',
        usage: { inputTokens: 2500, outputTokens: 800, searchQueries: 1 },
        directCostUsdMicros: 4312,
      },
      {} as any,
    )

    expect(result).toEqual({
      providerCostUsdMicros: 4312,
      pricingSource: 'provider_response',
    })
  })
})
