import { prisma } from '@/lib/db'
import { grantIncludedCreditsForPeriod } from './ledger'
import { getBillingPlan, isPlanSlug, type PlanSlug } from './plans'

export function addOneMonthUtc(date: Date) {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()
  const hours = date.getUTCHours()
  const minutes = date.getUTCMinutes()
  const seconds = date.getUTCSeconds()
  const milliseconds = date.getUTCMilliseconds()

  const targetMonthIndex = month + 1
  const targetYear = year + Math.floor(targetMonthIndex / 12)
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const clampedDay = Math.min(day, lastDayOfTargetMonth)

  return new Date(
    Date.UTC(targetYear, targetMonth, clampedDay, hours, minutes, seconds, milliseconds),
  )
}

export function getCurrentBillingDisplayPeriod(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0))
  return { start, end }
}

export function getBillingPeriodWindow(account: {
  currentPeriodStart: Date | null
  currentPeriodEnd: Date | null
} | null | undefined) {
  if (account?.currentPeriodStart && account?.currentPeriodEnd) {
    return {
      currentPeriodStart: account.currentPeriodStart,
      currentPeriodEnd: account.currentPeriodEnd,
    }
  }

  return {
    currentPeriodStart: getCurrentBillingDisplayPeriod().start,
    currentPeriodEnd: getCurrentBillingDisplayPeriod().end,
  }
}

export async function upsertManualPlanAssignment(input: {
  tenantId: string
  planSlug: PlanSlug
  billingEmail?: string | null
  assignedBy?: string | null
  anchorDate?: Date
}) {
  const anchorDate = input.anchorDate ?? new Date()
  const currentPeriodStart = new Date(anchorDate)
  const currentPeriodEnd = addOneMonthUtc(currentPeriodStart)
  getBillingPlan(input.planSlug)

  const account = await prisma.tenantBillingAccount.upsert({
    where: { tenantId: input.tenantId },
    create: {
      tenantId: input.tenantId,
      billingSource: 'manual',
      subscriptionStatus: 'active',
      planSlug: input.planSlug,
      planAssignedAt: new Date(),
      planAssignedBy: input.assignedBy ?? null,
      currentPeriodStart,
      currentPeriodEnd,
      billingEmail: input.billingEmail ?? null,
    },
    update: {
      billingSource: 'manual',
      subscriptionStatus: 'active',
      planSlug: input.planSlug,
      planAssignedAt: new Date(),
      planAssignedBy: input.assignedBy ?? null,
      currentPeriodStart,
      currentPeriodEnd,
      ...(input.billingEmail ? { billingEmail: input.billingEmail } : {}),
    },
  })

  await grantIncludedCreditsForPeriod({
    tenantId: input.tenantId,
    planSlug: input.planSlug,
    source: 'manual_plan_grant',
    externalReference: `manual_plan_grant:${input.tenantId}:${currentPeriodStart.toISOString()}:${input.planSlug}`,
    periodStart: currentPeriodStart,
    periodEnd: currentPeriodEnd,
    metadata: {
      billingSource: 'manual',
      assignedBy: input.assignedBy ?? null,
    },
  })

  return account
}

export async function rolloverManualBillingPeriods(now = new Date(), tenantIds?: string[]) {
  const accounts = await prisma.tenantBillingAccount.findMany({
    where: {
      billingSource: 'manual',
      subscriptionStatus: 'active',
      planSlug: { not: null },
      ...(tenantIds ? { tenantId: { in: tenantIds } } : {}),
    },
  })

  const results: Array<{ tenantId: string; grantsCreated: number; periodStart: Date | null; periodEnd: Date | null }> = []

  for (const account of accounts) {
    if (!isPlanSlug(account.planSlug)) continue

    let periodStart = account.currentPeriodStart ?? new Date(now)
    let periodEnd = account.currentPeriodEnd ?? addOneMonthUtc(periodStart)
    let grantsCreated = 0

    while (periodEnd <= now) {
      periodStart = new Date(periodEnd)
      periodEnd = addOneMonthUtc(periodStart)
      grantsCreated += 1

      await grantIncludedCreditsForPeriod({
        tenantId: account.tenantId,
        planSlug: account.planSlug,
        source: 'manual_plan_grant',
        externalReference: `manual_plan_grant:${account.tenantId}:${periodStart.toISOString()}:${account.planSlug}`,
        periodStart,
        periodEnd,
        metadata: { billingSource: 'manual' },
      })
    }

    if (
      grantsCreated > 0 ||
      !account.currentPeriodStart ||
      !account.currentPeriodEnd
    ) {
      await prisma.tenantBillingAccount.update({
        where: { id: account.id },
        data: {
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        },
      })
    }

    results.push({
      tenantId: account.tenantId,
      grantsCreated,
      periodStart,
      periodEnd,
    })
  }

  return results
}
