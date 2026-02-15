import { NextRequest, NextResponse } from 'next/server';
import { runSEOAuditAll, runSEOAudit } from '@/lib/jobs/seo-audit';
import { verifyCronAuth } from '@/lib/cron/verify-auth';
import { tenantIdParam } from '@/lib/validation/schemas';
import { routeLogger } from '@/lib/logger';

const log = routeLogger('/api/cron/seo');

/**
 * SEO Audit cron endpoint.
 * Triggered weekly by DigitalOcean cron or external scheduler.
 *
 * GET /api/cron/seo — Run SEO audit for all tenants
 * GET /api/cron/seo?tenantId=xxx — Run for a specific tenant
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
      const result = await runSEOAudit(tenantId);
      return NextResponse.json({ success: true, result });
    }

    const { results, errors } = await runSEOAuditAll();
    return NextResponse.json({
      success: true,
      summary: {
        tenantsAudited: results.length,
        totalDrops: results.reduce((s, r) => s + r.positionDrops, 0),
        totalBriefs: results.reduce((s, r) => s + r.briefsGenerated, 0),
        totalCannibalization: results.reduce((s, r) => s + r.cannibalizationIssues.length, 0),
        errors: errors.length,
      },
      results,
      errors,
    });
  } catch (error) {
    log.error({ err: error }, 'SEO audit failed');
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
