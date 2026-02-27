# Fulcrum RevOps Engine — Architect Brief

## What This Document Is

This is a complete handoff brief for an architect to project plan and build the Fulcrum client-facing UI and remaining backend gaps. Everything described in "What Exists" is production code already deployed on Vercel. Everything in "What Needs to Be Built" is net-new work.

---

## Product Overview

Fulcrum is a multi-tenant RevOps engine that automates lead generation, scoring, CRM syndication, content optimization, and commission tracking. The backend is fully built. The frontend is a blank slate — one placeholder page exists. The goal is to build a client-facing web application where customers can onboard themselves, configure their pipeline, monitor results, and manage their RevOps stack.

**Live URL:** revops.fulcrumcollective.io
**Stack:** Next.js 16, Prisma, Neon PostgreSQL (pgvector enabled), Clerk Auth, Vercel, Slack, Zoho/HubSpot/Salesforce CRM APIs, Claude + OpenAI APIs, Apify, Google Search Console, GA4, Microsoft Clarity, DataForSEO

---

## Architecture Decisions Already Made

### Multi-Tenancy
- Clerk Organizations map 1:1 to Tenant records via `clerkOrgId`
- Webhook at `POST /api/webhooks/clerk` auto-creates Tenant on `organization.created`
- All data is tenant-scoped via `tenantId` foreign keys
- Auth pattern: `const { orgId } = await auth()` → lookup tenant by `clerkOrgId`

### API Key Model (Hybrid)
- **Client-owned (required):** CRM credentials (Zoho/HubSpot/Salesforce), Slack workspace bot token
- **Fulcrum-provided by default, client-optional:** Apify (LinkedIn scraping), Anthropic/Claude (AI enrichment + first lines)
- If a tenant provides their own Apify or Anthropic key, the pipeline uses theirs. Otherwise it falls back to Fulcrum's platform keys.
- This requires new optional fields on the Tenant model: `apifyApiToken`, `anthropicApiKey`

### CRM Support
- Factory pattern: `CRMFactory.create(crmType, config)` — supports `zoho`, `hubspot`, `salesforce`
- Each connector implements: `authenticate()`, `createLead()`, `updateLead()`, `getDeals()`, `getClosedWonDeals()`
- Zoho custom fields already created: `Fulcrum_Score`, `Fulcrum_Grade`, `Fit_Score`, `Intent_Score`, `First_Line_Opener`, `LinkedIn_URL`
- Lead Source tagged per brand: `"Fulcrum - {tenant.name}"`

### Scoring Model
- Dual-axis: Fit Score (0-40) + Intent Score (0-60) = Fulcrum Score (0-100)
- Grades: A+ (90+), A (80+), B (60+), C (40+), D (<40)
- Time-decay on intent signals: 7d=1.5x, 30d=1.0x, 60d=0.5x, 90d+=0.2x
- Per-tenant scoring weights stored in `tenant_scoring_configs` (company_size, industry_fit, role_authority, revenue_signals)
- HITL feedback loop adjusts weights via vector embeddings (pgvector)

### Cold-Start
- New tenants enter a 30-day cold-start window
- All leads require manual approval during cold-start
- Confidence floor boost (default 0.20) applied to scores
- Auto-exits when statistical significance reached OR 30 days expire OR admin override

---

## What Exists (Production Code — Do Not Rebuild)

### 1. Lead Generation Pipeline
**Cron:** `POST /api/cron/pipeline` — runs Mon-Fri at 5 AM EST
**Orchestrator:** `lib/pipeline/orchestrator.ts`

7-stage pipeline per tenant:
1. **Scrape** — Apify `harvestapi~linkedin-profile-search` actor, runs tenant's search queries
2. **Dedup** — Filter profiles already in DB (compound unique on `[tenantId, linkedinUrl]`)
3. **Enrich** — Claude-powered profile enrichment
4. **Detect Signals** — Match against tenant's intent keywords with time-decay
5. **Score** — Fit + Intent = Fulcrum Score, grade assignment
6. **First Line** — Claude generates personalized opener for B+ leads
7. **Store** — Create Lead record, intent signals, ROI source tag
8. **CRM Push** — Auto-push B+ leads to CRM (3 retries, exponential backoff)
9. **Slack Notification** — Pipeline summary with lead cards, Zoho deep links, per-brand custom view URLs

