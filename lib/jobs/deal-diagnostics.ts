import { prisma, auditLog } from '@/lib/db';
import { CRMFactory } from '@/lib/crm/factory';
import { CRMDeal } from '@/lib/crm/types';
import { askClaudeJson } from '@/lib/ai/claude';
import { REENGAGEMENT_SYSTEM_PROMPT } from '@/lib/ai/prompts';
import { ReengagementResult } from '@/lib/ai/types';
import { sendStallAlert } from '@/lib/huck/proactive';
import { SlackDealAlert } from '@/lib/slack/types';
import { jobLogger } from '@/lib/logger';
import { decryptCrmConfig } from '@/lib/settings/crm';
import { resolveAnthropicCredentials } from '@/lib/settings/api-keys';

const log = jobLogger('deal_diagnostics');

/**
 * Check if a deal is stalled based on the diagnostic heuristics.
 */
function isDealStalled(deal: CRMDeal): { stalled: boolean; reason: string; daysSinceActivity: number; daysInStage: number } {
  const now = new Date();

  const daysSinceActivity = deal.last_activity_date
    ? Math.floor((now.getTime() - new Date(deal.last_activity_date).getTime()) / 86400000)
    : 999;

  const daysInStage = deal.stage_change_date
    ? Math.floor((now.getTime() - new Date(deal.stage_change_date).getTime()) / 86400000)
    : 999;

  const engagementRate = deal.email_sent_count > 0
    ? deal.email_response_count / deal.email_sent_count
    : 1; // No emails sent = not stalled on engagement

  // Primary criteria (any triggers stalled)
  if (daysSinceActivity > 7) {
    return { stalled: true, reason: `No activity in ${daysSinceActivity} days`, daysSinceActivity, daysInStage };
  }
  if (daysInStage > 30) {
    return { stalled: true, reason: `Same stage for ${daysInStage} days`, daysSinceActivity, daysInStage };
  }
  if (deal.email_sent_count >= 5 && engagementRate < 0.2) {
    return { stalled: true, reason: `Low engagement: ${deal.email_sent_count} emails, ${Math.round(engagementRate * 100)}% response rate`, daysSinceActivity, daysInStage };
  }

  return { stalled: false, reason: '', daysSinceActivity, daysInStage };
}

/**
 * Run deal diagnostics for a single tenant.
 * Fetches deals from CRM, checks for stalled ones, generates re-engagement actions.
 */
export async function runDealDiagnostics(tenantId: string): Promise<{ checked: number; stalled: number; alerts: SlackDealAlert[] }> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  if (!tenant.crmType) {
    return { checked: 0, stalled: 0, alerts: [] };
  }
  const crmConfig = decryptCrmConfig(tenant.crmConfig);
  if (!crmConfig) {
    throw new Error('CRM config missing or unreadable');
  }
  const anthropicCredentials = resolveAnthropicCredentials({
    anthropicApiKey: tenant.anthropicApiKey,
  });

  const crm = CRMFactory.create(tenant.crmType, crmConfig);
  await crm.authenticate();

  // Fetch active deals
  const deals = await crm.getDeals();
  const alerts: SlackDealAlert[] = [];
  let stalledCount = 0;

  for (const deal of deals) {
    const { stalled, reason, daysSinceActivity, daysInStage } = isDealStalled(deal);

    // Upsert diagnostic record
    await prisma.dealDiagnostic.upsert({
      where: {
        tenantId_dealId: { tenantId, dealId: deal.id },
      },
      update: {
        dealName: deal.name,
        dealValue: deal.value,
        dealStage: deal.stage,
        lastActivityDate: deal.last_activity_date ? new Date(deal.last_activity_date) : null,
        daysSinceActivity,
        stageChangeDate: deal.stage_change_date ? new Date(deal.stage_change_date) : null,
        daysInStage,
        emailSentCount: deal.email_sent_count,
        emailResponseCount: deal.email_response_count,
        isStalled: stalled,
        stalledReason: stalled ? reason : null,
        stalledDetectedAt: stalled ? new Date() : null,
      },
      create: {
        tenantId,
        dealId: deal.id,
        dealName: deal.name,
        dealValue: deal.value,
        dealStage: deal.stage,
        lastActivityDate: deal.last_activity_date ? new Date(deal.last_activity_date) : null,
        daysSinceActivity,
        stageChangeDate: deal.stage_change_date ? new Date(deal.stage_change_date) : null,
        daysInStage,
        emailSentCount: deal.email_sent_count,
        emailResponseCount: deal.email_response_count,
        isStalled: stalled,
        stalledReason: stalled ? reason : null,
        stalledDetectedAt: stalled ? new Date() : null,
      },
    });

    if (stalled) {
      stalledCount++;

      // Generate re-engagement action via Claude
      try {
        const reengagement = await askClaudeJson<ReengagementResult>(
          REENGAGEMENT_SYSTEM_PROMPT,
          `Deal: ${deal.name}\nValue: $${deal.value}\nStage: ${deal.stage}\nReason stalled: ${reason}\nContact: ${deal.contact_name}\nOwner: ${deal.owner}`,
          {
            apiKey: anthropicCredentials.apiKey ?? undefined,
            billingContext: {
              tenantId,
              provider: 'anthropic',
              feature: 'diagnostics',
              stage: 'diagnostics.reengagement',
              metadata: { dealId: deal.id, dealName: deal.name },
            },
          },
        );

        // Create task in CRM
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);

        const taskId = await crm.createTask(deal.id, {
          title: `Follow up: ${deal.name} (STALLED)`,
          description: reengagement.internal_note,
          due_date: tomorrow.toISOString().split('T')[0],
          priority: deal.value > 10000 ? 'high' : 'medium',
        });

        // Tag the deal
        await crm.addTag(deal.id, 'STALLED');
        await crm.addNote(deal.id, reengagement.reengagement_email);

        // Update diagnostic record
        await prisma.dealDiagnostic.update({
          where: { tenantId_dealId: { tenantId, dealId: deal.id } },
          data: { taskCreated: true, taskId },
        });

        alerts.push({
          deal_name: deal.name,
          deal_value: deal.value,
          days_stalled: daysSinceActivity,
          stalled_reason: reason,
          suggested_action: reengagement.suggested_actions[0] ?? 'Follow up with the prospect',
        });

        // Auto-move to nurture if severely stalled
        if (daysSinceActivity > 45) {
          const engagementRate = deal.email_sent_count > 0
            ? deal.email_response_count / deal.email_sent_count
            : 1;
          if (engagementRate === 0) {
            await crm.moveDealStage(deal.id, 'Long-term Nurture');
            await crm.addNote(deal.id, 'Auto-moved to Long-term Nurture after 45+ days with no response');
          }
        }
      } catch (error) {
        log.error({ err: error, tenantId, dealName: deal.name }, 'Re-engagement generation failed');
      }
    }
  }

  // Send Huck's stall alerts
  if (alerts.length > 0) {
    await sendStallAlert(tenantId, alerts);
  }

  await auditLog(tenantId, 'deal_diagnostics_completed', undefined, {
    deals_checked: deals.length,
    stalled: stalledCount,
    alerts_sent: alerts.length,
  });

  return { checked: deals.length, stalled: stalledCount, alerts };
}
