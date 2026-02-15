import { NextRequest, NextResponse } from 'next/server';
import { runICMReconciliationAll, runICMReconciliation } from '@/lib/jobs/icm-reconciliation';
import { verifyCronAuth } from '@/lib/cron/verify-auth';
import { tenantIdParam } from '@/lib/validation/schemas';
import { routeLogger } from '@/lib/logger';

const log = routeLogger('/api/cron/icm');

/**
 * ICM Reconciliation cron endpoint.
 * Triggered daily by DigitalOcean cron or external scheduler.
 *
 * GET /api/cron/icm — Run reconciliation for all performance-based tenants
 * GET /api/cron/icm?tenantId=xxx — Run for a specific tenant
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
      const result = await runICMReconciliation(tenantId);
      return NextResponse.json({ success: true, result });
    }

    const { results, errors } = await runICMReconciliationAll();
    return NextResponse.json({
      success: true,
      summary: {
        tenantsProcessed: results.length,
        totalNewDeals: results.reduce((s, r) => s + r.newDealsFound, 0),
        totalInvoicesMatched: results.reduce((s, r) => s + r.invoicesMatched, 0),
        totalPaymentsConfirmed: results.reduce((s, r) => s + r.paymentsConfirmed, 0),
        totalCommissionsCalculated: results.reduce((s, r) => s + r.commissionsCalculated, 0),
        errors: errors.length,
      },
      results,
      errors,
    });
  } catch (error) {
    log.error({ err: error }, 'ICM reconciliation failed');
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
