import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/get-authenticated-tenant', () => ({
  getAuthenticatedTenant: vi.fn(),
}))

vi.mock('@/lib/leads/crm-queue-ops', () => ({
  pauseTenantCrmPush: vi.fn(),
  unpauseTenantCrmPush: vi.fn(),
}))

import { getAuthenticatedTenant } from '@/lib/auth/get-authenticated-tenant'
import {
  pauseTenantCrmPush,
  unpauseTenantCrmPush,
} from '@/lib/leads/crm-queue-ops'
import { POST as postCrmSettingsAction } from '@/app/api/settings/crm/actions/route'

describe('crm settings actions route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getAuthenticatedTenant).mockResolvedValue({
      tenant: { id: 'tenant-1' },
      userId: 'user-1',
    } as any)
  })

  it('pauses CRM push through the settings action route', async () => {
    vi.mocked(pauseTenantCrmPush).mockResolvedValue({
      paused: true,
      pauseReason: 'Paused by operator.',
      pausedAt: new Date('2026-03-04T15:00:00.000Z'),
      message: 'CRM push paused.',
    } as any)

    const response = await postCrmSettingsAction(
      new Request('http://localhost/api/settings/crm/actions', {
        method: 'POST',
        body: JSON.stringify({ action: 'pause_crm_push' }),
      }),
    )
    if (!response) throw new Error('Expected a response')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      paused: true,
      pauseReason: 'Paused by operator.',
      message: 'CRM push paused.',
    })
  })

  it('unpauses CRM push through the settings action route', async () => {
    vi.mocked(unpauseTenantCrmPush).mockResolvedValue({
      paused: false,
      pauseReason: null,
      pausedAt: null,
      message: 'CRM push resumed.',
    } as any)

    const response = await postCrmSettingsAction(
      new Request('http://localhost/api/settings/crm/actions', {
        method: 'POST',
        body: JSON.stringify({ action: 'unpause_crm_push' }),
      }),
    )
    if (!response) throw new Error('Expected a response')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      paused: false,
      message: 'CRM push resumed.',
    })
  })

  it('rejects invalid payloads', async () => {
    const response = await postCrmSettingsAction(
      new Request('http://localhost/api/settings/crm/actions', {
        method: 'POST',
        body: JSON.stringify({ action: 'pause_crm_push', reason: 'x'.repeat(501) }),
      }),
    )
    if (!response) throw new Error('Expected a response')

    expect(response.status).toBe(400)
  })
})
