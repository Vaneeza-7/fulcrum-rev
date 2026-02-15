import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { runDealDiagnostics } from '@/lib/jobs/deal-diagnostics';
import { verifyCronAuth } from '@/lib/cron/verify-auth';
import { routeLogger } from '@/lib/logger';

const log = routeLogger('/api/cron/diagnostics');

/**
 * POST /api/cron/diagnostics
 * Trigger deal diagnostics for all active tenants.
 * Protected by CRON_SECRET header.
 */
export async function POST(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  try {
    const tenants = await prisma.tenant.findMany({ where: { isActive: true } });
    const results = [];

    for (const tenant of tenants) {
      try {
        const result = await runDealDiagnostics(tenant.id);
        results.push({ tenant: tenant.name, ...result });
      } catch (error) {
        results.push({ tenant: tenant.name, error: String(error) });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    log.error({ err: error }, 'Diagnostics trigger failed');
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
