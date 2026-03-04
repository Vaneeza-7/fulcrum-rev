import { NegativeReason, type Lead } from '@prisma/client'
import { auditLog, prisma } from '@/lib/db'
import { HITLProcessor } from '@/lib/hitl/hitl-processor'
import { buildApprovedLeadQueueUpdate } from './crm-queue-ops'
import { runCrmPreflight } from '@/lib/crm/preflight'

export const REVIEWABLE_LEAD_STATUSES = new Set(['pending_review', 'awaiting_approval'])

export interface ReviewLeadSnapshot {
  id: string
  tenantId: string
  fullName: string
  title: string | null
  company: string | null
  fulcrumScore: number
  fulcrumGrade: string | null
  fitScore: number
  intentScore: number
  firstLine: string | null
  linkedinUrl: string
  status: string
  rejectionReason: string | null
  crmLeadId: string | null
  crmPushState: string
  crmPushAttempts: number
  crmPushQueuedAt: Date | null
  crmPushProcessingAt: Date | null
  crmPushLastError: string | null
  approvedAt: Date | null
  approvedBy: string | null
}

export interface LeadReviewResult {
  lead: ReviewLeadSnapshot
  changed: boolean
  crmPreflightPassed: boolean
  message: string
}

function toSnapshot(lead: Lead): ReviewLeadSnapshot {
  return {
    id: lead.id,
    tenantId: lead.tenantId,
    fullName: lead.fullName,
    title: lead.title,
    company: lead.company,
    fulcrumScore: Number(lead.fulcrumScore),
    fulcrumGrade: lead.fulcrumGrade,
    fitScore: Number(lead.fitScore),
    intentScore: Number(lead.intentScore),
    firstLine: lead.firstLine,
    linkedinUrl: lead.linkedinUrl,
    status: lead.status,
    rejectionReason: lead.rejectionReason,
    crmLeadId: lead.crmLeadId,
    crmPushState: lead.crmPushState,
    crmPushAttempts: lead.crmPushAttempts,
    crmPushQueuedAt: lead.crmPushQueuedAt,
    crmPushProcessingAt: lead.crmPushProcessingAt,
    crmPushLastError: lead.crmPushLastError,
    approvedAt: lead.approvedAt,
    approvedBy: lead.approvedBy,
  }
}

async function getLeadForTenant(tenantId: string, leadId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, tenantId },
  })

  if (!lead) {
    throw new Error('Lead not found for this tenant')
  }

  return lead
}

export async function approveLeadForCrmQueue(input: {
  tenantId: string
  leadId: string
  approvedBy: string
}): Promise<LeadReviewResult> {
  const lead = await getLeadForTenant(input.tenantId, input.leadId)

  if (lead.status === 'pushed_to_crm' || lead.crmLeadId) {
    return {
      lead: toSnapshot(lead),
      changed: false,
      crmPreflightPassed: true,
      message: 'Lead was already pushed to the CRM.',
    }
  }

  if (!REVIEWABLE_LEAD_STATUSES.has(lead.status) && lead.status !== 'approved') {
    throw new Error(`Lead cannot be approved from status ${lead.status}`)
  }

  if (lead.status === 'approved' && ['queued', 'processing', 'succeeded', 'failed'].includes(lead.crmPushState)) {
    return {
      lead: toSnapshot(lead),
      changed: false,
      crmPreflightPassed: lead.crmPushState !== 'failed',
      message:
        lead.crmPushState === 'failed'
          ? lead.crmPushLastError ?? 'Lead is already approved but waiting for a CRM retry.'
          : 'Lead is already approved.',
    }
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: input.tenantId },
    select: {
      crmType: true,
      crmConfig: true,
    },
  })

  const queueEvaluation = (() => {
    const preflight = runCrmPreflight(tenant, lead)
    return {
      preflight,
      passed: preflight.ok,
      message: preflight.ok
        ? 'Lead approved and queued for CRM push.'
        : preflight.message ?? 'Lead approved, but CRM preflight failed.',
    }
  })()
  const now = new Date()

  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: buildApprovedLeadQueueUpdate({
      lead,
      queueEvaluation: {
        preflightPassed: queueEvaluation.passed,
        crmPushState: queueEvaluation.passed ? 'queued' : 'failed',
        message: queueEvaluation.preflight.message ?? 'CRM preflight failed.',
        errorCode: queueEvaluation.preflight.errorCode ?? null,
      },
      approvedAt: now,
      approvedBy: input.approvedBy,
      queuedAt: now,
    }),
  })

  await auditLog(input.tenantId, 'lead_approved', lead.id, {
    crmPushState: updated.crmPushState,
    crmPreflightPassed: queueEvaluation.passed,
    crmPreflightError: queueEvaluation.passed ? null : queueEvaluation.preflight.message ?? null,
    approvedBy: input.approvedBy,
  })

  return {
    lead: toSnapshot(updated),
    changed: true,
    crmPreflightPassed: queueEvaluation.passed,
    message: queueEvaluation.message,
  }
}

export async function rejectLeadFromReview(input: {
  tenantId: string
  leadId: string
  rejectionReason?: string
  rejectReason?: NegativeReason
  rejectedBy: string
}): Promise<LeadReviewResult> {
  const lead = await getLeadForTenant(input.tenantId, input.leadId)

  if (lead.status === 'rejected') {
    return {
      lead: toSnapshot(lead),
      changed: false,
      crmPreflightPassed: false,
      message: 'Lead was already rejected.',
    }
  }

  if (!REVIEWABLE_LEAD_STATUSES.has(lead.status)) {
    throw new Error(`Lead cannot be rejected from status ${lead.status}`)
  }

  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      status: 'rejected',
      rejectionReason: input.rejectionReason ?? 'Rejected from review',
      crmPushState: 'not_queued',
      crmPushQueuedAt: null,
      crmPushProcessingAt: null,
      crmPushLastError: null,
    },
  })

  await HITLProcessor.processRejection({
    tenantId: input.tenantId,
    leadId: lead.id,
    rejectReason: input.rejectReason ?? NegativeReason.OTHER,
    rejectReasonRaw: input.rejectionReason,
    rejectedBy: input.rejectedBy,
  })

  await auditLog(input.tenantId, 'lead_rejected', lead.id, {
    rejectionReason: input.rejectionReason ?? 'Rejected from review',
    rejectedBy: input.rejectedBy,
  })

  return {
    lead: toSnapshot(updated),
    changed: true,
    crmPreflightPassed: false,
    message: 'Lead rejected.',
  }
}

export async function bulkApproveLeadsByGrade(input: {
  tenantId: string
  grades: string[]
  approvedBy: string
}) {
  const leads = await prisma.lead.findMany({
    where: {
      tenantId: input.tenantId,
      status: { in: Array.from(REVIEWABLE_LEAD_STATUSES) },
      fulcrumGrade: { in: input.grades },
    },
    select: { id: true },
    orderBy: { fulcrumScore: 'desc' },
  })

  let approved = 0
  let failedPreflight = 0
  const errors: string[] = []

  for (const lead of leads) {
    try {
      const result = await approveLeadForCrmQueue({
        tenantId: input.tenantId,
        leadId: lead.id,
        approvedBy: input.approvedBy,
      })
      if (result.lead.crmPushState === 'failed') {
        failedPreflight++
      } else {
        approved++
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }

  await auditLog(input.tenantId, 'leads_bulk_approved', undefined, {
    grades: input.grades,
    approved,
    failedPreflight,
    errors,
    approvedBy: input.approvedBy,
  })

  return {
    total: leads.length,
    approved,
    failedPreflight,
    errors,
  }
}
