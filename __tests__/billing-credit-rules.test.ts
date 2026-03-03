import { describe, expect, it } from 'vitest'
import {
  getDiscoveryUsageCharge,
  getEnrichmentUsageCharge,
  getFirstLineUsageCharge,
} from '@/lib/billing/credit-rules'

describe('billing credit rules', () => {
  it('maps discovery credits directly to normalized provider cost cents', () => {
    expect(getDiscoveryUsageCharge()).toEqual({
      credits: 25,
      usdAmountCents: 25,
    })
  })

  it('maps enrichment credits directly to normalized provider cost cents', () => {
    const charge = getEnrichmentUsageCharge({
      inputTokens: 1000,
      outputTokens: 500,
    })

    expect(charge).toEqual({
      credits: 7,
      usdAmountCents: 7,
    })
  })

  it('maps first-line credits directly to normalized provider cost cents', () => {
    const charge = getFirstLineUsageCharge({
      inputTokens: 250,
      outputTokens: 120,
    })

    expect(charge).toEqual({
      credits: 1,
      usdAmountCents: 1,
    })
  })
})
