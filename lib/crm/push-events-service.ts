import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  formatCrmPushDuplicateRate,
  getCrmPushEventWindowStart,
  isCrmPushFailureOutcome,
  normalizeCrmPushEventOutcome,
  type CrmPushEventFilters,
  type CrmPushEventListItem,
  type CrmPushEventListResponse,
  type CrmPushEventMetadata,
  type CrmPushEventOutcome,
  type CrmPushEventSummary,
  type CrmPushEventWindow,
} from '@/lib/crm/push-events'

const KNOWN_DB_OUTCOME_VALUES = [
  'created',
  'matched_existing',
  'duplicate_detected',
  'auth_failed',
  'validation_failed',
  'transient_failed',
] as const

function normalizeMetadata(metadata: unknown): CrmPushEventMetadata {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {}
  }

  const record = metadata as Record<string, unknown>

  return {
    stage: record.stage === 'preflight' || record.stage === 'push' ? record.stage : undefined,
    rawError: typeof record.rawError === 'string' ? record.rawError : undefined,
    retry: typeof record.retry === 'number' ? record.retry : undefined,
    source: record.source === 'cron' ? 'cron' : undefined,
    duplicateHint:
      typeof record.duplicateHint === 'string'
        ? record.duplicateHint
        : record.duplicateHint === null
          ? null
          : undefined,
  }
}

function serializeEvent(
  event: {
    id: string
    tenantId: string
    leadId: string
    connector: string
    outcome: string
    crmObjectId: string | null
    attemptNumber: number
    errorCode: string | null
    errorMessage: string | null
    createdAt: Date
    metadata: unknown
    lead: {
      fullName: string
      company: string | null
    }
  },
): CrmPushEventListItem {
  return {
    id: event.id,
    tenantId: event.tenantId,
    leadId: event.leadId,
    leadName: event.lead.fullName,
    company: event.lead.company,
    connector: event.connector,
    outcome: normalizeCrmPushEventOutcome(event.outcome),
    rawOutcome: event.outcome,
    crmObjectId: event.crmObjectId,
    attemptNumber: event.attemptNumber,
    errorCode: event.errorCode,
    errorMessage: event.errorMessage,
    createdAt: event.createdAt.toISOString(),
    metadata: normalizeMetadata(event.metadata),
  }
}

function buildOutcomeWhere(outcome: CrmPushEventOutcome | null | undefined): Prisma.CrmPushEventWhereInput {
  if (!outcome) return {}
  if (outcome === 'other') {
    return {
      outcome: {
        notIn: [...KNOWN_DB_OUTCOME_VALUES],
      },
    }
  }

  return { outcome }
}

function buildTenantEventWhere(input: {
  tenantId: string
  filters: CrmPushEventFilters
}): Prisma.CrmPushEventWhereInput {
  const normalizedQuery = input.filters.q?.trim() ?? null

  return {
    tenantId: input.tenantId,
    createdAt: { gte: getCrmPushEventWindowStart(input.filters.window) },
    ...(input.filters.leadId ? { leadId: input.filters.leadId } : {}),
    ...(input.filters.errorCode ? { errorCode: input.filters.errorCode } : {}),
    ...buildOutcomeWhere(input.filters.outcome),
    ...(normalizedQuery
      ? {
          lead: {
            is: {
              OR: [
                { fullName: { contains: normalizedQuery, mode: 'insensitive' } },
                { company: { contains: normalizedQuery, mode: 'insensitive' } },
              ],
            },
          },
        }
      : {}),
  }
}

export async function listTenantCrmPushEvents(input: {
  tenantId: string
  filters: CrmPushEventFilters
  page?: number
  pageSize?: number
}): Promise<CrmPushEventListResponse> {
  const page = Math.max(1, input.page ?? 1)
  const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 25))
  const where = buildTenantEventWhere({
    tenantId: input.tenantId,
    filters: input.filters,
  })

  const [total, events] = await Promise.all([
    prisma.crmPushEvent.count({ where }),
    prisma.crmPushEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        lead: {
          select: {
            fullName: true,
            company: true,
          },
        },
      },
    }),
  ])

  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    filters: {
      leadId: input.filters.leadId ?? null,
      outcome: input.filters.outcome ?? null,
      errorCode: input.filters.errorCode ?? null,
      window: input.filters.window,
      q: input.filters.q?.trim() || null,
    },
    events: events.map(serializeEvent),
  }
}

