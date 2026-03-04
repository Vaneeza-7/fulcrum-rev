import { NegativeReason } from '@prisma/client'
import { prisma } from '@/lib/db'
import { sendLeadReviewThread } from './client'
import type { SlackLeadCard } from './types'
import * as monitoringDb from '@/lib/monitoring-db'
import {
  bulkApproveLeadsByGrade,
  approveLeadForCrmQueue,
  rejectLeadFromReview,
  type LeadReviewResult,
} from '@/lib/leads/review'
import { decryptCrmConfig } from '@/lib/settings/crm'

function toSlackLeadCard(lead: {
  tenantId: string
  id: string
  fullName: string
  title: string | null
  company: string | null
  fulcrumScore: number
  fulcrumGrade: string | null
  fitScore: number
  intentScore: number
  firstLine: string | null
  linkedinUrl: string
  crmLeadId?: string | null
  crmPushState?: string | null
  crmPushLastError?: string | null
}): SlackLeadCard {
  return {
    tenant_id: lead.tenantId,
    lead_id: lead.id,
    full_name: lead.fullName,
    title: lead.title ?? '',
    company: lead.company ?? '',
    fulcrum_score: Number(lead.fulcrumScore),
    fulcrum_grade: lead.fulcrumGrade ?? '',
    fit_score: Number(lead.fitScore),
    intent_score: Number(lead.intentScore),
    first_line: lead.firstLine ?? '',
    linkedin_url: lead.linkedinUrl,
    crm_lead_id: lead.crmLeadId ?? undefined,
    crm_push_state: lead.crmPushState ?? null,
    crm_push_last_error: lead.crmPushLastError ?? null,
  }
}

/**
 * Handle legacy "Push All A+" button click.
 * Approves and queues all A+ leads for the tenant.
 */
export async function handlePushAllAPlus(tenantId: string): Promise<{ approved: number; failedPreflight: number; errors: string[] }> {
  const result = await bulkApproveLeadsByGrade({
    tenantId,
    grades: ['A+'],
    approvedBy: 'slack_user',
  })

  return {
    approved: result.approved,
    failedPreflight: result.failedPreflight,
    errors: result.errors,
  }
}

/**
 * Handle "Approve" button on a single lead.
 */
export async function handleApproveLead(
  tenantId: string,
  leadId: string,
): Promise<LeadReviewResult> {
  return approveLeadForCrmQueue({
    tenantId,
    leadId,
    approvedBy: 'slack_user',
  })
}

/**
 * Handle "Reject" button on a single lead.
 */
export async function handleRejectLead(
  tenantId: string,
  leadId: string,
  reason?: string,
  rejectReason?: NegativeReason,
  rejectedBy?: string,
): Promise<LeadReviewResult> {
  return rejectLeadFromReview({
    tenantId,
    leadId,
    rejectionReason: reason ?? 'Rejected via Slack',
    rejectReason: rejectReason ?? NegativeReason.OTHER,
    rejectedBy: rejectedBy ?? 'slack_user',
  })
}

/**
 * Handle rejection of a brand suggestion.
 */
export async function handleRejectBrandSuggestion(
  tenantId: string,
  brandSuggestionId: string,
  reason?: string,
  rejectedBy?: string,
): Promise<void> {
  const { HITLProcessor } = await import('@/lib/hitl/hitl-processor')
  await HITLProcessor.processRejection({
    tenantId,
    brandSuggestionId,
    rejectReason: NegativeReason.BRAND_MISMATCH,
    rejectReasonRaw: reason,
    rejectedBy: rejectedBy ?? 'slack_user',
  })
}

/**
 * Handle "Review All Leads" button.
 * Posts individual lead cards in a thread for review.
 */
export async function handleReviewLeads(tenantId: string, threadTs?: string): Promise<void> {
  const [tenant, leads] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { crmType: true, crmConfig: true },
    }),
    prisma.lead.findMany({
      where: { tenantId, status: { in: ['pending_review', 'awaiting_approval'] } },
      orderBy: { fulcrumScore: 'desc' },
      take: 10,
      select: {
        id: true,
        tenantId: true,
        fullName: true,
        title: true,
        company: true,
        fulcrumScore: true,
        fulcrumGrade: true,
        fitScore: true,
        intentScore: true,
        firstLine: true,
        linkedinUrl: true,
        crmLeadId: true,
        crmPushState: true,
        crmPushLastError: true,
      },
    }),
  ])

  const crmConfig = decryptCrmConfig(tenant.crmConfig) ?? {}
  const crmOrgId = typeof crmConfig.org_id === 'string' ? crmConfig.org_id : undefined

  const leadCards: SlackLeadCard[] = leads.map((lead) =>
    toSlackLeadCard({
      ...lead,
      fulcrumScore: Number(lead.fulcrumScore),
      fitScore: Number(lead.fitScore),
      intentScore: Number(lead.intentScore),
    }),
  )

  await sendLeadReviewThread(tenantId, leadCards, threadTs, crmOrgId, tenant.crmType ?? undefined)
}

/**
 * Handle "Reject D Grade" button.
 */
export async function handleRejectGrade(tenantId: string, grades: string[]): Promise<number> {
  const result = await prisma.lead.updateMany({
    where: {
      tenantId,
      status: 'pending_review',
      fulcrumGrade: { in: grades },
    },
    data: {
      status: 'rejected',
      rejectionReason: `Auto-rejected: grade ${grades.join(', ')}`,
      crmPushState: 'not_queued',
      crmPushLastError: null,
      crmPushQueuedAt: null,
      crmPushProcessingAt: null,
    },
  })

  return result.count
}

/**
 * Handle "Dismiss" button on a monitoring alert.
 */
export async function handleMonitoringDismiss(
  alertId: string,
  resourceId: string,
  userId: string,
): Promise<void> {
  await monitoringDb.dismissAlert(alertId, userId)
}

/**
 * Handle "Acknowledge" button on a monitoring alert.
 */
export async function handleMonitoringAck(
  alertId: string,
  resourceId: string,
  userId: string,
): Promise<void> {
  await monitoringDb.acknowledgeAlert(alertId, userId)
}

/**
 * Handle "Suppress Resource" button on a monitoring alert.
 */
export async function handleMonitoringSuppress(
  alertId: string,
  resourceId: string,
  resourceName: string,
  userId: string,
): Promise<void> {
  await monitoringDb.suppressResource(resourceId, resourceName, userId)
}
