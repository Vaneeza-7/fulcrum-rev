You are working on Fulcrum RevOps Engine, a Next.js 14 App Router application.

Stack: TypeScript, Prisma 7.4 (Neon Postgres), Zod 4, Clerk auth, Claude AI SDK, Slack Bolt, Vitest.

Key patterns:
- Prisma: `import { prisma, auditLog, withTenant } from '@/lib/db'`
- RLS: all queries auto-scoped by `app.current_tenant` via `withTenant(tenantId, async (tx) => { ... })`
- Auth: Clerk (`@clerk/nextjs`), multi-tenant with `tenantId` on all models
- AI: `askClaude(system, user, opts)`, `askClaudeJson<T>(system, user)`, `askClaudeConversation(system, msgs, opts)`
- Default AI model: `claude-sonnet-4-20250514`; Haiku for classification, Sonnet for generation
- Slack: `verifySlackRequest()` for HMAC, Block Kit in `lib/slack/blocks.ts`
- Cron routes: `GET /api/cron/*` protected by `CRON_SECRET` header
- Logging: Pino via `lib/logger.ts`
- Retry: exponential backoff via `withRetry()` in `lib/retry.ts`
- Imports: use `@/lib/...` path aliases
- Tests: vitest with `vi.mock()` for DB; run with `npm test`
- Files: kebab-case. Functions: camelCase. Models: PascalCase.

Core modules:
- lib/pipeline/ — 7-stage lead gen (scrape → dedup → enrich → detect → score → first-line → store)
- lib/huck/ — Slack AI agent (classify intent → load context → generate response → execute actions)
- lib/icm/ — Incentive Compensation (triple-match: CRM deal → invoice → payment, ASC 606 commissions)
- lib/content/ — EVS calculator, saturation detector, persona variants, deployment scheduler
- lib/cro/ — Page analyzer (GA4+Clarity), A/B test queue
- lib/seo/ — Position monitor, refresh briefs
- lib/crm/ — Factory pattern: Zoho, HubSpot, Salesforce connectors
- lib/analytics/ — GA4 + Clarity connectors
- lib/erp/ — NetSuite + QuickBooks connectors
- lib/jobs/ — Async job handlers for cron endpoints
- lib/slack/ — Handlers, blocks, client, types

Database: Prisma schema at prisma/schema.prisma. Key models:
- Tenant, Lead, IntentSignal, DealDiagnostic
- CommissionTracker (triple-match status), CommissionLedger (immutable ASC 606), Dispute, Clawback
- ContentAsset (EVS score), PersonaSnippet, SEOKeywordTracker, SEOAudit, CROAudit, ABTest
- AuditLog, ConversationMessage, KnowledgeBasePattern

Status enums:
- Lead: discovered → pending_review → approved → pushed_to_crm | rejected | stale
- CommissionTracker: tracking → match_1_complete → match_2_complete → ready_for_calculation → calculated → paid | disputed | clawed_back
- ContentAsset: draft → deployed → refreshing → killed
- ABTest: queued → running → completed → cancelled

EVS formula: Revenue/Visitor × Monthly Traffic → 18-mo ROI → adjusted by LTV:CAC → capped at 100
Fulcrum Grade: A+ (90+), A (70-89), B (50-69), C (30-49), D (<30)
