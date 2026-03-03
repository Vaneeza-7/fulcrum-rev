import { env } from '@/lib/config'

export type PlanSlug = 'starter' | 'growth' | 'scale'

const PROVIDER_COST_USD_CENTS_PER_CREDIT = 1
const DEFAULT_TARGET_MARKUP_MULTIPLIER = 3

export interface BillingPlan {
  slug: PlanSlug
  basePriceId: string | null
  overagePriceId: string | null
  includedCredits: number
  providerCostUsdCentsPerCredit: number
  creditSellPriceUsdCents: number
  recommendedBaseMonthlyUsdCents: number
  targetMarkupMultiplier: number
}

function readNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function getTargetMarkupMultiplier() {
  return readNumber(env.BILLING_TARGET_MARKUP_MULTIPLIER, DEFAULT_TARGET_MARKUP_MULTIPLIER)
}

function createPlan(
  slug: PlanSlug,
  includedCredits: number,
  basePriceId: string | undefined,
  overagePriceId: string | undefined,
): BillingPlan {
  const targetMarkupMultiplier = getTargetMarkupMultiplier()
  const normalizedIncludedCredits = Math.max(0, Math.round(includedCredits))
  const creditSellPriceUsdCents = Math.max(
    1,
    Math.round(PROVIDER_COST_USD_CENTS_PER_CREDIT * targetMarkupMultiplier),
  )

  return {
    slug,
    basePriceId: basePriceId ?? null,
    overagePriceId: overagePriceId ?? null,
    includedCredits: normalizedIncludedCredits,
    providerCostUsdCentsPerCredit: PROVIDER_COST_USD_CENTS_PER_CREDIT,
    creditSellPriceUsdCents,
    recommendedBaseMonthlyUsdCents: normalizedIncludedCredits * creditSellPriceUsdCents,
    targetMarkupMultiplier,
  }
}

const plans: Record<PlanSlug, BillingPlan> = {
  starter: createPlan(
    'starter',
    readNumber(env.BILLING_INCLUDED_CREDITS_STARTER, 500),
    env.STRIPE_PRICE_STARTER_BASE,
    env.STRIPE_PRICE_STARTER_OVERAGE,
  ),
  growth: createPlan(
    'growth',
    readNumber(env.BILLING_INCLUDED_CREDITS_GROWTH, 2000),
    env.STRIPE_PRICE_GROWTH_BASE,
    env.STRIPE_PRICE_GROWTH_OVERAGE,
  ),
  scale: createPlan(
    'scale',
    readNumber(env.BILLING_INCLUDED_CREDITS_SCALE, 10000),
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
