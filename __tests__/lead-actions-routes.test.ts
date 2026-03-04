import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/get-authenticated-tenant', () => ({
  getAuthenticatedTenant: vi.fn(),
}))

vi.mock('@/lib/leads/review', () => ({
  bulkApproveLeadsByGrade: vi.fn(),
}))

vi.mock('@/lib/leads/crm-queue-ops', () => ({
  requeueLeadForCrmPush: vi.fn(),
  requeueFailedLeadsForTenant: vi.fn(),
  serializeLeadActionSnapshot: vi.fn((lead: unknown) => lead),
}))

import { getAuthenticatedTenant } from '@/lib/auth/get-authenticated-tenant'
import { bulkApproveLeadsByGrade } from '@/lib/leads/review'
import {
  requeueFailedLeadsForTenant,
  requeueLeadForCrmPush,
} from '@/lib/leads/crm-queue-ops'
import { POST as postBulkLeadAction } from '@/app/api/leads/actions/route'
import { POST as postLeadAction } from '@/app/api/leads/[id]/actions/route'

describe('lead action routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getAuthenticatedTenant).mockResolvedValue({
      tenant: { id: 'tenant-1' },
      userId: 'user-1',
    } as any)
  })

  it('retries a single CRM push through the id action route', async () => {
    vi.mocked(requeueLeadForCrmPush).mockResolvedValue({
      message: 'Lead re-queued for CRM push.',
      lead: {
        id: 'lead-1',
        status: 'approved',
        crmPushState: 'queued',
        crmPushLastError: null,
        approvedAt: '2026-03-04T15:00:00.000Z',
        approvedBy: 'user-1',
        crmLeadId: null,
      },
    } as any)

    const response = await postLeadAction(
      new Request('http://localhost/api/leads/lead-1/actions', {
        method: 'POST',
        body: JSON.stringify({ action: 'retry_crm_push' }),
      }),
      { params: Promise.resolve({ id: 'lead-1' }) },
    )
    if (!response) throw new Error('Expected a response')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.message).toBe('Lead re-queued for CRM push.')
    expect(requeueLeadForCrmPush).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      leadId: 'lead-1',
      requestedBy: 'user-1',
    })
  })

  it('returns 409 when a single-lead CRM retry is invalid', async () => {
    vi.mocked(requeueLeadForCrmPush).mockRejectedValue(
      new Error('Lead cannot be retried from status approved (queued)'),
    )

    const response = await postLeadAction(
      new Request('http://localhost/api/leads/lead-1/actions', {
        method: 'POST',
        body: JSON.stringify({ action: 'retry_crm_push' }),
      }),
      { params: Promise.resolve({ id: 'lead-1' }) },
    )
    if (!response) throw new Error('Expected a response')
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toContain('Lead cannot be retried')
  })

  it('bulk-approves selected grades across the review queue', async () => {
    vi.mocked(bulkApproveLeadsByGrade).mockResolvedValue({
      total: 4,
      approved: 3,
      failedPreflight: 1,
      errors: ['HubSpot credentials are incomplete.'],
    } as any)

    const response = await postBulkLeadAction(
      new Request('http://localhost/api/leads/actions', {
        method: 'POST',
        body: JSON.stringify({ action: 'bulk_approve_by_grade', grades: ['A+', 'A'] }),
      }),
    )
    if (!response) throw new Error('Expected a response')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      action: 'bulk_approve_by_grade',
      totalMatched: 4,
      approved: 3,
      failedPreflight: 1,
    })
  })

  it('bulk-retries failed CRM pushes', async () => {
    vi.mocked(requeueFailedLeadsForTenant).mockResolvedValue({
      totalMatched: 5,
      queued: 4,
      stillFailed: 1,
      errors: [{ message: 'HubSpot credentials are incomplete.', count: 1 }],
    })

    const response = await postBulkLeadAction(
      new Request('http://localhost/api/leads/actions', {
        method: 'POST',
        body: JSON.stringify({ action: 'retry_failed_crm_pushes' }),
      }),
    )
    if (!response) throw new Error('Expected a response')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      action: 'retry_failed_crm_pushes',
      totalMatched: 5,
      queued: 4,
      stillFailed: 1,
    })
  })
})
