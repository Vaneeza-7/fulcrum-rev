import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getBillingPlan, type PlanSlug } from './plans'
import { formatCredits } from './credit-rules'

export type CreditEntryType = 'grant' | 'usage' | 'adjustment' | 'refund'
export type CreditSource =
  | 'subscription_grant'
  | 'manual_plan_grant'
  | 'discovery'
  | 'enrichment'
  | 'first_line'
  | 'manual_adjustment'
  | 'refund'
  | 'onboarding'
  | 'pipeline'
  | 'seo'
  | 'cro'
  | 'diagnostics'
  | 'huck'

export interface CreditLedgerEntryInput {
  tenantId: string
  entryType: CreditEntryType
  source: CreditSource | string
  provider?: 'instantly' | 'apify' | 'anthropic' | 'perplexity' | 'system'
  creditDelta: number | Prisma.Decimal
  usdAmountCents: number
  providerCostUsdMicros?: number
  customerBillableUsdMicros?: number
  pricingUnitVersion?: number
  metadata?: Record<string, unknown>
  externalReference?: string
  reportedToStripeAt?: Date | null
  usageEventId?: string | null
}

function toJsonValue(value: Record<string, unknown> | undefined) {
  return (value ?? {}) as Prisma.InputJsonValue
}

export async function createCreditLedgerEntry(input: CreditLedgerEntryInput) {
  return prisma.fulcrumCreditLedger.create({
    data: {
      tenantId: input.tenantId,
      entryType: input.entryType,
      source: input.source,
      provider: input.provider ?? null,
      creditDelta:
        input.creditDelta instanceof Prisma.Decimal
          ? input.creditDelta
          : new Prisma.Decimal(input.creditDelta),
      usdAmountCents: input.usdAmountCents,
      providerCostUsdMicros: input.providerCostUsdMicros ?? 0,
      customerBillableUsdMicros: input.customerBillableUsdMicros ?? 0,
      pricingUnitVersion: input.pricingUnitVersion ?? 2,
      metadata: toJsonValue(input.metadata),
      externalReference: input.externalReference ?? null,
      reportedToStripeAt: input.reportedToStripeAt ?? null,
      usageEventId: input.usageEventId ?? null,
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
  source: 'subscription_grant' | 'manual_plan_grant'
  externalReference: string
  periodStart: Date
  periodEnd: Date
  metadata?: Record<string, unknown>
}) {
  const plan = getBillingPlan(input.planSlug)
  const existing = await prisma.fulcrumCreditLedger.findFirst({
    where: {
      tenantId: input.tenantId,
      externalReference: input.externalReference,
    },
    select: { id: true },
  })

  if (existing) return existing

  return createCreditLedgerEntry({
    tenantId: input.tenantId,
    entryType: 'grant',
    source: input.source,
    provider: 'system',
    creditDelta: new Prisma.Decimal(plan.includedCredits),
    usdAmountCents: 0,
    providerCostUsdMicros: 0,
    customerBillableUsdMicros: 0,
    pricingUnitVersion: 2,
    metadata: {
      planSlug: input.planSlug,
      periodStart: input.periodStart.toISOString(),
      periodEnd: input.periodEnd.toISOString(),
      ...(input.metadata ?? {}),
    },
    externalReference: input.externalReference,
  })
}

export async function getTenantCreditBalance(tenantId: string) {
  const aggregate = await prisma.fulcrumCreditLedger.aggregate({
    where: { tenantId, pricingUnitVersion: 2 },
    _sum: { creditDelta: true },
  })

  return Number(aggregate._sum.creditDelta ?? 0)
}

export async function getLeadLedgerSpend(tenantId: string, leadId: string) {
  const entries = await prisma.fulcrumCreditLedger.findMany({
    where: {
      tenantId,
      entryType: 'usage',
      pricingUnitVersion: 2,
      usageEvent: {
        is: { leadId },
      },
    },
    select: {
      creditDelta: true,
      providerCostUsdMicros: true,
      customerBillableUsdMicros: true,
    },
  })

  return entries.reduce(
    (acc, entry) => {
      acc.providerCostUsdMicros += entry.providerCostUsdMicros
      acc.customerBillableUsdMicros += entry.customerBillableUsdMicros
      acc.credits += Math.abs(Number(entry.creditDelta))
      return acc
    },
    { providerCostUsdMicros: 0, customerBillableUsdMicros: 0, credits: 0 },
  )
}

export async function getTenantLedgerSnapshot(tenantId: string) {
  const entries = await prisma.fulcrumCreditLedger.findMany({
    where: { tenantId, pricingUnitVersion: 2 },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return entries.map((entry) => ({
    ...entry,
    creditDeltaDisplay: formatCredits(entry.creditDelta),
  }))
}
