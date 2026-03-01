import { NextRequest, NextResponse } from 'next/server';
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
} from '@/lib/slack/handlers';
import { verifySlackRequest } from '@/lib/slack/verify-signature';
import { NegativeReason } from '@prisma/client';
import { routeLogger } from '@/lib/logger';

const log = routeLogger('/api/slack/interactions');

/**
 * Handle Slack Block Kit interaction payloads.
 * Slack sends a URL-encoded body with a "payload" field containing JSON.
 */
export async function POST(request: NextRequest) {
  try {
    // Verify Slack request signature
    const rawBody = await request.text();
    const signatureResult = verifySlackRequest(request.headers, rawBody);
    if (!signatureResult.valid) {
      log.warn({ error: signatureResult.error }, 'Slack signature verification failed');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Re-parse the body as form data since we already consumed it
    const formData = new URLSearchParams(rawBody);
    const payloadStr = formData.get('payload') as string;
    if (!payloadStr) {
      return NextResponse.json({ error: 'Missing payload' }, { status: 400 });
    }

    const payload = JSON.parse(payloadStr);
    const userId = payload.user?.id ?? 'unknown';

    for (const action of payload.actions ?? []) {
      const actionId = action.action_id;
      let value: Record<string, string> = {};
      try {
        value = action.value ? JSON.parse(action.value) : {};
      } catch {
        value = { raw: action.value };
      }

      const tenantId = value.tenantId ?? payload.team?.id ?? '';

      switch (actionId) {
        case 'approve_lead':
          await handleApproveLead(tenantId, value.leadId);
          break;

        case 'reject_lead':
          await handleRejectLead(tenantId, value.leadId, value.reason);
          break;

        case 'reject_lead_with_reason':
          await handleRejectLead(
            tenantId,
            value.leadId,
            value.reason,
            (value.rejectReason as NegativeReason) ?? NegativeReason.OTHER,
            userId,
          );
          break;

        case 'reject_brand_suggestion':
          await handleRejectBrandSuggestion(
            tenantId,
            value.brandSuggestionId,
            value.reason,
            userId,
          );
          break;

        case 'push_all_aplus':
          await handlePushAllAPlus(tenantId);
          break;

        case 'review_leads':
          await handleReviewLeads(tenantId, payload.message?.ts);
          break;

        case 'reject_grade': {
          const grades = value.grades ? JSON.parse(value.grades) : ['D'];
          await handleRejectGrade(tenantId, grades);
          break;
        }

        case 'monitoring_dismiss':
          await handleMonitoringDismiss(value.alertId, value.resourceId, userId);
          break;

        case 'monitoring_ack':
          await handleMonitoringAck(value.alertId, value.resourceId, userId);
          break;

        case 'monitoring_suppress':
          await handleMonitoringSuppress(value.alertId, value.resourceId, value.resourceName, userId);
          break;

        default:
          log.warn({ actionId }, 'Unknown Slack action');
      }
    }

    // Acknowledge the interaction
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ error }, 'Slack interaction error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
