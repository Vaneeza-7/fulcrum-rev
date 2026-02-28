import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const MAX_COMPETITORS = 10

export async function POST(request: Request) {
  const { orgId } = await auth()
  if (!orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
  })
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  const body = await request.json()

  const competitors = body.competitors as
    | Array<{ name: string; websiteUrl?: string; differentiator?: string }>
    | undefined

  if (!Array.isArray(competitors)) {
    return NextResponse.json(
      { error: 'competitors must be an array' },
      { status: 400 }
    )
  }

  // Cap at MAX_COMPETITORS
  const trimmed = competitors.slice(0, MAX_COMPETITORS)

  await prisma.$transaction(async (tx) => {
    // Delete all existing competitors for this tenant
    await tx.tenantCompetitor.deleteMany({
      where: { tenantId: tenant.id },
    })

    // Create new competitor rows
    if (trimmed.length > 0) {
      await tx.tenantCompetitor.createMany({
        data: trimmed.map((c) => ({
          tenantId: tenant.id,
          name: c.name,
          websiteUrl: c.websiteUrl ?? null,
          differentiator: c.differentiator ?? null,
        })),
      })
    }

    // Update profile with positioning fields
    await tx.tenantProfile.update({
      where: { tenantId: tenant.id },
      data: {
        competitorDifferentiation: body.competitorDifferentiation ?? null,
        whyChooseUs: body.whyChooseUs ?? null,
      },
    })
  })

  return NextResponse.json({ success: true, count: trimmed.length })
}
