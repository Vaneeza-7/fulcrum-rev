import { prisma } from '@/lib/db';
import type { FreshnessScore, DataHealthSummary } from './types';

/**
 * Calculate a freshness score based on when data was last enriched.
 * Score decays over time:
 *   0-7 days:  100 (fresh)
 *   8-14 days:  70 (aging)
 *   15-30 days: 40 (stale)
 *   30+ days:   10 (critical)
 */
export function calculateFreshnessScore(enrichedAt: Date | null): FreshnessScore {
  if (!enrichedAt) {
    return { score: 0, label: 'critical', daysSinceEnrichment: 999 };
  }

  const now = new Date();
  const daysSince = Math.floor((now.getTime() - enrichedAt.getTime()) / 86400000);

  if (daysSince <= 7) {
    return { score: 100, label: 'fresh', daysSinceEnrichment: daysSince };
  }
  if (daysSince <= 14) {
    return { score: 70, label: 'aging', daysSinceEnrichment: daysSince };
  }
  if (daysSince <= 30) {
    return { score: 40, label: 'stale', daysSinceEnrichment: daysSince };
  }
  return { score: 10, label: 'critical', daysSinceEnrichment: daysSince };
}

/**
 * Update freshness scores and stale flags for all leads of a tenant.
 */
export async function flagStaleLeads(tenantId: string): Promise<{ updated: number; staleCount: number }> {
  const leads = await prisma.lead.findMany({
    where: { tenantId },
    select: { id: true, enrichedAt: true },
  });

  let staleCount = 0;

  for (const lead of leads) {
    const freshness = calculateFreshnessScore(lead.enrichedAt);
    const isStale = freshness.score <= 40;
    if (isStale) staleCount++;

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        dataFreshnessScore: freshness.score,
        isStale,
        lastDataCheckAt: new Date(),
      },
    });
  }

  return { updated: leads.length, staleCount };
}

/**
 * Get a summary of data health for a tenant.
 */
export async function getDataHealthSummary(tenantId: string): Promise<DataHealthSummary> {
  const leads = await prisma.lead.findMany({
    where: { tenantId },
    select: { enrichedAt: true, dataFreshnessScore: true },
  });

  let freshCount = 0;
  let agingCount = 0;
  let staleCount = 0;
  let criticalCount = 0;
  let totalScore = 0;

  for (const lead of leads) {
    const freshness = calculateFreshnessScore(lead.enrichedAt);
    totalScore += freshness.score;

    switch (freshness.label) {
      case 'fresh': freshCount++; break;
      case 'aging': agingCount++; break;
      case 'stale': staleCount++; break;
      case 'critical': criticalCount++; break;
    }
  }

  return {
    totalLeads: leads.length,
    freshCount,
    agingCount,
    staleCount,
    criticalCount,
    averageScore: leads.length > 0 ? Math.round(totalScore / leads.length) : 0,
  };
}
