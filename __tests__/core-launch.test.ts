import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('parseCoreLaunchTenantIds', () => {
  beforeEach(() => {
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://example.com/db'
    vi.resetModules()
  })

  it('parses a comma-separated allowlist into a set', async () => {
    const { parseCoreLaunchTenantIds } = await import('@/lib/config')
    const tenantIds = parseCoreLaunchTenantIds(
      '11111111-1111-4111-8111-111111111111, 22222222-2222-4222-8222-222222222222',
    )

    expect(tenantIds).toEqual(
      new Set([
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ]),
    )
  })

  it('rejects invalid UUID entries', async () => {
    const { parseCoreLaunchTenantIds } = await import('@/lib/config')

    expect(() => parseCoreLaunchTenantIds('not-a-uuid')).toThrow(
      'Invalid CORE_LAUNCH_TENANT_IDS entry: not-a-uuid',
    )
  })
})

describe('getCoreLaunchTenants', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('filters fan-out tenants to the allowlist', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'tenant-1', name: 'Pilot' }])

    vi.doMock('@/lib/config', () => ({
      coreLaunchTenantIdAllowlist: new Set(['11111111-1111-4111-8111-111111111111']),
    }))
    vi.doMock('@/lib/db', () => ({
      prisma: {
        tenant: {
          findMany,
        },
      },
    }))

    const { getCoreLaunchTenants } = await import('@/lib/tenants/core-launch')
    const result = await getCoreLaunchTenants()

    expect(result).toEqual([{ id: 'tenant-1', name: 'Pilot' }])
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['11111111-1111-4111-8111-111111111111'] },
        }),
      }),
    )
  })

  it('blocks explicit tenant fan-out when the tenant is not allowlisted', async () => {
    const findMany = vi.fn()

    vi.doMock('@/lib/config', () => ({
      coreLaunchTenantIdAllowlist: new Set(['11111111-1111-4111-8111-111111111111']),
    }))
    vi.doMock('@/lib/db', () => ({
      prisma: {
        tenant: {
          findMany,
        },
      },
    }))

    const { getCoreLaunchTenants } = await import('@/lib/tenants/core-launch')
    const result = await getCoreLaunchTenants('33333333-3333-4333-8333-333333333333')

    expect(result).toEqual([])
    expect(findMany).not.toHaveBeenCalled()
  })
})
