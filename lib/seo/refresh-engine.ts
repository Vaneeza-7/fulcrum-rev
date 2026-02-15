import { prisma } from '@/lib/db';
import { decryptTenantConfig } from '@/lib/db-crypto';
import { askClaudeJson } from '@/lib/ai/claude';
import { SEO_REFRESH_BRIEF_PROMPT, CANNIBALIZATION_RESOLUTION_PROMPT } from '@/lib/ai/prompts';
import { DataForSEOConnector } from './dataforseo-connector';
import { RefreshBrief, CannibalizationResult, DataForSEOAuthConfig } from './types';

/**
 * SEO Refresh Engine — generates refresh briefs and detects cannibalization.
 * Uses Claude Sonnet for intelligent content refresh recommendations.
 */

/**
 * Generate a structured refresh brief for a position drop audit.
 */
export async function generateRefreshBrief(
  tenantId: string,
  auditId: string
): Promise<RefreshBrief | null> {
  const audit = await prisma.sEOAudit.findUniqueOrThrow({ where: { id: auditId } });
  const details = audit.details as { keyword?: string; assetId?: string; delta?: number };
  if (!details.keyword) return null;

  // Gather context for the brief
  const keyword = details.keyword;
  const asset = details.assetId
    ? await prisma.contentAsset.findUnique({ where: { id: details.assetId } })
    : null;

  // Get competitor SERP data if DataForSEO is configured
  let competitorContext = '';
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const dfConfig = decryptTenantConfig<DataForSEOAuthConfig>(tenant.dataforseoConfig as any);
  if (dfConfig?.login && dfConfig?.password) {
    try {
      const dfs = new DataForSEOConnector(dfConfig);
      const serp = await dfs.getSERPResults(keyword);
      competitorContext = `Top competitor results for "${keyword}":\n${serp.results
        .slice(0, 5)
        .map((r) => `#${r.position}: ${r.domain} - "${r.title}"`)
        .join('\n')}`;
    } catch {
      // DataForSEO unavailable — continue without competitor data
    }
  }

  // Get internal linking candidates (recent content assets)
  const internalLinks = await prisma.contentAsset.findMany({
    where: { tenantId, status: 'deployed' },
    orderBy: { deployedAt: 'desc' },
    take: 10,
    select: { title: true, url: true },
  });

  const prompt = `Keyword: "${keyword}"
Current asset: ${asset ? `"${asset.title}" (${asset.url})` : 'Unknown'}
Position dropped by ${details.delta} positions.

${competitorContext}

Available internal links:
${internalLinks.map((l) => `- "${l.title}" (${l.url})`).join('\n')}`;

  const brief = await askClaudeJson<RefreshBrief>(SEO_REFRESH_BRIEF_PROMPT, prompt);

  // Store brief on the audit record
  await prisma.sEOAudit.update({
    where: { id: auditId },
    data: {
      briefJson: brief as any,
      status: 'brief_generated',
    },
  });

  return brief;
}

/**
 * Detect keyword cannibalization: multiple assets ranking for the same keyword.
 */
export async function detectCannibalization(
  tenantId: string
): Promise<CannibalizationResult[]> {
  // Find keywords with multiple tracked assets
  const keywords = await prisma.sEOKeywordTracker.groupBy({
    by: ['keyword'],
    where: {
      tenantId,
      assetId: { not: null },
      position: { not: null, lte: 30 }, // Only care about page 1-3
    },
    _count: { assetId: true },
    having: { assetId: { _count: { gt: 1 } } },
  });

  const results: CannibalizationResult[] = [];

  for (const kw of keywords) {
    const trackers = await prisma.sEOKeywordTracker.findMany({
      where: { tenantId, keyword: kw.keyword, assetId: { not: null } },
      include: { asset: { select: { id: true, url: true, title: true } } },
      orderBy: { position: 'asc' },
    });

    results.push({
      keyword: kw.keyword,
      assets: trackers.map((t) => ({
        assetId: t.assetId!,
        url: t.asset?.url ?? '',
        title: t.asset?.title ?? '',
        position: t.position ?? 0,
      })),
      recommendation: 'merge', // Default; Claude will refine
      details: `${trackers.length} assets competing for "${kw.keyword}"`,
    });
  }

  return results;
}

/**
 * Generate a cannibalization resolution recommendation via Claude.
 */
export async function resolveCannibalization(
  tenantId: string,
  auditId: string
): Promise<{ recommendation: string; details: string } | null> {
  const audit = await prisma.sEOAudit.findUniqueOrThrow({ where: { id: auditId } });
  const details = audit.details as {
    keyword?: string;
    assets?: { assetId: string; url: string; title: string; position: number }[];
  };

  if (!details.keyword || !details.assets) return null;

  const prompt = `Keyword: "${details.keyword}"
Competing assets:
${details.assets.map((a) => `- "${a.title}" (${a.url}) at position #${a.position}`).join('\n')}

Recommend: merge (301 redirect weaker → stronger), redirect, or differentiate (refocus weaker on different keyword).`;

  const result = await askClaudeJson<{ recommendation: string; details: string }>(
    CANNIBALIZATION_RESOLUTION_PROMPT,
    prompt
  );

  await prisma.sEOAudit.update({
    where: { id: auditId },
    data: {
      briefJson: result as any,
      status: 'brief_generated',
    },
  });

  return result;
}
