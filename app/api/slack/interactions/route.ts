import { NextRequest, NextResponse } from 'next/server'
import { NegativeReason } from '@prisma/client'
import {
  handleApproveLead,
  handleRejectLead,
  handleRejectBrandSuggestion,
  handlePushAllAPlus,
  handleReviewLeads,
  handleRejectGrade,
  handleMonitoringDismiss,
  handleMonitoringAck,
  handleMonitoringSuppress,
} from '@/lib/slack/handlers'
import { verifySlackRequest } from '@/lib/slack/verify-signature'
import { routeLogger } from '@/lib/logger'
import {
  parseSlackActionValue,
  resolveSlackInteractionLeadId,
  resolveSlackInteractionTenantId,
} from '@/lib/slack/resolve-interaction-context'
import { decryptCrmConfig } from '@/lib/settings/crm'
import { prisma } from '@/lib/db'
import { updateLeadReviewMessage } from '@/lib/slack/client'
import type { SlackLeadCard } from '@/lib/slack/types'

const log = routeLogger('/api/slack/interactions')

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
  crmLeadId: string | null
  crmPushState: string
  crmPushLastError: string | null
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
    crm_push_state: lead.crmPushState,
    crm_push_last_error: lead.crmPushLastError,
  }
}

async function getTenantCrmDisplayContext(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { crmType: true, crmConfig: true },
  })

  const crmConfig = tenant ? decryptCrmConfig(tenant.crmConfig) ?? {} : {}
  return {
    crmType: tenant?.crmType ?? undefined,
    crmOrgId: typeof crmConfig.org_id === 'string' ? crmConfig.org_id : undefined,
  }
}

/**
 * Handle Slack Block Kit interaction payloads.
 * Slack sends a URL-encoded body with a "payload" field containing JSON.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const signatureResult = verifySlackRequest(request.headers, rawBody)
    if (!signatureResult.valid) {
      log.warn({ error: signatureResult.error }, 'Slack signature verification failed')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = new URLSearchParams(rawBody)
    const payloadStr = formData.get('payload') as string
    if (!payloadStr) {
      return NextResponse.json({ error: 'Missing payload' }, { status: 400 })
    }

    const payload = JSON.parse(payloadStr)
    const action = payload.actions?.[0]
    if (!action) {
      return NextResponse.json({ ok: true })
    }

    const parsedValue = parseSlackActionValue(action.value)
    const tenantId = await resolveSlackInteractionTenantId(payload, parsedValue)
    const leadId = resolveSlackInteractionLeadId(parsedValue)
    const userId = payload.user?.id ?? 'unknown'
    const channelId = payload.channel?.id
    const messageTs = payload.message?.ts

    if (!tenantId && !['monitoring_dismiss', 'monitoring_ack', 'monitoring_suppress'].includes(action.action_id)) {
      return NextResponse.json({ error: 'Unable to resolve tenant for Slack action' }, { status: 400 })
    }

    switch (action.action_id) {
      case 'approve_lead': {
        if (!tenantId || !leadId) {
          return NextResponse.json({ error: 'Lead context missing' }, { status: 400 })
        }

        const result = await handleApproveLead(tenantId, leadId)
        if (channelId && messageTs) {
          const crmContext = await getTenantCrmDisplayContext(tenantId)
          await updateLeadReviewMessage(
            tenantId,
            channelId,
            messageTs,
            toSlackLeadCard(result.lead),
            result.lead.crmPushState === 'failed'
              ? `Approved — CRM blocked: ${result.lead.crmPushLastError ?? 'CRM preflight failed'}`
              : 'Approved — Queued for CRM',
            crmContext.crmOrgId,
            crmContext.crmType,
          )
        }
        break
      }

      case 'reject_lead':
      case 'reject_lead_with_reason': {
        if (!tenantId || !leadId) {
          return NextResponse.json({ error: 'Lead context missing' }, { status: 400 })
        }

        const result = await handleRejectLead(
          tenantId,
          leadId,
          parsedValue.reason,
          (parsedValue.rejectReason as NegativeReason | undefined) ?? NegativeReason.OTHER,
          userId,
        )
        if (channelId && messageTs) {
          const crmContext = await getTenantCrmDisplayContext(tenantId)
          await updateLeadReviewMessage(
            tenantId,
            channelId,
            messageTs,
            toSlackLeadCard(result.lead),
            'Rejected',
            crmContext.crmOrgId,
            crmContext.crmType,
          )
        }
        break
      }

      case 'reject_brand_suggestion':
        await handleRejectBrandSuggestion(
          tenantId!,
          String(parsedValue.brandSuggestionId ?? parsedValue.raw ?? ''),
          parsedValue.reason,
          userId,
        )
        break

      case 'push_all_aplus':
        await handlePushAllAPlus(tenantId!)
        break

      case 'review_leads':
        await handleReviewLeads(tenantId!, messageTs)
        break

      case 'reject_grade':
        await handleRejectGrade(tenantId!, Array.isArray(parsedValue.grades) ? parsedValue.grades : ['D'])
        break

      case 'monitoring_dismiss':
        await handleMonitoringDismiss(
          String(parsedValue.alertId ?? parsedValue.raw ?? ''),
          String(parsedValue.resourceId ?? ''),
          userId,
        )
        break

      case 'monitoring_ack':
        await handleMonitoringAck(
          String(parsedValue.alertId ?? parsedValue.raw ?? ''),
          String(parsedValue.resourceId ?? ''),
          userId,
        )
        break

      case 'monitoring_suppress':
        await handleMonitoringSuppress(
          String(parsedValue.alertId ?? parsedValue.raw ?? ''),
          String(parsedValue.resourceId ?? ''),
          String(parsedValue.resourceName ?? ''),
          userId,
        )
        break

      default:
        log.warn({ actionId: action.action_id }, 'Unknown Slack action')
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    log.error({ error }, 'Slack interaction error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
