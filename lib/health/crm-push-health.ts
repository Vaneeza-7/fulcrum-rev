import { prisma } from '@/lib/db'
import { getTenantCrmPushEventSummary } from '@/lib/crm/push-events-service'
import type { IntegrityStatus } from '@/lib/types/integrity'

export interface TenantCrmHealthSummary {
  level: IntegrityStatus
  queuedCount: number
  failedCount: number
  oldestQueuedMinutes: number | null
  oldestFailedMinutes: number | null
  duplicateRate30d: string
  paused: boolean
  message: string
  action: string
}

function minutesSince(date: Date | null | undefined) {
  if (!date) return null
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000))
}

function buildMessage(summary: Omit<TenantCrmHealthSummary, 'message' | 'action'> & { crmLabel: string }) {
  if (summary.paused) {
    return {
      message: `CRM push is paused for ${summary.crmLabel}. Approved leads will stay queued until the issue is fixed.`,
      action: 'Open Leads filtered to Waiting to Push or Failed to Push, then fix CRM credentials or mappings before unpausing.',
    }
  }

  if (summary.failedCount > 0 && (summary.oldestFailedMinutes ?? 0) >= 15) {
    return {
      message: `Some approved leads are stuck before ${summary.crmLabel} push.`,
      action: 'Open Leads filtered to Failed to Push or Waiting to Push and fix the listed CRM issue.',
    }
  }

  if (summary.queuedCount > 10 && (summary.oldestQueuedMinutes ?? 0) >= 15) {
    return {
      message: `Approved leads are backing up before ${summary.crmLabel} push.`,
      action: 'Open Leads filtered to Waiting to Push and verify CRM push is running normally.',
    }
  }

  if (Number(summary.duplicateRate30d) >= 0.5) {
    return {
      message: `${summary.crmLabel} duplication risk is elevated.`,
      action: 'Review recent CRM push events and fix duplicate handling before approving more leads.',
    }
  }

  return {
    message: `${summary.crmLabel} push is healthy.`,
    action: 'No action required.',
  }
}

function crmLabel(crmType: string | null | undefined) {
  switch (crmType) {
    case 'hubspot':
      return 'HubSpot'
    case 'salesforce':
      return 'Salesforce'
    case 'zoho':
      return 'Zoho'
    default:
      return 'CRM'
  }
}

export async function getTenantCrmHealthSummary(tenantId: string): Promise<TenantCrmHealthSummary> {
  const now = new Date()
  const [tenant, queuedCount, failedCount, queuedOlderThan15, failedOlderThan15, oldestQueued, oldestFailed, summary30d] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        crmType: true,
        crmPushPaused: true,
      },
    }),
    prisma.lead.count({
      where: {
        tenantId,
        status: 'approved',
        crmPushState: { in: ['queued', 'processing'] },
      },
    }),
    prisma.lead.count({
      where: {
        tenantId,
        status: 'approved',
        crmPushState: 'failed',
      },
    }),
    prisma.lead.count({
      where: {
        tenantId,
        status: 'approved',
        crmPushState: { in: ['queued', 'processing'] },
        crmPushQueuedAt: { lt: new Date(now.getTime() - 15 * 60_000) },
      },
    }),
    prisma.lead.count({
      where: {
        tenantId,
        status: 'approved',
        crmPushState: 'failed',
        updatedAt: { lt: new Date(now.getTime() - 15 * 60_000) },
      },
    }),
    prisma.lead.findFirst({
      where: {
        tenantId,
        status: 'approved',
        crmPushState: { in: ['queued', 'processing'] },
        crmPushQueuedAt: { not: null },
      },
      orderBy: { crmPushQueuedAt: 'asc' },
      select: { crmPushQueuedAt: true },
    }),
    prisma.lead.findFirst({
      where: {
        tenantId,
        status: 'approved',
        crmPushState: 'failed',
      },
      orderBy: { updatedAt: 'asc' },
      select: { updatedAt: true },
    }),
    getTenantCrmPushEventSummary({
      tenantId,
      window: '30d',
    }),
  ])

  const duplicateRate30d = summary30d.duplicateRate

  let level: IntegrityStatus = 'GREEN'
  if (tenant.crmPushPaused || failedOlderThan15 >= 5 || Number(duplicateRate30d) >= 0.5) {
    level = 'RED'
  } else if (failedOlderThan15 >= 1 || queuedOlderThan15 > 10) {
    level = 'AMBER'
  }

  const base = {
    level,
    queuedCount,
    failedCount,
    oldestQueuedMinutes: minutesSince(oldestQueued?.crmPushQueuedAt),
    oldestFailedMinutes: minutesSince(oldestFailed?.updatedAt),
    duplicateRate30d,
    paused: tenant.crmPushPaused,
    crmLabel: crmLabel(tenant.crmType),
  }

  const messaging = buildMessage(base)

  return {
    level: base.level,
    queuedCount: base.queuedCount,
    failedCount: base.failedCount,
    oldestQueuedMinutes: base.oldestQueuedMinutes,
    oldestFailedMinutes: base.oldestFailedMinutes,
    duplicateRate30d: base.duplicateRate30d,
    paused: base.paused,
    message: messaging.message,
    action: messaging.action,
  }
}

export async function evaluateAndMaybePauseTenantCrmPush(tenantId: string) {
  const now = new Date()
  const [tenant, oldFailedCount, summary7d] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        crmPushPaused: true,
      },
    }),
    prisma.lead.count({
      where: {
        tenantId,
        status: 'approved',
        crmPushState: 'failed',
        updatedAt: { lt: new Date(now.getTime() - 30 * 60_000) },
      },
    }),
    getTenantCrmPushEventSummary({
      tenantId,
      window: '7d',
    }),
  ])

  const duplicateRate7d = Number(summary7d.duplicateRate)
  const duplicateCount7d = summary7d.totals.duplicates
  const shouldPause = (duplicateCount7d >= 2 && duplicateRate7d >= 0.5) || oldFailedCount >= 10

  if (!shouldPause || tenant.crmPushPaused) {
    return {
      paused: tenant.crmPushPaused,
      changed: false,
      reason: null,
    }
  }

  const reason =
    oldFailedCount >= 10
      ? 'CRM push paused because too many approved leads have been failing for more than 30 minutes.'
      : 'CRM push paused because duplicate creation risk exceeded the safe threshold.'

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      crmPushPaused: true,
      crmPushPauseReason: reason,
      crmPushPausedAt: now,
    },
  })

  return {
    paused: true,
    changed: true,
    reason,
  }
}
