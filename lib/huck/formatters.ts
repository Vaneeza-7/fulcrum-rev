import type { Lead, DealDiagnostic, SystemHealthCheck } from '@prisma/client';
import type { PipelineStats } from './types';

/**
 * Format leads into a context string for Claude.
 */
export function formatLeadsForContext(leads: Lead[]): string {
  if (leads.length === 0) return 'No leads found.';

  const lines = leads.map((l) =>
    `- ${l.fullName} | ${l.title ?? 'N/A'} at ${l.company ?? 'N/A'} | ` +
    `Grade: ${l.fulcrumGrade ?? 'Unscored'} | Score: ${Number(l.fulcrumScore)} | ` +
    `Fit: ${Number(l.fitScore)}/40 | Intent: ${Number(l.intentScore)}/60 | ` +
    `Status: ${l.status} | First line: ${l.firstLine ?? 'None'}`
  );

  return `Leads (${leads.length}):\n${lines.join('\n')}`;
}

/**
 * Format deal diagnostics into a context string for Claude.
 */
export function formatDealsForContext(deals: DealDiagnostic[]): string {
  if (deals.length === 0) return 'No deal diagnostics found.';

  const lines = deals.map((d) =>
    `- ${d.dealName ?? d.dealId} | Value: $${d.dealValue ?? 0} | ` +
    `Stage: ${d.dealStage ?? 'Unknown'} | ` +
    `Stalled: ${d.isStalled ? 'YES' : 'no'} | ` +
    `Reason: ${d.stalledReason ?? 'N/A'} | ` +
    `Days inactive: ${d.daysSinceActivity ?? '?'} | Days in stage: ${d.daysInStage ?? '?'}`
  );

  return `Deal Diagnostics (${deals.length}):\n${lines.join('\n')}`;
}

/**
 * Format pipeline stats into a context string for Claude.
 */
export function formatStatsForContext(stats: PipelineStats): string {
  const gradeStr = Object.entries(stats.gradeDistribution)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([grade, count]) => `${grade}: ${count}`)
    .join(', ');

  return `Pipeline Stats:
- Total leads: ${stats.totalLeads}
- Pending review: ${stats.pendingReview}
- Pushed to CRM: ${stats.pushedToCrm}
- Stalled deals: ${stats.stalledDeals}
- Grade distribution: ${gradeStr || 'None'}
- Last pipeline run: ${stats.lastPipelineRun ?? 'Never'}`;
}

/**
 * Format health checks into a context string for Claude.
 */
export function formatHealthForContext(checks: SystemHealthCheck[]): string {
  if (checks.length === 0) return 'No recent health checks.';

  const lines = checks.map((c) =>
    `- ${c.checkType}: ${c.status} (${c.checkedAt.toISOString()})`
  );

  return `System Health:\n${lines.join('\n')}`;
}
