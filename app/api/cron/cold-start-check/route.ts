import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyCronAuth } from '@/lib/cron/verify-auth';
import { routeLogger } from '@/lib/logger';
import { CalibrationMonitor } from '@/lib/cold-start';

const log = routeLogger('/api/cron/cold-start-check');

export async function POST(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;

  // Get all tenants still in cold-start
  const activeStates = await prisma.tenantOnboardingState.findMany({
    where: { coldStartActive: true },
    select: { tenantId: true },
  });

  log.info({ count: activeStates.length }, 'Checking cold-start tenants');

  const results: Array<{
    tenantId: string;
    exited: boolean;
    reason?: string;
    significance: number;
  }> = [];

  for (const { tenantId } of activeStates) {
    try {
      const result = await CalibrationMonitor.checkAndMaybeExit(tenantId);
      results.push({
        tenantId,
        exited: result.exited,
        reason: result.reason,
        significance: result.currentSignificance,
      });
    } catch (err) {
      log.error({ error: err, tenantId }, 'Failed cold-start check for tenant');
      results.push({ tenantId, exited: false, significance: 0 });
    }
  }

  const exited = results.filter(r => r.exited).length;
  log.info({ totalChecked: results.length, exited }, 'Cold-start check complete');

  return NextResponse.json({
    success: true,
    totalChecked: results.length,
    exited,
    results,
  });
}
