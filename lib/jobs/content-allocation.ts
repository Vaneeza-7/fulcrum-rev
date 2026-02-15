import { prisma, auditLog } from '@/lib/db';
import { calculateProfitabilityScore, allocateContentSlots } from '@/lib/content/evs-calculator';
import { rebalanceAllocations } from '@/lib/content/saturation-detector';
import { getSlackClient } from '@/lib/slack/client';
import { buildContentAllocationBlocks } from '@/lib/slack/blocks';
import { ProfitabilityScore, ContentAllocation } from '@/lib/content/types';
import { jobLogger } from '@/lib/logger';

const log = jobLogger('content_allocation');

/**
 * Monthly Content Allocation Job — runs 1st of month at 5 AM UTC.
 *
 * 1. Pull service profiles → calculate profitability scores
 * 2. Detect saturation → rebalance if needed
 * 3. Generate allocation plan
 * 4. Slack notification with allocation summary
 */
export async function runContentAllocation(tenantId: string): Promise<ContentAllocation | null> {
  const services = await prisma.serviceProfile.findMany({
    where: { tenantId, isActive: true },
  });

  if (services.length === 0) return null;

  // Calculate profitability scores
  const scores: ProfitabilityScore[] = services.map((s) =>
    calculateProfitabilityScore({
      id: s.id,
      name: s.name,
      margin: Number(s.margin),
      ltv: Number(s.ltv),
      cac: Number(s.cac),
      dealSize: Number(s.dealSize),
      salesCycleDays: s.salesCycleDays,
    })
  );

  // Allocate content slots (default 25/month as per PRE prompt)
  const totalSlots = 25;
  const allocated = allocateContentSlots(scores, totalSlots);

  // Check for saturation and rebalance
  const { saturated } = await rebalanceAllocations(tenantId);

  // Build allocation plan
  const allocation: ContentAllocation = {
    totalSlots,
    allocations: allocated.map((a) => ({
      serviceId: a.serviceId,
      serviceName: a.serviceName,
      slots: Math.round((a.allocationPercentage / 100) * totalSlots),
      percentage: a.allocationPercentage,
      profitabilityScore: a.score,
      saturationScore: 0,
      adjustedSlots: saturated.includes(a.serviceName)
        ? Math.round((a.allocationPercentage / 100) * totalSlots * 0.67) // 33% reduction
        : Math.round((a.allocationPercentage / 100) * totalSlots),
    })),
    tier1Topics: [],
    tier2Topics: [],
    tier3Topics: [],
    deprioritized: [],
  };

  // Send Slack notification
  try {
    const slack = await getSlackClient(tenantId);
    if (slack) {
      const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      await slack.client.chat.postMessage({
        channel: slack.channelId,
        text: `Monthly Content Allocation: ${totalSlots} slots across ${services.length} services`,
        blocks: buildContentAllocationBlocks({
          tenantName: tenant.name,
          month: new Date().toISOString().slice(0, 7),
          totalSlots,
          allocations: allocation.allocations,
          saturatedServices: saturated,
        }) as never[],
      });
    }
  } catch (error) {
    log.error({ err: error, tenantId }, 'Slack notification failed');
  }

  await auditLog(tenantId, 'content_allocation_complete', undefined, {
    totalSlots,
    services: services.length,
    saturated,
  });

  return allocation;
}

/**
 * Run content allocation for all active tenants.
 */
export async function runContentAllocationAll(): Promise<{
  results: ContentAllocation[];
  errors: string[];
}> {
  const tenants = await prisma.tenant.findMany({ where: { isActive: true } });
  const results: ContentAllocation[] = [];
  const errors: string[] = [];

  for (const tenant of tenants) {
    try {
      const result = await runContentAllocation(tenant.id);
      if (result) results.push(result);
    } catch (error) {
      errors.push(`Content allocation failed for ${tenant.name}: ${error}`);
    }
  }

  return { results, errors };
}
