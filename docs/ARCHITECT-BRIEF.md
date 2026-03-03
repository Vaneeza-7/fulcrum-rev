# Fulcrum RevOps Engine — Architect Brief

## System Status

This repo is not a backend-only handoff anymore. The production codebase now includes:

- tenant onboarding at `/step-1` through `/step-6`
- dashboard pages at `/`, `/leads`, `/usage`, `/settings`
- explicit settings APIs under `/api/settings/*`
- Instantly-first lead discovery with Apify fallback
- exact-cost billing telemetry for metered AI providers
- ROI spend derived from exact provider-cost ledger data

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

- Anthropic is the structured reasoning layer
- Perplexity is the web research layer
- per-call usage is exposed through `lib/ai/claude.ts` and `lib/ai/perplexity.ts`
- tenant-owned Anthropic and Perplexity keys override platform credentials when configured

### Settings Contract

Settings are explicit resources instead of onboarding-only persistence:

- `/api/settings/search-queries`
- `/api/settings/intent-keywords`
- `/api/settings/scoring`
- `/api/settings/crm`
- `/api/settings/slack`
- `/api/settings/api-keys`

Onboarding save routes remain for compatibility and call the same service-layer logic in `lib/settings/*`.

### Billing

- exact-cost billing currently applies to `Anthropic` and `Perplexity`
- subscription-priced discovery providers are tracked as unpriced operational activity
- pricing catalog: `ProviderPricingConfig`
- raw usage audit trail: `ProviderUsageEvent`
- billable credits and grants: `FulcrumCreditLedger`
- manual billing state: `TenantBillingAccount`
- `1 Fulcrum credit = $0.001 provider cost`
- projected customer billable value is derived from the global markup rule, default `3x`
- billing summary API: `/api/billing/summary`
- billing history API: `/api/billing/history`
- manual-period grant rollover cron: `/api/cron/billing-sync`

### ROI and Integrity

- ROI spend is derived from v2 exact-cost ledger rows tagged to each lead
- system integrity reads billing state and remaining exact credits
- legacy credit-zero pause flows are no longer part of active billing logic

## Deployed API Surface

### Core app APIs

- `/api/leads`
- `/api/leads/[id]`
- `/api/usage/summary`
- `/api/usage/history`
- `/api/settings/*`
- `/api/billing/summary`
- `/api/billing/history`
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

Still open or intentionally shallow:

- Stripe activation, product/price setup, and webhook validation are intentionally postponed until the exact-cost model is validated
- exact-cost allocation for subscription-priced providers is still pending:
  - `Instantly`
  - `Apify`
- NetSuite remains unsupported unless there is an active customer need
- broader UI/UX redesign remains separate from backend completion

## Reference Docs

- `docs/openapi.yaml`
- `docs/DISCOVERY-PROVIDERS.md`
- `docs/BILLING.md`
- `docs/CRO-MEMORY.md`
