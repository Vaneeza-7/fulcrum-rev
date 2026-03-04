import type { Lead, Tenant } from '@prisma/client'
import { auditLog, prisma } from '@/lib/db'
import { runCrmPreflight, type CrmPreflightResult } from '@/lib/crm/preflight'

export interface LeadActionSnapshot {
  id: string
  status: string
  crmPushState: string
  crmPushLastError: string | null
  approvedAt: Date | null
  approvedBy: string | null
  crmLeadId: string | null
}

export interface SerializedLeadActionSnapshot {
  id: string
  status: string
  crmPushState: string
  crmPushLastError: string | null
  approvedAt: string | null
  approvedBy: string | null
  crmLeadId: string | null
}

export interface ErrorSummary {
  message: string
  count: number
}

interface QueueEvaluation {
  preflightPassed: boolean
  crmPushState: 'queued' | 'failed'
  message: string
  errorCode: string | null
}

export interface RequeueLeadResult {
  lead: LeadActionSnapshot
  changed: boolean
  queued: boolean
  message: string
}

export interface BulkRetryFailedLeadsResult {
  totalMatched: number
  queued: number
  stillFailed: number
  errors: ErrorSummary[]
}

export interface TenantCrmPushPauseResult {
  paused: boolean
  changed: boolean
  pauseReason: string | null
  pausedAt: Date | null
  message: string
}

type QueueableLeadFields = Pick<
  Lead,
  | 'id'
  | 'tenantId'
  | 'fullName'
  | 'company'
  | 'linkedinUrl'
  | 'status'
  | 'crmLeadId'
  | 'crmPushState'
  | 'crmPushLastError'
  | 'approvedAt'
  | 'approvedBy'
>

type QueueableTenantFields = Pick<Tenant, 'id' | 'crmType' | 'crmConfig'>

function toLeadActionSnapshot(
  lead: Pick<
    Lead,
    'id' | 'status' | 'crmPushState' | 'crmPushLastError' | 'approvedAt' | 'approvedBy' | 'crmLeadId'
  >,
): LeadActionSnapshot {
  return {
    id: lead.id,
    status: lead.status,
    crmPushState: lead.crmPushState,
    crmPushLastError: lead.crmPushLastError,
    approvedAt: lead.approvedAt,
    approvedBy: lead.approvedBy,
    crmLeadId: lead.crmLeadId,
  }
}

export function serializeLeadActionSnapshot(
  lead: LeadActionSnapshot,
): SerializedLeadActionSnapshot {
  return {
    id: lead.id,
    status: lead.status,
    crmPushState: lead.crmPushState,
    crmPushLastError: lead.crmPushLastError,
    approvedAt: lead.approvedAt?.toISOString() ?? null,
    approvedBy: lead.approvedBy,
    crmLeadId: lead.crmLeadId,
  }
}

export function summarizeErrorMessages(messages: string[]): ErrorSummary[] {
  const counts = new Map<string, number>()
  for (const message of messages) {
    counts.set(message, (counts.get(message) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([message, count]) => ({ message, count }))
    .sort((a, b) => b.count - a.count || a.message.localeCompare(b.message))
}

function evaluateLeadForQueue(
  tenant: QueueableTenantFields,
  lead: Pick<Lead, 'fullName' | 'company' | 'linkedinUrl'>,
): QueueEvaluation {
  const preflight = runCrmPreflight(tenant, lead)
  return queueEvaluationFromPreflight(preflight)
}

function queueEvaluationFromPreflight(preflight: CrmPreflightResult): QueueEvaluation {
  if (preflight.ok) {
    return {
      preflightPassed: true,
      crmPushState: 'queued',
      message: 'Lead is queued for CRM push.',
      errorCode: null,
    }
  }

  return {
    preflightPassed: false,
    crmPushState: 'failed',
    message: preflight.message ?? 'CRM preflight failed.',
    errorCode: preflight.errorCode ?? 'validation_failed',
  }
}

export function buildApprovedLeadQueueUpdate(input: {
  lead: Pick<Lead, 'approvedAt' | 'approvedBy'>
  queueEvaluation: QueueEvaluation
  approvedAt: Date
  approvedBy: string
  preserveExistingApprovalMetadata?: boolean
  queuedAt?: Date
}) {
  const queuedAt = input.queuedAt ?? new Date()
  const approvedAt = input.preserveExistingApprovalMetadata
    ? input.lead.approvedAt ?? input.approvedAt
    : input.approvedAt
  const approvedBy = input.preserveExistingApprovalMetadata
    ? input.lead.approvedBy ?? input.approvedBy
    : input.approvedBy

  return {
    status: 'approved' as const,
    approvedAt,
    approvedBy,
    crmPushState: input.queueEvaluation.crmPushState,
    crmPushQueuedAt: queuedAt,
    crmPushProcessingAt: null,
    crmPushLastError:
      input.queueEvaluation.crmPushState === 'failed'
        ? input.queueEvaluation.message
        : null,
  }
}

async function getLeadForTenantOrThrow(tenantId: string, leadId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, tenantId },
    select: {
      id: true,
      tenantId: true,
      fullName: true,
      company: true,
      linkedinUrl: true,
      status: true,
      crmLeadId: true,
      crmPushState: true,
      crmPushLastError: true,
      approvedAt: true,
      approvedBy: true,
    },
  })

  if (!lead) {
    throw new Error('Lead not found for this tenant')
  }

  return lead
}

async function getTenantForQueueOrThrow(tenantId: string) {
  return prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      id: true,
      crmType: true,
      crmConfig: true,
      crmPushPaused: true,
      crmPushPauseReason: true,
      crmPushPausedAt: true,
    },
  })
}

