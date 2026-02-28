import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

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
  const keywords = body.keywords as Array<{
    keyword: string
    intentScore: number
    category?: string
  }>

  if (!Array.isArray(keywords) || keywords.length === 0) {
    return NextResponse.json({ error: 'At least one keyword is required' }, { status: 400 })
  }

  // Replace-all strategy
  await prisma.tenantIntentKeyword.deleteMany({
    where: { tenantId: tenant.id },
  })

  await prisma.tenantIntentKeyword.createMany({
    data: keywords.map((k) => ({
      tenantId: tenant.id,
      keyword: k.keyword,
      intentScore: k.intentScore,
      category: k.category ?? null,
    })),
  })

  return NextResponse.json({ success: true, count: keywords.length })
}
