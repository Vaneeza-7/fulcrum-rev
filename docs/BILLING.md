# Billing

## Overview

Fulcrum now runs an exact-cost billing engine before Stripe activation.

Primary models:

- `TenantBillingAccount`
- `ProviderPricingConfig`
- `ProviderUsageEvent`
- `FulcrumCreditLedger`
- `StripeWebhookEvent`

## What Is Billable Now

Exact-cost billing currently applies only to metered providers:

- `Anthropic`
- `Perplexity`

These providers are tracked but not billed yet because they are subscription-priced and not on exact allocation rules:

- `Instantly`
- `Apify`

Unpriced provider activity still appears in billing summaries so the operational volume is visible.

## Credit Economics

- `1 Fulcrum credit = $0.001` of provider cost
- projected customer billable value = `provider cost * BILLING_TARGET_MARKUP_MULTIPLIER`
- default markup multiplier = `3`

Examples:

- `$0.001000` provider cost = `1.000` credit
- `$0.003000` provider cost = `3.000` credits
- `$0.015320` provider cost = `15.320` credits
- `$0.015320` provider cost projects to `$0.045960` customer billable at `3x`

## Plans

Manual plans are active before Stripe.

Default plan budgets:

- `starter`: `5000` included credits
- `growth`: `20000` included credits
- `scale`: `100000` included credits

These credits represent included provider-cost budget, not customer-facing dollars.

## Pricing Sources

`ProviderPricingConfig` is the editable pricing catalog.

Seeded official defaults currently cover:

- Anthropic `claude-sonnet-4-20250514`
- Anthropic `claude-haiku-4-5-20251001`
- Perplexity `sonar`

Perplexity billing prefers direct response cost from the provider response when present. Catalog pricing is the fallback.

## Usage Capture

Raw provider activity is written to `ProviderUsageEvent`.

Billable metered usage also writes a paired `FulcrumCreditLedger` usage row with:

- `providerCostUsdMicros`
- `customerBillableUsdMicros`
- `pricingUnitVersion = 2`
- negative `creditDelta`

Legacy approximate ledger rows remain for audit and are marked `pricingUnitVersion = 1`. Summary and credit balance logic only count v2 rows.

## Tenant-Owned Keys

If a tenant uses their own `Anthropic` or `Perplexity` key:

- Fulcrum still records a `ProviderUsageEvent`
- `tenantOwnedCredentialUsed = true`
- no billable ledger row is created
- no Fulcrum credits are consumed

## APIs

### `GET /api/settings/api-keys`
Shows tenant-owned key status for:

- `instantly`
- `apify`
- `anthropic`
- `perplexity`

### `PUT /api/settings/api-keys`
Allows storing, rotating, and clearing tenant-owned provider credentials.

### `GET /api/billing/summary`
Returns the current-period exact-cost summary:

- plan and billing source
- included, used, and remaining credits
- provider-cost total
- projected billable total
- provider/stage breakdown
- unpriced activity

### `GET /api/billing/history`
Returns paginated current-period provider usage history for the dashboard.

## Manual Plan Operations

Operator scripts:

- `scripts/billing/seed-provider-pricing.ts`
- `scripts/billing/assign-plan.ts`
- `scripts/billing/update-provider-price.ts`

Useful commands:

```bash
npm run billing:seed-provider-pricing
npm run billing:assign-plan -- --tenantId <tenant-id> --plan growth
npm run billing:update-provider-price -- --provider anthropic --model claude-sonnet-4-20250514 --operationType output_token --usdMicrosPerUnit 15
```

## Cron Behavior

`POST /api/cron/billing-sync`

Current pre-Stripe behavior:

- rolls manual-plan billing periods forward
- issues the next monthly included-credit grant when a period changes
- does not report usage to Stripe yet

## Dashboard

Read-only billing surfaces live on `app/(dashboard)/usage/page.tsx` and show:

- Fulcrum credits
- projected billing
- provider activity
- billing history
- unpriced activity banner

## Stripe Status

Stripe code and routes remain in the repo, but exact-cost billing is the source of truth right now. Stripe product/price setup and webhook activation should happen after the cost model is validated in production.
