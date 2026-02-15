import { prisma, auditLog } from '@/lib/db';
import { decryptTenantConfig } from '@/lib/db-crypto';
import { analyzeFunnel, detectCriticalLeakage } from '@/lib/cro/funnel-auditor';
import { analyzePage, runTrustSignalAudit } from '@/lib/cro/page-analyzer';
import { analyzeFormAbandonment } from '@/lib/cro/form-optimizer';
import { generateTestHypotheses } from '@/lib/cro/ab-test-queue';
import { getSlackClient } from '@/lib/slack/client';
import { buildCROReportBlocks } from '@/lib/slack/blocks';
import { CROReport } from '@/lib/cro/types';
import { GA4AuthConfig } from '@/lib/analytics/types';
import { jobLogger } from '@/lib/logger';

const log = jobLogger('cro_audit');

/**
 * Bi-weekly CRO Audit Job — runs 1st and 15th at 3 AM UTC.
 *
 * 1. Analyze conversion funnel → detect leakage
 * 2. Analyze each conversion page against benchmarks
 * 3. Run trust signal audit
 * 4. Analyze form abandonment
 * 5. Generate A/B test hypotheses from findings
 * 6. Send Slack report
 */

/** Default conversion pages to audit. */
const AUDIT_PAGES = [
  { url: '/', type: 'homepage' },
  { url: '/services', type: 'service' },
  { url: '/pricing', type: 'pricing' },
  { url: '/contact', type: 'contact' },
];

export async function runCROAudit(tenantId: string): Promise<CROReport | null> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const ga4Config = decryptTenantConfig<GA4AuthConfig>(tenant.ga4Config as any);

  if (!ga4Config?.accessToken || !ga4Config?.propertyId) {
    return null;
  }

  const report: CROReport = {
    tenantName: tenant.name,
    auditDate: new Date().toISOString().split('T')[0],
    pagesAudited: 0,
    criticalIssues: 0,
    warnings: 0,
    optimizations: 0,
    totalEstimatedPipelineImpact: 0,
    topIssues: [],
    abTestsQueued: 0,
  };

  // Step 1: Funnel analysis
  try {
    const leakages = await analyzeFunnel(tenantId);
    const criticalLeaks = detectCriticalLeakage(leakages);
    for (const leak of criticalLeaks) {
      report.topIssues.push({
        pageUrl: leak.pageUrl,
        pageType: leak.stepName,
        issue: `${Math.round(leak.dropOffRate * 100)}% drop-off at ${leak.stepName}`,
        estimatedImpact: leak.estimatedPipelineImpact,
      });
    }
  } catch (error) {
    log.error({ err: error, tenantId }, 'Funnel analysis failed');
  }

  // Step 2: Page-by-page analysis
  for (const page of AUDIT_PAGES) {
    try {
      const analysis = await analyzePage(tenantId, page.url, page.type);
      if (!analysis) continue;

      report.pagesAudited++;
      report.criticalIssues += analysis.critical.length;
      report.warnings += analysis.warnings.length;
      report.optimizations += analysis.optimizations.length;

      // Calculate estimated pipeline impact
      let pageImpact = 0;
      for (const issue of [...analysis.critical, ...analysis.warnings]) {
        for (const fix of issue.fixes) {
          pageImpact += fix.estimated_pipeline_impact;
        }
      }

      // Store CRO audit record
      const auditRecord = await prisma.cROAudit.create({
        data: {
          tenantId,
          pageUrl: page.url,
          pageType: page.type,
          metrics: {},
          benchmarks: {},
          issues: [...analysis.critical, ...analysis.warnings, ...analysis.optimizations] as any,
          recommendations: analysis.critical.flatMap((i) => i.fixes),
          estimatedPipelineImpact: pageImpact,
        },
      });

      report.totalEstimatedPipelineImpact += pageImpact;

      // Add top issues
      for (const issue of analysis.critical) {
        report.topIssues.push({
          pageUrl: page.url,
          pageType: page.type,
          issue: issue.issue,
          estimatedImpact: issue.fixes.reduce((sum, f) => sum + f.estimated_pipeline_impact, 0),
        });
      }

      // Generate A/B tests for pages with critical issues
      if (analysis.critical.length > 0) {
        try {
          const hypotheses = await generateTestHypotheses(tenantId, auditRecord.id);
          report.abTestsQueued += hypotheses.length;
        } catch (error) {
          log.error({ err: error, tenantId, pageUrl: page.url }, 'A/B test generation failed');
        }
      }
    } catch (error) {
      log.error({ err: error, tenantId, pageUrl: page.url }, 'Page analysis failed');
    }
  }

  // Step 3: Form abandonment analysis
  try {
    const formAnalysis = await analyzeFormAbandonment(tenantId, '/contact');
    if (formAnalysis && formAnalysis.highFrictionFields.length > 0) {
      report.topIssues.push({
        pageUrl: '/contact',
        pageType: 'contact',
        issue: `${Math.round(formAnalysis.totalAbandonment * 100)}% form abandonment (${formAnalysis.highFrictionFields.length} high-friction fields)`,
        estimatedImpact: formAnalysis.estimatedPipelineImpact,
      });
      report.totalEstimatedPipelineImpact += formAnalysis.estimatedPipelineImpact;
    }
  } catch (error) {
    log.error({ err: error, tenantId }, 'Form analysis failed');
  }

  // Step 4: Trust signal audit
  try {
    const trustSignals = await runTrustSignalAudit(tenantId);
    const missingSignals = trustSignals.filter((s) => !s.present);
    if (missingSignals.length > 5) {
      report.warnings++;
    }
  } catch (error) {
    log.error({ err: error, tenantId }, 'Trust signal audit failed');
  }

  // Sort top issues by impact
  report.topIssues.sort((a, b) => b.estimatedImpact - a.estimatedImpact);
  report.topIssues = report.topIssues.slice(0, 5);

  // Step 5: Slack notification
  try {
    const slack = await getSlackClient(tenantId);
    if (slack && (report.criticalIssues > 0 || report.warnings > 0)) {
      await slack.client.chat.postMessage({
        channel: slack.channelId,
        text: `CRO Audit: ${report.criticalIssues} critical issues, $${report.totalEstimatedPipelineImpact.toLocaleString()}/mo pipeline impact`,
        blocks: buildCROReportBlocks(report as any) as never[],
      });
    }
  } catch (error) {
    log.error({ err: error, tenantId }, 'Slack notification failed');
  }

  await auditLog(tenantId, 'cro_audit_complete', undefined, {
    pagesAudited: report.pagesAudited,
    criticalIssues: report.criticalIssues,
    warnings: report.warnings,
    pipelineImpact: report.totalEstimatedPipelineImpact,
    abTestsQueued: report.abTestsQueued,
  });

  return report;
}

/**
 * Run CRO audit for all active tenants.
 */
export async function runCROAuditAll(): Promise<{
  results: CROReport[];
  errors: string[];
}> {
  const tenants = await prisma.tenant.findMany({ where: { isActive: true } });
  const results: CROReport[] = [];
  const errors: string[] = [];

  for (const tenant of tenants) {
    try {
      const result = await runCROAudit(tenant.id);
      if (result) results.push(result);
    } catch (error) {
      errors.push(`CRO audit failed for ${tenant.name}: ${error}`);
    }
  }

  return { results, errors };
}
