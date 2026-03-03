import { Prisma, type PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/db'

export type SettingsDbClient = PrismaClient | Prisma.TransactionClient
export type MeteredProvider = 'anthropic' | 'perplexity'
export type UsageProvider = MeteredProvider | 'instantly' | 'apify'
export type ProviderPriceOperationType = 'input_token' | 'output_token' | 'search_request'
export type ProviderPricingSource =
  | 'official_default'
  | 'admin_override'
  | 'provider_response'
  | 'subscription_priced_deferred'
  | 'tenant_owned'

export interface ProviderPriceLookupResult {
  provider: MeteredProvider
  model: string | null
  operationType: ProviderPriceOperationType
  usdMicrosPerUnit: string
  source: 'official_default' | 'admin_override'
  effectiveFrom: Date
}

interface OfficialPricingDefault extends ProviderPriceLookupResult {
  notes: string
}

export const OFFICIAL_PROVIDER_PRICING_DEFAULTS: OfficialPricingDefault[] = [
  {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    operationType: 'input_token',
    usdMicrosPerUnit: '3',
    source: 'official_default',
    effectiveFrom: new Date('2026-03-03T00:00:00.000Z'),
    notes: 'Anthropic Claude Sonnet 4 input tokens: $3 / 1M tokens.',
  },
  {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    operationType: 'output_token',
    usdMicrosPerUnit: '15',
    source: 'official_default',
    effectiveFrom: new Date('2026-03-03T00:00:00.000Z'),
    notes: 'Anthropic Claude Sonnet 4 output tokens: $15 / 1M tokens.',
  },
  {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    operationType: 'input_token',
    usdMicrosPerUnit: '1',
    source: 'official_default',
    effectiveFrom: new Date('2026-03-03T00:00:00.000Z'),
    notes: 'Anthropic Claude Haiku 4.5 input tokens: $1 / 1M tokens.',
  },
  {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    operationType: 'output_token',
    usdMicrosPerUnit: '5',
    source: 'official_default',
    effectiveFrom: new Date('2026-03-03T00:00:00.000Z'),
    notes: 'Anthropic Claude Haiku 4.5 output tokens: $5 / 1M tokens.',
  },
  {
    provider: 'perplexity',
    model: 'sonar',
    operationType: 'input_token',
    usdMicrosPerUnit: '1',
    source: 'official_default',
    effectiveFrom: new Date('2026-03-03T00:00:00.000Z'),
    notes: 'Perplexity Sonar input tokens: $1 / 1M tokens.',
  },
  {
    provider: 'perplexity',
    model: 'sonar',
    operationType: 'output_token',
    usdMicrosPerUnit: '1',
    source: 'official_default',
    effectiveFrom: new Date('2026-03-03T00:00:00.000Z'),
    notes: 'Perplexity Sonar output tokens: $1 / 1M tokens.',
  },
  {
    provider: 'perplexity',
    model: 'sonar',
    operationType: 'search_request',
    usdMicrosPerUnit: '1000',
    source: 'official_default',
    effectiveFrom: new Date('2026-03-03T00:00:00.000Z'),
    notes: 'Perplexity Sonar search requests: $1 / 1K searches when provider response cost is unavailable.',
  },
]

function selectBestPrice<T extends { model: string | null; effectiveFrom: Date }>(rows: T[], model: string | null) {
  const exact = rows.find((row) => row.model === model)
  if (exact) return exact
  const generic = rows.find((row) => row.model === null)
  if (generic) return generic
  return null
}

function getOfficialDefault(
  provider: MeteredProvider,
  operationType: ProviderPriceOperationType,
  model: string | null,
): ProviderPriceLookupResult {
  const matches = OFFICIAL_PROVIDER_PRICING_DEFAULTS.filter(
    (row) => row.provider === provider && row.operationType === operationType,
  )
  const selected = selectBestPrice(matches, model)
  if (!selected) {
    throw new Error(`No official default pricing found for ${provider}:${model ?? 'default'}:${operationType}`)
  }

  return {
    provider: selected.provider,
    model: selected.model,
    operationType: selected.operationType,
    usdMicrosPerUnit: selected.usdMicrosPerUnit,
    source: selected.source,
    effectiveFrom: selected.effectiveFrom,
  }
}

export async function getProviderPriceLookup(
  provider: MeteredProvider,
  operationType: ProviderPriceOperationType,
  model: string | null,
  db: SettingsDbClient = prisma,
): Promise<ProviderPriceLookupResult> {
  const now = new Date()
  const rows = await db.providerPricingConfig.findMany({
    where: {
      provider,
      operationType,
      isActive: true,
      effectiveFrom: { lte: now },
      AND: [
        {
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gt: now } },
          ],
        },
        {
          OR: [
            { model },
            { model: null },
          ],
        },
      ],
    },
    orderBy: [{ effectiveFrom: 'desc' }],
    select: {
      provider: true,
      model: true,
      operationType: true,
      usdMicrosPerUnit: true,
      source: true,
      effectiveFrom: true,
    },
  })

  const selected = selectBestPrice(rows, model)
  if (selected) {
    return {
      provider: selected.provider as MeteredProvider,
      model: selected.model,
      operationType: selected.operationType as ProviderPriceOperationType,
      usdMicrosPerUnit: selected.usdMicrosPerUnit.toString(),
      source: selected.source === 'admin_override' ? 'admin_override' : 'official_default',
      effectiveFrom: selected.effectiveFrom,
    }
  }

  return getOfficialDefault(provider, operationType, model)
}

