import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function getAuthenticatedTenant() {
  const { orgId, userId } = await auth()
  if (!orgId) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
  })

  if (!tenant) {
    return {
      error: NextResponse.json({ error: 'Tenant not found' }, { status: 404 }),
    }
  }

  return { tenant, userId }
}
