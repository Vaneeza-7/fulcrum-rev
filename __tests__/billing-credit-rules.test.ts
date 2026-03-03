import { describe, expect, it } from 'vitest'
import {
  getDiscoveryUsageCharge,
  getEnrichmentUsageCharge,
  getFirstLineUsageCharge,
} from '@/lib/billing/credit-rules'

describe('billing credit rules', () => {
  it('returns the normalized discovery charge', () => {
    expect(getDiscoveryUsageCharge()).toEqual({
      credits: 1,
      usdAmountCents: 25,
    })
  })

  it('calculates enrichment usd spend from token usage', () => {
    const charge = getEnrichmentUsageCharge({
      inputTokens: 1000,
      outputTokens: 500,
    })

    expect(charge.credits).toBe(0.35)
    expect(charge.usdAmountCents).toBeGreaterThan(0)
  })

  it('calculates first-line usd spend from token usage', () => {
    const charge = getFirstLineUsageCharge({
      inputTokens: 250,
      outputTokens: 120,
    })

    expect(charge.credits).toBe(0.15)
    expect(charge.usdAmountCents).toBeGreaterThan(0)
  })
})
