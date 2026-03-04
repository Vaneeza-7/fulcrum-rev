import { Prisma } from '@prisma/client'
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { resolveUniqueTenantSlug } from '@/lib/tenants/slug'

type TenantProfileInput = {
  companyName: string
  websiteUrl: string | null
  industry: string | null
  companySize: string | null
  productDescription: string | null
  problemsSolved: string | null
  valueProposition: string | null
}

async function upsertTenantProfile(tenantId: string, profileData: TenantProfileInput) {
  const existingProfile = await prisma.tenantProfile.findUnique({
    where: { tenantId },
    select: { tenantId: true },
  })

  if (existingProfile) {
    await prisma.tenantProfile.update({
      where: { tenantId },
      data: profileData,
    })
    return
  }

  await prisma.tenantProfile.create({
    data: { tenantId, ...profileData },
  })
}

export async function POST(request: Request) {
  try {
    const { orgId, orgSlug } = await auth()
    if (!orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const companyName = body.companyName as string | undefined
    if (!companyName || companyName.trim().length === 0) {
      return NextResponse.json(
        { error: 'companyName is required' },
        { status: 400 }
      )
    }

    const profileData: TenantProfileInput = {
      companyName: companyName.trim(),
      websiteUrl: (body.websiteUrl as string) ?? null,
      industry: (body.industry as string) ?? null,
      companySize: (body.companySize as string) ?? null,
      productDescription: (body.productDescription as string) ?? null,
      problemsSolved: (body.problemsSolved as string) ?? null,
      valueProposition: (body.valueProposition as string) ?? null,
    }

    // If tenant already exists, update name and upsert profile
    const existing = await prisma.tenant.findUnique({
      where: { clerkOrgId: orgId },
      include: { profile: true },
    })

    if (existing) {
      await prisma.tenant.update({
        where: { id: existing.id },
        data: { name: companyName.trim() },
      })

      await upsertTenantProfile(existing.id, profileData)

      return NextResponse.json({ tenantId: existing.id })
    }

    const slugSeed = orgSlug ?? companyName.trim()

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const tenant = await prisma.$transaction(async (tx) => {
          const slug = await resolveUniqueTenantSlug(tx, slugSeed, {
            fallbackSeed: `org-${orgId.slice(0, 8)}`,
          })

          const newTenant = await tx.tenant.create({
            data: {
              clerkOrgId: orgId,
              name: companyName.trim(),
              slug,
              productType: 'custom',
            },
          })

          await tx.tenantProfile.create({
            data: { tenantId: newTenant.id, ...profileData },
          })

          return newTenant
        })

        return NextResponse.json({ tenantId: tenant.id })
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
          throw error
        }

        const tenantCreatedElsewhere = await prisma.tenant.findUnique({
          where: { clerkOrgId: orgId },
          include: { profile: true },
        })

        if (tenantCreatedElsewhere) {
          await prisma.tenant.update({
            where: { id: tenantCreatedElsewhere.id },
            data: { name: companyName.trim() },
          })
          await upsertTenantProfile(tenantCreatedElsewhere.id, profileData)
          return NextResponse.json({ tenantId: tenantCreatedElsewhere.id })
        }
      }
    }

    return NextResponse.json(
      { error: 'We could not finish workspace setup. Please retry in a moment.' },
      { status: 409 },
    )
  } catch (error) {
    console.error('create-tenant error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
