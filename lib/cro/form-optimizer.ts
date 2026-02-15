import { prisma } from '@/lib/db';
import { decryptTenantConfig } from '@/lib/db-crypto';
import { ClarityConnector } from '@/lib/analytics/clarity-connector';
import { ClarityAuthConfig } from '@/lib/analytics/types';
import { FormAnalysis } from './types';

/**
 * Form Optimizer — analyzes form abandonment and recommends fixes.
 * Uses Clarity field-level data to identify high-friction fields.
 */

/** Field-level abandonment thresholds. */
const HIGH_FRICTION_THRESHOLD = 0.15; // 15% abandonment on a field = high friction

/**
 * Analyze form abandonment for a specific page.
 */
export async function analyzeFormAbandonment(
  tenantId: string,
  pageUrl: string,
  formSelector = 'form'
): Promise<FormAnalysis | null> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const clarityConfig = decryptTenantConfig<ClarityAuthConfig>(tenant.clarityConfig as any);

  if (!clarityConfig?.apiToken || !clarityConfig?.projectId) {
    return null;
  }

  const clarity = new ClarityConnector(clarityConfig);
  const formData = await clarity.getFormAnalytics(formSelector, pageUrl);

  if (formData.totalInteractions === 0) {
    return null;
  }

  const highFrictionFields = formData.fieldDropoffs
    .filter((f) => f.abandonmentRate > HIGH_FRICTION_THRESHOLD)
    .map((f) => ({
      fieldName: f.fieldName,
      abandonmentRate: f.abandonmentRate,
      recommendation: generateFieldRecommendation(f.fieldName, f.abandonmentRate),
    }));

  // Estimate pipeline impact
  const services = await prisma.serviceProfile.findMany({
    where: { tenantId, isActive: true },
  });
  const avgDealSize = services.length > 0
    ? services.reduce((sum, s) => sum + Number(s.dealSize), 0) / services.length
    : 10000;
  const avgCloseRate = services.length > 0
    ? services.reduce((sum, s) => sum + Number(s.closeRate), 0) / services.length
    : 0.05;

  // Lost conversions = total interactions × abandonment rate × close rate × deal size
  const totalAbandonment = 1 - formData.completionRate;
  const estimatedPipelineImpact = Math.round(
    formData.totalInteractions * totalAbandonment * avgCloseRate * avgDealSize
  );

  return {
    pageUrl,
    totalAbandonment,
    highFrictionFields,
    estimatedPipelineImpact,
  };
}

/**
 * Generate a recommendation for a high-friction field.
 */
function generateFieldRecommendation(fieldName: string, abandonmentRate: number): string {
  const lower = fieldName.toLowerCase();

  if (lower.includes('phone') || lower.includes('tel')) {
    return `Make phone field optional (${Math.round(abandonmentRate * 100)}% abandonment). Most users prefer email contact.`;
  }
  if (lower.includes('budget') || lower.includes('revenue') || lower.includes('spend')) {
    return `Replace with range selector or make optional (${Math.round(abandonmentRate * 100)}% abandonment). Users resist sharing budget info early.`;
  }
  if (lower.includes('message') || lower.includes('needs') || lower.includes('description') || lower.includes('tell')) {
    return `Replace open text with radio buttons / checkboxes (${Math.round(abandonmentRate * 100)}% abandonment). "What's your primary challenge?" with 4-5 options.`;
  }
  if (lower.includes('company') || lower.includes('organization')) {
    return `Consider auto-detecting from email domain (${Math.round(abandonmentRate * 100)}% abandonment).`;
  }

  return `Consider removing or simplifying this field (${Math.round(abandonmentRate * 100)}% abandonment rate exceeds ${Math.round(HIGH_FRICTION_THRESHOLD * 100)}% threshold).`;
}
