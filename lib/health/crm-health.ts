import { prisma } from '@/lib/db';
import { CRMFactory } from '@/lib/crm/factory';
import type { CRMAuthConfig } from '@/lib/crm/types';
import { flagStaleLeads, getDataHealthSummary } from './data-freshness';
import type { HealthCheckResult } from './types';

/**
 * Check CRM connectivity for a tenant.
 * Tests OAuth token validity by attempting authentication.
 */
async function checkCRMConnection(tenantId: string): Promise<HealthCheckResult> {
  try {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const crm = CRMFactory.create(tenant.crmType, tenant.crmConfig as CRMAuthConfig);
    await crm.authenticate();

    return {
      checkType: 'crm_connectivity',
      status: 'healthy',
      details: { crmType: tenant.crmType, message: 'Authentication successful' },
    };
  } catch (error) {
    return {
      checkType: 'crm_connectivity',
      status: 'critical',
      details: { error: String(error) },
    };
  }
}

/**
 * Check data freshness health for a tenant.
 */
async function checkDataFreshness(tenantId: string): Promise<HealthCheckResult> {
  const summary = await getDataHealthSummary(tenantId);
  await flagStaleLeads(tenantId);

  let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
  if (summary.criticalCount > 0) {
    status = 'critical';
  } else if (summary.staleCount > summary.totalLeads * 0.3) {
    status = 'degraded';
  }

  return {
    checkType: 'data_freshness',
    status,
    details: summary as unknown as Record<string, unknown>,
  };
}

/**
 * Check pipeline health — when did it last run successfully?
 */
async function checkPipelineHealth(tenantId: string): Promise<HealthCheckResult> {
  const lastRun = await prisma.auditLog.findFirst({
    where: { tenantId, actionType: 'pipeline_completed' },
    orderBy: { createdAt: 'desc' },
  });

  if (!lastRun) {
    return {
      checkType: 'pipeline_health',
      status: 'degraded',
      details: { message: 'Pipeline has never run for this tenant' },
    };
  }

  const hoursSinceRun = (Date.now() - lastRun.createdAt.getTime()) / 3600000;

  if (hoursSinceRun > 48) {
    return {
      checkType: 'pipeline_health',
      status: 'critical',
      details: { lastRun: lastRun.createdAt.toISOString(), hoursSinceRun: Math.round(hoursSinceRun) },
    };
  }

  if (hoursSinceRun > 26) {
    return {
      checkType: 'pipeline_health',
      status: 'degraded',
      details: { lastRun: lastRun.createdAt.toISOString(), hoursSinceRun: Math.round(hoursSinceRun) },
    };
  }

  return {
    checkType: 'pipeline_health',
    status: 'healthy',
    details: { lastRun: lastRun.createdAt.toISOString(), hoursSinceRun: Math.round(hoursSinceRun) },
  };
}

/**
 * Run all health checks for a tenant and store results.
 */
export async function runHealthChecks(tenantId: string): Promise<HealthCheckResult[]> {
  const checks = await Promise.all([
    checkCRMConnection(tenantId),
    checkDataFreshness(tenantId),
    checkPipelineHealth(tenantId),
  ]);

  // Store results
  for (const check of checks) {
    await prisma.systemHealthCheck.create({
      data: {
        tenantId,
        checkType: check.checkType,
        status: check.status,
        detailsJson: check.details as any,
      },
    });
  }

  return checks;
}
