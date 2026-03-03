import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getBillingPlan, type PlanSlug } from './plans'

export type CreditEntryType = 'grant' | 'usage' | 'adjustment' | 'refund'
export type CreditSource =
  | 'subscription_grant'
  | 'discovery'
  | 'enrichment'
  | 'first_line'
  | 'manual_adjustment'
  | 'refund'

export interface CreditLedgerEntryInput {
  tenantId: string
  entryType: CreditEntryType
  source: CreditSource
  provider?: 'instantly' | 'apify' | 'anthropic' | 'system'
  creditDelta: number
  usdAmountCents: number
  metadata?: Record<string, unknown>
  externalReference?: string
  reportedToStripeAt?: Date | null
}

export async function createCreditLedgerEntry(input: CreditLedgerEntryInput) {
  return prisma.fulcrumCreditLedger.create({
    data: {
      tenantId: input.tenantId,
      entryType: input.entryType,
      source: input.source,
      provider: input.provider ?? null,
      creditDelta: new Prisma.Decimal(input.creditDelta),
      usdAmountCents: input.usdAmountCents,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      externalReference: input.externalReference ?? null,
      reportedToStripeAt: input.reportedToStripeAt ?? null,
    },
  })
}

export async function createCreditLedgerEntries(inputs: CreditLedgerEntryInput[]) {
  for (const input of inputs) {
    await createCreditLedgerEntry(input)
  }
}

export async function grantIncludedCreditsForPeriod(input: {
  tenantId: string
  planSlug: PlanSlug
  subscriptionId: string
  periodStart: Date
  periodEnd: Date
}) {
  const plan = getBillingPlan(input.planSlug)
  const externalReference = `subscription_grant:${input.subscriptionId}:${input.periodStart.toISOString()}:${input.periodEnd.toISOString()}`
  const existing = await prisma.fulcrumCreditLedger.findFirst({
    where: {
      tenantId: input.tenantId,
      externalReference,
    },
    select: { id: true },
  })

  if (existing) return existing

  return createCreditLedgerEntry({
    tenantId: input.tenantId,
    entryType: 'grant',
    source: 'subscription_grant',
    provider: 'system',
    creditDelta: plan.includedCredits,
    usdAmountCents: 0,
    metadata: {
      planSlug: input.planSlug,
      periodStart: input.periodStart.toISOString(),
      periodEnd: input.periodEnd.toISOString(),
      subscriptionId: input.subscriptionId,
    },
    externalReference,
  })
}

export async function getTenantCreditBalance(tenantId: string) {
  const aggregate = await prisma.fulcrumCreditLedger.aggregate({
    where: { tenantId },
    _sum: { creditDelta: true },
  })

  return Number(aggregate._sum.creditDelta ?? 0)
}

export async function getLeadLedgerSpend(tenantId: string, leadId: string) {
  const entries = await prisma.fulcrumCreditLedger.findMany({
    where: {
      tenantId,
      entryType: 'usage',
    },
  })

  return entries.reduce(
    (acc, entry) => {
      const metadata = (entry.metadata ?? {}) as Record<string, unknown>
      if (metadata.leadId !== leadId) return acc

      return {
        usdAmountCents: acc.usdAmountCents + entry.usdAmountCents,
        credits: acc.credits + Math.abs(Number(entry.creditDelta)),
      }
    },
    { usdAmountCents: 0, credits: 0 },
  )
}
