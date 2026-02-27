import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'

/**
 * POST /api/queue/purge-creditzero
 *
 * Deletes all leads that were paused (status = 'cancelled_creditzero')
 * while the tenant's credit balance was zero. Called by the CleanSlateModal
 * when the user chooses "Start Fresh."
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
