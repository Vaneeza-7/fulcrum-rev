import { env } from '@/lib/config'

export type PlanSlug = 'starter' | 'growth' | 'scale'

interface BillingPlan {
  slug: PlanSlug
  basePriceId: string | null
  overagePriceId: string | null
  includedCredits: number
  overageUsdPerCredit: number
}

function readNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const plans: Record<PlanSlug, BillingPlan> = {
  starter: {
    slug: 'starter',
    basePriceId: env.STRIPE_PRICE_STARTER_BASE ?? null,
    overagePriceId: env.STRIPE_PRICE_STARTER_OVERAGE ?? null,
    includedCredits: readNumber(env.BILLING_INCLUDED_CREDITS_STARTER, 500),
    overageUsdPerCredit: readNumber(env.BILLING_OVERAGE_USD_PER_CREDIT_STARTER, 0.5),
  },
  growth: {
    slug: 'growth',
    basePriceId: env.STRIPE_PRICE_GROWTH_BASE ?? null,
    overagePriceId: env.STRIPE_PRICE_GROWTH_OVERAGE ?? null,
    includedCredits: readNumber(env.BILLING_INCLUDED_CREDITS_GROWTH, 2000),
    overageUsdPerCredit: readNumber(env.BILLING_OVERAGE_USD_PER_CREDIT_GROWTH, 0.4),
  },
  scale: {
    slug: 'scale',
    basePriceId: env.STRIPE_PRICE_SCALE_BASE ?? null,
    overagePriceId: env.STRIPE_PRICE_SCALE_OVERAGE ?? null,
    includedCredits: readNumber(env.BILLING_INCLUDED_CREDITS_SCALE, 10000),
    overageUsdPerCredit: readNumber(env.BILLING_OVERAGE_USD_PER_CREDIT_SCALE, 0.3),
  },
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