**Key files:**
- `lib/pipeline/orchestrator.ts` — main pipeline
- `lib/pipeline/scraper.ts` — Apify integration
- `lib/pipeline/deduplicator.ts` — dedup logic
- `lib/pipeline/enricher.ts` — Claude enrichment
- `lib/pipeline/signal-detector.ts` — intent signal matching
- `lib/pipeline/scorer.ts` — scoring engine
- `lib/pipeline/first-line.ts` — Claude first line generation
- `lib/pipeline/types.ts` — shared types

### 2. CRM Integration
**Files:** `lib/crm/factory.ts`, `lib/crm/zoho-connector.ts`, `lib/crm/hubspot.ts`, `lib/crm/salesforce.ts`, `lib/crm/base-connector.ts`

- OAuth 2.0 refresh token flow for all three CRMs
- Field mapping: Fulcrum fields → CRM-specific field names
- `lib/jobs/crm-push.ts` — push individual leads with retry logic

### 3. Slack Integration
**Files:** `lib/slack/client.ts`, `lib/slack/blocks.ts`, `lib/slack/types.ts`, `lib/slack/handlers/`

- Per-tenant Slack bot tokens
- Block Kit messages: pipeline summaries, lead review cards, deal alerts, commission alerts, SEO reports, content ROI, CRO audits, monitoring alerts
- Interactive handlers: approve/reject leads, push to CRM, dismiss/ack/suppress monitoring alerts
- Route: `POST /api/slack/interactions`

### 4. ICM (Incentive Compensation Management)
**Files:** `lib/icm/reconciliation.ts`, `lib/icm/ledger.ts`, `lib/icm/matching-engine.ts`, `lib/icm/calculator.ts`

- ASC 606 compliant immutable ledger
- Triple-match validation: CRM deal → ERP invoice → ERP payment
- 45-day cancellation window before commission calculation
- Clawback engine with full/prorated/none policies
- Dispute resolution workflow

### 5. ROI Attribution
**Files:** `lib/roi/source-tagger.ts`, `app/api/roi/dashboard/route.ts`

- Source types: RESEARCHER_DISCOVERY, ICP_MATCH, SIGNAL_TRIGGERED, RESURRECTION
- Dashboard API returns: total leads, credit spend, attributed revenue, ROI multiplier
- **Gap:** FulcrumCreditLedger not yet implemented (TODO in code)

### 6. HITL Feedback Loop
**Files:** `lib/hitl/hitl-processor.ts`
**Route:** `POST /api/hitl/feedback`
**Cron:** `POST /api/cron/hitl-recalibrate` — 3 AM daily

- Captures rejection reasons with NegativeReason enum (WRONG_ICP, BAD_TIMING, ALREADY_CUSTOMER, COMPETITOR, NOT_INTERESTED, BRAND_MISMATCH, OTHER)
- Vectorizes rejection text via OpenAI embeddings → stores in pgvector
- Recalibration cron adjusts tenant scoring weights from accumulated signals

### 7. Cold-Start System
**Files:** `lib/cold-start/gate.ts`, `lib/cold-start/initialize.ts`
**Route:** `GET /api/cold-start/status`
**Cron:** `POST /api/cron/cold-start-check` — midnight daily

### 8. Content Management
**Files:** `lib/content/evs-calculator.ts`, `lib/content/saturation-detector.ts`, `lib/content/deployment-manager.ts`, `lib/content/persona-generator.ts`

- EVS (Economic Value Score) calculation per content asset
- Saturation detection: engagement decline, traffic plateau, keyword cannibalization, ranking efficiency
- Persona snippet generation: CFO, Director, End-User variants via Claude
- Staggered deployment scheduling

### 9. SEO Module
**Files:** `lib/seo/gsc-connector.ts`, `lib/seo/refresh-engine.ts`, `lib/seo/position-tracker.ts`, `lib/seo/rank-monitor.ts`

- Google Search Console OAuth integration
- Position tracking with delta calculation
- Auto-generated refresh briefs via Claude
- Cannibalization detection and resolution recommendations
- DataForSEO integration for competitor SERP data

### 10. CRO Module
**Files:** `lib/cro/form-optimizer.ts`, `lib/cro/funnel-auditor.ts`, `lib/cro/page-analyzer.ts`

