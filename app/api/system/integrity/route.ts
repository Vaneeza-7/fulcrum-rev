import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { getTenantIntegritySummary } from '@/lib/integrity/tenant-integrity'

import type { IntegrityStatus } from '@/lib/types/integrity'
export type { IntegrityStatus }

interface IntegrityDetail {
  signal: string
  status: IntegrityStatus
  message: string
}

interface IntegrityResponse {
  status: IntegrityStatus
  details: IntegrityDetail[]
  checkedAt: string
  crmHealth: {
    level: IntegrityStatus
    queuedCount: number
    failedCount: number
    oldestQueuedMinutes: number | null
    duplicateRate30d: string
    paused: boolean
    message: string
    action: string
  }
}

export async function GET(): Promise<NextResponse<IntegrityResponse>> {
  const { orgId } = await auth()
  if (!orgId) {
    return NextResponse.json(
      {
        status: 'RED' as const,
        details: [],
        checkedAt: new Date().toISOString(),
        crmHealth: {
          level: 'RED',
          queuedCount: 0,
          failedCount: 0,
          oldestQueuedMinutes: null,
          duplicateRate30d: '0.00',
          paused: false,
          message: 'Authentication required.',
          action: 'Sign in to view system integrity.',
        },
      },
      { status: 401 },
    )
  }

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  })
  if (!tenant) {
    return NextResponse.json(
      {
        status: 'RED' as const,
        details: [],
        checkedAt: new Date().toISOString(),
        crmHealth: {
          level: 'RED',
          queuedCount: 0,
          failedCount: 0,
          oldestQueuedMinutes: null,
          duplicateRate30d: '0.00',
          paused: false,
          message: 'Tenant not found.',
          action: 'Complete onboarding to enable integrity checks.',
        },
      },
      { status: 404 },
    )
  }

  const summary = await getTenantIntegritySummary(tenant.id)
  return NextResponse.json(summary)
}
