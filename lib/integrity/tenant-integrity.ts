import { prisma } from '@/lib/db'
import { getTenantBillingSummary } from '@/lib/billing/summary'
import { getTenantCrmHealthSummary, type TenantCrmHealthSummary } from '@/lib/health/crm-push-health'
import type { IntegrityStatus } from '@/lib/types/integrity'

export interface IntegrityDetail {
  signal: string
  status: IntegrityStatus
  message: string
}

export interface TenantIntegritySummary {
  status: IntegrityStatus
  details: IntegrityDetail[]
  checkedAt: string
  crmHealth: TenantCrmHealthSummary
}

export async function getTenantIntegritySummary(tenantId: string): Promise<TenantIntegritySummary> {
  const details: IntegrityDetail[] = []
  const [billingSummary, crmHealth, lastCron, onboardingState] = await Promise.all([
    getTenantBillingSummary(tenantId),
    getTenantCrmHealthSummary(tenantId),
    prisma.auditLog.findFirst({
      where: { tenantId, actionType: 'pipeline_completed' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.tenantOnboardingState.findUnique({
      where: { tenantId },
      select: { calibrationSignificance: true, coldStartActive: true },
    }),
  ])

  if (!billingSummary.billing.planSlug || !['active', 'trialing'].includes(billingSummary.billing.subscriptionStatus)) {
    details.push({ signal: 'credits', status: 'RED', message: 'Billing is inactive or payment has failed.' })
  } else {
    const includedCredits = Number(billingSummary.billing.includedCredits)
    const remainingCredits = Number(billingSummary.billing.remainingCredits)
    const ratio = includedCredits > 0 ? remainingCredits / includedCredits : 0

    if (ratio <= 0.2) {
      details.push({
        signal: 'credits',
        status: 'AMBER',
        message: `${billingSummary.billing.remainingCredits} credits remaining before overage.`,
      })
    } else {
      details.push({
        signal: 'credits',
        status: 'GREEN',
        message: `${billingSummary.billing.remainingCredits} credits remaining.`,
      })
    }
  }

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
  const stalledCount = await prisma.lead.count({
    where: {
      tenantId,
      status: { in: ['discovered', 'pending_review', 'awaiting_approval'] },
      updatedAt: { lt: twoHoursAgo },
    },
  })
  if (stalledCount >= 50) {
    details.push({ signal: 'queue', status: 'RED', message: `${stalledCount} leads stalled for more than 2 hours.` })
  } else if (stalledCount > 10) {
    details.push({ signal: 'queue', status: 'AMBER', message: `${stalledCount} leads stalled for more than 2 hours.` })
  } else {
    details.push({ signal: 'queue', status: 'GREEN', message: 'Queue flowing normally.' })
  }

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

  if (onboardingState) {
    const significance = onboardingState.calibrationSignificance
    if (onboardingState.coldStartActive && significance < 0.1) {
      details.push({
        signal: 'calibration',
        status: 'AMBER',
        message: `Calibration at ${(significance * 100).toFixed(0)}% — cold-start still active.`,
      })
    } else if (significance < 0.3) {
      details.push({
        signal: 'calibration',
        status: 'AMBER',
        message: `Calibration at ${(significance * 100).toFixed(0)}% — model still learning.`,
      })
    } else {
      details.push({
        signal: 'calibration',
        status: 'GREEN',
        message: `Calibration at ${(significance * 100).toFixed(0)}%.`,
      })
    }
  }

  details.push({
    signal: 'crm_push_queue',
    status: crmHealth.level,
    message: crmHealth.message,
  })

  let overallStatus: IntegrityStatus = 'GREEN'
  if (details.some((detail) => detail.status === 'RED')) overallStatus = 'RED'
  else if (details.some((detail) => detail.status === 'AMBER')) overallStatus = 'AMBER'

  return {
    status: overallStatus,
    details,
    checkedAt: new Date().toISOString(),
    crmHealth,
  }
}
