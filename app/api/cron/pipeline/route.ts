import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyCronAuth } from '@/lib/cron/verify-auth';
import { routeLogger } from '@/lib/logger';
import { runPipelineForTenant } from '@/lib/pipeline/orchestrator';

const log = routeLogger('/api/cron/pipeline');

export async function POST(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;

  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  log.info({ count: tenants.length }, 'Starting pipeline for all active tenants');

  const results: Array<{
    tenantId: string;
    tenantName: string;
    leadsProcessed: number;
    error?: string;
  }> = [];

  for (const tenant of tenants) {
    try {
      const result = await runPipelineForTenant(tenant.id);
      results.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        leadsProcessed: result.profiles_scored,
      });
    } catch (err) {
      log.error({ error: err, tenantId: tenant.id }, 'Pipeline failed for tenant');
      results.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        leadsProcessed: 0,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  const totalLeads = results.reduce((sum, r) => sum + r.leadsProcessed, 0);
  log.info({ totalLeads, tenantsProcessed: results.length }, 'Pipeline complete');

  return NextResponse.json({
    success: true,
    tenantsProcessed: results.length,
    totalLeads,
    results,
  });
}
