import { prisma, auditLog } from '@/lib/db'
import { CRMFactory } from '@/lib/crm/factory'
import { jobLogger } from '@/lib/logger'
import {
  buildCrmLeadData,
  humanizeCrmPushError,
  runCrmPreflight,
  type CrmPushFailureCode,
} from '@/lib/crm/preflight'
import type { CrmPushEventMetadata } from '@/lib/crm/push-events'

const log = jobLogger('crm_push')
const MAX_RETRIES = 3
const BASE_DELAY_MS = 1_000
const QUEUEABLE_CRM_PUSH_STATES = ['queued', 'failed'] as const

interface PushLeadResult {
  success: boolean
  skipped?: boolean
  crmLeadId?: string
  error?: string
  outcome?: string
}

async function createCrmPushEvent(input: {
  tenantId: string
  leadId: string
  connector: string
  outcome: string
  attemptNumber: number
  crmObjectId?: string | null
  errorCode?: string | null
  errorMessage?: string | null
  metadata?: CrmPushEventMetadata
}) {
  await prisma.crmPushEvent.create({
    data: {
      tenantId: input.tenantId,
      leadId: input.leadId,
      connector: input.connector,
      outcome: input.outcome,
      attemptNumber: input.attemptNumber,
      crmObjectId: input.crmObjectId ?? null,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      metadata: (input.metadata ?? {}) as never,
    },
  })
}

async function markLeadFailed(input: {
  leadId: string
  error: string
}) {
  await prisma.lead.update({
    where: { id: input.leadId },
    data: {
      status: 'approved',
      crmPushState: 'failed',
      crmPushProcessingAt: null,
      crmPushLastError: input.error,
    },
  })
}

function isQueueableState(value: string) {
  return QUEUEABLE_CRM_PUSH_STATES.includes(value as (typeof QUEUEABLE_CRM_PUSH_STATES)[number])
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function getLeadWithTenant(leadId: string) {
  return prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: {
      tenant: true,
    },
  })
}

/**
 * Push a single approved queued lead to the CRM.
 * Claim-based and idempotent so cron workers can safely retry.
 */
