import { SlackLeadCard, SlackPipelineSummary, SlackDealAlert } from './types';
import { SlackCommissionAlert, SlackReconciliationSummary } from '@/lib/icm/types';
import type { MonthlyContentReport, ContentAllocation } from '@/lib/content/types';
import type { PersonaSnippet } from '@prisma/client';

/**
 * Build Slack Block Kit message for the daily pipeline summary.
 */
export function buildPipelineSummaryBlocks(summary: SlackPipelineSummary) {
  const gradeText = Object.entries(summary.grade_distribution)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([grade, count]) => `*${grade}*: ${count}`)
    .join('  |  ');

  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Fulcrum Daily Report: ${summary.tenant_name}` },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${summary.profiles_new} new leads* discovered (${summary.profiles_scraped} scraped)\n${gradeText}`,
      },
    },
    { type: 'divider' },
  ];

  // Top leads preview (max 5)
  for (const lead of summary.top_leads.slice(0, 5)) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${lead.full_name}* - ${lead.title} at ${lead.company}\nScore: *${lead.fulcrum_score}* (${lead.fulcrum_grade}) | Fit: ${lead.fit_score} | Intent: ${lead.intent_score}\n_${lead.first_line || 'No first line generated'}_`,
      },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: 'LinkedIn' },
        url: lead.linkedin_url,
        action_id: 'open_linkedin',
      },
    });
  }

  // Action buttons
  blocks.push(
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
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Reject D Grade' },
          style: 'danger',
          action_id: 'reject_grade',
          value: JSON.stringify({ grades: ['D'] }),
        },
      ],
    }
  );

  if (summary.errors.length > 0) {
    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `Errors: ${summary.errors.length} | ${summary.errors[0]}`,
      }],
    });
  }

  return blocks;
}

/**
 * Build a single lead review card with approve/reject buttons.
 */
export function buildLeadReviewBlocks(lead: SlackLeadCard) {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${lead.full_name}*\n${lead.title} at ${lead.company}\n\nFulcrum Score: *${lead.fulcrum_score}* (${lead.fulcrum_grade})\nFit: ${lead.fit_score}/40 | Intent: ${lead.intent_score}/60\n\n_${lead.first_line || 'No first line'}_`,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Approve' },
          style: 'primary',
          action_id: 'approve_lead',
          value: lead.lead_id,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Reject' },
          style: 'danger',
          action_id: 'reject_lead',
          value: lead.lead_id,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'LinkedIn' },
          action_id: 'open_linkedin_review',
          url: lead.linkedin_url,
        },
      ],
    },
    { type: 'divider' },
  ];
}

/**
 * Build stalled deal alert blocks.
 */
export function buildDealAlertBlocks(alerts: SlackDealAlert[]) {
  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Stalled Deal Alerts' },
    },
  ];

  for (const alert of alerts) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${alert.deal_name}* ($${alert.deal_value.toLocaleString()})\nStalled: ${alert.days_stalled} days | Reason: ${alert.stalled_reason}\nSuggested: _${alert.suggested_action}_`,
      },
    });
  }

  return blocks;
}

/**
 * Build status response for /fulcrum status command.
 */
export function buildStatusBlocks(stats: {
  tenant_name: string;
  total_leads: number;
  pending_review: number;
  pushed_to_crm: number;
  grade_distribution: Record<string, number>;
  stalled_deals: number;
  last_pipeline_run: string;
}) {
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Fulcrum Status: ${stats.tenant_name}` },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Total Leads*\n${stats.total_leads}` },
        { type: 'mrkdwn', text: `*Pending Review*\n${stats.pending_review}` },
        { type: 'mrkdwn', text: `*Pushed to CRM*\n${stats.pushed_to_crm}` },
        { type: 'mrkdwn', text: `*Stalled Deals*\n${stats.stalled_deals}` },
      ],
    },
    {
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `Last pipeline run: ${stats.last_pipeline_run}`,
      }],
    },
  ];
}

// ============================================================================
// ICM COMMISSION TRACKING BLOCKS
// ============================================================================

/**
 * Build Slack blocks for daily ICM reconciliation summary.
 */
export function buildReconciliationSummaryBlocks(summary: SlackReconciliationSummary) {
  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `ICM Daily Reconciliation: ${summary.tenantName}` },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*New Deals Tracked*\n${summary.newDeals}` },
        { type: 'mrkdwn', text: `*Invoices Matched*\n${summary.invoicesMatched}` },
        { type: 'mrkdwn', text: `*Payments Confirmed*\n${summary.paymentsConfirmed}` },
        { type: 'mrkdwn', text: `*Pending Commissions*\n${summary.pendingCommissions} ($${summary.pendingCommissionValue.toLocaleString()})` },
      ],
    },
  ];

  if (summary.errors.length > 0) {
    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `Errors: ${summary.errors.length} | ${summary.errors[0]}`,
      }],
    });
  }

  return blocks;
}

