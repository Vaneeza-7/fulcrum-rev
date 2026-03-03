import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'

/**
 * POST /api/queue/purge-creditzero
 *
 * Legacy compatibility endpoint for historical `cancelled_creditzero` leads.
 * Exact-cost billing no longer pauses leads on zero credits, so this route is
 * only useful for cleaning up old data created before the metered-overage cutover.
 */
export async function POST() {
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

  const { count } = await prisma.lead.deleteMany({
    where: {
      tenantId: tenant.id,
      status: 'cancelled_creditzero',
    },
  })

  return NextResponse.json({ purged: count })
}
