import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(request: Request) {
  try {
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

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const targetIndustries = body.targetIndustries as string[] | undefined
    const targetRoles = body.targetRoles as string[] | undefined

    if (
      !Array.isArray(targetIndustries) ||
      targetIndustries.length === 0
    ) {
      return NextResponse.json(
        { error: 'At least one target industry is required' },
        { status: 400 }
      )
    }

    if (
      !Array.isArray(targetRoles) ||
      targetRoles.length === 0
    ) {
      return NextResponse.json(
        { error: 'At least one target role is required' },
        { status: 400 }
      )
    }

    await prisma.tenantProfile.upsert({
      where: { tenantId: tenant.id },
      create: {
        tenantId: tenant.id,
        companyName: tenant.name,
        targetIndustries: targetIndustries,
        targetCompanySizes: (body.targetCompanySizes as string[]) ?? [],
        targetRoles: targetRoles,
        targetGeography: (body.targetGeography as string[]) ?? [],
        painPoints: (body.painPoints as string) ?? null,
        buyingSignals: (body.buyingSignals as string) ?? null,
        searchKeywords: (body.searchKeywords as string) ?? null,
      },
      update: {
        targetIndustries: targetIndustries,
        targetCompanySizes: (body.targetCompanySizes as string[]) ?? [],
        targetRoles: targetRoles,
        targetGeography: (body.targetGeography as string[]) ?? [],
        painPoints: (body.painPoints as string) ?? null,
        buyingSignals: (body.buyingSignals as string) ?? null,
        searchKeywords: (body.searchKeywords as string) ?? null,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('save-icp error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
