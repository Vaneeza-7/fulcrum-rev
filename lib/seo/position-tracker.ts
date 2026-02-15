import { prisma } from '@/lib/db';
import { decryptTenantConfig } from '@/lib/db-crypto';
import { GSCConnector } from './gsc-connector';
import { PositionSnapshot, PositionDrop, GSCAuthConfig } from './types';

/**
 * Track keyword positions week-over-week via Google Search Console.
 * Detects drops and classifies severity.
 */

/**
 * Pull latest GSC data and upsert SEOKeywordTracker rows.
 * Calculates deltas from previous check.
 */
export async function syncPositions(tenantId: string): Promise<PositionSnapshot[]> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const gscConfig = decryptTenantConfig<GSCAuthConfig>(tenant.gscConfig as any);
  if (!gscConfig?.accessToken || !gscConfig?.siteUrl) {
    return [];
  }

  const gsc = new GSCConnector(gscConfig);

  // Pull last 7 days of data
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const analytics = await gsc.getSearchAnalytics(startDate, endDate);
  const snapshots: PositionSnapshot[] = [];

  for (const row of analytics) {
    // Find existing tracker for this keyword
    const existing = await prisma.sEOKeywordTracker.findFirst({
      where: { tenantId, keyword: row.query },
      orderBy: { checkedAt: 'desc' },
    });

    // Try to match keyword to a content asset by URL
    let assetId: string | undefined;
    if (row.page) {
      const asset = await prisma.contentAsset.findFirst({
        where: { tenantId, url: { contains: row.page } },
      });
      assetId = asset?.id;
    }

    const prevPosition = existing?.position ?? null;
    const currentPosition = Math.round(row.position);
    const delta = prevPosition != null ? currentPosition - prevPosition : null;

    // Upsert the tracker
    await prisma.sEOKeywordTracker.upsert({
      where: {
        id: existing?.id ?? '00000000-0000-0000-0000-000000000000',
      },
      create: {
        tenantId,
        assetId,
        keyword: row.query,
        position: currentPosition,
        prevPosition,
        positionDelta: delta,
        impressions: row.impressions,
        clicks: row.clicks,
        ctr: row.ctr,
        checkedAt: new Date(),
      },
      update: {
        prevPosition: existing?.position,
        position: currentPosition,
        positionDelta: delta,
        impressions: row.impressions,
        clicks: row.clicks,
        ctr: row.ctr,
        assetId: assetId ?? existing?.assetId,
        checkedAt: new Date(),
      },
    });

    snapshots.push({
      keyword: row.query,
      assetId,
      currentPosition,
      previousPosition: prevPosition,
      delta,
      impressions: row.impressions,
      clicks: row.clicks,
      ctr: row.ctr,
    });
  }

  return snapshots;
}

/**
 * Detect keywords that have dropped more than 3 positions.
 */
export async function detectDrops(tenantId: string): Promise<PositionDrop[]> {
  const drops = await prisma.sEOKeywordTracker.findMany({
    where: {
      tenantId,
      positionDelta: { gt: 3 }, // positive delta = dropped
    },
    include: {
      asset: { select: { id: true, url: true } },
    },
    orderBy: { positionDelta: 'desc' },
  });

  return drops.map((d) => ({
    keyword: d.keyword,
    assetId: d.assetId ?? undefined,
    assetUrl: d.asset?.url ?? undefined,
    fromPosition: d.prevPosition ?? 0,
    toPosition: d.position ?? 0,
    delta: d.positionDelta ?? 0,
    severity: classifyDrop(d.positionDelta ?? 0),
  }));
}

/**
 * Classify drop severity per PRE response matrix:
 * - 3-5 positions: MEDIUM (refresh within 7 days)
 * - 6-10 positions: HIGH (major refresh within 3 days)
 * - >10 positions: CRITICAL (full rewrite within 24 hours)
 */
export function classifyDrop(delta: number): 'medium' | 'high' | 'critical' {
  if (delta > 10) return 'critical';
  if (delta > 5) return 'high';
  return 'medium';
}