- Microsoft Clarity integration for form analytics
- GA4 integration for page metrics and funnel analysis
- Pipeline impact estimation per friction point
- A/B test tracking schema

### 11. Analytics Connectors
**Files:** `lib/analytics/clarity-connector.ts`, `lib/analytics/ga4-connector.ts`

- Microsoft Clarity: session metrics, heatmaps, form analytics
- GA4: page metrics, funnel reports, conversion events

### 12. Huck Conversational AI
**Files:** `lib/huck/agent.ts`, `lib/huck/handlers/`, `lib/huck/prompts/`

- 4-layer processing: save message → classify intent → build context → generate response
- Slack-native delivery
- Intent classification via Claude Haiku
- Response generation via Claude Sonnet with full lead/deal/metric context

### 13. Tenant Onboarding (Programmatic)
**File:** `lib/onboarding/seed-tenant.ts`

- `seedTenant(config)` — creates tenant with search queries, intent keywords, scoring configs
- Pre-built configs: HUNHU_CONFIG, PULSE_CONFIG, FULCRUM_COLLECTIVE_CONFIG
- Initializes cold-start state

---

## What Needs to Be Built

### PRIORITY 1: Client-Facing Web Application

The entire frontend. No UI components, no Tailwind, no component library exists. Start from scratch.

**Recommended stack addition:**
- Tailwind CSS
- shadcn/ui (or similar component library)
- React Query / SWR for data fetching
- Clerk `<OrganizationSwitcher>` and `<UserButton>` components

#### 1A. Authentication & Onboarding Flow

**Sign Up / Sign In:**
- Clerk-powered auth (already installed, needs UI wiring)
- Organization creation triggers Tenant provisioning via existing webhook

**Onboarding Wizard (post-signup, first-time flow):**
1. **Welcome** — Brand name, product type (maps to `productType`)
2. **Connect CRM** — OAuth flow for Zoho, HubSpot, or Salesforce. Store credentials in `crmConfig`
3. **Connect Slack** — Slack OAuth install flow (or manual bot token entry). Store in `TenantSlackConfig`
4. **Define ICP** — Form to configure:
   - Search queries (title keywords, industry, company size, additional keywords)
   - Intent keywords with scores and categories
   - Scoring weights (company size ranges, industry fit, role authority, revenue signals)
5. **Optional: Bring Your Own Keys** — Apify API token, Anthropic API key
6. **Review & Activate** — Summary of config, activate pipeline

**Data model changes needed:**
- Add `apifyApiToken` (encrypted, optional) to Tenant
- Add `anthropicApiKey` (encrypted, optional) to Tenant
- Pipeline scraper/enricher/first-line must check tenant-level keys before falling back to platform keys

#### 1B. Dashboard

**Main dashboard (after onboarding):**
- Pipeline status: last run time, next scheduled run, leads processed today/this week/this month
- Grade distribution chart (A+/A/B/C/D) over time
- Top leads list (quick view, click to expand)
- Cold-start progress bar (if in cold-start period)
- CRM sync status: last push, errors
- Slack delivery status: last message sent

**Data sources:** All data exists in the DB. Need new API routes to aggregate and return dashboard metrics.

#### 1C. Lead Management

**Lead table page:**
- Sortable, filterable table of all leads for the tenant
- Columns: Name, Title, Company, Fulcrum Score, Grade, Fit Score, Intent Score, Status, Discovered Date
- Filters: by grade, by status (discovered, pending_review, awaiting_approval, approved, rejected, pushed_to_crm), date range
- Click to expand: full profile, enrichment data, intent signals, first line, score breakdown
- Actions: Approve, Reject (with reason — feeds HITL), Push to CRM manually
- Bulk actions: approve all A+, reject all D
- Deep links to CRM record (when `crmLeadId` exists)
- Deep link to LinkedIn profile

**API routes needed:**
- `GET /api/leads` — paginated, filterable lead list
- `PATCH /api/leads/:id` — approve/reject/update status
- `POST /api/leads/:id/push-to-crm` — manual CRM push

#### 1D. Settings Pages

**ICP Configuration:**
- Edit search queries (add/remove/modify)
- Edit intent keywords (add/remove, adjust scores)
- Edit scoring weights
- Preview: "Based on this config, here's what a sample search would look like"

