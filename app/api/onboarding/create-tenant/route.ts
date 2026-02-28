import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(request: Request) {
  const { orgId, orgSlug } = await auth()
  if (!orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Idempotent — return existing tenant if already created
  const existing = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
  })
  if (existing) {
    return NextResponse.json({ tenantId: existing.id, alreadyExists: true })
  }

  const body = await request.json()

  const companyName = body.companyName as string | undefined
  if (!companyName || companyName.trim().length === 0) {
    return NextResponse.json(
      { error: 'companyName is required' },
      { status: 400 }
    )
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
      data: {
        tenantId: newTenant.id,
        companyName: companyName.trim(),
        websiteUrl: body.websiteUrl ?? null,
        industry: body.industry ?? null,
        companySize: body.companySize ?? null,
        productDescription: body.productDescription ?? null,
        problemsSolved: body.problemsSolved ?? null,
        valueProposition: body.valueProposition ?? null,
      },
    })

    return newTenant
  })

  return NextResponse.json({ tenantId: tenant.id })
}
