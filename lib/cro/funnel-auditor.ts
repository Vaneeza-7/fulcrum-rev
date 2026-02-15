import { prisma } from '@/lib/db';
import { decryptTenantConfig } from '@/lib/db-crypto';
import { GA4Connector } from '@/lib/analytics/ga4-connector';
import { GA4AuthConfig } from '@/lib/analytics/types';
import { FunnelLeakage } from './types';

/**
 * Funnel Auditor — detects conversion funnel leakage.
 * Tracks drop-off at each stage: homepage → service → pricing → contact → conversion.
 */

/** Default funnel steps (configurable per tenant). */
const DEFAULT_FUNNEL_STEPS = [
  { stepName: 'Homepage', pageUrl: '/' },
  { stepName: 'Service Page', pageUrl: '/services' },
  { stepName: 'Pricing Page', pageUrl: '/pricing' },
  { stepName: 'Contact Form', pageUrl: '/contact' },
];

/**
 * Analyze the conversion funnel for a tenant.
 * Pulls GA4 data and calculates drop-off rates.
 */
export async function analyzeFunnel(tenantId: string): Promise<FunnelLeakage[]> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const ga4Config = decryptTenantConfig<GA4AuthConfig>(tenant.ga4Config as any);
  if (!ga4Config?.accessToken || !ga4Config?.propertyId) {
    return [];
  }

  const ga4 = new GA4Connector(ga4Config);

  // Last 30 days
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const funnelData = await ga4.getFunnelReport(DEFAULT_FUNNEL_STEPS, startDate, endDate);

  // Get average deal size for pipeline impact estimation
  const services = await prisma.serviceProfile.findMany({
    where: { tenantId, isActive: true },
  });
  const avgDealSize = services.length > 0
    ? services.reduce((sum, s) => sum + Number(s.dealSize), 0) / services.length
    : 10000; // default

  const avgCloseRate = services.length > 0
    ? services.reduce((sum, s) => sum + Number(s.closeRate), 0) / services.length
    : 0.05;

  const leakages: FunnelLeakage[] = funnelData.map((step) => {
    // Pipeline impact = lost visitors × conversion rate × deal size
    const estimatedPipelineImpact = step.dropOffCount * avgCloseRate * avgDealSize;

    return {
      stepName: step.stepName,
      pageUrl: step.pageUrl,
      sessions: step.sessions,
      dropOffRate: step.dropOffRate,
      estimatedPipelineImpact: Math.round(estimatedPipelineImpact),
      isCritical: step.dropOffRate > 0.5,
    };
  });

  return leakages;
}

/**
 * Detect critical leakage points (>50% drop-off).
 */
export function detectCriticalLeakage(leakages: FunnelLeakage[]): FunnelLeakage[] {
  return leakages.filter((l) => l.isCritical);
}

/**
 * Estimate total pipeline impact from all funnel leakage.
 */
export function estimateTotalPipelineImpact(leakages: FunnelLeakage[]): number {
  return leakages.reduce((sum, l) => sum + l.estimatedPipelineImpact, 0);
}