**CRM Settings:**
- Current CRM connection status (connected/disconnected, last sync)
- Re-authenticate / switch CRM
- Custom field mapping review
- Per-brand custom view URL for Zoho

**Slack Settings:**
- Current connection status
- Change notification channel
- Notification preferences (which grades to notify, frequency)

**API Keys (Optional):**
- Add/remove own Apify token
- Add/remove own Anthropic key
- Show current usage: "Using Fulcrum's keys" vs "Using your own"

**Account:**
- Organization name, slug
- Team members (Clerk org members)
- Billing/subscription (see Priority 2)

**API routes needed:**
- `GET/PUT /api/settings/search-queries`
- `GET/PUT /api/settings/intent-keywords`
- `GET/PUT /api/settings/scoring`
- `GET/PUT /api/settings/crm`
- `GET/PUT /api/settings/slack`
- `GET/PUT /api/settings/api-keys`

#### 1E. Usage & Analytics

**Usage page:**
- Leads processed per day/week/month (chart)
- CRM pushes count
- API calls consumed (Apify runs, Claude tokens)
- Pipeline run history with success/failure status
- Credit consumption (if using Fulcrum's keys)

**API routes needed:**
- `GET /api/usage/summary` — aggregate usage metrics
- `GET /api/usage/history` — pipeline run history

---

### PRIORITY 2: Billing & Credit System

Not needed for launch, but needed before scaling to paying customers.

- Stripe integration for subscriptions
- Plan tiers: define what each plan includes (leads/month, features)
- Credit ledger: track Apify + Claude consumption per tenant
- Overage billing or usage caps
- Implements the missing `FulcrumCreditLedger` referenced in ROI attribution code

---

### PRIORITY 3: Content/SEO/CRO Dashboard

Expose the existing backend modules in the UI:

**Content Hub:**
- Content asset list with EVS scores
- Revenue champions vs kill list
- Persona snippet status (generated, deployed, pending)
- Saturation alerts

**SEO Dashboard:**
- Keyword position tracker with deltas
- Position drop alerts
- Cannibalization warnings
- Refresh brief queue

**CRO Dashboard:**
- Page audit results with friction points
- A/B test queue and results
- Pipeline impact estimates
- Form optimization recommendations

**API routes needed for all of the above** — the backend logic exists but there are no API routes to surface data to the UI.

---

### PRIORITY 4: Admin Panel (Internal — Fulcrum Team Only)

- View all tenants, their status, pipeline health
- Aggregate usage across all tenants
- Manually seed/configure tenants
- Override cold-start for specific tenants
- Monitor platform-level API key usage (Apify credits remaining, Claude spend)
- Impersonate tenant view for debugging

---

### PRIORITY 5: Missing Cron Route Implementations

These cron schedules are defined in `vercel.json` but the API routes don't exist yet:

| Path | Schedule | What It Should Do |
|------|----------|-------------------|
| `/api/cron/diagnostics` | 6 AM daily | Run deal diagnostics (stalled deal detection). Backend: `lib/jobs/` likely needs a diagnostics job |
| `/api/cron/icm` | 6 AM daily | Run ICM reconciliation. Backend: `lib/icm/reconciliation.ts` exists |
| `/api/cron/health` | 12 PM daily | System health checks (CRM connectivity, data freshness). Backend: health check logic may need creation |
| `/api/cron/weekly-digest` | 9 AM Friday | Weekly summary Slack message. Backend: needs aggregation logic |
| `/api/cron/seo` | 4 AM Monday | SEO audit run. Backend: `lib/seo/` exists |
| `/api/cron/cro` | 3 AM 1st/15th | CRO audit run. Backend: `lib/cro/` exists |
| `/api/cron/content-allocation` | 5 AM 1st | Monthly content slot allocation. Backend: `lib/content/` exists |
| `/api/cron/content-roi` | 6 AM 2nd | Monthly content ROI report. Backend: `lib/content/` exists |
| `/api/cron/persona-deployment` | 8 AM daily | Deploy scheduled persona snippets. Backend: `lib/content/deployment-manager.ts` exists |

---

### PRIORITY 6: External Service Integrations Not Yet Wired

These config fields exist on the Tenant model but the data ingestion pipelines may not be fully connected to the cron system:

- **Google Search Console** (`gscConfig`) — connector exists (`lib/seo/gsc-connector.ts`), needs OAuth onboarding flow in UI
- **Google Analytics 4** (`ga4Config`) — connector exists (`lib/analytics/ga4-connector.ts`), needs OAuth onboarding flow
- **Microsoft Clarity** (`clarityConfig`) — connector exists (`lib/analytics/clarity-connector.ts`), needs config entry in UI
- **DataForSEO** (`dataforseoConfig`) — used by SEO refresh engine, needs config entry in UI
- **ERP (NetSuite/QuickBooks)** (`erpType`, `erpConfig`) — referenced by ICM module, no connector code found

---

## Database Schema Reference

Full schema in `prisma/schema.prisma`. Key models:

| Model | Purpose |
|-------|---------|
| `Tenant` | Organization/customer. All config lives here or in related tables |
| `Lead` | Discovered prospects with scores, grades, CRM sync status |
| `IntentSignal` | Detected buying signals per lead |
| `TenantSearchQuery` | LinkedIn search query configs per tenant |
| `TenantIntentKeyword` | Intent keywords with scores per tenant |
| `TenantScoringConfig` | Scoring weights per tenant (4 types) |
| `TenantSlackConfig` | Slack workspace connection per tenant |
| `CommissionTracker` | Deal tracking for ICM with triple-match status |
| `CommissionLedger` | Immutable commission calculation records (ASC 606) |
| `Dispute` | Commission dispute tracking |
| `Clawback` | Commission reversal records |
| `ContentAsset` | Content pieces with EVS scores and revenue attribution |
| `PersonaSnippet` | CFO/Director/End-User content variants |
| `SEOKeywordTracker` | Keyword position monitoring |
| `SEOAudit` | Position drop and cannibalization audits |
| `CROAudit` | Page conversion optimization analysis |
| `ABTest` | A/B test tracking |
| `ServiceProfile` | Service economics (LTV, CAC, margin) |
| `SignalWeight` | Per-tenant scoring weights with vector embeddings |
| `NegativeSignal` | HITL rejection data with vector embeddings |
| `FulcrumSourceTag` | Lead source attribution for ROI |
| `ROIAttribution` | Revenue attribution per lead |
| `TenantOnboardingState` | Cold-start tracking |
| `ModelCalibration` | Scoring model performance metrics |
| `AuditLog` | System-wide audit trail |

---

## Environment Variables Required

```
# Database
DATABASE_URL=

# Clerk Auth
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=

# AI (Platform keys — used when tenant doesn't provide their own)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=     # Used for HITL embeddings

# Scraping (Platform key)
APIFY_API_TOKEN=

# Slack (Huck app — platform-level)
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=
SLACK_APP_TOKEN=
SLACK_APP_ID=

# Cron authentication
CRON_SECRET=

# Sentry
SENTRY_ORG=
SENTRY_PROJECT=

# App
NODE_ENV=
```

Per-tenant secrets (stored encrypted in DB, not env vars):
- CRM OAuth credentials (client_id, client_secret, refresh_token, org_id)
- Slack bot token per workspace
- Optional: Apify token, Anthropic key
- Optional: GSC OAuth tokens, GA4 OAuth tokens, Clarity project config, DataForSEO creds

---

## Deployment

- **Hosting:** Vercel (already deployed)
- **Database:** Neon PostgreSQL with pgvector extension
- **Crons:** Vercel Cron Jobs (defined in `vercel.json`)
- **Domain:** revops.fulcrumcollective.io
- **Monitoring:** Sentry (already configured)
- **Logging:** Pino structured logging

---

## Summary of Build Scope

| Priority | Scope | Effort Estimate |
|----------|-------|-----------------|
| P1 | Client UI (Auth, Onboarding, Dashboard, Leads, Settings, Usage) | Large — this is the bulk of the work |
| P2 | Billing & Credits (Stripe, credit ledger, plans) | Medium |
| P3 | Content/SEO/CRO UI dashboards | Medium |
| P4 | Admin panel | Medium |
| P5 | Missing cron route implementations (8 routes) | Small-Medium |
| P6 | External service OAuth onboarding flows (GSC, GA4, Clarity, DataForSEO) | Medium |
