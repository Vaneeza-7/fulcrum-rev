import { prisma, auditLog } from '@/lib/db';
import { generateMonthlyReport, updateEVSFromPerformance, updateContentAttribution } from '@/lib/content/roi-tracker';
import { getSlackClient } from '@/lib/slack/client';
import { buildContentROIBlocks } from '@/lib/slack/blocks';
import { MonthlyContentReport } from '@/lib/content/types';
import { jobLogger } from '@/lib/logger';

const log = jobLogger('content_roi');

/**
 * Monthly Content ROI Job — runs 2nd of month at 6 AM UTC.
 *
 * 1. Update content attribution from ICM commission data
 * 2. Generate monthly performance report
 * 3. Update EVS scores based on actual performance
 * 4. Send Slack notification with report
 */
export async function runContentROI(tenantId: string): Promise<MonthlyContentReport | null> {
  // Check if tenant has any content assets
  const assetCount = await prisma.contentAsset.count({ where: { tenantId } });
  if (assetCount === 0) return null;

  // Step 1: Update content attribution from ICM
  try {
    await updateContentAttribution(tenantId);
  } catch (error) {
    log.error({ err: error, tenantId }, 'Attribution update failed');
  }

  // Step 2: Generate monthly report
  const report = await generateMonthlyReport(tenantId);

  // Step 3: Update EVS from actual performance
  const evsUpdated = await updateEVSFromPerformance(tenantId);

  // Step 4: Kill underperformers (EVS < 20)
  const killCandidates = await prisma.contentAsset.findMany({
    where: { tenantId, status: 'deployed', evs: { lt: 20 } },
  });

  for (const asset of killCandidates) {
    await prisma.contentAsset.update({
      where: { id: asset.id },
      data: { status: 'killed' },
    });
  }

  // Step 5: Slack notification
  try {
    const slack = await getSlackClient(tenantId);
    if (slack) {
      await slack.client.chat.postMessage({
        channel: slack.channelId,
        text: `Content ROI Report: $${report.totalRevenue.toLocaleString()} attributed revenue, ${report.killList.length} assets to kill`,
        blocks: buildContentROIBlocks(report) as never[],
      });
    }
  } catch (error) {
    log.error({ err: error, tenantId }, 'Slack notification failed');
  }

  await auditLog(tenantId, 'content_roi_complete', undefined, {
    totalAssets: report.totalAssets,
    totalRevenue: report.totalRevenue,
    revenueChampions: report.revenueChampions.length,
    killList: report.killList.length,
    evsUpdated,
    killed: killCandidates.length,
  });

  return report;
}

/**
 * Run content ROI analysis for all active tenants.
 */
export async function runContentROIAll(): Promise<{
  results: MonthlyContentReport[];
  errors: string[];
}> {
  const tenants = await prisma.tenant.findMany({ where: { isActive: true } });
  const results: MonthlyContentReport[] = [];
  const errors: string[] = [];

  for (const tenant of tenants) {
    try {
      const result = await runContentROI(tenant.id);
      if (result) results.push(result);
    } catch (error) {
      errors.push(`Content ROI failed for ${tenant.name}: ${error}`);
    }
  }

  return { results, errors };
}
