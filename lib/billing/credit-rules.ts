const DISCOVERY_PROFILE_USD_CENTS = Number(process.env.BILLING_DISCOVERY_PROFILE_USD_CENTS ?? '25')
const ENRICHMENT_INPUT_TOKEN_USD_CENTS = Number(process.env.BILLING_ENRICHMENT_INPUT_TOKEN_USD_CENTS ?? '0.002')
const ENRICHMENT_OUTPUT_TOKEN_USD_CENTS = Number(process.env.BILLING_ENRICHMENT_OUTPUT_TOKEN_USD_CENTS ?? '0.01')
const FIRST_LINE_INPUT_TOKEN_USD_CENTS = Number(process.env.BILLING_FIRST_LINE_INPUT_TOKEN_USD_CENTS ?? '0.001')
const FIRST_LINE_OUTPUT_TOKEN_USD_CENTS = Number(process.env.BILLING_FIRST_LINE_OUTPUT_TOKEN_USD_CENTS ?? '0.008')

function normalizeProviderCostUsdCents(rawUsdAmountCents: number) {
  return Math.max(0, Math.round(rawUsdAmountCents))
}

export function getDiscoveryUsageCharge() {
  const usdAmountCents = normalizeProviderCostUsdCents(DISCOVERY_PROFILE_USD_CENTS)

  return {
    credits: usdAmountCents,
    usdAmountCents,
  }
}

export function getEnrichmentUsageCharge(usage: { inputTokens: number; outputTokens: number }) {
  const usdAmountCents = normalizeProviderCostUsdCents(
    usage.inputTokens * ENRICHMENT_INPUT_TOKEN_USD_CENTS +
    usage.outputTokens * ENRICHMENT_OUTPUT_TOKEN_USD_CENTS
  )

  return {
    credits: usdAmountCents,
    usdAmountCents,
  }
}

export function getFirstLineUsageCharge(usage: { inputTokens: number; outputTokens: number }) {
  const usdAmountCents = normalizeProviderCostUsdCents(
    usage.inputTokens * FIRST_LINE_INPUT_TOKEN_USD_CENTS +
    usage.outputTokens * FIRST_LINE_OUTPUT_TOKEN_USD_CENTS
  )

  return {
    credits: usdAmountCents,
    usdAmountCents,
  }
}
