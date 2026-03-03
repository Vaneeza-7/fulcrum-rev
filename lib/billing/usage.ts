import { rolloverManualBillingPeriods } from './manual-plans'
import {
  recordAnthropicUsage,
  recordPerplexityUsage,
  recordUnpricedProviderActivity,
  type BillableUsageContext,
} from './provider-usage'

export async function recordDiscoveryLeadUsage(input: {
  tenantId: string
  leadId: string
  provider: 'instantly' | 'apify'
  tenantOwnedCredentialUsed: boolean
  queryName?: string
}) {
  return recordUnpricedProviderActivity({
    tenantId: input.tenantId,
    leadId: input.leadId,
    provider: input.provider,
    stage: 'discovery',
    requestCount: 1,
    tenantOwnedCredentialUsed: input.tenantOwnedCredentialUsed,
    metadata: {
      queryName: input.queryName ?? null,
      provider: input.provider,
      tenantOwnedCredentialUsed: input.tenantOwnedCredentialUsed,
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
  const context: BillableUsageContext = {
    tenantId: input.tenantId,
    provider: 'anthropic',
    feature: 'pipeline',
    stage: 'pipeline.enrichment.analysis',
    leadId: input.leadId,
  }

  return recordAnthropicUsage({
    context,
    model: input.model,
    inputTokens: input.usage.inputTokens,
    outputTokens: input.usage.outputTokens,
    tenantOwnedCredentialUsed: input.tenantOwnedCredentialUsed,
  })
}

export async function recordSignalDetectionUsage(input: {
  tenantId: string
  leadId: string
  usage: { inputTokens: number; outputTokens: number }
  model: string
  tenantOwnedCredentialUsed: boolean
}) {
  const context: BillableUsageContext = {
    tenantId: input.tenantId,
    provider: 'anthropic',
    feature: 'pipeline',
    stage: 'pipeline.signal_detection',
    leadId: input.leadId,
  }

  return recordAnthropicUsage({
    context,
    model: input.model,
    inputTokens: input.usage.inputTokens,
    outputTokens: input.usage.outputTokens,
    tenantOwnedCredentialUsed: input.tenantOwnedCredentialUsed,
  })
}

export async function recordPerplexityResearchUsage(input: {
  tenantId: string
  leadId: string
  usage: { inputTokens: number; outputTokens: number; searchQueries: number }
  model: string
  directCostUsdMicros: number | null
  tenantOwnedCredentialUsed: boolean
}) {
  const context: BillableUsageContext = {
    tenantId: input.tenantId,
    provider: 'perplexity',
    feature: 'pipeline',
    stage: 'pipeline.enrichment.research',
    leadId: input.leadId,
  }

  return recordPerplexityUsage({
    context,
    model: input.model,
    requestCount: input.usage.searchQueries,
    inputTokens: input.usage.inputTokens,
    outputTokens: input.usage.outputTokens,
    searchQueries: input.usage.searchQueries,
    directCostUsdMicros: input.directCostUsdMicros,
    tenantOwnedCredentialUsed: input.tenantOwnedCredentialUsed,
  })
}

export async function recordFirstLineUsage(input: {
  tenantId: string
  leadId: string
  usage: { inputTokens: number; outputTokens: number }
  model: string
  tenantOwnedCredentialUsed: boolean
}) {
  const context: BillableUsageContext = {
    tenantId: input.tenantId,
    provider: 'anthropic',
    feature: 'pipeline',
    stage: 'pipeline.first_line',
    leadId: input.leadId,
  }

  return recordAnthropicUsage({
    context,
    model: input.model,
    inputTokens: input.usage.inputTokens,
    outputTokens: input.usage.outputTokens,
    tenantOwnedCredentialUsed: input.tenantOwnedCredentialUsed,
  })
}

export async function syncBillingPeriodsForAllTenants() {
  const results = await rolloverManualBillingPeriods()
  return results.map((result) => ({
    tenantId: result.tenantId,
    grantsCreated: result.grantsCreated,
    periodStart: result.periodStart?.toISOString() ?? null,
    periodEnd: result.periodEnd?.toISOString() ?? null,
  }))
}
