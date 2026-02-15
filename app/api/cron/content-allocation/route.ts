import { NextRequest, NextResponse } from 'next/server';
import { runContentAllocationAll, runContentAllocation } from '@/lib/jobs/content-allocation';
import { verifyCronAuth } from '@/lib/cron/verify-auth';
import { tenantIdParam } from '@/lib/validation/schemas';
import { routeLogger } from '@/lib/logger';

const log = routeLogger('/api/cron/content-allocation');

/**
 * POST /api/cron/content-allocation
 * Monthly content allocation for all tenants.
 * POST /api/cron/content-allocation?tenantId=xxx for a specific tenant.
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
      const result = await runContentAllocation(tenantId);
      return NextResponse.json({ success: true, result });
    }

    const { results, errors } = await runContentAllocationAll();
    return NextResponse.json({
      success: true,
      summary: {
        tenantsProcessed: results.length,
        errors: errors.length,
      },
      results,
      errors,
    });
  } catch (error) {
    log.error({ err: error }, 'Content allocation trigger failed');
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
