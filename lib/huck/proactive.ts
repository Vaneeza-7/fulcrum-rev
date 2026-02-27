import { prisma } from '@/lib/db';
import { askClaude } from '@/lib/ai/claude';
import { HUCK_PROACTIVE_SUMMARY_PROMPT } from '@/lib/ai/prompts';
import { getSlackClient } from '@/lib/slack/client';
import { getDataHealthSummary } from '@/lib/health/data-freshness';
import { ROIAttributionService } from '@/lib/roi/attribution-service';
import type { PipelineResult } from '@/lib/pipeline/types';
import type { SlackDealAlert } from '@/lib/slack/types';

/**
 * Send Huck's daily pipeline summary in his voice.
 * Replaces the generic pipeline summary with a conversational message.
 */
export async function sendDailySummary(
  tenantId: string,
  tenantName: string,
  result: PipelineResult,
  topLeads: Array<{ fullName: string; company: string | null; fulcrumGrade: string | null; fulcrumScore: number }>
): Promise<void> {
  const slack = await getSlackClient(tenantId);
  if (!slack) return;

  // Fetch ROI data in parallel with report formatting
  const [roiSummary, topROILeads] = await Promise.all([
    ROIAttributionService.getTenantROISummary(tenantId),
    ROIAttributionService.getTopROILeads(tenantId, 5),
  ]);

  const gradeStr = Object.entries(result.grade_distribution)
    .map(([grade, count]) => `${grade}: ${count}`)
    .join(', ');

  const topLeadStr = topLeads
    .slice(0, 3)
    .map((l) => `${l.fullName} at ${l.company ?? 'Unknown'} (${l.fulcrumGrade}, ${l.fulcrumScore})`)
    .join('\n');

  const roiSection = roiSummary.totalLeads > 0
    ? `Shadow ROI Summary:
- Fulcrum-sourced leads: ${roiSummary.totalLeads}
- Total credit invested: ${roiSummary.totalSpend} credits
- Estimated attributed revenue: $${roiSummary.totalRevenue.toLocaleString()}
- Average ROI multiplier: ${roiSummary.avgMultiplier.toFixed(1)}x
Top 5 leads by ROI:
${topROILeads.map((l) => `- Lead ${l.leadId}: ${l.roiMultiplier.toFixed(1)}x ROI | Stage: ${l.stage || 'Unknown'} | Deal: $${l.estimatedDealValue?.toLocaleString() || 'N/A'}`).join('\n')}`
    : 'Shadow ROI Summary: No Fulcrum-sourced leads tracked yet. ROI data will appear once the first sync runs.';

  const contextForClaude = `Tenant: ${tenantName}
New leads today: ${result.profiles_new}
Total scraped: ${result.profiles_scraped}
Grade breakdown: ${gradeStr}
Top prospects:\n${topLeadStr}
Errors: ${result.errors.length > 0 ? result.errors.join(', ') : 'None'}

${roiSection}`;

  const huckMessage = await askClaude(
    HUCK_PROACTIVE_SUMMARY_PROMPT,
    contextForClaude,
    { maxTokens: 512 }
  );

  await slack.client.chat.postMessage({
    channel: slack.channelId,
    text: huckMessage,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: huckMessage },
      },
      { type: 'divider' },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Push All A+ to CRM' },
            style: 'primary',
            action_id: 'push_all_aplus',
            value: JSON.stringify({ grades: ['A+'] }),
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Review All Leads' },
            action_id: 'review_leads',
          },
        ],
      },
    ] as never[],
  });
}

/**
 * Send a stalled deal alert in Huck's voice.
 */
export async function sendStallAlert(
  tenantId: string,
  alerts: SlackDealAlert[]
): Promise<void> {
  if (alerts.length === 0) return;

  const slack = await getSlackClient(tenantId);
  if (!slack) return;

  const alertList = alerts
    .map((a) => `*${a.deal_name}* ($${a.deal_value.toLocaleString()}) — ${a.stalled_reason}. Suggested: _${a.suggested_action}_`)
    .join('\n');

  const message = `Heads up — ${alerts.length} deal${alerts.length > 1 ? 's need' : ' needs'} attention:\n\n${alertList}\n\nWant me to create follow-up tasks for these?`;

  await slack.client.chat.postMessage({
    channel: slack.channelId,
    text: message,
  });
}

/**
 * Send a system health alert in Huck's voice.
 */
export async function sendSystemAlert(
  tenantId: string,
  checkType: string,
  status: string,
  details: string
): Promise<void> {
  const slack = await getSlackClient(tenantId);
  if (!slack) return;

  const emoji = status === 'critical' ? ':rotating_light:' : ':warning:';
  const message = `${emoji} *System Alert* — ${checkType} is ${status}.\n${details}\n\nI'm keeping an eye on it. Let me know if you need me to investigate further.`;

  await slack.client.chat.postMessage({
    channel: slack.channelId,
    text: message,
  });
}

/**
 * Send a weekly performance digest in Huck's voice.
 */
export async function sendWeeklyDigest(tenantId: string): Promise<void> {
  const slack = await getSlackClient(tenantId);
  if (!slack) return;

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

  // Gather weekly stats
  const weekAgo = new Date(Date.now() - 7 * 86400000);

  const [newLeadsThisWeek, pushedThisWeek, stalledDeals, dataHealth] = await Promise.all([
    prisma.lead.count({
      where: { tenantId, discoveredAt: { gte: weekAgo } },
    }),
    prisma.lead.count({
      where: { tenantId, pushedToCrmAt: { gte: weekAgo } },
    }),
    prisma.dealDiagnostic.count({
      where: { tenantId, isStalled: true },
    }),
    getDataHealthSummary(tenantId),
  ]);

  // Grade distribution for the week
  const weekLeads = await prisma.lead.groupBy({
    by: ['fulcrumGrade'],
    where: {
      tenantId,
      discoveredAt: { gte: weekAgo },
      fulcrumGrade: { not: null },
    },
    _count: true,
  });

  const gradeStr = weekLeads
    .filter((r) => r.fulcrumGrade)
    .map((r) => `${r.fulcrumGrade}: ${r._count}`)
    .join(', ');

  const message = `*Weekly Digest for ${tenant.name}*\n\n` +
    `This week: *${newLeadsThisWeek}* new leads discovered | *${pushedThisWeek}* pushed to CRM\n` +
    `Grades: ${gradeStr || 'No graded leads yet'}\n` +
    `Stalled deals: ${stalledDeals}\n` +
    `Data health: avg score ${dataHealth.averageScore}/100 (${dataHealth.freshCount} fresh, ${dataHealth.staleCount + dataHealth.criticalCount} need refresh)\n\n` +
    (stalledDeals > 0 ? `_${stalledDeals} deals need attention — ask me about them._` : '_All deals are progressing nicely._');

  await slack.client.chat.postMessage({
    channel: slack.channelId,
    text: message,
  });
}