export async function pushLeadToCRM(leadId: string): Promise<PushLeadResult> {
  const currentLead = await getLeadWithTenant(leadId)

  if (currentLead.crmLeadId || currentLead.status === 'pushed_to_crm') {
    return {
      success: true,
      skipped: true,
      crmLeadId: currentLead.crmLeadId ?? undefined,
      outcome: 'already_pushed',
    }
  }

  if (currentLead.status !== 'approved' || !isQueueableState(currentLead.crmPushState)) {
    return {
      success: false,
      skipped: true,
      error: 'Lead is not queueable for CRM push.',
      outcome: 'not_queueable',
    }
  }

  const claim = await prisma.lead.updateMany({
    where: {
      id: leadId,
      status: 'approved',
      crmLeadId: null,
      crmPushState: { in: ['queued', 'failed'] },
    },
    data: {
      crmPushState: 'processing',
      crmPushProcessingAt: new Date(),
      crmPushAttempts: { increment: 1 },
    },
  })

  if (claim.count === 0) {
    const latest = await getLeadWithTenant(leadId)
    return {
      success: Boolean(latest.crmLeadId || latest.status === 'pushed_to_crm'),
      skipped: true,
      crmLeadId: latest.crmLeadId ?? undefined,
      error: latest.crmPushLastError ?? undefined,
      outcome: latest.crmLeadId ? 'already_pushed' : 'claim_lost',
    }
  }

  const lead = await getLeadWithTenant(leadId)
  const attemptNumber = lead.crmPushAttempts
  const preflight = runCrmPreflight(lead.tenant, lead)

  if (!preflight.ok || !preflight.connector || !preflight.crmConfig) {
    const errorCode = (preflight.errorCode ?? 'validation_failed') as CrmPushFailureCode
    const message = preflight.message ?? 'CRM preflight failed.'
    await markLeadFailed({ leadId, error: message })
    await createCrmPushEvent({
      tenantId: lead.tenantId,
      leadId,
      connector: preflight.connector ?? lead.tenant.crmType ?? 'crm',
      outcome: errorCode === 'auth_failed' ? 'auth_failed' : 'validation_failed',
      attemptNumber,
      errorCode,
      errorMessage: message,
      metadata: {
        stage: 'preflight',
        retry: 0,
        source: 'cron',
        duplicateHint: null,
      },
    })

    return { success: false, error: message, outcome: errorCode }
  }

  const crm = CRMFactory.create(preflight.connector, preflight.crmConfig)
  const crmLeadData = buildCrmLeadData(lead, lead.tenant.name)
  let lastError: unknown = null
  let lastRetry = 0

  for (let retry = 1; retry <= MAX_RETRIES; retry++) {
    lastRetry = retry
    try {
      await crm.authenticate()
      const crmLeadId = await crm.createLead(crmLeadData)

      await prisma.lead.update({
        where: { id: leadId },
        data: {
          status: 'pushed_to_crm',
          crmLeadId,
          pushedToCrmAt: new Date(),
          crmPushState: 'succeeded',
          crmPushProcessingAt: null,
          crmPushLastError: null,
        },
      })

      await createCrmPushEvent({
        tenantId: lead.tenantId,
        leadId,
        connector: preflight.connector,
        outcome: 'created',
        attemptNumber,
        crmObjectId: crmLeadId,
        metadata: {
          stage: 'push',
          retry,
          source: 'cron',
          duplicateHint: null,
        },
      })

      await auditLog(lead.tenantId, 'lead_pushed_to_crm', leadId, {
        crmLeadId,
        attemptNumber,
      })

      return { success: true, crmLeadId, outcome: 'created' }
    } catch (error) {
      lastError = error
      log.error({ err: error, leadId, retry, attemptNumber }, 'CRM push attempt failed')

      if (retry < MAX_RETRIES) {
        await delay(BASE_DELAY_MS * Math.pow(2, retry - 1))
      }
    }
  }

  const humanized = humanizeCrmPushError(lastError)
  await markLeadFailed({ leadId, error: humanized.message })
  await createCrmPushEvent({
    tenantId: lead.tenantId,
    leadId,
    connector: preflight.connector,
    outcome:
      humanized.errorCode === 'duplicate_detected'
        ? 'duplicate_detected'
        : humanized.errorCode === 'auth_failed'
          ? 'auth_failed'
          : humanized.errorCode === 'validation_failed'
            ? 'validation_failed'
            : 'transient_failed',
    attemptNumber,
    errorCode: humanized.errorCode,
    errorMessage: humanized.message,
    metadata: {
      stage: 'push',
      rawError: lastError instanceof Error ? lastError.message : String(lastError),
      retry: lastRetry,
      source: 'cron',
      duplicateHint: humanized.duplicate ? humanized.message : null,
    },
  })

  await auditLog(lead.tenantId, 'crm_push_failed', leadId, {
    error: humanized.message,
    errorCode: humanized.errorCode,
    attemptNumber,
  })

  return { success: false, error: humanized.message, outcome: humanized.errorCode }
}

/**
 * Push all approved queued leads for a tenant.
 */
export async function pushApprovedLeads(tenantId: string): Promise<{ pushed: number; failed: number }> {
  const leads = await prisma.lead.findMany({
    where: {
      tenantId,
      status: 'approved',
      crmLeadId: null,
      crmPushState: { in: ['queued', 'failed'] },
    },
    orderBy: [{ crmPushQueuedAt: 'asc' }, { updatedAt: 'asc' }],
    select: { id: true },
  })

  let pushed = 0
  let failed = 0

  for (const lead of leads) {
    const result = await pushLeadToCRM(lead.id)
    if (result.success && !result.skipped) pushed++
    else if (!result.skipped) failed++
  }

  return { pushed, failed }
}
