import { prisma } from '@/lib/db'
import { getDiscoveryUsageCharge, getEnrichmentUsageCharge, getFirstLineUsageCharge } from './credit-rules'
import { createCreditLedgerEntry } from './ledger'
import { getTenantBillingSummary } from './summary'
import { isPlanSlug } from './plans'
import { reportStripeUsage } from './stripe'

export async function recordDiscoveryLeadUsage(input: {
  tenantId: string
  leadId: string
  provider: 'instantly' | 'apify'
  tenantOwnedCredentialUsed: boolean
  queryName?: string
}) {
  if (input.tenantOwnedCredentialUsed) return null

  const charge = getDiscoveryUsageCharge()
  return createCreditLedgerEntry({
    tenantId: input.tenantId,
    entryType: 'usage',
    source: 'discovery',
    provider: input.provider,
    creditDelta: charge.credits * -1,
    usdAmountCents: charge.usdAmountCents,
    metadata: {
      leadId: input.leadId,
      queryName: input.queryName ?? null,
      stage: 'discovery',
      provider: input.provider,
      tenantOwnedCredentialUsed: false,
    },
  })
}

export async function recordEnrichmentUsage(input: {
  tenantId: string
  leadId: string
  usage: { inputTokens: number; outputTokens: number }
  model: string
  tenantOwnedCredentialUsed: boolean
}) {
  if (input.tenantOwnedCredentialUsed) return null

  const charge = getEnrichmentUsageCharge(input.usage)
  return createCreditLedgerEntry({
    tenantId: input.tenantId,
    entryType: 'usage',
    source: 'enrichment',
    provider: 'anthropic',
    creditDelta: charge.credits * -1,
    usdAmountCents: charge.usdAmountCents,
    metadata: {
      leadId: input.leadId,
      stage: 'enrichment',
      model: input.model,
      provider: 'anthropic',
      tenantOwnedCredentialUsed: false,
      usage: input.usage,
    },
  })
}

export async function recordFirstLineUsage(input: {
  tenantId: string
  leadId: string
  usage: { inputTokens: number; outputTokens: number }
  model: string
  tenantOwnedCredentialUsed: boolean
}) {
  if (input.tenantOwnedCredentialUsed) return null

  const charge = getFirstLineUsageCharge(input.usage)
  return createCreditLedgerEntry({
    tenantId: input.tenantId,
    entryType: 'usage',
    source: 'first_line',
    provider: 'anthropic',
    creditDelta: charge.credits * -1,
    usdAmountCents: charge.usdAmountCents,
    metadata: {
      leadId: input.leadId,
      stage: 'first_line',
      model: input.model,
      provider: 'anthropic',
      tenantOwnedCredentialUsed: false,
      usage: input.usage,
    },
  })
}

export async function syncStripeOverageUsageForAllTenants() {
  const accounts = await prisma.tenantBillingAccount.findMany({
    where: {
      stripeSubscriptionId: { not: null },
      stripeOverageSubscriptionItemId: { not: null },
      subscriptionStatus: { in: ['active', 'trialing', 'past_due'] },
    },
  })

  const results: Array<{ tenantId: string; reportedCredits: number }> = []

  for (const account of accounts) {
    if (!account.planSlug || !isPlanSlug(account.planSlug)) continue

    const summary = await getTenantBillingSummary(account.tenantId)
    const deltaOverage = summary.billing.overageCredits - Number(account.reportedOverageCredits)
    if (deltaOverage <= 0) continue

    await reportStripeUsage({
      subscriptionItemId: account.stripeOverageSubscriptionItemId!,
      quantity: deltaOverage,
      timestamp: Math.floor(Date.now() / 1000),
      idempotencyKey: `usage:${account.tenantId}:${account.currentPeriodStart?.toISOString() ?? 'none'}:${summary.billing.overageCredits}`,
    })

    await prisma.tenantBillingAccount.update({
      where: { id: account.id },
      data: {
        reportedOverageCredits: summary.billing.overageCredits,
      },
    })

    await prisma.fulcrumCreditLedger.updateMany({
      where: {
        tenantId: account.tenantId,
        entryType: 'usage',
        reportedToStripeAt: null,
      },
      data: {
        reportedToStripeAt: new Date(),
      },
    })

    results.push({ tenantId: account.tenantId, reportedCredits: deltaOverage })
  }

  return results
}
