import { prisma } from '@/lib/db'
import {
  formatCredits,
  formatUsdMicros,
  getCreditUnitUsdDisplay,
  getTargetMarkupMultiplierDisplay,
  usdMicrosToUsdNumber,
} from './credit-rules'
import { getBillingPeriodWindow } from './manual-plans'
import { getBillingPlan, isPlanSlug } from './plans'

function sumCredits(values: Array<{ creditDelta: unknown }>) {
  return values.reduce((sum, entry) => sum + Math.abs(Number(entry.creditDelta ?? 0)), 0)
}

function formatPerLeadMetric(total: number, count: number) {
  if (count <= 0) return '0.000'
  return (total / count).toFixed(3)
}

function formatUsdPerLead(totalUsdMicros: number, count: number) {
  if (count <= 0) return '0.000000'
  return formatUsdMicros(Math.round(totalUsdMicros / count))
}

export async function getTenantBillingSummary(tenantId: string) {
  const account = await prisma.tenantBillingAccount.findUnique({
    where: { tenantId },
  })

  const { currentPeriodStart, currentPeriodEnd } = getBillingPeriodWindow(account)
  const plan = account?.planSlug && isPlanSlug(account.planSlug)
    ? getBillingPlan(account.planSlug)
    : null

  const [usageEntries, usageEvents, approvedLeadCount, pushedLeadCount] = await Promise.all([
    prisma.fulcrumCreditLedger.findMany({
      where: {
        tenantId,
        entryType: 'usage',
        pricingUnitVersion: 2,
        createdAt: {
          gte: currentPeriodStart,
          lt: currentPeriodEnd,
        },
      },
      select: {
        creditDelta: true,
      },
    }),
    prisma.providerUsageEvent.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: currentPeriodStart,
          lt: currentPeriodEnd,
        },
      },
      select: {
        provider: true,
        stage: true,
        requestCount: true,
        providerCostUsdMicros: true,
        tenantOwnedCredentialUsed: true,
        pricingSource: true,
      },
    }),
    prisma.lead.count({
      where: {
        tenantId,
        approvedAt: {
          gte: currentPeriodStart,
          lt: currentPeriodEnd,
        },
      },
    }),
    prisma.lead.count({
      where: {
        tenantId,
        pushedToCrmAt: {
          gte: currentPeriodStart,
          lt: currentPeriodEnd,
        },
      },
    }),
  ])

  const usedCreditsNumber = sumCredits(usageEntries)
  const includedCreditsNumber = plan?.includedCredits ?? 0
  const remainingCreditsNumber = Math.max(includedCreditsNumber - usedCreditsNumber, 0)

  const providerBreakdownMap = new Map<string, {
    provider: string
    stage: string
    credits: number
    providerCostUsdMicros: number
    projectedBillableUsdMicros: number
    requestCount: number
    billable: boolean
  }>()

  const unpricedActivityMap = new Map<string, {
    provider: string
    stage: string
    activityCount: number
    reason: string
  }>()

  let providerCostUsdMicros = 0
  let projectedBillableUsdMicros = 0

  for (const event of usageEvents) {
    const billable = event.providerCostUsdMicros > 0 && !event.tenantOwnedCredentialUsed

    if (billable) {
      providerCostUsdMicros += event.providerCostUsdMicros
      projectedBillableUsdMicros += event.providerCostUsdMicros * 3

      const key = `${event.provider}:${event.stage}`
      const current = providerBreakdownMap.get(key) ?? {
        provider: event.provider,
        stage: event.stage,
        credits: 0,
        providerCostUsdMicros: 0,
        projectedBillableUsdMicros: 0,
        requestCount: 0,
        billable: true,
      }

      current.credits += event.providerCostUsdMicros / 1_000
      current.providerCostUsdMicros += event.providerCostUsdMicros
      current.projectedBillableUsdMicros += event.providerCostUsdMicros * 3
      current.requestCount += event.requestCount
      providerBreakdownMap.set(key, current)
      continue
    }

    if (event.pricingSource === 'subscription_priced_deferred') {
      const key = `${event.provider}:${event.stage}`
      const current = unpricedActivityMap.get(key) ?? {
        provider: event.provider,
        stage: event.stage,
        activityCount: 0,
        reason: 'subscription_priced_deferred',
      }
      current.activityCount += event.requestCount
      unpricedActivityMap.set(key, current)
    }
  }

  return {
    billing: {
      planSlug: plan?.slug ?? null,
      billingSource: account?.billingSource ?? 'manual',
      subscriptionStatus: account?.subscriptionStatus ?? 'inactive',
      currentPeriodStart,
      currentPeriodEnd,
      creditUnitUsd: getCreditUnitUsdDisplay(),
      targetMarkupMultiplier: getTargetMarkupMultiplierDisplay(),
      includedCredits: formatCredits(includedCreditsNumber),
      usedCredits: formatCredits(usedCreditsNumber),
      remainingCredits: formatCredits(remainingCreditsNumber),
      providerCostUsd: formatUsdMicros(providerCostUsdMicros),
      projectedBillableUsd: formatUsdMicros(projectedBillableUsdMicros),
      approvedLeadCount,
      pushedLeadCount,
      creditsPerApprovedLead: formatPerLeadMetric(usedCreditsNumber, approvedLeadCount),
      creditsPerPushedLead: formatPerLeadMetric(usedCreditsNumber, pushedLeadCount),
      projectedBillablePerApprovedLeadUsd: formatUsdPerLead(projectedBillableUsdMicros, approvedLeadCount),
      projectedBillablePerPushedLeadUsd: formatUsdPerLead(projectedBillableUsdMicros, pushedLeadCount),
      providerBreakdown: Array.from(providerBreakdownMap.values())
        .sort((a, b) => b.providerCostUsdMicros - a.providerCostUsdMicros)
        .map((entry) => ({
          provider: entry.provider,
          stage: entry.stage,
          credits: formatCredits(entry.credits),
          providerCostUsd: formatUsdMicros(entry.providerCostUsdMicros),
          projectedBillableUsd: formatUsdMicros(entry.projectedBillableUsdMicros),
          requestCount: entry.requestCount,
          billable: entry.billable,
        })),
      unpricedActivity: Array.from(unpricedActivityMap.values()).sort((a, b) => b.activityCount - a.activityCount),
      metrics: {
        providerCostUsdNumber: usdMicrosToUsdNumber(providerCostUsdMicros),
        projectedBillableUsdNumber: usdMicrosToUsdNumber(projectedBillableUsdMicros),
      },
    },
    account,
  }
}
