import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { buildStatusBlocks } from '@/lib/slack/blocks';
import { runPipelineForTenant } from '@/lib/pipeline/orchestrator';
import { verifySlackRequest } from '@/lib/slack/verify-signature';

/**
 * POST /api/slack/commands
 * Handle Slack slash commands: /fulcrum status, /fulcrum run, /fulcrum deals
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const params = new URLSearchParams(body);

  // Verify Slack request signature
  const sig = verifySlackRequest(request.headers, body);
  if (!sig.valid) {
    return NextResponse.json({ error: sig.error }, { status: 401 });
  }

  const command = params.get('command');
  const text = params.get('text')?.trim() ?? '';
  const teamId = params.get('team_id') ?? '';

  // Find tenant by Slack team ID
  const slackConfig = await prisma.tenantSlackConfig.findFirst({
    where: { teamId },
    include: { tenant: true },
  });

  if (!slackConfig) {
    return NextResponse.json({
      response_type: 'ephemeral',
      text: 'No Fulcrum tenant configured for this workspace.',
    });
  }

  const tenant = slackConfig.tenant;
  const subcommand = text.split(' ')[0]?.toLowerCase();

  switch (subcommand) {
    case 'status': {
      const [totalLeads, pendingReview, pushedToCrm, stalledDeals, lastRun] = await Promise.all([
        prisma.lead.count({ where: { tenantId: tenant.id } }),
        prisma.lead.count({ where: { tenantId: tenant.id, status: 'pending_review' } }),
        prisma.lead.count({ where: { tenantId: tenant.id, status: 'pushed_to_crm' } }),
        prisma.dealDiagnostic.count({ where: { tenantId: tenant.id, isStalled: true } }),
        prisma.auditLog.findFirst({
          where: { tenantId: tenant.id, actionType: 'pipeline_completed' },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      // Grade distribution
      const leads = await prisma.lead.groupBy({
        by: ['fulcrumGrade'],
        where: { tenantId: tenant.id },
        _count: true,
      });
      const gradeDistribution: Record<string, number> = {};
      leads.forEach((l) => {
        if (l.fulcrumGrade) gradeDistribution[l.fulcrumGrade] = l._count;
      });

      return NextResponse.json({
        response_type: 'in_channel',
        blocks: buildStatusBlocks({
          tenant_name: tenant.name,
          total_leads: totalLeads,
          pending_review: pendingReview,
          pushed_to_crm: pushedToCrm,
          grade_distribution: gradeDistribution,
          stalled_deals: stalledDeals,
          last_pipeline_run: lastRun?.createdAt.toISOString() ?? 'Never',
        }),
      });
    }

    case 'run': {
      // Trigger pipeline manually (async, respond immediately)
      runPipelineForTenant(tenant.id).catch(console.error);
      return NextResponse.json({
        response_type: 'ephemeral',
        text: `Pipeline started for ${tenant.name}. Results will be posted when complete.`,
      });
    }

    case 'deals': {
      const stalledDeals = await prisma.dealDiagnostic.findMany({
        where: { tenantId: tenant.id, isStalled: true },
        orderBy: { daysSinceActivity: 'desc' },
        take: 10,
      });

      if (stalledDeals.length === 0) {
        return NextResponse.json({
          response_type: 'in_channel',
          text: 'No stalled deals detected. All deals are progressing normally.',
        });
      }

      const dealText = stalledDeals.map((d) =>
        `*${d.dealName}* ($${Number(d.dealValue ?? 0).toLocaleString()}) - ${d.stalledReason}`
      ).join('\n');

      return NextResponse.json({
        response_type: 'in_channel',
        text: `*${stalledDeals.length} Stalled Deals:*\n${dealText}`,
      });
    }

    default:
      return NextResponse.json({
        response_type: 'ephemeral',
        text: 'Available commands: `/fulcrum status`, `/fulcrum run`, `/fulcrum deals`',
      });
  }
}

