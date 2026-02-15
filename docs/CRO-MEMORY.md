# Fulcrum Revenue Operating System — CRO Knowledge Base

> This document is the AI agent's operational memory for the Fulcrum platform.
> Copy this into your Notion CRO Knowledge workspace for reference as you build out the AI agency system.

---

## System Overview

**Fulcrum** is a multi-tenant B2B lead generation and qualification engine. It discovers prospects via LinkedIn (Apify), enriches them with AI (Perplexity + Claude), scores them on a dual-axis model, and pushes qualified leads to customer CRMs. There is no web UI — Slack is the control plane.

**Project Location:** `~/fulcrum-rev`
**Stack:** Next.js 14 (API-only) / Neon PostgreSQL / Prisma 7 / Clerk / Slack / DigitalOcean
**Neon Project ID:** `restless-grass-89011670`
**Database:** `neondb`

---

## Architecture

```
LinkedIn (Apify) → Scraper → Deduplicator → Enricher (Perplexity + Claude)
  → Signal Detector (Claude) → Scorer (DB-driven weights)
  → First-Line Generator (Claude) → Slack Notification → CRM Push
```

### Key Design Principles

1. **All tenant config in the database** — ICP definitions, search queries, intent keywords, scoring weights, CRM settings. No config files per customer. Adding customer #10 = inserting rows.
2. **CRM abstraction layer** — Zoho (full), HubSpot (stub), Salesforce (stub). All behind one interface. Zero-code-change onboarding for new CRMs.
3. **Slack multi-workspace** — Each customer gets their own Slack channels. OAuth per workspace.
4. **Per-tenant scoring weights** — Scoring formula is configurable per tenant via `tenant_scoring_configs` rows.
5. **Email through CRM** — All outbound email goes through the customer's CRM (Zoho, HubSpot, etc.), not a separate email service.

---

## Database Schema (14 Models)

### Core Tables
| Table | Purpose |
|-------|---------|
| `tenants` | Organizations (Clerk org ID, CRM type, CRM config) |
| `leads` | Discovered prospects with scoring + data freshness fields |
| `intent_signals` | Detected signals with time decay |
| `deal_diagnostics` | Stalled deal tracking |
| `audit_log` | All actions logged |

### Configuration Tables (Data-Driven, No Code Changes)
| Table | Purpose |
|-------|---------|
| `tenant_search_queries` | LinkedIn search queries per tenant (3+ each) |
| `tenant_intent_keywords` | Monitored keywords per tenant with intent scores |
| `tenant_scoring_configs` | Per-tenant scoring weights (4 types: company_size, industry_fit, role_authority, revenue_signals) |
| `tenant_slack_configs` | Slack workspace tokens, channel IDs |

### Huck Agent Tables
| Table | Purpose |
|-------|---------|
| `conversation_messages` | Huck's conversation memory per Slack thread |
| `onboarding_workflows` | Enterprise onboarding step tracking |
| `system_health_checks` | CRM/pipeline/data health monitoring history |
| `knowledge_base_patterns` | Patterns learned from Huck interactions |

### Row-Level Security
All tenant-scoped tables have RLS enabled. The `app.current_tenant` session variable is set per request via `setTenantContext()` or `withTenant()` in `lib/db.ts`.

---

## Scoring Algorithm (Dual-Axis Model)

### Fit Score (0-40 points)
| Component | Max Points | Source |
|-----------|-----------|--------|
| Company Size | 10 | `tenant_scoring_configs.company_size` ranges |
| Industry Fit | 8 | Confidence score from Claude enrichment |
| Revenue Signals | 7 | Funding stage + budget timing |
| Role Authority | 15 | Decision maker level classification |

### Intent Score (0-60 points, capped)
Sum of all detected signals with time-decay multipliers applied:

| Signal Age | Multiplier |
|-----------|------------|
| 0-7 days | 1.5x (boost fresh signals) |
| 8-30 days | 1.0x (full value) |
| 31-60 days | 0.5x (half value) |
| 61-90 days | 0.2x (minimal value) |
| 90+ days | 0.0x (expired) |

### Fulcrum Score Formula
```
Fit Normalized = (Fit Score / 40) × 100
Intent Normalized = (Intent Score / 60) × 100
Fulcrum Score = (Fit Normalized × 0.40) + (Intent Normalized × 0.60)
```

