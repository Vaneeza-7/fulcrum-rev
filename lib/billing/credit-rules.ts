const DISCOVERY_PROFILE_CREDITS = Number(process.env.BILLING_DISCOVERY_PROFILE_CREDITS ?? '1')
const ENRICHMENT_CALL_CREDITS = Number(process.env.BILLING_ENRICHMENT_CALL_CREDITS ?? '0.35')
const FIRST_LINE_CALL_CREDITS = Number(process.env.BILLING_FIRST_LINE_CALL_CREDITS ?? '0.15')

const DISCOVERY_PROFILE_USD_CENTS = Number(process.env.BILLING_DISCOVERY_PROFILE_USD_CENTS ?? '25')
const ENRICHMENT_INPUT_TOKEN_USD_CENTS = Number(process.env.BILLING_ENRICHMENT_INPUT_TOKEN_USD_CENTS ?? '0.002')
const ENRICHMENT_OUTPUT_TOKEN_USD_CENTS = Number(process.env.BILLING_ENRICHMENT_OUTPUT_TOKEN_USD_CENTS ?? '0.01')
const FIRST_LINE_INPUT_TOKEN_USD_CENTS = Number(process.env.BILLING_FIRST_LINE_INPUT_TOKEN_USD_CENTS ?? '0.001')
const FIRST_LINE_OUTPUT_TOKEN_USD_CENTS = Number(process.env.BILLING_FIRST_LINE_OUTPUT_TOKEN_USD_CENTS ?? '0.008')

export function getDiscoveryUsageCharge() {
  return {
    credits: DISCOVERY_PROFILE_CREDITS,
    usdAmountCents: Math.round(DISCOVERY_PROFILE_USD_CENTS),
  }
}

export function getEnrichmentUsageCharge(usage: { inputTokens: number; outputTokens: number }) {
  const usdAmountCents =
    usage.inputTokens * ENRICHMENT_INPUT_TOKEN_USD_CENTS +
    usage.outputTokens * ENRICHMENT_OUTPUT_TOKEN_USD_CENTS

  return {
    credits: ENRICHMENT_CALL_CREDITS,
    usdAmountCents: Math.max(0, Math.round(usdAmountCents)),
  }
}

export function getFirstLineUsageCharge(usage: { inputTokens: number; outputTokens: number }) {
  const usdAmountCents =
    usage.inputTokens * FIRST_LINE_INPUT_TOKEN_USD_CENTS +
    usage.outputTokens * FIRST_LINE_OUTPUT_TOKEN_USD_CENTS

  return {
    credits: FIRST_LINE_CALL_CREDITS,
    usdAmountCents: Math.max(0, Math.round(usdAmountCents)),
  }
}
