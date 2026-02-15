import cron from 'node-cron';
import { runDailyPipeline } from './daily-pipeline';
import { runDealDiagnostics } from './deal-diagnostics';
import { runICMReconciliationAll } from './icm-reconciliation';
import { sendWeeklyDigest } from '@/lib/huck/proactive';
import { runHealthChecks } from '@/lib/health/crm-health';
import { runSEOAuditAll } from './seo-audit';
import type { SEOHealthReport } from '@/lib/seo/types';
import { runContentAllocationAll } from './content-allocation';
import { runContentROIAll } from './content-roi';
import { runPersonaDeploymentAll } from './persona-deployment';
import { runCROAuditAll } from './cro-audit';
import { prisma } from '@/lib/db';
import { jobLogger } from '@/lib/logger';

const log = jobLogger('scheduler');

let isSchedulerRunning = false;
let isShuttingDown = false;
const activeJobs = new Set<Promise<void>>();

/**
 * Start the cron scheduler for background jobs.
 * Called once when the Next.js server starts.
 */
export function startScheduler(): void {
  if (isSchedulerRunning) return;
  isSchedulerRunning = true;

  // Helper: track a job so graceful shutdown can wait for it
  function trackJob(name: string, fn: () => Promise<void>) {
    if (isShuttingDown) {
      log.warn({ job: name }, 'Skipping job — shutdown in progress');
      return;
    }
    const jl = jobLogger(name);
    const start = Date.now();
    jl.info('Starting');
    const promise = fn()
      .then(() => jl.info({ durationMs: Date.now() - start }, 'Completed'))
      .catch((error) => jl.error({ err: error, durationMs: Date.now() - start }, 'Failed'))
      .finally(() => activeJobs.delete(promise));
    activeJobs.add(promise);
  }

  // 5 AM daily pipeline (UTC)
  cron.schedule('0 5 * * *', () => trackJob('daily_pipeline', async () => {
    const result = await runDailyPipeline();
    log.info({ tenants: result.tenants_processed, errors: result.errors.length }, 'Pipeline completed');
  }));

  // Deal diagnostics every 6 hours
  cron.schedule('0 */6 * * *', () => trackJob('deal_diagnostics', async () => {
    const tenants = await prisma.tenant.findMany({ where: { isActive: true } });
    for (const tenant of tenants) {
      try {
        await runDealDiagnostics(tenant.id);
      } catch (error) {
        jobLogger('deal_diagnostics', tenant.id).error({ err: error }, `Failed for ${tenant.name}`);
      }
    }
  }));

  // Weekly digest — Friday 9 AM UTC
  cron.schedule('0 9 * * 5', () => trackJob('weekly_digest', async () => {
    const tenants = await prisma.tenant.findMany({ where: { isActive: true } });
    for (const tenant of tenants) {
      try {
        await sendWeeklyDigest(tenant.id);
      } catch (error) {
        jobLogger('weekly_digest', tenant.id).error({ err: error }, `Failed for ${tenant.name}`);
      }
    }
  }));

  // Health checks every 12 hours
  cron.schedule('0 */12 * * *', () => trackJob('health_checks', async () => {
    const tenants = await prisma.tenant.findMany({ where: { isActive: true } });
    for (const tenant of tenants) {
      try {
        await runHealthChecks(tenant.id);
      } catch (error) {
        jobLogger('health_checks', tenant.id).error({ err: error }, `Failed for ${tenant.name}`);
      }
    }
  }));

  // ICM reconciliation — 6 AM daily (after pipeline)
  cron.schedule('0 6 * * *', () => trackJob('icm_reconciliation', async () => {
    const { results, errors } = await runICMReconciliationAll();
    log.info({
      tenants: results.length,
      newDeals: results.reduce((s, r) => s + r.newDealsFound, 0),
      commissions: results.reduce((s, r) => s + r.commissionsCalculated, 0),
      errors: errors.length,
    }, 'ICM reconciliation completed');
  }));

  // SEO audit — Monday 4 AM UTC (weekly)
  cron.schedule('0 4 * * 1', () => trackJob('seo_audit', async () => {
    const { results, errors } = await runSEOAuditAll();
    log.info({
      tenants: results.length,
      totalDrops: results.reduce((s: number, r: SEOHealthReport) => s + r.positionDrops, 0),
      errors: errors.length,
    }, 'SEO audit completed');
  }));

  // Content allocation — 1st of month, 5 AM UTC
  cron.schedule('0 5 1 * *', () => trackJob('content_allocation', async () => {
    const { results, errors } = await runContentAllocationAll();
    log.info({ tenants: results.length, errors: errors.length }, 'Content allocation completed');
  }));

  // Content ROI report — 2nd of month, 6 AM UTC
  cron.schedule('0 6 2 * *', () => trackJob('content_roi', async () => {
    const { results, errors } = await runContentROIAll();
    log.info({
      tenants: results.length,
      totalRevenue: results.reduce((s, r) => s + r.totalRevenue, 0),
      errors: errors.length,
    }, 'Content ROI completed');
  }));

  // Persona deployment check — daily 8 AM UTC
  cron.schedule('0 8 * * *', () => trackJob('persona_deployment', async () => {
    const { totalDeployed, errors } = await runPersonaDeploymentAll();
    log.info({
      totalDeployed,
      errors: errors.length,
    }, 'Persona deployment completed');
  }));

  // CRO audit — 1st and 15th, 3 AM UTC (bi-weekly)
  cron.schedule('0 3 1,15 * *', () => trackJob('cro_audit', async () => {
    const { results, errors } = await runCROAuditAll();
    log.info({ tenants: results.length, errors: errors.length }, 'CRO audit completed');
  }));

  log.info('Cron jobs registered: daily pipeline (5 AM), ICM reconciliation (6 AM), deal diagnostics (6h), weekly digest (Fri 9 AM), health checks (12h), SEO audit (Mon 4 AM), content allocation (1st 5 AM), content ROI (2nd 6 AM), persona deploy (daily 8 AM), CRO audit (1st/15th 3 AM)');
}

/**
 * Graceful shutdown — wait for active jobs to complete before exiting.
 * Register with process signal handlers.
 */
export async function shutdownScheduler(): Promise<void> {
  if (!isSchedulerRunning) return;

  isShuttingDown = true;
  log.info({ activeJobs: activeJobs.size }, 'Shutdown initiated, waiting for active jobs');

  // Wait for active jobs with a 30-second timeout
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 30_000));
  await Promise.race([
    Promise.allSettled(Array.from(activeJobs)),
    timeout,
  ]);

  if (activeJobs.size > 0) {
    log.warn({ remaining: activeJobs.size }, 'Shutdown timeout — some jobs may not have completed');
  } else {
    log.info('All jobs completed, shutting down cleanly');
  }

  isSchedulerRunning = false;

  // Disconnect Prisma
  await prisma.$disconnect();
}
