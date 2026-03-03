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
  it('derives starter pricing from exact-cost credit units', async () => {
    const { getBillingPlan } = await import('@/lib/billing/plans')
    const plan = getBillingPlan('starter')

    expect(plan.providerCostUsdMicrosPerCredit).toBe(1000)
    expect(plan.targetMarkupMultiplier).toBe(3)
    expect(plan.creditSellPriceUsdMicros).toBe(3000)
    expect(plan.includedCredits).toBe(5000)
    expect(plan.recommendedBaseMonthlyUsdCents).toBe(1500)
  })

  it('keeps the same sell price per credit across every plan', async () => {
    const { getBillingPlan } = await import('@/lib/billing/plans')
    const starter = getBillingPlan('starter')
    const growth = getBillingPlan('growth')
    const scale = getBillingPlan('scale')

    expect(growth.creditSellPriceUsdMicros).toBe(starter.creditSellPriceUsdMicros)
    expect(scale.creditSellPriceUsdMicros).toBe(starter.creditSellPriceUsdMicros)
    expect(growth.recommendedBaseMonthlyUsdCents).toBe(6000)
    expect(scale.recommendedBaseMonthlyUsdCents).toBe(30000)
  })
})
