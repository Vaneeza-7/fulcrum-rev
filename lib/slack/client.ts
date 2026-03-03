import { WebClient } from '@slack/web-api';
import { prisma } from '@/lib/db';
import { buildPipelineSummaryBlocks, buildLeadReviewBlocks, buildDealAlertBlocks } from './blocks';
import { SlackLeadCard, SlackPipelineSummary, SlackDealAlert } from './types';
import { decryptSlackBotToken } from '@/lib/settings/slack';

/**
 * Get a Slack WebClient for a specific tenant.
 * Each tenant has their own Slack workspace and bot token.
 */
export async function getSlackClient(tenantId: string): Promise<{ client: WebClient; channelId: string } | null> {
  const config = await prisma.tenantSlackConfig.findUnique({
    where: { tenantId },
  });

  if (!config) return null;
  const botToken = decryptSlackBotToken(config.botToken);
  if (!botToken) return null;

  return {
    client: new WebClient(botToken),
    channelId: config.channelId,
  };
}

/**
 * Send the daily pipeline summary to a tenant's Slack channel.
 */
export async function sendPipelineSummary(
  tenantId: string,
  summary: SlackPipelineSummary
): Promise<void> {
  const slack = await getSlackClient(tenantId);
  if (!slack) {
    console.log(`No Slack config for tenant ${tenantId}, skipping notification`);
    return;
  }

  await slack.client.chat.postMessage({
    channel: slack.channelId,
    text: `Fulcrum: ${summary.profiles_new} new leads for ${summary.tenant_name}`,
    blocks: buildPipelineSummaryBlocks(summary) as never[],
  });
}

/**
 * Send individual lead review cards in a thread.
 */
export async function sendLeadReviewThread(
  tenantId: string,
  leads: SlackLeadCard[],
  parentTs?: string,
  crmOrgId?: string,
  crmType?: string
): Promise<void> {
  const slack = await getSlackClient(tenantId);
  if (!slack) return;

  for (const lead of leads) {
    await slack.client.chat.postMessage({
      channel: slack.channelId,
      thread_ts: parentTs,
      text: `Review: ${lead.full_name} (${lead.fulcrum_grade})`,
      blocks: buildLeadReviewBlocks(lead, crmOrgId, crmType) as never[],
    });
  }
}

/**
 * Send stalled deal alerts.
 */
export async function sendDealAlerts(
  tenantId: string,
  alerts: SlackDealAlert[]
): Promise<void> {
  if (alerts.length === 0) return;

  const slack = await getSlackClient(tenantId);
  if (!slack) return;

  await slack.client.chat.postMessage({
    channel: slack.channelId,
    text: `Stalled Deal Alert: ${alerts.length} deals need attention`,
    blocks: buildDealAlertBlocks(alerts) as never[],
  });
}
