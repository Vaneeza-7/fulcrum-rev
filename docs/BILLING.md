# Billing

## Overview

Fulcrum billing is built around a local ledger plus Stripe subscriptions.

Primary models:

- `TenantBillingAccount`
- `FulcrumCreditLedger`
- `StripeWebhookEvent`

## Plans

Supported monthly plans:

- `starter`
- `growth`
- `scale`

Price IDs come from environment variables.
Included credits are read from env-backed plan config in `lib/billing/plans.ts`.

Credit economics are now enforced from a single rule:

- `1 credit = 1 provider-cost cent`
- customer sell price per credit = `provider cost per credit * BILLING_TARGET_MARKUP_MULTIPLIER`
- default markup multiplier = `3`

This means:

- discovery, enrichment, and first-line usage consume credits equal to normalized provider cost in cents
- included plan credits represent included provider-cost budget
- recommended base monthly price = `includedCredits * sell price per credit`
- overage price per Stripe usage unit must equal the derived sell price per credit

## Ledger Semantics

- positive `creditDelta`: grants, refunds, adjustments
- negative `creditDelta`: usage
- `usdAmountCents`: normalized provider cost used for ROI and billing math
- `metadata`: lead-level attribution and provider details

Usage sources currently recorded:

- `discovery`
- `enrichment`
- `first_line`

If a tenant uses their own provider key, billable ledger usage for that provider is skipped.

## Stripe Flows

### Checkout

`POST /api/billing/checkout`

Creates a Stripe Checkout session for the selected plan and its metered overage price.

Before checkout is created, Fulcrum validates that the configured Stripe price IDs match the derived pricing model:

- base monthly price must equal `includedCredits * sell price per credit`
- overage price must equal `sell price per credit`
- base price must be monthly recurring and non-metered
- overage price must be monthly recurring and metered

### Portal

`POST /api/billing/portal`

Creates a Stripe customer portal session for the tenant customer.

### Webhook

`POST /api/webhooks/stripe`

Handled events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Webhook idempotency is enforced through `StripeWebhookEvent.stripeEventId`.

## Overage Sync

`POST /api/cron/billing-sync`

- computes local overage from the ledger versus included credits
- reports delta usage to Stripe
- advances `reportedOverageCredits` on the tenant billing account

## Key Files

- `lib/billing/plans.ts`
- `lib/billing/credit-rules.ts`
- `lib/billing/ledger.ts`
- `lib/billing/summary.ts`
- `lib/billing/usage.ts`
- `lib/billing/stripe.ts`
