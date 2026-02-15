import { NextRequest, NextResponse } from 'next/server';
import { runContentROIAll, runContentROI } from '@/lib/jobs/content-roi';
import { verifyCronAuth } from '@/lib/cron/verify-auth';
import { tenantIdParam } from '@/lib/validation/schemas';
import { routeLogger } from '@/lib/logger';

const log = routeLogger('/api/cron/content-roi');

/**
 * POST /api/cron/content-roi
 * Monthly content ROI analysis for all tenants.
 * POST /api/cron/content-roi?tenantId=xxx for a specific tenant.
 * Protected by CRON_SECRET header.
 */
export async function POST(request: NextRequest) {
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
      const result = await runContentROI(tenantId);
      return NextResponse.json({ success: true, result });
    }

    const { results, errors } = await runContentROIAll();
    return NextResponse.json({
      success: true,
      summary: {
        tenantsProcessed: results.length,
        totalRevenue: results.reduce((s, r) => s + r.totalRevenue, 0),
        totalKilled: results.reduce((s, r) => s + r.killList.length, 0),
        errors: errors.length,
      },
      results,
      errors,
    });
  } catch (error) {
    log.error({ err: error }, 'Content ROI trigger failed');
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