export async function getTenantCrmPushEventSummary(input: {
  tenantId: string
  window?: CrmPushEventWindow
}): Promise<CrmPushEventSummary> {
  const window = input.window ?? '7d'
  const createdAt = { gte: getCrmPushEventWindowStart(window) }

  const [groupedByOutcome, oldestFailure, duplicateGroups, recentDuplicates] = await Promise.all([
    prisma.crmPushEvent.groupBy({
      by: ['outcome'],
      where: {
        tenantId: input.tenantId,
        createdAt,
      },
      _count: {
        _all: true,
      },
    }),
    prisma.crmPushEvent.findFirst({
      where: {
        tenantId: input.tenantId,
        createdAt,
        outcome: {
          notIn: ['created', 'matched_existing', 'duplicate_detected'],
        },
      },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    prisma.crmPushEvent.groupBy({
      by: ['leadId'],
      where: {
        tenantId: input.tenantId,
        createdAt,
        outcome: 'duplicate_detected',
      },
      _count: {
        _all: true,
      },
      orderBy: {
        _count: {
          leadId: 'desc',
        },
      },
      take: 5,
    }),
    prisma.crmPushEvent.findMany({
      where: {
        tenantId: input.tenantId,
        createdAt,
        outcome: 'duplicate_detected',
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        lead: {
          select: {
            fullName: true,
            company: true,
          },
        },
      },
    }),
  ])

  const totals = {
    created: 0,
    duplicates: 0,
    authFailed: 0,
    validationFailed: 0,
    transientFailed: 0,
    matchedExisting: 0,
    other: 0,
  }

  for (const row of groupedByOutcome) {
    const normalized = normalizeCrmPushEventOutcome(row.outcome)
    const count = row._count._all

    switch (normalized) {
      case 'created':
        totals.created += count
        break
      case 'matched_existing':
        totals.matchedExisting += count
        break
      case 'duplicate_detected':
        totals.duplicates += count
        break
      case 'auth_failed':
        totals.authFailed += count
        break
      case 'validation_failed':
        totals.validationFailed += count
        break
      case 'transient_failed':
        totals.transientFailed += count
        break
      case 'other':
        totals.other += count
        break
    }
  }

  const duplicateDenominator = totals.created + totals.matchedExisting + totals.duplicates
  const duplicateLeadIds = duplicateGroups.map((row) => row.leadId)
  const duplicateLeads =
    duplicateLeadIds.length > 0
      ? await prisma.lead.findMany({
          where: {
            tenantId: input.tenantId,
            id: { in: duplicateLeadIds },
          },
          select: {
            id: true,
            fullName: true,
            company: true,
          },
        })
      : []

  const duplicateLeadMap = new Map(
    duplicateLeads.map((lead) => [
      lead.id,
      {
        leadName: lead.fullName,
        company: lead.company,
      },
    ]),
  )

  return {
    window,
    totals,
    duplicateRate: formatCrmPushDuplicateRate(totals.duplicates, duplicateDenominator),
    oldestFailedMinutes: oldestFailure
      ? Math.max(0, Math.floor((Date.now() - oldestFailure.createdAt.getTime()) / 60000))
      : null,
    topDuplicateLeads: duplicateGroups.map((row) => ({
      leadId: row.leadId,
      leadName: duplicateLeadMap.get(row.leadId)?.leadName ?? 'Unknown lead',
      company: duplicateLeadMap.get(row.leadId)?.company ?? null,
      duplicateCount: row._count._all,
    })),
    recentDuplicates: recentDuplicates.map(serializeEvent),
  }
}

export async function listLeadCrmPushEvents(input: {
  tenantId: string
  leadId: string
  limit?: number
}): Promise<CrmPushEventListItem[]> {
  const limit = Math.min(20, Math.max(1, input.limit ?? 5))

  const events = await prisma.crmPushEvent.findMany({
    where: {
      tenantId: input.tenantId,
      leadId: input.leadId,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      lead: {
        select: {
          fullName: true,
          company: true,
        },
      },
    },
  })

  return events.map(serializeEvent)
}

export function deriveCrmFailureCount(summary: CrmPushEventSummary) {
  return (
    summary.totals.authFailed +
    summary.totals.validationFailed +
    summary.totals.transientFailed +
    summary.totals.other
  )
}

export function deriveCrmFailureOutcome(outcome: string | null | undefined) {
  return isCrmPushFailureOutcome(normalizeCrmPushEventOutcome(outcome))
}
