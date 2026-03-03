import { env } from '@/lib/config'
import {
  CREDIT_UNIT_USD_MICROS,
  getTargetMarkupMultiplier,
} from './credit-rules'

export type PlanSlug = 'starter' | 'growth' | 'scale'

export interface BillingPlan {
  slug: PlanSlug
  basePriceId: string | null
  overagePriceId: string | null
  includedCredits: number
  providerCostUsdMicrosPerCredit: number
  creditSellPriceUsdMicros: number
  creditSellPriceUsdCents: number
  recommendedBaseMonthlyUsdMicros: number
  recommendedBaseMonthlyUsdCents: number
  targetMarkupMultiplier: number
}

function readNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function createPlan(
  slug: PlanSlug,
  includedCredits: number,
  basePriceId: string | undefined,
  overagePriceId: string | undefined,
): BillingPlan {
  const targetMarkupMultiplier = getTargetMarkupMultiplier()
  const normalizedIncludedCredits = Math.max(0, Math.round(includedCredits))
  const creditSellPriceUsdMicros = Math.max(
    1,
    Math.round(CREDIT_UNIT_USD_MICROS * targetMarkupMultiplier),
  )
  const recommendedBaseMonthlyUsdMicros = normalizedIncludedCredits * creditSellPriceUsdMicros

  return {
    slug,
    basePriceId: basePriceId ?? null,
    overagePriceId: overagePriceId ?? null,
    includedCredits: normalizedIncludedCredits,
    providerCostUsdMicrosPerCredit: CREDIT_UNIT_USD_MICROS,
    creditSellPriceUsdMicros,
    creditSellPriceUsdCents: creditSellPriceUsdMicros / 10_000,
    recommendedBaseMonthlyUsdMicros,
    recommendedBaseMonthlyUsdCents: Math.round(recommendedBaseMonthlyUsdMicros / 10_000),
    targetMarkupMultiplier,
  }
}

const plans: Record<PlanSlug, BillingPlan> = {
  starter: createPlan(
    'starter',
    readNumber(env.BILLING_INCLUDED_CREDITS_STARTER, 5_000),
    env.STRIPE_PRICE_STARTER_BASE,
    env.STRIPE_PRICE_STARTER_OVERAGE,
  ),
  growth: createPlan(
    'growth',
    readNumber(env.BILLING_INCLUDED_CREDITS_GROWTH, 20_000),
    env.STRIPE_PRICE_GROWTH_BASE,
    env.STRIPE_PRICE_GROWTH_OVERAGE,
  ),
  scale: createPlan(
    'scale',
    readNumber(env.BILLING_INCLUDED_CREDITS_SCALE, 100_000),
    env.STRIPE_PRICE_SCALE_BASE,
    env.STRIPE_PRICE_SCALE_OVERAGE,
  ),
}

export function getBillingPlan(planSlug: PlanSlug): BillingPlan {
  return plans[planSlug]
}

export function getAllBillingPlans(): BillingPlan[] {
  return Object.values(plans)
}

export function isPlanSlug(value: string | null | undefined): value is PlanSlug {
  return value === 'starter' || value === 'growth' || value === 'scale'
}

export function getPlanSlugFromPriceId(priceId: string | null | undefined): PlanSlug | null {
  if (!priceId) return null

  for (const plan of Object.values(plans)) {
    if (plan.basePriceId === priceId || plan.overagePriceId === priceId) {
      return plan.slug
    }
  }

  return null
}
