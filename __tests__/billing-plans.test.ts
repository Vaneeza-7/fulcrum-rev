import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test'
  delete process.env.BILLING_TARGET_MARKUP_MULTIPLIER
  delete process.env.BILLING_INCLUDED_CREDITS_STARTER
  delete process.env.BILLING_INCLUDED_CREDITS_GROWTH
  delete process.env.BILLING_INCLUDED_CREDITS_SCALE
  vi.resetModules()
})

describe('billing plans', () => {
  it('derives starter pricing from a single 3x markup rule', async () => {
    const { getBillingPlan } = await import('@/lib/billing/plans')
    const plan = getBillingPlan('starter')

    expect(plan.providerCostUsdCentsPerCredit).toBe(1)
    expect(plan.targetMarkupMultiplier).toBe(3)
    expect(plan.creditSellPriceUsdCents).toBe(3)
    expect(plan.includedCredits).toBe(500)
    expect(plan.recommendedBaseMonthlyUsdCents).toBe(1500)
  })

  it('derives every plan from the same credit sell price', async () => {
    const { getBillingPlan } = await import('@/lib/billing/plans')
    const starter = getBillingPlan('starter')
    const growth = getBillingPlan('growth')
    const scale = getBillingPlan('scale')

    expect(growth.creditSellPriceUsdCents).toBe(starter.creditSellPriceUsdCents)
    expect(scale.creditSellPriceUsdCents).toBe(starter.creditSellPriceUsdCents)
    expect(growth.recommendedBaseMonthlyUsdCents).toBe(growth.includedCredits * growth.creditSellPriceUsdCents)
    expect(scale.recommendedBaseMonthlyUsdCents).toBe(scale.includedCredits * scale.creditSellPriceUsdCents)
  })
})
