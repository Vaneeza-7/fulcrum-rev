# Fulcrum Rev

Fulcrum Rev is a multi-tenant RevOps engine built on Next.js, Prisma, Neon, Clerk, and Vercel. It handles onboarding, lead discovery, enrichment, scoring, CRM push, Slack delivery, ROI tracking, and exact-cost billing telemetry.

## Current Product Surface

- Dashboard routes: `/`, `/leads`, `/usage`, `/settings`
- `/leads` now includes CRM queue controls, CRM activity history, and duplicate diagnostics
- Onboarding routes: `/step-1` through `/step-6`
- Settings APIs: `/api/settings/*`
- Discovery providers: `Instantly` primary, `Apify` fallback
- Metered AI providers: `Anthropic`, `Perplexity`
- Billing APIs: `/api/billing/summary`, `/api/billing/history`
- Webhooks: `/api/webhooks/clerk`, `/api/webhooks/stripe`
- Scheduled jobs: `/api/cron/*`

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Useful commands:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npx prisma generate
npm run db:migrate
npm run billing:seed-provider-pricing
npm run billing:assign-plan -- --tenantId <tenant-id> --plan growth
npm run crm:backfill-push-state -- --tenantId <tenant-id> --dryRun
```

## Required Environment

Minimum:

```bash
DATABASE_URL=
```

Auth and platform services:

```bash
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=
CRON_SECRET=
TOKEN_ENCRYPTION_KEY=
APP_URL=
CORE_LAUNCH_TENANT_IDS=
```

Discovery and AI:

```bash
DEFAULT_DISCOVERY_PROVIDER=instantly
INSTANTLY_API_KEY=
INSTANTLY_WORKSPACE_ID=
APIFY_API_TOKEN=
ANTHROPIC_API_KEY=
PERPLEXITY_API_KEY=
```

Slack and CRM:

```bash
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=
SLACK_APP_TOKEN=
SLACK_APP_ID=
ZOHO_CLIENT_ID=
ZOHO_CLIENT_SECRET=
ZOHO_REFRESH_TOKEN=
```

Billing defaults:

```bash
BILLING_TARGET_MARKUP_MULTIPLIER=3
BILLING_INCLUDED_CREDITS_STARTER=5000
BILLING_INCLUDED_CREDITS_GROWTH=20000
BILLING_INCLUDED_CREDITS_SCALE=100000
```

Optional Stripe envs remain in the codebase, but exact-cost billing currently runs in manual-plan mode before Stripe activation.

## Discovery Providers

- `Instantly` is the default lead discovery provider.
- `Apify` remains available behind the provider abstraction as fallback.
- Tenant-owned Instantly, Apify, Anthropic, and Perplexity credentials can be managed through `/api/settings/api-keys`.
- CRM and Slack secrets are encrypted at rest through `lib/db-crypto.ts` when `TOKEN_ENCRYPTION_KEY` is configured.

More detail: `docs/DISCOVERY-PROVIDERS.md`

## Billing

- Exact-cost billing currently applies only to metered providers:
  - `Anthropic`
  - `Perplexity`
- Subscription-priced discovery providers are tracked operationally but are not part of exact credit billing yet:
  - `Instantly`
  - `Apify`
- `1 Fulcrum credit = $0.001` of provider cost.
- Customer billable value is derived from a single markup rule: `BILLING_TARGET_MARKUP_MULTIPLIER`, default `3x`.
- Manual plan assignment is the active billing source before Stripe.
- Current dashboard billing surfaces are read-only and live on `/usage`.
- Monthly grants are rolled forward by `/api/cron/billing-sync` for manual accounts.

More detail: `docs/BILLING.md`

CRM queue rollout and recovery: `docs/CRM-QUEUE-ROLLOUT.md`

CRM activity and observability live inside `/leads`, backed by:

- `GET /api/crm/push-events`
- `GET /api/crm/push-events/summary`
- `GET /api/leads/{id}/crm-push-events`

## Cron Schedule

| Path | Schedule (UTC) |
| --- | --- |
| `/api/cron/pipeline` | `0 10 * * 1-5` |
| `/api/cron/crm-push` | `30 10 * * 1-5` |
| `/api/cron/roi-sync` | `0 2 * * *` |
| `/api/cron/hitl-recalibrate` | `0 3 * * *` |
| `/api/cron/cold-start-check` | `0 0 * * *` |
| `/api/cron/health` | `0 11 * * 1-5` |
| `/api/cron/billing-sync` | `0 1 * * *` |

## Verification Status

Current baseline:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

All four pass in the local workspace.
