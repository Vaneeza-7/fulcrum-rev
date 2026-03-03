import { Prisma, type PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  billableUsdMicrosFromProviderCost,
  creditsFromProviderCostUsdMicros,
} from './credit-rules'
import {
  calculateAnthropicCostUsdMicros,
  calculatePerplexityCostUsdMicros,
  type ProviderPricingSource,
  type SettingsDbClient,
  type UsageProvider,
} from './provider-pricing'

export interface BillableUsageContext {
  tenantId: string
  provider: 'anthropic' | 'perplexity'
  feature: 'onboarding' | 'pipeline' | 'seo' | 'cro' | 'diagnostics' | 'huck'
  stage:
    | 'onboarding.generate_config'
    | 'pipeline.signal_detection'
    | 'pipeline.enrichment.research'
    | 'pipeline.enrichment.analysis'
    | 'pipeline.first_line'
    | 'seo.refresh_brief'
    | 'seo.recommendation'
    | 'cro.page_analysis'
    | 'cro.ab_hypothesis'
    | 'diagnostics.reengagement'
    | 'huck.daily_summary'
    | 'huck.weekly_digest'
    | 'huck.system_alert'
  leadId?: string
  metadata?: Record<string, unknown>
}

interface BaseUsageEventInput {
  tenantId: string
  provider: UsageProvider
  feature: string
  stage: string
  leadId?: string
  model?: string | null
  requestCount?: number
  inputTokens?: number
  outputTokens?: number
  providerCostUsdMicros?: number
  pricingSource: ProviderPricingSource
  tenantOwnedCredentialUsed?: boolean
  externalRequestId?: string | null
  metadata?: Record<string, unknown>
}

interface MeteredUsageInput {
  context: BillableUsageContext
  model: string
  requestCount?: number
  inputTokens: number
  outputTokens: number
  tenantOwnedCredentialUsed: boolean
  externalRequestId?: string | null
  metadata?: Record<string, unknown>
}

function toJsonValue(value: Record<string, unknown> | undefined) {
  return (value ?? {}) as Prisma.InputJsonValue
}

function sourceFromFeature(feature: string) {
  return feature
}

async function createUsageEvent(input: BaseUsageEventInput, db: SettingsDbClient = prisma) {
  return db.providerUsageEvent.create({
    data: {
      tenantId: input.tenantId,
      leadId: input.leadId ?? null,
      provider: input.provider,
      model: input.model ?? null,
      feature: input.feature,
      stage: input.stage,
      requestCount: input.requestCount ?? 1,
      inputTokens: input.inputTokens ?? 0,
      outputTokens: input.outputTokens ?? 0,
      providerCostUsdMicros: input.providerCostUsdMicros ?? 0,
      pricingSource: input.pricingSource,
      tenantOwnedCredentialUsed: input.tenantOwnedCredentialUsed ?? false,
      externalRequestId: input.externalRequestId ?? null,
      metadata: toJsonValue(input.metadata),
    },
  })
}

async function createBillableLedgerEntry(input: {
  tenantId: string
  source: string
  provider: 'anthropic' | 'perplexity'
  providerCostUsdMicros: number
  usageEventId: string
  metadata?: Record<string, unknown>
}, db: SettingsDbClient = prisma) {
  const customerBillableUsdMicros = billableUsdMicrosFromProviderCost(input.providerCostUsdMicros)

  return db.fulcrumCreditLedger.create({
    data: {
      tenantId: input.tenantId,
      entryType: 'usage',
      source: input.source,
      provider: input.provider,
      creditDelta: creditsFromProviderCostUsdMicros(input.providerCostUsdMicros).mul(-1),
      usdAmountCents: Math.round(input.providerCostUsdMicros / 10_000),
      providerCostUsdMicros: input.providerCostUsdMicros,
      customerBillableUsdMicros,
      pricingUnitVersion: 2,
      usageEventId: input.usageEventId,
      metadata: toJsonValue(input.metadata),
    },
  })
}

