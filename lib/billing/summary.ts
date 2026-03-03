import { prisma } from '@/lib/db'
import { getBillingPlan, isPlanSlug } from './plans'

export async function getTenantBillingSummary(tenantId: string) {
  const account = await prisma.tenantBillingAccount.findUnique({
    where: { tenantId },
  })

  if (!account || !account.planSlug || !isPlanSlug(account.planSlug)) {
    return {
      billing: {
        planSlug: null,
        subscriptionStatus: account?.subscriptionStatus ?? 'inactive',
        currentPeriodStart: account?.currentPeriodStart ?? null,
        currentPeriodEnd: account?.currentPeriodEnd ?? null,
        includedCredits: 0,
        providerCostUsdCentsPerCredit: 1,
        creditSellPriceUsdCents: 0,
        recommendedBaseMonthlyUsdCents: 0,
        targetMarkupMultiplier: 0,
        usedCredits: 0,
        remainingIncludedCredits: 0,
        overageCredits: 0,
        projectedOverageUsdCents: 0,
      },
      account,
    }
  }

  const plan = getBillingPlan(account.planSlug)
  const periodStart = account.currentPeriodStart ?? new Date(0)
  const periodEnd = account.currentPeriodEnd ?? new Date()

  const usageEntries = await prisma.fulcrumCreditLedger.findMany({
    where: {
      tenantId,
      entryType: 'usage',
      createdAt: {
        gte: periodStart,
        lte: periodEnd,
      },
    },
  })

  const usedCredits = usageEntries.reduce((sum, entry) => sum + Math.abs(Number(entry.creditDelta)), 0)
  const remainingIncludedCredits = Math.max(plan.includedCredits - usedCredits, 0)
  const overageCredits = Math.max(usedCredits - plan.includedCredits, 0)
  const projectedOverageUsdCents = Math.round(overageCredits * plan.creditSellPriceUsdCents)

  return {
    billing: {
      planSlug: account.planSlug,
      subscriptionStatus: account.subscriptionStatus,
      currentPeriodStart: account.currentPeriodStart,
      currentPeriodEnd: account.currentPeriodEnd,
      includedCredits: plan.includedCredits,
      providerCostUsdCentsPerCredit: plan.providerCostUsdCentsPerCredit,
      creditSellPriceUsdCents: plan.creditSellPriceUsdCents,
      recommendedBaseMonthlyUsdCents: plan.recommendedBaseMonthlyUsdCents,
      targetMarkupMultiplier: plan.targetMarkupMultiplier,
      usedCredits,
      remainingIncludedCredits,
      overageCredits,
      projectedOverageUsdCents,
    },
    account,
  }
}
