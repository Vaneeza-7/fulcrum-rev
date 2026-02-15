import { prisma, auditLog } from '@/lib/db';
import { runPipelineForTenant } from '@/lib/pipeline/orchestrator';
import { sendDailySummary } from '@/lib/huck/proactive';
import { PipelineResult } from '@/lib/pipeline/types';
import { jobLogger } from '@/lib/logger';

const log = jobLogger('daily_pipeline');

/**
 * Run the full daily pipeline for all active tenants.
 * This is triggered by the 5 AM cron job.
 */
export async function runDailyPipeline(): Promise<{
  tenants_processed: number;
  results: PipelineResult[];
  errors: string[];
}> {
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
  });

  await auditLog(null, 'daily_pipeline_started', undefined, {
    tenant_count: tenants.length,
  });

  const results: PipelineResult[] = [];
  const errors: string[] = [];

  // Process tenants sequentially to manage API rate limits
  for (const tenant of tenants) {
    try {
      log.info({ tenantId: tenant.id, tenantName: tenant.name }, 'Starting pipeline for tenant');
      const result = await runPipelineForTenant(tenant.id);
      results.push(result);

      // Send Huck's proactive daily summary
      const topLeads = await prisma.lead.findMany({
        where: {
          tenantId: tenant.id,
          status: 'pending_review',
          discoveredAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        orderBy: { fulcrumScore: 'desc' },
        take: 5,
      });

      await sendDailySummary(
        tenant.id,
        tenant.name,
        result,
        topLeads.map((l) => ({
          fullName: l.fullName,
          company: l.company,
          fulcrumGrade: l.fulcrumGrade,
          fulcrumScore: Number(l.fulcrumScore),
        }))
      );

      log.info({ tenantName: tenant.name, newLeads: result.profiles_new }, 'Pipeline completed for tenant');
    } catch (error) {
      log.error({ err: error, tenantName: tenant.name }, 'Pipeline failed for tenant');
      errors.push(`Pipeline failed for tenant ${tenant.name}: ${error}`);
    }
  }

  await auditLog(null, 'daily_pipeline_completed', undefined, {
    tenants_processed: tenants.length,
    total_new_leads: results.reduce((sum, r) => sum + r.profiles_new, 0),
    errors: errors.length,
  });

  return {
    tenants_processed: tenants.length,
    results,
    errors,
  };
}