### Grade Thresholds
| Grade | Score Range | Action |
|-------|------------|--------|
| A+ | 90-100 | Auto-push to CRM (if hybrid mode) |
| A | 80-89 | High priority review |
| B | 60-79 | Standard review |
| C | 40-59 | Low priority |
| D | 0-39 | Skip |

---

## Signal Types Detected

- `job_change` — New role in the last 6 months
- `series_a` / `series_b` / `seed_funding` — Funding events
- `hiring_surge` — Multiple job postings
- `keyword_mention` — Matches tenant's monitored keywords
- `pain_point_mentioned` — Expressed relevant pain points
- `competitor_research` — Researching alternatives

---

## AI Pipeline (Perplexity + Claude)

### Step 1: Perplexity (Web Search Enrichment)
- Uses OpenAI-compatible API (`sonar` model)
- Finds: company funding, news, hiring data, tech stack, competitor mentions
- Cost: ~$0.005/profile

### Step 2: Claude (Analysis & Reasoning)
- Model: `claude-sonnet-4-20250514`
- Takes Perplexity's raw data + LinkedIn profile
- Produces structured enrichment: company size, industry, pain points, buying signals, decision maker level
- Cost: ~$0.01/profile

### Step 3: Claude (Signal Detection)
- Analyzes enrichment against tenant's keyword list
- Detects and classifies intent signals
- Applies time decay multipliers

### Step 4: Claude (First-Line Generation)
- Personalized email opener per lead
- Context: profile + enrichment + score rationale
- ~150 tokens per generation

---

## Current Tenants

### Hunhu (K-12 Education)
- **Tenant ID:** `252b7916-924c-4471-a00b-3830781412cc`
- **ICP:** School districts, 500-5,000 students, Superintendents/Directors
- **CRM:** Zoho
- **Search Queries:** Superintendent Search, Director of Student Services, Principal Search
- **Key Intent Keywords:** student mental health crisis (9), SEL assessment tools (9), suicide prevention schools (10), early warning system schools (8)
- **Top Scoring:** Company size 51-500 = 10pts, C-level/Superintendent = 15pts

### Pulse (SaaS Analytics)
- **Tenant ID:** `b442001c-94e7-4185-a54b-e5e58437e3c7`
- **ICP:** B2B SaaS startups, 1-50 employees, Founders/VPs
- **CRM:** Zoho
- **Search Queries:** Founder/CEO/CTO Search, VP Product Search, Revenue Leader Search
- **Key Intent Keywords:** reduce SaaS churn (9), predictive churn model (9), CRM analytics for startups (8), customer health score (8)
- **Top Scoring:** Company size 1-50 = 10pts, Founder/CEO = 15pts

---

## Onboarding New Customers (Repeatable Checklist)

Adding customer #N requires **zero code changes**. Steps:

1. **Create Clerk Organization** → Webhook auto-creates `tenants` row
2. **Insert `tenant_search_queries`** rows (LinkedIn search configurations)
3. **Insert `tenant_intent_keywords`** rows (monitored keywords + scores)
4. **Insert `tenant_scoring_configs`** rows (4 types: company_size, industry_fit, role_authority, revenue_signals)
5. **Customer installs Slack app** → OAuth stores token in `tenant_slack_configs`
6. **Customer provides CRM OAuth** → Stored in `tenants.crm_config` JSONB
7. **First pipeline run** → Leads flowing

Or use the programmatic approach:
```typescript
import { seedTenant, TenantSeedConfig } from '@/lib/onboarding/seed-tenant';

const NEW_CUSTOMER: TenantSeedConfig = {
  name: 'Company Name',
  slug: 'company-slug',
  productType: 'custom',
  crmType: 'zoho', // or 'hubspot', 'salesforce'
  crmConfig: { /* OAuth credentials */ },
  searchQueries: [ /* LinkedIn search configs */ ],
  intentKeywords: [ /* Monitored keywords */ ],
  scoringConfig: { /* ICP weights */ },
};

await seedTenant(NEW_CUSTOMER);
```

---

## Daily Pipeline (5 AM UTC)