export async function requeueLeadForCrmPush(input: {
  tenantId: string
  leadId: string
  requestedBy: string
}): Promise<RequeueLeadResult> {
  const lead = await getLeadForTenantOrThrow(input.tenantId, input.leadId)

  if (lead.crmLeadId || lead.status === 'pushed_to_crm') {
    throw new Error('Lead has already been pushed to the CRM')
  }

  if (lead.status !== 'approved' || lead.crmPushState !== 'failed') {
    throw new Error(`Lead cannot be retried from status ${lead.status} (${lead.crmPushState})`)
  }

  const tenant = await getTenantForQueueOrThrow(input.tenantId)
  const queueEvaluation = evaluateLeadForQueue(tenant, lead)
  const now = new Date()

  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: buildApprovedLeadQueueUpdate({
      lead,
      queueEvaluation,
      approvedAt: lead.approvedAt ?? now,
      approvedBy: lead.approvedBy ?? input.requestedBy,
      preserveExistingApprovalMetadata: true,
      queuedAt: now,
    }),
    select: {
      id: true,
      status: true,
      crmPushState: true,
      crmPushLastError: true,
      approvedAt: true,
      approvedBy: true,
      crmLeadId: true,
    },
  })

  await auditLog(
    input.tenantId,
    queueEvaluation.preflightPassed ? 'lead_retry_queued' : 'lead_retry_preflight_failed',
    lead.id,
    {
      requestedBy: input.requestedBy,
      crmPushState: updated.crmPushState,
      crmPreflightPassed: queueEvaluation.preflightPassed,
      crmPreflightError: queueEvaluation.preflightPassed ? null : queueEvaluation.message,
      errorCode: queueEvaluation.errorCode,
    },
  )

  return {
    lead: toLeadActionSnapshot(updated),
    changed: true,
    queued: queueEvaluation.preflightPassed,
    message: queueEvaluation.preflightPassed
      ? 'Lead re-queued for CRM push.'
      : queueEvaluation.message,
  }
}

export async function requeueFailedLeadsForTenant(input: {
  tenantId: string
  requestedBy: string
}): Promise<BulkRetryFailedLeadsResult> {
  const leads = await prisma.lead.findMany({
    where: {
      tenantId: input.tenantId,
      status: 'approved',
      crmPushState: 'failed',
      crmLeadId: null,
    },
    orderBy: [{ crmPushQueuedAt: 'asc' }, { updatedAt: 'asc' }],
    select: { id: true },
  })

  let queued = 0
  let stillFailed = 0
  const errors: string[] = []

  for (const lead of leads) {
    try {
      const result = await requeueLeadForCrmPush({
        tenantId: input.tenantId,
        leadId: lead.id,
        requestedBy: input.requestedBy,
      })

      if (result.queued) {
        queued++
      } else {
        stillFailed++
        errors.push(result.message)
      }
    } catch (error) {
      stillFailed++
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }

  const summarizedErrors = summarizeErrorMessages(errors)
  await auditLog(input.tenantId, 'crm_push_bulk_retry', undefined, {
    requestedBy: input.requestedBy,
    totalMatched: leads.length,
    queued,
    stillFailed,
    errors: summarizedErrors,
  })

  return {
    totalMatched: leads.length,
    queued,
    stillFailed,
    errors: summarizedErrors,
  }
}

export async function pauseTenantCrmPush(input: {
  tenantId: string
  reason?: string
  requestedBy: string
}): Promise<TenantCrmPushPauseResult> {
  const tenant = await getTenantForQueueOrThrow(input.tenantId)

  if (tenant.crmPushPaused) {
    return {
      paused: true,
      changed: false,
      pauseReason: tenant.crmPushPauseReason,
      pausedAt: tenant.crmPushPausedAt,
      message: 'CRM push is already paused.',
    }
  }

  const now = new Date()
  const pauseReason = input.reason?.trim() || 'Paused by operator.'
  const updated = await prisma.tenant.update({
    where: { id: input.tenantId },
    data: {
      crmPushPaused: true,
      crmPushPauseReason: pauseReason,
      crmPushPausedAt: now,
    },
    select: {
      crmPushPaused: true,
      crmPushPauseReason: true,
      crmPushPausedAt: true,
    },
  })

  await auditLog(input.tenantId, 'crm_push_paused_by_operator', undefined, {
    requestedBy: input.requestedBy,
    pauseReason,
  })

  return {
    paused: updated.crmPushPaused,
    changed: true,
    pauseReason: updated.crmPushPauseReason,
    pausedAt: updated.crmPushPausedAt,
    message: 'CRM push paused.',
  }
}

export async function unpauseTenantCrmPush(input: {
  tenantId: string
  requestedBy: string
}): Promise<TenantCrmPushPauseResult> {
  const tenant = await getTenantForQueueOrThrow(input.tenantId)

  if (!tenant.crmPushPaused) {
    return {
      paused: false,
      changed: false,
      pauseReason: null,
      pausedAt: null,
      message: 'CRM push is already running.',
    }
  }

  const updated = await prisma.tenant.update({
    where: { id: input.tenantId },
    data: {
      crmPushPaused: false,
      crmPushPauseReason: null,
      crmPushPausedAt: null,
    },
    select: {
      crmPushPaused: true,
      crmPushPauseReason: true,
      crmPushPausedAt: true,
    },
  })

  await auditLog(input.tenantId, 'crm_push_unpaused_by_operator', undefined, {
    requestedBy: input.requestedBy,
  })

  return {
    paused: updated.crmPushPaused,
    changed: true,
    pauseReason: updated.crmPushPauseReason,
    pausedAt: updated.crmPushPausedAt,
    message: 'CRM push resumed.',
  }
}
