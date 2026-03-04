import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    crmPushEvent: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      groupBy: vi.fn(),
    },
    lead: {
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/db'
import {
  getTenantCrmPushEventSummary,
  listLeadCrmPushEvents,
  listTenantCrmPushEvents,
} from '@/lib/crm/push-events-service'

describe('crm push events service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists tenant events with pagination and normalizes unknown outcomes', async () => {
    vi.mocked(prisma.crmPushEvent.count).mockResolvedValue(3)
    vi.mocked(prisma.crmPushEvent.findMany).mockResolvedValue([
      {
        id: 'event-1',
        tenantId: 'tenant-1',
        leadId: 'lead-1',
        connector: 'hubspot',
        outcome: 'mystery_failure',
        crmObjectId: null,
        attemptNumber: 2,
        errorCode: 'mystery_failure',
        errorMessage: 'Unknown failure',
        createdAt: new Date('2026-03-04T15:00:00.000Z'),
        metadata: {
          source: 'cron',
        },
        lead: {
          fullName: 'Jordan Example',
          company: 'Acme',
        },
      },
    ] as any)

    const result = await listTenantCrmPushEvents({
      tenantId: 'tenant-1',
      filters: {
        window: '7d',
        outcome: null,
        q: 'Jordan',
      },
      page: 2,
      pageSize: 2,
    })

    expect(result).toMatchObject({
      page: 2,
      pageSize: 2,
      total: 3,
      totalPages: 2,
      filters: {
        window: '7d',
        q: 'Jordan',
      },
    })
    expect(result.events[0]).toMatchObject({
      id: 'event-1',
      outcome: 'other',
      rawOutcome: 'mystery_failure',
      leadName: 'Jordan Example',
    })
    expect(prisma.crmPushEvent.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          lead: {
            is: {
              OR: expect.any(Array),
            },
          },
        }),
      }),
    )
  })

  it('builds summary totals, duplicate rate, and top duplicate leads', async () => {
    vi.mocked(prisma.crmPushEvent.groupBy)
      .mockResolvedValueOnce([
        { outcome: 'created', _count: { _all: 10 } },
        { outcome: 'matched_existing', _count: { _all: 2 } },
        { outcome: 'duplicate_detected', _count: { _all: 2 } },
        { outcome: 'auth_failed', _count: { _all: 1 } },
        { outcome: 'validation_failed', _count: { _all: 3 } },
        { outcome: 'legacy_unknown', _count: { _all: 4 } },
      ] as any)
      .mockResolvedValueOnce([
        { leadId: 'lead-1', _count: { _all: 2 } },
        { leadId: 'lead-2', _count: { _all: 1 } },
      ] as any)
    vi.mocked(prisma.crmPushEvent.findFirst).mockResolvedValue({
      createdAt: new Date(Date.now() - 42 * 60_000),
    } as any)
    vi.mocked(prisma.crmPushEvent.findMany).mockResolvedValue([
      {
        id: 'event-2',
        tenantId: 'tenant-1',
        leadId: 'lead-1',
        connector: 'hubspot',
        outcome: 'duplicate_detected',
        crmObjectId: 'hs-123',
        attemptNumber: 3,
        errorCode: 'duplicate_detected',
        errorMessage: 'Duplicate detected in the CRM.',
        createdAt: new Date('2026-03-04T15:30:00.000Z'),
        metadata: {
          source: 'cron',
          duplicateHint: 'Duplicate detected in the CRM.',
        },
        lead: {
          fullName: 'Jordan Example',
          company: 'Acme',
        },
      },
    ] as any)
    vi.mocked(prisma.lead.findMany).mockResolvedValue([
      {
        id: 'lead-1',
        fullName: 'Jordan Example',
        company: 'Acme',
      },
      {
        id: 'lead-2',
        fullName: 'Taylor Example',
        company: 'Beta Corp',
      },
    ] as any)

    const summary = await getTenantCrmPushEventSummary({
      tenantId: 'tenant-1',
      window: '7d',
    })

    expect(summary.totals).toEqual({
      created: 10,
      duplicates: 2,
      authFailed: 1,
      validationFailed: 3,
      transientFailed: 0,
      matchedExisting: 2,
      other: 4,
    })
    expect(summary.duplicateRate).toBe('14.29')
    expect(summary.oldestFailedMinutes).toBeGreaterThanOrEqual(42)
    expect(summary.topDuplicateLeads).toEqual([
      {
        leadId: 'lead-1',
        leadName: 'Jordan Example',
        company: 'Acme',
        duplicateCount: 2,
      },
      {
        leadId: 'lead-2',
        leadName: 'Taylor Example',
        company: 'Beta Corp',
        duplicateCount: 1,
      },
    ])
    expect(summary.recentDuplicates[0]).toMatchObject({
      id: 'event-2',
      outcome: 'duplicate_detected',
    })
  })

  it('returns newest-first lead activity limited by the requested cap', async () => {
    vi.mocked(prisma.crmPushEvent.findMany).mockResolvedValue([
      {
        id: 'event-3',
        tenantId: 'tenant-1',
        leadId: 'lead-1',
        connector: 'hubspot',
        outcome: 'created',
        crmObjectId: 'hs-123',
        attemptNumber: 2,
        errorCode: null,
        errorMessage: null,
        createdAt: new Date('2026-03-04T16:00:00.000Z'),
        metadata: {
          stage: 'push',
          retry: 1,
          source: 'cron',
        },
        lead: {
          fullName: 'Jordan Example',
          company: 'Acme',
        },
      },
      {
        id: 'event-4',
        tenantId: 'tenant-1',
        leadId: 'lead-1',
        connector: 'hubspot',
        outcome: 'validation_failed',
        crmObjectId: null,
        attemptNumber: 1,
        errorCode: 'validation_failed',
        errorMessage: 'Lead is missing a company.',
        createdAt: new Date('2026-03-04T15:00:00.000Z'),
        metadata: {
          stage: 'preflight',
          retry: 0,
          source: 'cron',
        },
        lead: {
          fullName: 'Jordan Example',
          company: 'Acme',
        },
      },
    ] as any)

    const events = await listLeadCrmPushEvents({
      tenantId: 'tenant-1',
      leadId: 'lead-1',
      limit: 5,
    })

    expect(events).toHaveLength(2)
    expect(events[0].id).toBe('event-3')
    expect(events[1].id).toBe('event-4')
  })
})
