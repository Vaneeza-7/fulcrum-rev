# CRM Queue Rollout and Recovery

This runbook covers the staged rollout of the CRM queue, legacy lead backfill, and operator recovery actions.

## 1. Allowlist Setup

Set `CORE_LAUNCH_TENANT_IDS` to the internal tenant UUIDs allowed to receive launch cron fan-out.

Example:

```bash
CORE_LAUNCH_TENANT_IDS=205a1b47-8e88-40e2-baf9-d3c6e9ac384c
```

- Empty or unset means all eligible launch tenants.
- For the pilot, set exactly one tenant UUID before deploy.

## 2. Migration Apply

Deploy the app, then apply the existing migration:

```bash
npx prisma migrate deploy
```

This rollout does not require a new schema migration beyond `20260303194500_core_launch_hardening`.

## 2a. Pre-activation Readiness

Before pilot activation:

- confirm `/api/cron/crm-push` is present in the deployed `vercel.json`
- confirm `CRON_SECRET` is set in production
- confirm the pilot tenant is the only UUID in `CORE_LAUNCH_TENANT_IDS`
- confirm the pilot tenant CRM credentials and mappings are valid in `/settings`
- confirm `/api/system/integrity` is reachable after deploy

## 3. Pilot Backfill Dry Run

Preview the legacy lead state changes before writing anything:

```bash
npm run crm:backfill-push-state -- --tenantId <pilot-tenant-id> --dryRun
```

Review:

- `matchedByStatus`
- `projectedQueued`
- `projectedFailedPreflight`
- `projectedSucceeded`
- `failureReasons`

## 4. Pilot Backfill Apply

Apply the queue-state backfill for the pilot tenant:

```bash
npm run crm:backfill-push-state -- --tenantId <pilot-tenant-id>
```

The backfill is idempotent. Re-running it should not duplicate work once the lead state is corrected.

## 5. Pilot Manual Cron Invocation

After backfill, either leave the tenant paused while verifying CRM config or resume queue processing.

To manually run the CRM push cron for the pilot:

```bash
curl -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  "https://revops.fulcrumcollective.io/api/cron/crm-push?tenantId=<pilot-tenant-id>"
```

If production is running on a Vercel scope that only allows daily cron jobs, use the manual signed cron call above for pilot validation and ad hoc queue drains until the project is upgraded.

## 6. Pilot Validation Checklist

Validate the pilot before expanding the allowlist:

- previously approved leads were converted to `queued`, `failed`, or `succeeded` correctly
- failed leads show the correct CRM preflight error in `/leads`
- queue processing creates CRM records and moves leads to `pushed_to_crm`
- `/leads` CRM Activity shows recent created, duplicate, auth, validation, and transient outcomes
- duplicate diagnostics on `/leads` match the recent `crm_push_events` mix
- expanded lead cards show recent CRM activity for retried or pushed leads
- `/api/system/integrity` and the dashboard show healthy or explainable CRM status
- no unexpected duplicate spike appears in `crm_push_events`

## 7. Expand the Allowlist

After the pilot is stable, extend `CORE_LAUNCH_TENANT_IDS` to include the remaining launch tenants and redeploy or update envs through the platform.

Example:

```bash
CORE_LAUNCH_TENANT_IDS=tenant-a,tenant-b,tenant-c
```

## 8. Full Backfill

Preview all allowlisted launch tenants:

```bash
npm run crm:backfill-push-state -- --allCoreLaunch --dryRun
```

Apply for all allowlisted launch tenants:

```bash
npm run crm:backfill-push-state -- --allCoreLaunch
```

## 9. Pause, Unpause, and Retry Procedures

### Pause or resume from the app

- Use the CRM Health card on `/leads`
- `Pause CRM Push` freezes queue processing for the tenant
- `Resume CRM Push` clears the pause flag only; it does not push synchronously

### Resume from CLI

```bash
npm run crm:unpause-tenant -- --tenantId <tenant-id>
```

### Retry failed leads from the app

- Use `Retry Failed Pushes` on `/leads` for tenant-wide retry
- Use `Retry CRM Push` in an expanded lead row for a single lead
- Use `CRM Activity` on `/leads` to inspect the affected lead history before retrying duplicate or auth failures

### Retry failed leads from CLI

```bash
npm run crm:requeue-failed-pushes -- --tenantId <tenant-id>
```

## 10. Rollback

Rollback is operational, not schema-based.

- Shrink `CORE_LAUNCH_TENANT_IDS` back to the pilot tenant or another known-safe subset
- Pause affected tenants from `/leads` or with operator tooling
- Do not revert the schema migration
- Re-run targeted backfill or retry commands only after the CRM configuration problem is fixed

## 11. Expansion Guardrails

- never expand the allowlist until the pilot tenant is stable
- never clear `CORE_LAUNCH_TENANT_IDS` accidentally during rollout
- use `/leads` CRM Activity and `/api/system/integrity` together when validating duplicate spikes or stale failures