1. **Scrape** — Apify runs LinkedIn searches per tenant (3 queries × 10 results = 30 leads/day)
2. **Deduplicate** — Skip existing leads by `(tenant_id, linkedin_url)` unique constraint
3. **Enrich** — Perplexity web search → Claude analysis → structured enrichment JSON
4. **Detect Signals** — Claude classifies intent signals from enrichment data
5. **Score** — Dual-axis scoring with DB-driven weights per tenant
6. **Generate First Lines** — Claude creates personalized email openers
7. **Store** — All data persisted to `leads` and `intent_signals` tables
8. **Notify** — Slack summary with grade breakdown + interactive review buttons

---

## Deal Diagnostics (Every 6 Hours)

Monitors CRM deals for staleness:
- **No activity 7+ days** → Alert
- **Same stage 30+ days** → Alert
- **5+ emails, <20% response rate** → Low engagement alert
- **45+ days stuck** → Auto-move to nurture

For each stalled deal, Claude generates re-engagement actions (tasks, notes, suggested outreach).

---

## Huck — The AI Revenue Operations Agent

Huck is the sole interface for Fulcrum. Users interact via Slack DM or @mention. No dashboards.

### How Huck Works (4-Layer Architecture)
1. **Ingestion** — Slack event → return 200 immediately, process async
2. **Intent Classification** — Claude Haiku classifies intent + extracts entities (~200 tokens, fast)
3. **Context Assembly** — Load conversation history + relevant leads/deals/health data
4. **Response Generation** — Claude Sonnet generates response in Huck's voice + executes actions

### What Huck Can Do
- **Lead queries**: "show me A+ leads", "how many leads this week?"
- **Lead details**: "tell me about Sarah Chen", "what's the score on Acme?"
- **Pipeline control**: "run the pipeline", "when was the last run?"
- **Deal health**: "any stalled deals?", "how's the Johnson deal?"
- **System status**: "is everything working?", "check CRM connection"
- **Actions**: Push leads to CRM, trigger pipeline, create follow-up tasks

### Huck's Proactive Messages
- **Daily Summary** (5 AM after pipeline): AI-generated summary with metrics + suggested actions
- **Stall Alerts** (every 6h): Actionable deal health warnings
- **Weekly Digest** (Friday 9 AM): Weekly performance recap
- **System Alerts**: CRM connectivity or pipeline issues

### Conversation Memory
- Last 20 messages per thread stored in `conversation_messages`
- Thread-level context (not channel-level)
- Intent + entities logged for every user message

### Huck's Personality
- Direct, confident, like a sharp sales ops analyst
- Data-driven — always cites numbers and grades
- Proactive — suggests next actions without being asked
- Brief — Slack-optimized formatting

### Files
```
lib/huck/
├── agent.ts              # Main orchestrator (Layer 4)
├── intent-classifier.ts  # Haiku-based classification (Layer 2)
├── context-builder.ts    # Data loading + assembly (Layer 3)
├── entity-resolver.ts    # Fuzzy name matching to DB records
├── action-executor.ts    # Execute CRM push, pipeline, etc.
├── formatters.ts         # Format data for Claude context
├── proactive.ts          # Daily summaries, alerts, digests
└── types.ts              # All Huck type definitions
```

---

## Slack Control Plane

### Huck's Daily Summary
- AI-generated morning message in Huck's voice
- Key metrics + grade breakdown + top prospects
- Interactive buttons: "Push All A+", "Review Leads"

### Lead Review Thread
- Card per lead: Name, Company, Title, Score, Grade, First Line
- Per-lead buttons: Approve | Reject

### Slash Commands
- `/fulcrum status` — Pipeline status, lead counts
- `/fulcrum run` — Trigger pipeline manually
- `/fulcrum deals` — Show stalled deal alerts
- `/fulcrum ask <question>` — Ask Huck directly

---

## CRM Abstraction Layer

All CRM operations go through `CRMConnector` interface:

| Method | Description |
|--------|-------------|
| `authenticate()` | OAuth refresh flow |
| `createLead(data)` | Push lead with field mapping |
| `updateLead(id, data)` | Update existing lead |
| `getDeals(filters)` | Retrieve deals for diagnostics |
| `createTask(dealId, task)` | Create follow-up task |
| `addTag(dealId, tag)` | Tag a deal |
| `addNote(dealId, note)` | Add note to deal |
| `moveDealStage(dealId, stage)` | Move deal pipeline stage |
| `sendEmail(to, subject, body)` | Send email via CRM |
| `mapFields(data)` | Map Fulcrum fields to CRM fields |