export async function recordAnthropicUsage(
  input: MeteredUsageInput,
  db: SettingsDbClient = prisma,
) {
  if (input.tenantOwnedCredentialUsed) {
    return createUsageEvent(
      {
        tenantId: input.context.tenantId,
        leadId: input.context.leadId,
        provider: 'anthropic',
        feature: input.context.feature,
        stage: input.context.stage,
        model: input.model,
        requestCount: input.requestCount ?? 1,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        providerCostUsdMicros: 0,
        pricingSource: 'tenant_owned',
        tenantOwnedCredentialUsed: true,
        externalRequestId: input.externalRequestId,
        metadata: { ...input.context.metadata, ...input.metadata },
      },
      db,
    )
  }

  const pricing = await calculateAnthropicCostUsdMicros(
    input.model,
    { inputTokens: input.inputTokens, outputTokens: input.outputTokens },
    db,
  )

  const usageEvent = await createUsageEvent(
    {
      tenantId: input.context.tenantId,
      leadId: input.context.leadId,
      provider: 'anthropic',
      feature: input.context.feature,
      stage: input.context.stage,
      model: input.model,
      requestCount: input.requestCount ?? 1,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      providerCostUsdMicros: pricing.providerCostUsdMicros,
      pricingSource: pricing.pricingSource,
      tenantOwnedCredentialUsed: false,
      externalRequestId: input.externalRequestId,
      metadata: { ...input.context.metadata, ...input.metadata },
    },
    db,
  )

  const ledgerEntry = await createBillableLedgerEntry(
    {
      tenantId: input.context.tenantId,
      source: sourceFromFeature(input.context.feature),
      provider: 'anthropic',
      providerCostUsdMicros: pricing.providerCostUsdMicros,
      usageEventId: usageEvent.id,
      metadata: {
        ...input.context.metadata,
        ...input.metadata,
        stage: input.context.stage,
        model: input.model,
        provider: 'anthropic',
        leadId: input.context.leadId ?? null,
        usage: {
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
          requestCount: input.requestCount ?? 1,
        },
        tenantOwnedCredentialUsed: false,
      },
    },
    db,
  )

  return { usageEvent, ledgerEntry }
}

export async function recordPerplexityUsage(
  input: MeteredUsageInput & { searchQueries: number; directCostUsdMicros: number | null },
  db: SettingsDbClient = prisma,
) {
  if (input.tenantOwnedCredentialUsed) {
    return createUsageEvent(
      {
        tenantId: input.context.tenantId,
        leadId: input.context.leadId,
        provider: 'perplexity',
        feature: input.context.feature,
        stage: input.context.stage,
        model: input.model,
        requestCount: input.requestCount ?? input.searchQueries,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        providerCostUsdMicros: 0,
        pricingSource: 'tenant_owned',
        tenantOwnedCredentialUsed: true,
        externalRequestId: input.externalRequestId,
        metadata: {
          ...input.context.metadata,
          ...input.metadata,
          searchQueries: input.searchQueries,
        },
      },
      db,
    )
  }

  const pricing = await calculatePerplexityCostUsdMicros(
    {
      model: input.model,
      usage: {
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        searchQueries: input.searchQueries,
      },
      directCostUsdMicros: input.directCostUsdMicros,
    },
    db,
  )

  const usageEvent = await createUsageEvent(
    {
      tenantId: input.context.tenantId,
      leadId: input.context.leadId,
      provider: 'perplexity',
      feature: input.context.feature,
      stage: input.context.stage,
      model: input.model,
      requestCount: input.requestCount ?? input.searchQueries,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      providerCostUsdMicros: pricing.providerCostUsdMicros,
      pricingSource: pricing.pricingSource,
      tenantOwnedCredentialUsed: false,
      externalRequestId: input.externalRequestId,
      metadata: {
        ...input.context.metadata,
        ...input.metadata,
        searchQueries: input.searchQueries,
      },
    },
    db,
  )

  const ledgerEntry = await createBillableLedgerEntry(
    {
      tenantId: input.context.tenantId,
      source: sourceFromFeature(input.context.feature),
      provider: 'perplexity',
      providerCostUsdMicros: pricing.providerCostUsdMicros,
      usageEventId: usageEvent.id,
      metadata: {
        ...input.context.metadata,
        ...input.metadata,
        stage: input.context.stage,
        model: input.model,
        provider: 'perplexity',
        leadId: input.context.leadId ?? null,
        usage: {
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
          requestCount: input.requestCount ?? input.searchQueries,
          searchQueries: input.searchQueries,
        },
        tenantOwnedCredentialUsed: false,
      },
    },
    db,
  )

  return { usageEvent, ledgerEntry }
}

export async function recordUnpricedProviderActivity(input: {
  tenantId: string
  provider: 'instantly' | 'apify'
  stage: 'discovery'
  leadId?: string
  requestCount?: number
  tenantOwnedCredentialUsed?: boolean
  metadata?: Record<string, unknown>
}, db: SettingsDbClient = prisma) {
  return createUsageEvent(
    {
      tenantId: input.tenantId,
      leadId: input.leadId,
      provider: input.provider,
      feature: 'pipeline',
      stage: input.stage,
      requestCount: input.requestCount ?? 1,
      providerCostUsdMicros: 0,
      pricingSource: 'subscription_priced_deferred',
      tenantOwnedCredentialUsed: input.tenantOwnedCredentialUsed ?? false,
      metadata: input.metadata,
    },
    db,
  )
}
