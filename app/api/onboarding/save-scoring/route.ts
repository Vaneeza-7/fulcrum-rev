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

    const { company_size, industry_fit, role_authority, revenue_signals } = body

    const configs = [
      { configType: 'company_size', configData: company_size },
      { configType: 'industry_fit', configData: industry_fit },
      { configType: 'role_authority', configData: role_authority },
      { configType: 'revenue_signals', configData: revenue_signals },
    ]

    for (const config of configs) {
      if (!config.configData) continue
      await prisma.tenantScoringConfig.upsert({
        where: {
          tenantId_configType: {
            tenantId: tenant.id,
            configType: config.configType,
          },
        },
        update: { configData: config.configData as any },
        create: {
          tenantId: tenant.id,
          configType: config.configType,
          configData: config.configData as any,
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('save-scoring error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
