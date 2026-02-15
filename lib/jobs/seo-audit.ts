import { prisma, auditLog } from '@/lib/db';
import { decryptTenantConfig } from '@/lib/db-crypto';
import { syncPositions, detectDrops } from '@/lib/seo/position-tracker';
import { generateRefreshBrief, detectCannibalization } from '@/lib/seo/refresh-engine';
import { submitForReindex } from '@/lib/seo/reindex-submitter';
import { getSlackClient } from '@/lib/slack/client';
import { buildSEOAuditBlocks } from '@/lib/slack/blocks';
import { GSCAuthConfig, SEOHealthReport } from '@/lib/seo/types';
import { jobLogger } from '@/lib/logger';

const log = jobLogger('seo_audit');

/**
 * Weekly SEO Audit Job — runs Monday 4 AM UTC.
 *
 * For each tenant with GSC configured:
 * 1. Sync keyword positions from Google Search Console
 * 2. Detect position drops (>3 positions)
 * 3. Generate refresh briefs for drops
 * 4. Detect keyword cannibalization
 * 5. Auto-submit critical drops for re-indexing
 * 6. Send Slack summary
 */
export async function runSEOAudit(tenantId: string): Promise<SEOHealthReport | null> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const gscConfig = decryptTenantConfig<GSCAuthConfig>(tenant.gscConfig as any);

  // Skip tenants without GSC configured
  if (!gscConfig?.accessToken || !gscConfig?.siteUrl) {
    return null;
  }

  const report: SEOHealthReport = {
    tenantName: tenant.name,
    totalKeywordsTracked: 0,
    positionImprovements: 0,
    positionDrops: 0,
    criticalDrops: [],
    cannibalizationIssues: [],
    briefsGenerated: 0,
    reindexSubmitted: 0,
  };

  // ---- Step 1: Sync positions ----
  try {
    const snapshots = await syncPositions(tenantId);
    report.totalKeywordsTracked = snapshots.length;
    report.positionImprovements = snapshots.filter((s) => s.delta != null && s.delta < 0).length;
  } catch (error) {
    log.error({ err: error, tenantId, tenantName: tenant.name }, 'Position sync failed');
    return report;
  }

  // ---- Step 2: Detect drops ----
  const drops = await detectDrops(tenantId);
  report.positionDrops = drops.length;
  report.criticalDrops = drops.filter((d) => d.severity === 'critical');

  // ---- Step 3: Create audit records + generate briefs ----
  for (const drop of drops) {
    try {
      const audit = await prisma.sEOAudit.create({
        data: {
          tenantId,
          auditType: 'position_drop',
          severity: drop.severity,
          details: {
            keyword: drop.keyword,
            assetId: drop.assetId,
            assetUrl: drop.assetUrl,
            fromPosition: drop.fromPosition,
            toPosition: drop.toPosition,
            delta: drop.delta,
          },
          status: 'detected',
        },
      });

      const brief = await generateRefreshBrief(tenantId, audit.id);
      if (brief) report.briefsGenerated++;
    } catch (error) {
      log.error({ err: error, tenantId, keyword: drop.keyword }, 'Brief generation failed');
    }
  }

  // ---- Step 4: Detect cannibalization ----
  try {
    const cannibalization = await detectCannibalization(tenantId);
    report.cannibalizationIssues = cannibalization;

    for (const issue of cannibalization) {
      await prisma.sEOAudit.create({
        data: {
          tenantId,
          auditType: 'cannibalization',
          severity: 'medium',
          details: {
            keyword: issue.keyword,
            assets: issue.assets,
            recommendation: issue.recommendation,
          },
          status: 'detected',
        },
      });
    }
  } catch (error) {
    log.error({ err: error, tenantId }, 'Cannibalization detection failed');
  }

  // ---- Step 5: Auto-reindex critical drops ----
  const criticalUrls = drops
    .filter((d) => d.severity === 'critical' && d.assetUrl)
    .map((d) => d.assetUrl!);

  if (criticalUrls.length > 0) {
    try {
      const indexNowKey = process.env.INDEXNOW_API_KEY;
      for (const url of criticalUrls) {
        await submitForReindex(url, gscConfig, indexNowKey);
        report.reindexSubmitted++;
      }
    } catch (error) {
      log.error({ err: error, tenantId }, 'Re-index submission failed');
    }
  }

  // ---- Step 6: Send Slack summary ----
  try {
    const slack = await getSlackClient(tenantId);
    if (slack && (report.positionDrops > 0 || report.cannibalizationIssues.length > 0)) {
      await slack.client.chat.postMessage({
        channel: slack.channelId,
        text: `SEO Audit: ${report.positionDrops} drops detected, ${report.briefsGenerated} briefs generated`,
        blocks: buildSEOAuditBlocks(report as any) as never[],
      });
    }
  } catch (error) {
    log.error({ err: error, tenantId }, 'Slack notification failed');
  }

  await auditLog(tenantId, 'seo_audit_complete', undefined, {
    keywordsTracked: report.totalKeywordsTracked,
    drops: report.positionDrops,
    criticalDrops: report.criticalDrops.length,
    briefsGenerated: report.briefsGenerated,
    reindexSubmitted: report.reindexSubmitted,
    cannibalization: report.cannibalizationIssues.length,
  });

  return report;
}

/**
 * Run SEO audit for all tenants with GSC configured.
 */
export async function runSEOAuditAll(): Promise<{
  results: SEOHealthReport[];
  errors: string[];
}> {
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
  });

  const results: SEOHealthReport[] = [];
  const errors: string[] = [];

  for (const tenant of tenants) {
    try {
      const report = await runSEOAudit(tenant.id);
      if (report) results.push(report);
    } catch (error) {
      errors.push(`SEO audit failed for ${tenant.name}: ${error}`);
    }
  }

  return { results, errors };
}
