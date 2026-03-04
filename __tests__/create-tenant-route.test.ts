import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    tenant: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    tenantProfile: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { POST as postCreateTenant } from '@/app/api/onboarding/create-tenant/route'

describe('create tenant onboarding route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue({
      orgId: 'org_12345678',
      orgSlug: 'acme',
    } as any)
  })

  it('creates a tenant with a unique slug when the Clerk org slug is already taken', async () => {
    const tx = {
      tenant: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: 'tenant-existing' })
          .mockResolvedValueOnce(null),
        create: vi.fn().mockResolvedValue({ id: 'tenant-new' }),
      },
      tenantProfile: {
        create: vi.fn().mockResolvedValue({ id: 'profile-new' }),
      },
    }

    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null as any)
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => callback(tx))

    const response = await postCreateTenant(
      new Request('http://localhost/api/onboarding/create-tenant', {
        method: 'POST',
        body: JSON.stringify({ companyName: 'Acme' }),
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ tenantId: 'tenant-new' })
    expect(tx.tenant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clerkOrgId: 'org_12345678',
        name: 'Acme',
        slug: 'acme-2',
      }),
    })
  })

  it('upserts profile data when the tenant already exists for the Clerk organization', async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
      id: 'tenant-existing',
      profile: null,
    } as any)
    vi.mocked(prisma.tenant.update).mockResolvedValue({ id: 'tenant-existing' } as any)
    vi.mocked(prisma.tenantProfile.findUnique).mockResolvedValue(null as any)
    vi.mocked(prisma.tenantProfile.create).mockResolvedValue({ id: 'profile-new' } as any)

    const response = await postCreateTenant(
      new Request('http://localhost/api/onboarding/create-tenant', {
        method: 'POST',
        body: JSON.stringify({
          companyName: 'Acme',
          websiteUrl: 'https://acme.test',
        }),
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ tenantId: 'tenant-existing' })
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: 'tenant-existing' },
      data: { name: 'Acme' },
    })
    expect(prisma.tenantProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-existing',
        companyName: 'Acme',
        websiteUrl: 'https://acme.test',
      }),
    })
  })
})