/**
 * Build Slack blocks for individual commission alerts.
 */
export function buildCommissionAlertBlocks(alert: SlackCommissionAlert) {
  const emoji: Record<string, string> = {
    new_commission: ':moneybag:',
    payment_confirmed: ':white_check_mark:',
    clawback_detected: ':warning:',
    dispute_filed: ':scales:',
    dispute_resolved: ':handshake:',
  };

  const title: Record<string, string> = {
    new_commission: 'New Commission Calculated',
    payment_confirmed: 'Payment Confirmed',
    clawback_detected: 'Clawback Detected',
    dispute_filed: 'Dispute Filed',
    dispute_resolved: 'Dispute Resolved',
  };

  const blocks: unknown[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji[alert.type] ?? ''} *${title[alert.type] ?? alert.type}*\n*${alert.dealName}* — $${alert.dealValue.toLocaleString()} deal${alert.commissionAmount ? ` | Commission: *$${alert.commissionAmount.toLocaleString()}*` : ''}\n${alert.details}`,
      },
    },
  ];

  // Add action buttons for disputes
  if (alert.type === 'dispute_filed') {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Resolve for Fulcrum' },
          style: 'primary',
          action_id: 'resolve_dispute_fulcrum',
          value: alert.dealName,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Resolve for Client' },
          action_id: 'resolve_dispute_client',
          value: alert.dealName,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View Details' },
          action_id: 'view_dispute_details',
          value: alert.dealName,
        },
      ],
    });
  }

  return blocks;
}

// ============================================================================
// PREDICTIVE REVENUE ENGINE BLOCKS
// ============================================================================

/**
 * Build Slack blocks for the weekly SEO audit summary.
 */
export function buildSEOAuditBlocks(report: {
  tenantName: string;
  totalKeywords: number;
  drops: Array<{ keyword: string; delta: number; severity: string; position: number }>;
  cannibalization: Array<{ keyword: string; assetCount: number }>;
  briefsGenerated: number;
  reindexSubmitted: number;
}) {
  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `SEO Health Report: ${report.tenantName}` },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Keywords Tracked*\n${report.totalKeywords}` },
        { type: 'mrkdwn', text: `*Position Drops*\n${report.drops.length}` },
        { type: 'mrkdwn', text: `*Refresh Briefs*\n${report.briefsGenerated}` },
        { type: 'mrkdwn', text: `*Re-index Submitted*\n${report.reindexSubmitted}` },
      ],
    },
  ];

  // Critical drops
  const criticalDrops = report.drops.filter((d) => d.severity === 'critical');
  if (criticalDrops.length > 0) {
    blocks.push(
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*:rotating_light: Critical Drops*\n${criticalDrops
            .map((d) => `• "${d.keyword}" dropped *${d.delta}* positions (now #${d.position})`)
            .join('\n')}`,
        },
      }
    );
  }

  // High drops
  const highDrops = report.drops.filter((d) => d.severity === 'high');
  if (highDrops.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*:warning: High Severity Drops*\n${highDrops
          .map((d) => `• "${d.keyword}" dropped *${d.delta}* positions (now #${d.position})`)
          .join('\n')}`,
      },
    });
  }

  // Cannibalization
  if (report.cannibalization.length > 0) {
    blocks.push(
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*:scissors: Cannibalization Detected*\n${report.cannibalization
            .map((c) => `• "${c.keyword}" — ${c.assetCount} assets competing`)
            .join('\n')}`,
        },
      }
    );
  }

  return blocks;
}

/**
 * Build Slack blocks for monthly content allocation summary.
 */
