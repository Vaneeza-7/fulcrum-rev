import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    tenant: {
      findUniqueOrThrow: vi.fn(),
    },
    lead: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@/lib/crm/preflight', () => ({
  runCrmPreflight: vi.fn(),
}))

import { prisma } from '@/lib/db'
import { runCrmPreflight } from '@/lib/crm/preflight'
import {
  backfillCrmPushStateForTenants,
  backfillTenantCrmPushState,
} from '@/lib/leads/crm-push-backfill'

const tenant = {
  id: 'tenant-1',
  name: 'Pilot Tenant',
  crmType: 'hubspot',
  crmConfig: {},
}

function makeLead(overrides: Record<string, unknown>) {
  return {
    id: 'lead-1',
    tenantId: 'tenant-1',
    status: 'approved',
    crmLeadId: null,
    crmPushState: 'not_queued',
    crmPushLastError: null,
    approvedAt: null,
    approvedBy: null,
    pushedToCrmAt: null,
    discoveredAt: new Date('2026-03-01T10:00:00.000Z'),
    createdAt: new Date('2026-03-01T09:00:00.000Z'),
    updatedAt: new Date('2026-03-01T11:00:00.000Z'),
    fullName: 'Jordan Example',
    company: 'Acme',
    linkedinUrl: 'https://linkedin.com/in/jordan',
    ...overrides,
  }
}

describe('crm push backfill', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('summarizes dry-run projections for succeeded, queued, and failed-preflight leads', async () => {
    vi.mocked(prisma.tenant.findUniqueOrThrow).mockResolvedValue(tenant as any)
    vi.mocked(prisma.lead.findMany).mockResolvedValue(
      [
        makeLead({
          id: 'lead-succeeded',
          status: 'pushed_to_crm',
          crmPushState: 'not_queued',
          crmLeadId: 'crm-123',
          pushedToCrmAt: new Date('2026-03-02T12:00:00.000Z'),
        }),
        makeLead({ id: 'lead-queued' }),
        makeLead({ id: 'lead-failed' }),
      ] as any,
    )
    vi.mocked(runCrmPreflight)
      .mockReturnValueOnce({
        ok: true,
        connector: 'hubspot',
        crmConfig: {},
      } as any)
      .mockReturnValueOnce({
        ok: false,
        connector: 'hubspot',
        errorCode: 'crm_credentials_incomplete',
        message: 'HubSpot credentials are incomplete.',
      } as any)

    const result = await backfillTenantCrmPushState({ tenantId: 'tenant-1', dryRun: true })

    expect(result).toMatchObject({
      tenantId: 'tenant-1',
      tenantName: 'Pilot Tenant',
      projectedQueued: 1,
      projectedFailedPreflight: 1,
      projectedSucceeded: 1,
      updatedQueued: 0,
      updatedFailedPreflight: 0,
      updatedSucceeded: 0,
    })
    expect(result.failureReasons).toEqual([
      { message: 'HubSpot credentials are incomplete.', count: 1 },
    ])
  })

  it('applies backfill updates and is safe to rerun', async () => {
    vi.mocked(prisma.tenant.findUniqueOrThrow)
      .mockResolvedValueOnce(tenant as any)
      .mockResolvedValueOnce(tenant as any)
    vi.mocked(prisma.lead.findMany)
      .mockResolvedValueOnce([
        makeLead({
          id: 'lead-succeeded',
          status: 'pushed_to_crm',
          crmPushState: 'not_queued',
          crmLeadId: 'crm-123',
          pushedToCrmAt: new Date('2026-03-02T12:00:00.000Z'),
        }),
        makeLead({ id: 'lead-queued' }),
      ] as any)
      .mockResolvedValueOnce([] as any)
    vi.mocked(runCrmPreflight).mockReturnValue({
      ok: true,
      connector: 'hubspot',
      crmConfig: {},
    } as any)

    const firstRun = await backfillCrmPushStateForTenants({
      tenantIds: ['tenant-1'],
      dryRun: false,
    })
    const secondRun = await backfillCrmPushStateForTenants({
      tenantIds: ['tenant-1'],
      dryRun: false,
    })

    expect(firstRun[0]).toMatchObject({
      updatedQueued: 1,
      updatedSucceeded: 1,
      updatedFailedPreflight: 0,
    })
    expect(secondRun[0]).toMatchObject({
      updatedQueued: 0,
      updatedSucceeded: 0,
      updatedFailedPreflight: 0,
    })
    expect(prisma.lead.update).toHaveBeenCalledTimes(2)
  })
})
