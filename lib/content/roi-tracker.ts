import { prisma } from '@/lib/db';
import { AssetPerformance, MonthlyContentReport } from './types';

/**
 * Content ROI Tracker.
 * Tracks pipeline contribution + attributed revenue per content asset.
 * Categorizes assets: Revenue Champions, Pipeline Builders, Traffic Drivers, Kill List.
 */

/**
 * Track performance for all deployed assets of a tenant.
 * Pulls GA4 visit data + CRM pipeline attribution.
 */
export async function trackAssetPerformance(tenantId: string): Promise<AssetPerformance[]> {
  const assets = await prisma.contentAsset.findMany({
    where: { tenantId, status: { in: ['deployed', 'refreshing'] } },
    orderBy: { attributedRevenue: 'desc' },
  });

  return assets.map((asset) => {
    const revenue = Number(asset.attributedRevenue);
    const pipeline = Number(asset.pipelineContribution);
    const visits = asset.monthlyVisits;
    const costPerLead = asset.costPerLead ? Number(asset.costPerLead) : null;

    // Categorize
    let category: AssetPerformance['category'];
    if (revenue > 0) {
      category = 'revenue_champion';
    } else if (pipeline > 0) {
      category = 'pipeline_builder';
    } else if (visits > 100) {
      category = 'traffic_driver';
    } else {
      category = 'kill';
    }

    return {
      assetId: asset.id,
      title: asset.title,
      evs: Number(asset.evs),
      monthlyVisits: visits,
      pipelineContribution: pipeline,
      attributedRevenue: revenue,
      costPerLead,
      revenuePerPiece: revenue,
      category,
    };
  });
}

/**
 * Generate monthly content ROI report.
 */
export async function generateMonthlyReport(tenantId: string): Promise<MonthlyContentReport> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const performances = await trackAssetPerformance(tenantId);

  const month = new Date().toISOString().slice(0, 7); // YYYY-MM

  return {
    tenantName: tenant.name,
    month,
    totalAssets: performances.length,
    totalVisits: performances.reduce((sum, p) => sum + p.monthlyVisits, 0),
    totalPipeline: performances.reduce((sum, p) => sum + p.pipelineContribution, 0),
    totalRevenue: performances.reduce((sum, p) => sum + p.attributedRevenue, 0),
    revenueChampions: performances.filter((p) => p.category === 'revenue_champion'),
    pipelineBuilders: performances.filter((p) => p.category === 'pipeline_builder'),
    trafficDrivers: performances.filter((p) => p.category === 'traffic_driver'),
    killList: performances.filter((p) => p.category === 'kill'),
  };
}

/**
 * Update EVS scores based on actual performance data.
 * Assets that generated revenue get EVS boost; underperformers get penalized.
 * This creates a self-improving feedback loop.
 */
export async function updateEVSFromPerformance(tenantId: string): Promise<number> {
  const performances = await trackAssetPerformance(tenantId);
  let updated = 0;

  for (const perf of performances) {
    const asset = await prisma.contentAsset.findUnique({ where: { id: perf.assetId } });
    if (!asset) continue;

    const currentEVS = Number(asset.evs);
    let newEVS = currentEVS;

    // Revenue champions: boost EVS (cap at 100)
    if (perf.category === 'revenue_champion' && perf.attributedRevenue > 0) {
      newEVS = Math.min(currentEVS + 10, 100);
    }
    // Pipeline builders: small boost
    else if (perf.category === 'pipeline_builder') {
      newEVS = Math.min(currentEVS + 5, 100);
    }
    // Kill list: reduce EVS
    else if (perf.category === 'kill' && perf.monthlyVisits < 50) {
      newEVS = Math.max(currentEVS - 15, 0);
    }

    if (newEVS !== currentEVS) {
      await prisma.contentAsset.update({
        where: { id: perf.assetId },
        data: { evs: newEVS },
      });
      updated++;
    }
  }

  return updated;
}

/**
 * Update content asset revenue attribution from ICM commission data.
 * Links closed deals back to the content that influenced them.
 */
export async function updateContentAttribution(tenantId: string): Promise<number> {
  // Find commission trackers with content signals in their attribution proof
  const trackers = await prisma.commissionTracker.findMany({
    where: {
      tenantId,
      status: 'calculated',
    },
  });

  let updated = 0;

  for (const tracker of trackers) {
    const proof = tracker.attributionProof as {
      contentAssetIds?: string[];
      matchedLeadId?: string;
    };

    if (!proof.contentAssetIds?.length) continue;

    // Distribute revenue evenly across contributing assets
    const dealValue = Number(tracker.dealValue);
    const perAsset = dealValue / proof.contentAssetIds.length;

    for (const assetId of proof.contentAssetIds) {
      try {
        await prisma.contentAsset.update({
          where: { id: assetId },
          data: {
            attributedRevenue: {
              increment: perAsset,
            },
          },
        });
        updated++;
      } catch {
        // Asset may have been deleted
      }
    }
  }

  return updated;
}
