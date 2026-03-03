# Fulcrum Rev

Fulcrum Rev is a multi-tenant RevOps engine built on Next.js, Prisma, Neon, Clerk, and Vercel. It handles tenant onboarding, lead discovery, enrichment, scoring, CRM push, Slack delivery, ROI tracking, and billing.

## Current Product Surface

- Dashboard routes: `/`, `/leads`, `/usage`, `/settings`
- Onboarding routes: `/step-1` through `/step-6`
- Settings APIs: `/api/settings/*`
- Discovery providers: `Instantly` primary, `Apify` fallback
- Billing APIs: `/api/billing/*`
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

Billing:

```bash
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_STARTER_BASE=
STRIPE_PRICE_STARTER_OVERAGE=
STRIPE_PRICE_GROWTH_BASE=
STRIPE_PRICE_GROWTH_OVERAGE=
STRIPE_PRICE_SCALE_BASE=
STRIPE_PRICE_SCALE_OVERAGE=
BILLING_INCLUDED_CREDITS_STARTER=
BILLING_INCLUDED_CREDITS_GROWTH=
BILLING_INCLUDED_CREDITS_SCALE=
BILLING_OVERAGE_USD_PER_CREDIT_STARTER=
BILLING_OVERAGE_USD_PER_CREDIT_GROWTH=
BILLING_OVERAGE_USD_PER_CREDIT_SCALE=
```

## Discovery Providers

- `Instantly` is the default lead discovery provider.
- `Apify` remains available behind the provider abstraction as fallback.
- Tenant-owned Instantly, Apify, and Anthropic credentials can be managed through `/api/settings/api-keys`.
- CRM and Slack secrets are encrypted at rest through `lib/db-crypto.ts` when `TOKEN_ENCRYPTION_KEY` is configured.

More detail: `docs/DISCOVERY-PROVIDERS.md`

## Billing

- Stripe subscriptions support `starter`, `growth`, and `scale`.
- Monthly included credits are granted into `FulcrumCreditLedger`.
- Usage from discovery, enrichment, and first-line generation writes negative ledger entries.
- Metered overage is synced by `/api/cron/billing-sync`.

More detail: `docs/BILLING.md`

## Cron Schedule

| Path | Schedule (UTC) |
| --- | --- |
| `/api/cron/pipeline` | `0 10 * * 1-5` |
| `/api/cron/roi-sync` | `0 2 * * *` |
| `/api/cron/hitl-recalibrate` | `0 3 * * *` |
| `/api/cron/cold-start-check` | `0 0 * * *` |
| `/api/cron/email-digest` | `0 10 * * *` |
| `/api/cron/diagnostics` | `0 6 * * *` |
| `/api/cron/icm` | `0 6 * * *` |
| `/api/cron/health` | `0 12 * * *` |
| `/api/cron/weekly-digest` | `0 9 * * 5` |
| `/api/cron/seo` | `0 4 * * 1` |
| `/api/cron/cro` | `0 3 1,15 * *` |
| `/api/cron/content-allocation` | `0 5 1 * *` |
| `/api/cron/content-roi` | `0 6 2 * *` |
| `/api/cron/persona-deployment` | `0 8 * * *` |
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