### Adding a New CRM
1. Create `lib/crm/new-crm-connector.ts` extending `CRMConnector`
2. Register in `lib/crm/factory.ts` CONNECTORS map
3. Done — customer can select this CRM type during onboarding

---

## API Routes

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | Health check + DB stats |
| `POST /api/cron/pipeline` | Trigger daily pipeline (CRON_SECRET protected) |
| `POST /api/cron/diagnostics` | Trigger deal diagnostics |
| `POST /api/slack/commands` | Slash command handler |
| `POST /api/slack/interactions` | Button click handler |
| `POST /api/slack/events` | Huck's primary entry point (DMs + @mentions) |
| `POST /api/webhooks/clerk` | Clerk org webhook |
| `POST /api/webhooks/apify` | Apify completion callback |

---

## File Structure

```
~/fulcrum-rev/
├── app/api/                    # All API routes
├── lib/
│   ├── ai/                     # Claude + Perplexity clients, prompts
│   ├── crm/                    # CRM abstraction (factory + connectors)
│   ├── huck/                   # Huck AI agent (intent, context, actions)
│   ├── health/                 # System health monitoring
│   ├── pipeline/               # Lead gen pipeline stages
│   ├── slack/                  # Slack Block Kit + handlers
│   ├── jobs/                   # Scheduled jobs (pipeline, diagnostics, digest)
│   ├── onboarding/             # Tenant seeding
│   ├── db.ts                   # Prisma singleton + tenant RLS
│   └── config.ts               # Env validation (Zod)
├── prisma/
│   ├── schema.prisma           # 14 models, all tenant-scoped
│   └── seed.ts                 # Seeds Hunhu + Pulse
├── __tests__/                  # 87 tests (scoring, signals, CRM, pipeline, Huck, health)
├── vitest.config.ts
└── .env                        # All credentials
```

---

## Cost Estimates Per Tenant

| Service | Monthly Cost |
|---------|-------------|
| Apify (LinkedIn scraping) | ~$12.60 (30 profiles/day × 30 days) |
| Claude (enrichment + scoring) | ~$4.50 (30 × $0.005/profile × 30 days) |
| Perplexity (web search) | ~$4.50 (30 × $0.005/profile × 30 days) |
| Neon (database) | Free tier (generous) |
| DigitalOcean App Platform | ~$12/month (shared) |
| **Total per tenant** | **~$34/month** |

---

## API Accounts Required

| Service | URL | Purpose |
|---------|-----|---------|
| Neon | neon.tech | PostgreSQL database |
| Clerk | clerk.com | Multi-tenant auth |
| Apify | apify.com | LinkedIn scraping |
| Anthropic | console.anthropic.com | Claude AI |
| Perplexity | perplexity.ai/settings/api | Web search enrichment |
| Slack | api.slack.com/apps | Control plane |
| Zoho CRM | zoho.com/crm | CRM integration |
| DigitalOcean | digitalocean.com | Hosting |

---

## Key Technical Decisions

1. **Prisma 7 with Neon Adapter** — `PrismaNeon` is a factory that takes `{ connectionString }` config, NOT a Pool instance. It creates its own Pool internally.
2. **No SendGrid** — All email goes through the customer's CRM. This simplifies the stack and keeps email reputation tied to the customer's domain.
3. **Perplexity for enrichment** — Better at finding fresh, factual data with citations than Claude's training data. Claude is used for analysis/reasoning on top of Perplexity's research.
4. **node-cron in-process** — Simple scheduling within Next.js process. For production scale, consider external scheduler (DigitalOcean cron jobs or dedicated worker).
5. **RLS with session variables** — `SET LOCAL app.current_tenant` per transaction ensures tenant isolation at the database level.

---

## Next Steps for Production

1. Set up all API accounts (Clerk, Apify, Anthropic, Perplexity, Slack, Zoho)
2. Configure Clerk webhook endpoint
3. Create Slack app and install in workspace
4. Set up Zoho OAuth for each customer
5. Deploy to DigitalOcean App Platform
6. Run first live pipeline
7. Validate end-to-end: Apify → Enrichment → Scoring → Slack → CRM

---

*Last updated: 2026-02-14*
*System built by Claude Code for Fulcrum Co*
