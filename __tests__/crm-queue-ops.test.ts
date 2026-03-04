import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    lead: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    tenant: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
  },
  auditLog: vi.fn(),
}))

vi.mock('@/lib/crm/preflight', () => ({
  runCrmPreflight: vi.fn(),
}))

import { auditLog, prisma } from '@/lib/db'
import { runCrmPreflight } from '@/lib/crm/preflight'
import {
  pauseTenantCrmPush,
  requeueFailedLeadsForTenant,
  requeueLeadForCrmPush,
  unpauseTenantCrmPush,
} from '@/lib/leads/crm-queue-ops'

const failedLead = {
  id: 'lead-1',
  tenantId: 'tenant-1',
  fullName: 'Jamie Example',
  company: 'Acme',
  linkedinUrl: 'https://linkedin.com/in/jamie',
  status: 'approved',
  crmLeadId: null,
  crmPushState: 'failed',
  crmPushLastError: 'CRM config missing',
  approvedAt: new Date('2026-03-01T12:00:00.000Z'),
  approvedBy: 'user-1',
}

const tenant = {
  id: 'tenant-1',
  crmType: 'hubspot',
  crmConfig: {},
  crmPushPaused: false,
  crmPushPauseReason: null,
  crmPushPausedAt: null,
}

describe('crm queue ops', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requeues a failed lead when CRM preflight passes', async () => {
    vi.mocked(prisma.lead.findFirst).mockResolvedValue(failedLead as any)
    vi.mocked(prisma.tenant.findUniqueOrThrow).mockResolvedValue(tenant as any)
    vi.mocked(runCrmPreflight).mockReturnValue({
      ok: true,
      connector: 'hubspot',
      crmConfig: {},
    } as any)
    vi.mocked(prisma.lead.update).mockResolvedValue({
      ...failedLead,
      crmPushState: 'queued',
      crmPushLastError: null,
    } as any)

    const result = await requeueLeadForCrmPush({
      tenantId: 'tenant-1',
      leadId: 'lead-1',
      requestedBy: 'operator-1',
    })

    expect(result.queued).toBe(true)
    expect(result.message).toBe('Lead re-queued for CRM push.')
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-1' },
        data: expect.objectContaining({
          crmPushState: 'queued',
          crmPushLastError: null,
          approvedBy: 'user-1',
        }),
      }),
    )
    expect(auditLog).toHaveBeenCalledWith(
      'tenant-1',
      'lead_retry_queued',
      'lead-1',
      expect.objectContaining({
        requestedBy: 'operator-1',
        crmPreflightPassed: true,
      }),
    )
  })

  it('keeps a failed lead failed when CRM preflight still fails', async () => {
    vi.mocked(prisma.lead.findFirst).mockResolvedValue(failedLead as any)
    vi.mocked(prisma.tenant.findUniqueOrThrow).mockResolvedValue(tenant as any)
    vi.mocked(runCrmPreflight).mockReturnValue({
      ok: false,
      connector: 'hubspot',
      errorCode: 'crm_credentials_incomplete',
      message: 'HubSpot credentials are incomplete.',
    } as any)
    vi.mocked(prisma.lead.update).mockResolvedValue({
      ...failedLead,
      crmPushState: 'failed',
      crmPushLastError: 'HubSpot credentials are incomplete.',
    } as any)

    const result = await requeueLeadForCrmPush({
      tenantId: 'tenant-1',
      leadId: 'lead-1',
      requestedBy: 'operator-1',
    })

    expect(result.queued).toBe(false)
    expect(result.message).toBe('HubSpot credentials are incomplete.')
    expect(auditLog).toHaveBeenCalledWith(
      'tenant-1',
      'lead_retry_preflight_failed',
      'lead-1',
      expect.objectContaining({
        crmPreflightPassed: false,
        errorCode: 'crm_credentials_incomplete',
      }),
    )
  })

  it('bulk requeue aggregates queued and still-failed leads', async () => {
    vi.mocked(prisma.lead.findMany).mockResolvedValue([{ id: 'lead-1' }, { id: 'lead-2' }] as any)
    vi.mocked(prisma.lead.findFirst)
      .mockResolvedValueOnce(failedLead as any)
      .mockResolvedValueOnce({ ...failedLead, id: 'lead-2' } as any)
    vi.mocked(prisma.tenant.findUniqueOrThrow).mockResolvedValue(tenant as any)
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
    vi.mocked(prisma.lead.update)
      .mockResolvedValueOnce({
        ...failedLead,
        crmPushState: 'queued',
        crmPushLastError: null,
      } as any)
      .mockResolvedValueOnce({
        ...failedLead,
        id: 'lead-2',
        crmPushState: 'failed',
        crmPushLastError: 'HubSpot credentials are incomplete.',
      } as any)

    const result = await requeueFailedLeadsForTenant({
      tenantId: 'tenant-1',
      requestedBy: 'operator-1',
    })

    expect(result).toEqual({
      totalMatched: 2,
      queued: 1,
      stillFailed: 1,
      errors: [{ message: 'HubSpot credentials are incomplete.', count: 1 }],
    })
    expect(auditLog).toHaveBeenCalledWith(
      'tenant-1',
      'crm_push_bulk_retry',
      undefined,
      expect.objectContaining({
        totalMatched: 2,
        queued: 1,
        stillFailed: 1,
      }),
    )
  })

  it('pauses and unpauses the CRM queue idempotently', async () => {
    vi.mocked(prisma.tenant.findUniqueOrThrow)
      .mockResolvedValueOnce(tenant as any)
      .mockResolvedValueOnce({ ...tenant, crmPushPaused: true, crmPushPauseReason: 'Paused by operator.' } as any)
      .mockResolvedValueOnce({ ...tenant, crmPushPaused: true, crmPushPauseReason: 'Paused by operator.' } as any)
      .mockResolvedValueOnce(tenant as any)
    vi.mocked(prisma.tenant.update)
      .mockResolvedValueOnce({
        crmPushPaused: true,
        crmPushPauseReason: 'Paused by operator.',
        crmPushPausedAt: new Date('2026-03-04T15:00:00.000Z'),
      } as any)
      .mockResolvedValueOnce({
        crmPushPaused: false,
        crmPushPauseReason: null,
        crmPushPausedAt: null,
      } as any)

    const paused = await pauseTenantCrmPush({
      tenantId: 'tenant-1',
      requestedBy: 'operator-1',
    })
    const pausedAgain = await pauseTenantCrmPush({
      tenantId: 'tenant-1',
      requestedBy: 'operator-1',
    })
    const resumed = await unpauseTenantCrmPush({
      tenantId: 'tenant-1',
      requestedBy: 'operator-1',
    })
    const resumedAgain = await unpauseTenantCrmPush({
      tenantId: 'tenant-1',
      requestedBy: 'operator-1',
    })

    expect(paused.changed).toBe(true)
    expect(pausedAgain.changed).toBe(false)
    expect(resumed.changed).toBe(true)
    expect(resumedAgain.changed).toBe(false)
    expect(auditLog).toHaveBeenCalledWith(
      'tenant-1',
      'crm_push_paused_by_operator',
      undefined,
      expect.objectContaining({ requestedBy: 'operator-1' }),
    )
    expect(auditLog).toHaveBeenCalledWith(
      'tenant-1',
      'crm_push_unpaused_by_operator',
      undefined,
      expect.objectContaining({ requestedBy: 'operator-1' }),
    )
  })
})
