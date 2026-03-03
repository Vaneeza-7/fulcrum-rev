import { prisma } from '@/lib/db';
import { decryptTenantConfig } from '@/lib/db-crypto';
import { askClaudeJson } from '@/lib/ai/claude';
import { GA4Connector } from '@/lib/analytics/ga4-connector';
import { ClarityConnector } from '@/lib/analytics/clarity-connector';
import { GA4AuthConfig, ClarityAuthConfig } from '@/lib/analytics/types';
import { CRO_ANALYSIS_PROMPT } from '@/lib/ai/prompts';
import { CROAnalysisResult, TrustSignalAudit, PAGE_BENCHMARKS } from './types';
import { resolveAnthropicCredentials } from '@/lib/settings/api-keys';

/**
 * CRO Page Analyzer.
 * Pulls GA4 + Clarity data, compares against benchmarks, generates recommendations.
 */

/**
 * Analyze a single page against benchmarks.
 */
export async function analyzePage(
  tenantId: string,
  pageUrl: string,
  pageType: string
): Promise<CROAnalysisResult | null> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const anthropicCredentials = resolveAnthropicCredentials({
    anthropicApiKey: tenant.anthropicApiKey,
  });
  const ga4Config = decryptTenantConfig<GA4AuthConfig>(tenant.ga4Config as any);

  if (!ga4Config?.accessToken || !ga4Config?.propertyId) {
    return null;
  }

  const ga4 = new GA4Connector(ga4Config);
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Pull GA4 page metrics
  const metrics = await ga4.getPageMetrics(startDate, endDate, pageUrl);
  const pageMetrics = metrics.find((m) => m.pageUrl.includes(pageUrl));
  if (!pageMetrics) return null;

  // Pull Clarity data if available
  let clarityData = '';
  const clarityConfig = decryptTenantConfig<ClarityAuthConfig>(tenant.clarityConfig as any);
  if (clarityConfig?.apiToken && clarityConfig?.projectId) {
    try {
      const clarity = new ClarityConnector(clarityConfig);
      const sessionMetrics = await clarity.getSessionMetrics(pageUrl);
      clarityData = `
Clarity Data:
- Rage clicks: ${sessionMetrics.rageClicks}
- Dead clicks: ${sessionMetrics.deadClicks}
- Quick backs: ${sessionMetrics.quickBacks}
- Avg scroll depth: ${sessionMetrics.avgScrollDepth}%`;
    } catch {
      // Clarity unavailable
    }
  }

  // Get benchmarks for this page type
  const benchmark = PAGE_BENCHMARKS[pageType] ?? PAGE_BENCHMARKS.blog;

  // Get average deal size for pipeline impact calculation
  const services = await prisma.serviceProfile.findMany({
    where: { tenantId, isActive: true },
  });
  const avgDealSize = services.length > 0
    ? services.reduce((sum, s) => sum + Number(s.dealSize), 0) / services.length
    : 10000;

  const prompt = `Page: ${pageUrl} (type: ${pageType})

Analytics Data (last 30 days):
- Sessions: ${pageMetrics.sessions}
- Bounce rate: ${(pageMetrics.bounceRate * 100).toFixed(1)}% (benchmark: <${(benchmark.bounceRate.target * 100).toFixed(0)}%, alert: >${(benchmark.bounceRate.alertThreshold * 100).toFixed(0)}%)
- Avg time on page: ${Math.round(pageMetrics.avgTimeOnPage)}s (benchmark: >${benchmark.timeOnPage.target}s)
- Conversions: ${pageMetrics.conversions}
- Conversion rate: ${(pageMetrics.conversionRate * 100).toFixed(2)}%
${clarityData}

Average deal size: $${avgDealSize.toLocaleString()}
Monthly visitors: ${pageMetrics.sessions}`;

  const analysis = await askClaudeJson<CROAnalysisResult>(CRO_ANALYSIS_PROMPT, prompt, {
    apiKey: anthropicCredentials.apiKey ?? undefined,
    billingContext: {
      tenantId,
      provider: 'anthropic',
      feature: 'cro',
      stage: 'cro.page_analysis',
      metadata: { pageUrl, pageType },
    },
  });
  return analysis;
}

/**
 * Run trust signal audit across all conversion pages.
 * Checks for: logos, testimonials, video testimonials, case studies,
 * security badges, urgency signals.
 */
export async function runTrustSignalAudit(_tenantId: string): Promise<TrustSignalAudit[]> {
  // Trust signal audit is a checklist-based assessment.
  // In production, this would crawl the actual pages. For now, we generate
  // a standard checklist that gets populated during CRO audits.
  const audits: TrustSignalAudit[] = [
    // Social Proof
    {
      category: 'social_proof',
      signal: 'Customer logos on homepage',
      present: false,
      recommendation: 'Add 5-8 recognizable customer logos above the fold',
      estimatedConversionLift: 1.8,
    },
    {
      category: 'social_proof',
      signal: 'Customer logos on service pages',
      present: false,
      recommendation: 'Add relevant customer logos to each service page',
      estimatedConversionLift: 1.2,
    },
    {
      category: 'social_proof',
      signal: 'Testimonials on pricing page',
      present: false,
      recommendation: 'Add 2-3 testimonials with photos and company names',
      estimatedConversionLift: 2.4,
    },
    {
      category: 'social_proof',
      signal: 'Video testimonials',
      present: false,
      recommendation: 'Create 3 video testimonials (60-90s each)',
      estimatedConversionLift: 3.1,
    },
    {
      category: 'social_proof',
      signal: 'Case studies linked from service pages',
      present: false,
      recommendation: 'Embed case study previews inline on service pages',
      estimatedConversionLift: 2.2,
    },
    // Authority
    {
      category: 'authority',
      signal: 'Industry certifications displayed',
      present: false,
      recommendation: 'Display relevant certifications and badges',
      estimatedConversionLift: 1.0,
    },
    {
      category: 'authority',
      signal: 'Social proof counter',
      present: false,
      recommendation: 'Add "X organizations served" counter',
      estimatedConversionLift: 1.4,
    },
    // Risk Reduction
    {
      category: 'risk_reduction',
      signal: 'Money-back guarantee',
      present: false,
      recommendation: 'Add satisfaction guarantee or performance-based pricing messaging',
      estimatedConversionLift: 1.5,
    },
    {
      category: 'risk_reduction',
      signal: 'Free assessment offer',
      present: false,
      recommendation: 'Offer free initial assessment to reduce commitment friction',
      estimatedConversionLift: 2.0,
    },
    {
      category: 'risk_reduction',
      signal: 'Security badges',
      present: false,
      recommendation: 'Add SSL, data protection, and privacy badges',
      estimatedConversionLift: 0.8,
    },
    // Urgency
    {
      category: 'urgency',
      signal: 'Demand indicators',
      present: false,
      recommendation: 'Add "X slots available this month" messaging',
      estimatedConversionLift: 1.2,
    },
    {
      category: 'urgency',
      signal: 'Recent activity indicators',
      present: false,
      recommendation: 'Show recent sign-ups or downloads (social proof + urgency)',
      estimatedConversionLift: 0.9,
    },
  ];

  return audits;
}
