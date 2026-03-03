# Fulcrum RevOps Engine — Architect Brief

## System Status

This repo is no longer a backend-only handoff. The production codebase now includes:

- tenant onboarding at `/step-1` through `/step-6`
- dashboard pages at `/`, `/leads`, `/usage`, `/settings`
- explicit settings APIs under `/api/settings/*`
- Instantly-first lead discovery with Apify fallback
- Stripe-backed billing primitives and a local credit ledger
- ROI spend derived from ledger entries instead of placeholders

## Core Architecture

### Multi-tenancy

- Clerk organizations map 1:1 to `Tenant` via `clerkOrgId`
- tenant-scoped data hangs off `tenantId`
- helper pattern: `lib/auth/get-authenticated-tenant.ts`

### Discovery

- primary provider: `Instantly`
- fallback provider: `Apify`
- provider orchestration: `lib/discovery/service.ts`
- tenant credential management: `/api/settings/api-keys`
- stored search query shape remains unchanged in `tenant_search_queries`

### AI

- Anthropic remains the structured reasoning layer for enrichment and first-line generation
- per-call usage is exposed through `lib/ai/claude.ts`
- tenant-owned Anthropic keys override platform credentials when configured

### Settings Contract

Settings are now explicit resources instead of onboarding-only persistence:

- `/api/settings/search-queries`
- `/api/settings/intent-keywords`
- `/api/settings/scoring`
- `/api/settings/crm`
- `/api/settings/slack`
- `/api/settings/api-keys`

Onboarding save routes remain for compatibility and call the same service-layer logic in `lib/settings/*`.

### Billing

- Stripe subscriptions are modeled through `TenantBillingAccount`
- included and consumed credits are stored in `FulcrumCreditLedger`
- webhook idempotency is stored in `StripeWebhookEvent`
- `1 credit = 1 provider-cost cent`
- customer pricing is derived from a single markup rule, default `3x`
- billing summary API: `/api/billing/summary`
- subscription checkout API: `/api/billing/checkout`
- billing portal API: `/api/billing/portal`
- Stripe webhook: `/api/webhooks/stripe`
- overage sync cron: `/api/cron/billing-sync`

### ROI and Integrity

- ROI spend is derived from ledger rows tagged to each lead
- system integrity now reads billing state and remaining included credits
- dashboard layout no longer relies on the placeholder credit stub

## Deployed API Surface

### Core app APIs

- `/api/leads`
- `/api/leads/[id]`
- `/api/usage/summary`
- `/api/usage/history`
- `/api/settings/*`
- `/api/billing/*`
- `/api/system/integrity`

### Webhooks

- `/api/webhooks/clerk`
- `/api/webhooks/stripe`
- `/api/slack/interactions`

### Cron routes

- `/api/cron/pipeline`
- `/api/cron/roi-sync`
- `/api/cron/hitl-recalibrate`
- `/api/cron/cold-start-check`
- `/api/cron/email-digest`
- `/api/cron/diagnostics`
- `/api/cron/icm`
- `/api/cron/health`
- `/api/cron/weekly-digest`
- `/api/cron/seo`
- `/api/cron/cro`
- `/api/cron/content-allocation`
- `/api/cron/content-roi`
- `/api/cron/persona-deployment`
- `/api/cron/billing-sync`

## Remaining Work

The major remaining program is UI/UX completion and dashboard depth, not backend scaffolding.

Still open or intentionally shallow:

- settings UI does not yet expose the new API-key workflow
- Instantly field mapping is intentionally tolerant because the upstream API is less rigid than the stored query model
- Stripe production setup still depends on real price IDs and webhook configuration in the environment
- NetSuite remains out of scope unless an active customer requires it
- broader UI polish, billing pages, and design-system work are still separate from backend completion

## Reference Docs

- `docs/openapi.yaml`
- `docs/DISCOVERY-PROVIDERS.md`
- `docs/BILLING.md`