export function buildContentAllocationBlocks(allocation: {
  tenantName: string;
  month: string;
  totalSlots: number;
  allocations: Array<{
    serviceName: string;
    slots: number;
    percentage: number;
    profitabilityScore: number;
    adjustedSlots: number;
  }>;
  saturatedServices: string[];
}) {
  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Content Allocation: ${allocation.tenantName} — ${allocation.month}` },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${allocation.totalSlots} content slots* allocated across ${allocation.allocations.length} services`,
      },
    },
    { type: 'divider' },
  ];

  for (const a of allocation.allocations) {
    const saturatedNote = allocation.saturatedServices.includes(a.serviceName)
      ? ' :warning: _saturated — reduced 33%_'
      : '';
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${a.serviceName}*\n${a.adjustedSlots} slots (${a.percentage}%) | Profitability: ${a.profitabilityScore.toFixed(1)}${saturatedNote}`,
      },
    });
  }

  return blocks;
}

/**
 * Build Slack blocks for monthly content ROI report.
 */
export function buildContentROIBlocks(report: MonthlyContentReport) {
  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Monthly Content ROI Report' },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Total Assets*\n${report.totalAssets}` },
        { type: 'mrkdwn', text: `*Attributed Revenue*\n$${report.totalRevenue.toLocaleString()}` },
        { type: 'mrkdwn', text: `*Revenue Champions*\n${report.revenueChampions.length}` },
        { type: 'mrkdwn', text: `*Kill List*\n${report.killList.length}` },
      ],
    },
  ];

  // Revenue champions
  if (report.revenueChampions.length > 0) {
    blocks.push(
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*:trophy: Revenue Champions*\n${report.revenueChampions
            .slice(0, 5)
            .map((a) => `• *${a.title}* — $${a.attributedRevenue.toLocaleString()} revenue, EVS ${a.evs}`)
            .join('\n')}`,
        },
      }
    );
  }

  // Kill list
  if (report.killList.length > 0) {
    blocks.push(
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*:skull: Kill List* (EVS < 20)\n${report.killList
            .slice(0, 5)
            .map((a) => `• ${a.title} — EVS ${a.evs}, ${a.monthlyVisits} visits/mo`)
            .join('\n')}`,
        },
      }
    );
  }

  return blocks;
}

/**
 * Build Slack blocks for persona snippet deployment notification.
 */
export function buildPersonaSnippetBlocks(snippet: PersonaSnippet, assetTitle: string) {
  const personaLabels: Record<string, string> = {
    cfo: ':chart_with_upwards_trend: CFO Snippet',
    director: ':clipboard: Director Snippet',
    end_user: ':computer: End-User Snippet',
  };

  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${personaLabels[snippet.persona] ?? snippet.persona}\n*Asset:* ${assetTitle}\n\n*Hook:* ${snippet.hook}\n\n${snippet.body}\n\n*CTA:* _${snippet.cta}_`,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Deploy to LinkedIn' },
          style: 'primary',
          action_id: 'deploy_snippet_linkedin',
          value: snippet.id,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Deploy to Email' },
          action_id: 'deploy_snippet_email',
          value: snippet.id,
        },
      ],
    },
    { type: 'divider' },
  ];
}

/**
 * Build Slack blocks for bi-weekly CRO audit report.
 */
export function buildCROReportBlocks(report: {
  tenantName: string;
  totalPages: number;
  critical: Array<{ pageUrl: string; issue: string; pipelineImpact: number }>;
  warnings: Array<{ pageUrl: string; issue: string; pipelineImpact: number }>;
  abTestsQueued: number;
  totalPipelineImpact: number;
}) {
  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `CRO Audit: ${report.tenantName}` },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Pages Analyzed*\n${report.totalPages}` },
        { type: 'mrkdwn', text: `*Critical Issues*\n${report.critical.length}` },
        { type: 'mrkdwn', text: `*A/B Tests Queued*\n${report.abTestsQueued}` },
        { type: 'mrkdwn', text: `*Pipeline Impact*\n$${report.totalPipelineImpact.toLocaleString()}/mo` },
      ],
    },
  ];

  // Critical issues
  if (report.critical.length > 0) {
    blocks.push(
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*:rotating_light: Critical*\n${report.critical
            .slice(0, 5)
            .map((c) => `• *${c.pageUrl}* — ${c.issue} ($${c.pipelineImpact.toLocaleString()}/mo)`)
            .join('\n')}`,
        },
      }
    );
  }

  // Warnings
  if (report.warnings.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*:warning: Warnings*\n${report.warnings
          .slice(0, 5)
          .map((w) => `• *${w.pageUrl}* — ${w.issue} ($${w.pipelineImpact.toLocaleString()}/mo)`)
          .join('\n')}`,
      },
    });
  }

  return blocks;
}

/**
 * Build Slack blocks for saturation alert.
 */
export function buildSaturationAlertBlocks(alert: {
  tenantName: string;
  saturatedServices: Array<{ serviceName: string; score: number; signals: string[] }>;
  rebalanced: boolean;
}) {
  const blocks: unknown[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*:warning: Content Saturation Alert — ${alert.tenantName}*\n${alert.saturatedServices.length} service(s) showing saturation signals${alert.rebalanced ? ' — allocations auto-rebalanced' : ''}`,
      },
    },
  ];

  for (const s of alert.saturatedServices) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${s.serviceName}* (score: ${s.score}/100)\n${s.signals.map((sig) => `• ${sig}`).join('\n')}`,
      },
    });
  }

  return blocks;
}
