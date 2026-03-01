import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

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

    const profileData = {
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

      if (existing.profile) {
        await prisma.tenantProfile.update({
          where: { tenantId: existing.id },
          data: profileData,
        })
      } else {
        await prisma.tenantProfile.create({
          data: { tenantId: existing.id, ...profileData },
        })
      }

      return NextResponse.json({ tenantId: existing.id })
    }

    const slug = orgSlug ?? `org-${orgId.slice(0, 8)}`

    // Create tenant + profile in a transaction
    const tenant = await prisma.$transaction(async (tx) => {
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
    console.error('create-tenant error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