function multiplyUnits(units: number, usdMicrosPerUnit: string) {
  return new Prisma.Decimal(units)
    .mul(usdMicrosPerUnit)
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
}

export async function calculateAnthropicCostUsdMicros(
  model: string,
  usage: { inputTokens: number; outputTokens: number },
  db: SettingsDbClient = prisma,
): Promise<{
  providerCostUsdMicros: number
  pricingSource: 'official_default' | 'admin_override'
}> {
  const [inputRate, outputRate] = await Promise.all([
    getProviderPriceLookup('anthropic', 'input_token', model, db),
    getProviderPriceLookup('anthropic', 'output_token', model, db),
  ])

  const total = multiplyUnits(usage.inputTokens, inputRate.usdMicrosPerUnit)
    .add(multiplyUnits(usage.outputTokens, outputRate.usdMicrosPerUnit))
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)

  return {
    providerCostUsdMicros: Number(total),
    pricingSource: inputRate.source === 'admin_override' || outputRate.source === 'admin_override'
      ? 'admin_override'
      : 'official_default' as const,
  }
}

export async function calculatePerplexityCostUsdMicros(input: {
  model: string
  usage: { inputTokens: number; outputTokens: number; searchQueries: number }
  directCostUsdMicros: number | null
}, db: SettingsDbClient = prisma): Promise<{
  providerCostUsdMicros: number
  pricingSource: 'provider_response' | 'official_default' | 'admin_override'
}> {
  if (typeof input.directCostUsdMicros === 'number') {
    return {
      providerCostUsdMicros: Math.max(0, Math.round(input.directCostUsdMicros)),
      pricingSource: 'provider_response' as const,
    }
  }

  const [searchRate, inputRate, outputRate] = await Promise.all([
    getProviderPriceLookup('perplexity', 'search_request', input.model, db),
    getProviderPriceLookup('perplexity', 'input_token', input.model, db),
    getProviderPriceLookup('perplexity', 'output_token', input.model, db),
  ])

  const total = multiplyUnits(input.usage.searchQueries, searchRate.usdMicrosPerUnit)
    .add(multiplyUnits(input.usage.inputTokens, inputRate.usdMicrosPerUnit))
    .add(multiplyUnits(input.usage.outputTokens, outputRate.usdMicrosPerUnit))
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)

  const source = [searchRate.source, inputRate.source, outputRate.source].includes('admin_override')
    ? 'admin_override'
    : 'official_default'

  return {
    providerCostUsdMicros: Number(total),
    pricingSource: source as 'official_default' | 'admin_override',
  }
}

export async function seedProviderPricingCatalog(db: SettingsDbClient = prisma) {
  let created = 0

  for (const row of OFFICIAL_PROVIDER_PRICING_DEFAULTS) {
    const existing = await db.providerPricingConfig.findFirst({
      where: {
        provider: row.provider,
        model: row.model,
        operationType: row.operationType,
        source: row.source,
        effectiveFrom: row.effectiveFrom,
      },
      select: { id: true },
    })

    if (existing) continue

    await db.providerPricingConfig.create({
      data: {
        provider: row.provider,
        model: row.model,
        operationType: row.operationType,
        usdMicrosPerUnit: new Prisma.Decimal(row.usdMicrosPerUnit),
        source: row.source,
        effectiveFrom: row.effectiveFrom,
        notes: row.notes,
      },
    })
    created += 1
  }

  return { created, totalDefaults: OFFICIAL_PROVIDER_PRICING_DEFAULTS.length }
}
