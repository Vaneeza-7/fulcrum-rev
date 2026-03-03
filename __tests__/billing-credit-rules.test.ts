import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test'
  delete process.env.BILLING_TARGET_MARKUP_MULTIPLIER
  vi.resetModules()
})

describe('billing credit rules', () => {
  it('converts provider cost micros into decimal credits', async () => {
    const { creditsFromProviderCostUsdMicros, formatCredits } = await import('@/lib/billing/credit-rules')

    expect(formatCredits(creditsFromProviderCostUsdMicros(1_000))).toBe('1.000')
    expect(formatCredits(creditsFromProviderCostUsdMicros(15_320))).toBe('15.320')
  })

  it('applies a global 3x markup to billable spend', async () => {
    const { billableUsdMicrosFromProviderCost, formatUsdMicros } = await import('@/lib/billing/credit-rules')

    expect(formatUsdMicros(billableUsdMicrosFromProviderCost(15_320))).toBe('0.045960')
  })
})
