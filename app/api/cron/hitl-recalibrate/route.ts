import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron/verify-auth';
import { prisma } from '@/lib/db';
import { jobLogger } from '@/lib/logger';
import { SignalWeightService } from '@/lib/scoring/signal-weight-service';

const log = jobLogger('hitl-recalibrate');

export async function POST(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const startedAt = Date.now();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h ago

  // Find tenants with overdue unapplied signals (>24h old — SLA breach)
  const overdueSignals = await prisma.negativeSignal.findMany({
    where: {
      appliedToModel: false,
      createdAt: { lte: cutoff },
    },
    select: { tenantId: true },
    distinct: ['tenantId'],
  });

  const results: Array<{
    tenantId: string;
    signalsProcessed: number;
    weightsAdjusted: number;
  }> = [];

  for (const { tenantId } of overdueSignals) {
    try {
      const result = await SignalWeightService.recalibrateFromNegativeSignals(tenantId);
      results.push({ tenantId, ...result });
      log.info(
        { tenantId, signalsProcessed: result.signalsProcessed, weightsAdjusted: result.weightsAdjusted },
        'Overdue recalibration completed',
      );
    } catch (err) {
      log.error({ error: err, tenantId }, 'Recalibration failed');
      results.push({ tenantId, signalsProcessed: 0, weightsAdjusted: 0 });
    }
  }

  // Also process any tenant with unapplied signals (even if <24h, run opportunistically)
  const allUnapplied = await prisma.negativeSignal.findMany({
    where: { appliedToModel: false },
    select: { tenantId: true },
    distinct: ['tenantId'],
  });

  const alreadyProcessed = new Set(results.map(r => r.tenantId));

  for (const { tenantId } of allUnapplied) {
    if (alreadyProcessed.has(tenantId)) continue;
    try {
      const result = await SignalWeightService.recalibrateFromNegativeSignals(tenantId);
      results.push({ tenantId, ...result });
    } catch (err) {
      log.error({ error: err, tenantId }, 'Recalibration failed');
    }
  }

  const durationMs = Date.now() - startedAt;
  log.info({ tenantsProcessed: results.length, durationMs }, 'HITL recalibration cron completed');

  return NextResponse.json({
    success: true,
    tenantsProcessed: results.length,
    durationMs,
    results,
  });
}
