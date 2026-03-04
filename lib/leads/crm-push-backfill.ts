import { prisma } from '@/lib/db'
import { runCrmPreflight } from '@/lib/crm/preflight'
import {
  buildApprovedLeadQueueUpdate,
  summarizeErrorMessages,
  type ErrorSummary,
} from './crm-queue-ops'

interface CandidateLead {
  id: string
  tenantId: string
  status: string
  crmLeadId: string | null
  crmPushState: string
  crmPushLastError: string | null
  approvedAt: Date | null
  approvedBy: string | null
  pushedToCrmAt: Date | null
  discoveredAt: Date
  createdAt: Date
  updatedAt: Date
  fullName: string
  company: string | null
  linkedinUrl: string
}

export interface CrmPushBackfillTenantResult {
  tenantId: string
  tenantName: string
  dryRun: boolean
  matchedByStatus: Record<string, number>
  projectedQueued: number
  projectedFailedPreflight: number
  projectedSucceeded: number
  failureReasons: ErrorSummary[]
  updatedQueued: number
  updatedFailedPreflight: number
  updatedSucceeded: number
}

function firstDate(...values: Array<Date | null | undefined>) {
  for (const value of values) {
    if (value) return value
  }
  return null
}

function shouldMarkSucceeded(lead: CandidateLead) {
  return (
    (lead.status === 'pushed_to_crm' || Boolean(lead.crmLeadId)) &&
    (lead.crmPushState !== 'succeeded' ||
      lead.crmPushLastError !== null ||
      lead.approvedAt === null ||
      lead.approvedBy === null)
  )
}

function shouldRequeueApprovedLead(lead: CandidateLead) {
  return lead.status === 'approved' && lead.crmLeadId === null && lead.crmPushState === 'not_queued'
}

async function loadTenantLeadCandidates(tenantId: string) {
  const [tenant, leads] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        crmType: true,
        crmConfig: true,
      },
    }),
    prisma.lead.findMany({
      where: {
        tenantId,
        OR: [
          { status: 'pushed_to_crm' },
          { crmLeadId: { not: null } },
          { status: 'approved', crmPushState: 'not_queued', crmLeadId: null },
        ],
      },
      select: {
        id: true,
        tenantId: true,
        status: true,
        crmLeadId: true,
        crmPushState: true,
        crmPushLastError: true,
        approvedAt: true,
        approvedBy: true,
        pushedToCrmAt: true,
        discoveredAt: true,
        createdAt: true,
        updatedAt: true,
        fullName: true,
        company: true,
        linkedinUrl: true,
      },
      orderBy: [{ discoveredAt: 'desc' }, { updatedAt: 'desc' }],
    }),
  ])

  return { tenant, leads }
}

export async function backfillTenantCrmPushState(input: {
  tenantId: string
  dryRun?: boolean
}): Promise<CrmPushBackfillTenantResult> {
  const dryRun = input.dryRun ?? false
  const { tenant, leads } = await loadTenantLeadCandidates(input.tenantId)
  const matchedByStatus: Record<string, number> = {}
  let projectedQueued = 0
  let projectedFailedPreflight = 0
  let projectedSucceeded = 0
  let updatedQueued = 0
  let updatedFailedPreflight = 0
  let updatedSucceeded = 0
  const failureMessages: string[] = []

  for (const lead of leads) {
    matchedByStatus[lead.status] = (matchedByStatus[lead.status] ?? 0) + 1

    if (shouldMarkSucceeded(lead)) {
      projectedSucceeded++

      if (!dryRun) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            crmPushState: 'succeeded',
            crmPushProcessingAt: null,
            crmPushLastError: null,
            approvedAt:
              lead.approvedAt ??
              firstDate(lead.pushedToCrmAt, lead.updatedAt, lead.discoveredAt, lead.createdAt),
            approvedBy: lead.approvedBy ?? 'legacy_backfill',
          },
        })
        updatedSucceeded++
      }
      continue
    }

    if (!shouldRequeueApprovedLead(lead)) {
      continue
    }

    const preflight = runCrmPreflight(tenant, lead)
    const queueEvaluation = {
      preflightPassed: preflight.ok,
      crmPushState: (preflight.ok ? 'queued' : 'failed') as 'queued' | 'failed',
      message: preflight.message ?? 'CRM preflight failed.',
      errorCode: preflight.errorCode ?? null,
    }

    if (queueEvaluation.preflightPassed) {
      projectedQueued++
    } else {
      projectedFailedPreflight++
      failureMessages.push(queueEvaluation.message)
    }

    if (!dryRun) {
      const now = new Date()
      await prisma.lead.update({
        where: { id: lead.id },
        data: buildApprovedLeadQueueUpdate({
          lead,
          queueEvaluation,
          approvedAt: lead.approvedAt ?? firstDate(lead.updatedAt, lead.discoveredAt, lead.createdAt) ?? now,
          approvedBy: lead.approvedBy ?? 'legacy_backfill',
          preserveExistingApprovalMetadata: true,
          queuedAt: now,
        }),
      })

      if (queueEvaluation.preflightPassed) {
        updatedQueued++
      } else {
        updatedFailedPreflight++
      }
    }
  }

  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    dryRun,
    matchedByStatus,
    projectedQueued,
    projectedFailedPreflight,
    projectedSucceeded,
    failureReasons: summarizeErrorMessages(failureMessages).slice(0, 10),
    updatedQueued,
    updatedFailedPreflight,
    updatedSucceeded,
  }
}

export async function backfillCrmPushStateForTenants(input: {
  tenantIds: string[]
  dryRun?: boolean
}) {
  const results: CrmPushBackfillTenantResult[] = []
  for (const tenantId of input.tenantIds) {
    results.push(
      await backfillTenantCrmPushState({
        tenantId,
        dryRun: input.dryRun,
      }),
    )
  }
  return results
}
