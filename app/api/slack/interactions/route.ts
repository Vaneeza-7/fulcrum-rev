import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  handlePushAllAPlus,
  handleApproveLead,
  handleRejectLead,
  handleReviewLeads,
  handleRejectGrade,
} from '@/lib/slack/handlers';
import { verifySlackRequest } from '@/lib/slack/verify-signature';

/**
 * POST /api/slack/interactions
 * Handle Slack interactive components (button clicks, approvals).
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const params = new URLSearchParams(body);
  const payloadStr = params.get('payload');

  if (!payloadStr) {
    return NextResponse.json({ error: 'Missing payload' }, { status: 400 });
  }

  // Verify Slack request signature
  const sig = verifySlackRequest(request.headers, body);
  if (!sig.valid) {
    return NextResponse.json({ error: sig.error }, { status: 401 });
  }

  const payload = JSON.parse(payloadStr);
  const action = payload.actions?.[0];
  const teamId = payload.team?.id;

  if (!action || !teamId) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Find tenant
  const slackConfig = await prisma.tenantSlackConfig.findFirst({
    where: { teamId },
  });

  if (!slackConfig) {
    return new NextResponse('', { status: 200 }); // Acknowledge but do nothing
  }

  const tenantId = slackConfig.tenantId;

  switch (action.action_id) {
    case 'push_all_aplus': {
      const result = await handlePushAllAPlus(tenantId);
      return NextResponse.json({
        response_type: 'in_channel',
        replace_original: false,
        text: `Pushed ${result.pushed} A+ leads to CRM.${result.errors.length > 0 ? ` ${result.errors.length} errors.` : ''}`,
      });
    }

    case 'review_leads': {
      await handleReviewLeads(tenantId, payload.message?.ts);
      return new NextResponse('', { status: 200 });
    }

    case 'approve_lead': {
      const leadId = action.value;
      const result = await handleApproveLead(tenantId, leadId);
      return NextResponse.json({
        response_type: 'in_channel',
        replace_original: false,
        text: result.success
          ? `Lead approved and pushed to CRM (ID: ${result.crmLeadId})`
          : `Failed to push lead: ${result.error}`,
      });
    }

    case 'reject_lead': {
      const leadId = action.value;
      await handleRejectLead(tenantId, leadId, 'Rejected via Slack');
      return NextResponse.json({
        response_type: 'in_channel',
        replace_original: false,
        text: 'Lead rejected.',
      });
    }

    case 'reject_grade': {
      const { grades } = JSON.parse(action.value);
      const count = await handleRejectGrade(tenantId, grades);
      return NextResponse.json({
        response_type: 'in_channel',
        replace_original: false,
        text: `Rejected ${count} ${grades.join('/')} grade leads.`,
      });
    }

    default:
      return new NextResponse('', { status: 200 });
  }
}

