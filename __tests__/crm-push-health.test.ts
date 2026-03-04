import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    tenant: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    lead: {
      count: vi.fn(),
      findFirst: vi.fn(),
    },
    crmPushEvent: {
      count: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/db'
import {
  evaluateAndMaybePauseTenantCrmPush,
  getTenantCrmHealthSummary,
} from '@/lib/health/crm-push-health'

describe('crm push health', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports GREEN when the queue is healthy', async () => {
    vi.mocked(prisma.tenant.findUniqueOrThrow).mockResolvedValue({
      crmType: 'hubspot',
      crmPushPaused: false,
    } as any)
    vi.mocked(prisma.lead.count)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
    vi.mocked(prisma.lead.findFirst)
      .mockResolvedValueOnce({ crmPushQueuedAt: new Date(Date.now() - 5 * 60_000) } as any)
      .mockResolvedValueOnce(null as any)
    vi.mocked(prisma.crmPushEvent.count).mockResolvedValueOnce(10).mockResolvedValueOnce(0)

    const result = await getTenantCrmHealthSummary('tenant-1')

    expect(result.level).toBe('GREEN')
    expect(result.message).toBe('HubSpot push is healthy.')
  })

  it('reports RED when duplicate creation risk is elevated', async () => {
    vi.mocked(prisma.tenant.findUniqueOrThrow).mockResolvedValue({
      crmType: 'hubspot',
      crmPushPaused: false,
    } as any)
    vi.mocked(prisma.lead.count)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
    vi.mocked(prisma.lead.findFirst).mockResolvedValueOnce(null as any).mockResolvedValueOnce(null as any)
    vi.mocked(prisma.crmPushEvent.count).mockResolvedValueOnce(100).mockResolvedValueOnce(1)

    const result = await getTenantCrmHealthSummary('tenant-1')

    expect(result.level).toBe('RED')
    expect(result.message).toBe('HubSpot duplication risk is elevated.')
  })

  it('auto-pauses tenants when too many approved leads have failed for too long', async () => {
    vi.mocked(prisma.tenant.findUniqueOrThrow).mockResolvedValue({
      crmPushPaused: false,
    } as any)
    vi.mocked(prisma.lead.count).mockResolvedValueOnce(10)
    vi.mocked(prisma.crmPushEvent.count).mockResolvedValueOnce(0).mockResolvedValueOnce(0)
    vi.mocked(prisma.tenant.update).mockResolvedValue({
      crmPushPaused: true,
      crmPushPauseReason: 'CRM push paused because too many approved leads have been failing for more than 30 minutes.',
      crmPushPausedAt: new Date('2026-03-04T15:00:00.000Z'),
    } as any)

    const result = await evaluateAndMaybePauseTenantCrmPush('tenant-1')

    expect(result).toEqual({
      paused: true,
      changed: true,
      reason: 'CRM push paused because too many approved leads have been failing for more than 30 minutes.',
    })
    expect(prisma.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tenant-1' },
        data: expect.objectContaining({
          crmPushPaused: true,
        }),
      }),
    )
  })
})
