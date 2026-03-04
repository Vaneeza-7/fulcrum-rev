import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth/get-authenticated-tenant', () => ({
  getAuthenticatedTenant: vi.fn(),
}))

vi.mock('@/lib/crm/push-events-service', () => ({
  listTenantCrmPushEvents: vi.fn(),
  getTenantCrmPushEventSummary: vi.fn(),
  listLeadCrmPushEvents: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    lead: {
      findFirst: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/db'
import { getAuthenticatedTenant } from '@/lib/auth/get-authenticated-tenant'
import {
  getTenantCrmPushEventSummary,
  listLeadCrmPushEvents,
  listTenantCrmPushEvents,
} from '@/lib/crm/push-events-service'
import { GET as getTenantEvents } from '@/app/api/crm/push-events/route'
import { GET as getTenantEventSummary } from '@/app/api/crm/push-events/summary/route'
import { GET as getLeadEvents } from '@/app/api/leads/[id]/crm-push-events/route'

describe('crm push event routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getAuthenticatedTenant).mockResolvedValue({
      tenant: { id: 'tenant-1' },
      userId: 'user-1',
    } as any)
  })

  it('enforces tenant auth on the tenant activity route', async () => {
    vi.mocked(getAuthenticatedTenant).mockResolvedValueOnce({
      error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    } as any)

    const response = await getTenantEvents(new NextRequest('http://localhost/api/crm/push-events'))
    if (!response) throw new Error('Expected a response')
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe('Unauthorized')
  })

  it('filters tenant activity by outcome, lead, and window', async () => {
    const leadId = '11111111-1111-4111-8111-111111111111'
    vi.mocked(listTenantCrmPushEvents).mockResolvedValue({
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
      filters: {
        leadId,
        outcome: 'duplicate_detected',
        errorCode: null,
        window: '7d',
        q: 'Jordan',
      },
      events: [],
    } as any)

    const response = await getTenantEvents(
      new NextRequest(
        `http://localhost/api/crm/push-events?leadId=${leadId}&outcome=duplicate_detected&window=7d&q=Jordan&page=1&pageSize=25`,
      ),
    )
    if (!response) throw new Error('Expected a response')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.filters).toMatchObject({
      leadId,
      outcome: 'duplicate_detected',
      window: '7d',
      q: 'Jordan',
    })
    expect(listTenantCrmPushEvents).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      filters: {
        leadId,
        outcome: 'duplicate_detected',
        errorCode: null,
        window: '7d',
        q: 'Jordan',
      },
      page: 1,
      pageSize: 25,
    })
  })

  it('returns tenant CRM activity summary', async () => {
    vi.mocked(getTenantCrmPushEventSummary).mockResolvedValue({
      window: '7d',
      totals: {
        created: 8,
        duplicates: 2,
        authFailed: 1,
        validationFailed: 0,
        transientFailed: 1,
        matchedExisting: 1,
        other: 0,
      },
      duplicateRate: '18.18',
      oldestFailedMinutes: 31,
      topDuplicateLeads: [],
      recentDuplicates: [],
    } as any)

    const response = await getTenantEventSummary(
      new NextRequest('http://localhost/api/crm/push-events/summary?window=7d'),
    )
    if (!response) throw new Error('Expected a response')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      window: '7d',
      duplicateRate: '18.18',
    })
  })

  it('rejects cross-tenant lead event access', async () => {
    vi.mocked(prisma.lead.findFirst).mockResolvedValue(null as any)

    const response = await getLeadEvents(
      new NextRequest('http://localhost/api/leads/lead-1/crm-push-events?limit=5'),
      { params: Promise.resolve({ id: 'lead-1' }) },
    )
    if (!response) throw new Error('Expected a response')
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toBe('Lead not found')
    expect(listLeadCrmPushEvents).not.toHaveBeenCalled()
  })

  it('returns recent lead CRM activity when the lead belongs to the tenant', async () => {
    vi.mocked(prisma.lead.findFirst).mockResolvedValue({ id: 'lead-1' } as any)
    vi.mocked(listLeadCrmPushEvents).mockResolvedValue([
      {
        id: 'event-1',
        tenantId: 'tenant-1',
        leadId: 'lead-1',
        leadName: 'Jordan Example',
        company: 'Acme',
        connector: 'hubspot',
        outcome: 'created',
        rawOutcome: 'created',
        crmObjectId: 'hs-123',
        attemptNumber: 1,
        errorCode: null,
        errorMessage: null,
        createdAt: '2026-03-04T15:00:00.000Z',
        metadata: { source: 'cron' },
      },
    ] as any)

    const response = await getLeadEvents(
      new NextRequest('http://localhost/api/leads/lead-1/crm-push-events?limit=5'),
      { params: Promise.resolve({ id: 'lead-1' }) },
    )
    if (!response) throw new Error('Expected a response')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.leadId).toBe('lead-1')
    expect(body.events).toHaveLength(1)
    expect(listLeadCrmPushEvents).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      leadId: 'lead-1',
      limit: 5,
    })
  })
})
