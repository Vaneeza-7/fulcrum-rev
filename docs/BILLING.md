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

Included credits and overage rates are read from env-backed plan config in `lib/billing/plans.ts`.

## Ledger Semantics

- positive `creditDelta`: grants, refunds, adjustments
- negative `creditDelta`: usage
- `usdAmountCents`: platform cost / billable spend for ROI and overage projection
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
