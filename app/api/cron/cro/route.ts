import { NextRequest, NextResponse } from 'next/server';
import { runCROAuditAll, runCROAudit } from '@/lib/jobs/cro-audit';
import { verifyCronAuth } from '@/lib/cron/verify-auth';
import { tenantIdParam } from '@/lib/validation/schemas';
import { routeLogger } from '@/lib/logger';

const log = routeLogger('/api/cron/cro');

/**
 * CRO Audit cron endpoint.
 * Triggered bi-weekly (1st and 15th) by DigitalOcean cron or external scheduler.
 *
 * GET /api/cron/cro — Run CRO audit for all tenants
 * GET /api/cron/cro?tenantId=xxx — Run for a specific tenant
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const rawTenantId = request.nextUrl.searchParams.get('tenantId');
  const parsed = tenantIdParam.safeParse(rawTenantId ?? undefined);
  if (rawTenantId && !parsed.success) {
    return NextResponse.json({ error: 'Invalid tenantId format' }, { status: 400 });
  }
  const tenantId = parsed.data ?? null;

  try {
    if (tenantId) {
      const result = await runCROAudit(tenantId);
      return NextResponse.json({ success: true, result });
    }

    const { results, errors } = await runCROAuditAll();
    return NextResponse.json({
      success: true,
      summary: {
        tenantsAudited: results.length,
        totalCriticalIssues: results.reduce((s, r) => s + r.criticalIssues, 0),
        totalPipelineImpact: results.reduce((s, r) => s + r.totalEstimatedPipelineImpact, 0),
        totalABTests: results.reduce((s, r) => s + r.abTestsQueued, 0),
        errors: errors.length,
      },
      results,
      errors,
    });
  } catch (error) {
    log.error({ err: error }, 'CRO audit failed');
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
