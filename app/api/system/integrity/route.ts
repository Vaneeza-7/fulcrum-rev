import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'

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
}

export async function GET(): Promise<NextResponse<IntegrityResponse>> {
  const { orgId } = await auth()
  if (!orgId) {
    return NextResponse.json(
      { status: 'RED' as const, details: [], checkedAt: new Date().toISOString() },
      { status: 401 }
    )
  }

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
  })
  if (!tenant) {
    return NextResponse.json(
      { status: 'RED' as const, details: [], checkedAt: new Date().toISOString() },
      { status: 404 }
    )
  }

  const tenantId = tenant.id
  const details: IntegrityDetail[] = []

  // ---- SIGNAL 1: Credit Balance ----
  // TODO: Replace with actual credit balance lookup when the billing system is
  // implemented. For now, always GREEN since no credit model exists yet.
  details.push({ signal: 'credits', status: 'GREEN', message: 'Credits healthy.' })

  // ---- SIGNAL 2: Queue Backlog Detection ----
  // Check for leads stuck in non-terminal states for more than 2 hours
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
  const stalledCount = await prisma.lead.count({
    where: {
      tenantId,
      status: { in: ['discovered', 'pending_review', 'awaiting_approval'] },
      updatedAt: { lt: twoHoursAgo },
    },
  })
  if (stalledCount >= 50) {
    details.push({ signal: 'queue', status: 'RED', message: `${stalledCount} leads stalled >2h.` })
  } else if (stalledCount > 10) {
    details.push({ signal: 'queue', status: 'AMBER', message: `${stalledCount} leads stalled >2h.` })
  } else {
    details.push({ signal: 'queue', status: 'GREEN', message: 'Queue flowing normally.' })
  }

  // ---- SIGNAL 3: Last Pipeline Run (via AuditLog) ----
  const lastCron = await prisma.auditLog.findFirst({
    where: { tenantId, actionType: 'pipeline_completed' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  if (!lastCron) {
    details.push({ signal: 'cron', status: 'AMBER', message: 'No pipeline activity recorded yet.' })
  } else {
    const hoursSince = (Date.now() - lastCron.createdAt.getTime()) / (1000 * 60 * 60)
    if (hoursSince > 48) {
      details.push({ signal: 'cron', status: 'RED', message: `Last pipeline ran ${Math.round(hoursSince)}h ago.` })
    } else if (hoursSince > 25) {
      details.push({ signal: 'cron', status: 'AMBER', message: `Last pipeline ran ${Math.round(hoursSince)}h ago.` })
    } else {
      details.push({ signal: 'cron', status: 'GREEN', message: 'Pipeline running on schedule.' })
    }
  }

  // ---- SIGNAL 4: Model Calibration ----
  const onboardingState = await prisma.tenantOnboardingState.findUnique({
    where: { tenantId },
    select: { calibrationSignificance: true, coldStartActive: true },
  })
  if (onboardingState) {
    const sig = onboardingState.calibrationSignificance
    if (onboardingState.coldStartActive && sig < 0.1) {
      details.push({ signal: 'calibration', status: 'AMBER', message: `Calibration at ${(sig * 100).toFixed(0)}% — cold-start active, needs more HITL feedback.` })
    } else if (sig < 0.3) {
      details.push({ signal: 'calibration', status: 'AMBER', message: `Calibration at ${(sig * 100).toFixed(0)}% — model still learning.` })
    } else {
      details.push({ signal: 'calibration', status: 'GREEN', message: `Calibration at ${(sig * 100).toFixed(0)}%.` })
    }
  }

  // ---- Aggregate status ----
  let overallStatus: IntegrityStatus = 'GREEN'
  if (details.some((d) => d.status === 'RED')) overallStatus = 'RED'
  else if (details.some((d) => d.status === 'AMBER')) overallStatus = 'AMBER'

  return NextResponse.json({
    status: overallStatus,
    details,
    checkedAt: new Date().toISOString(),
  })
}
