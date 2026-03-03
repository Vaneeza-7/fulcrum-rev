import { Prisma } from '@prisma/client'
import { env } from '@/lib/config'

export const CREDIT_UNIT_USD_MICROS = 1_000
export const DEFAULT_TARGET_MARKUP_MULTIPLIER = 3

function readNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function getTargetMarkupMultiplier() {
  return readNumber(env.BILLING_TARGET_MARKUP_MULTIPLIER, DEFAULT_TARGET_MARKUP_MULTIPLIER)
}

export function creditsFromProviderCostUsdMicros(providerCostUsdMicros: number) {
  return new Prisma.Decimal(providerCostUsdMicros)
    .div(CREDIT_UNIT_USD_MICROS)
    .toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP)
}

export function billableUsdMicrosFromProviderCost(providerCostUsdMicros: number) {
  return Number(
    new Prisma.Decimal(providerCostUsdMicros)
      .mul(getTargetMarkupMultiplier())
      .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP),
  )
}

export function decimalCreditsToNumber(value: Prisma.Decimal | number | string | null | undefined) {
  return Number(value ?? 0)
}

export function formatCredits(value: Prisma.Decimal | number | string | null | undefined) {
  return decimalCreditsToNumber(value).toFixed(3)
}

export function formatUsdMicros(value: number) {
  return (value / 1_000_000).toFixed(6)
}

export function usdMicrosToUsdNumber(value: number) {
  return value / 1_000_000
}

export function getCreditUnitUsdDisplay() {
  return formatUsdMicros(CREDIT_UNIT_USD_MICROS)
}

export function getTargetMarkupMultiplierDisplay() {
  return getTargetMarkupMultiplier().toFixed(3)
}
