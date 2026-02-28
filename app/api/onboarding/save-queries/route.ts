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
  const queries = body.queries as Array<{
    queryName: string
    searchQuery: Record<string, unknown>
    maxResults?: number
  }>

  if (!Array.isArray(queries) || queries.length === 0) {
    return NextResponse.json({ error: 'At least one query is required' }, { status: 400 })
  }

  // Replace-all strategy: delete existing, create new
  await prisma.tenantSearchQuery.deleteMany({
    where: { tenantId: tenant.id },
  })

  await prisma.tenantSearchQuery.createMany({
    data: queries.map((q) => ({
      tenantId: tenant.id,
      queryName: q.queryName,
      searchQuery: q.searchQuery as any,
      maxResults: q.maxResults ?? 10,
    })),
  })

  return NextResponse.json({ success: true, count: queries.length })
}
