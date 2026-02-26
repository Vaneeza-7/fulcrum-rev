import { prisma, auditLog } from '@/lib/db';
import { ClawbackTrigger, ClawbackCalculation, ClawbackPolicy } from './types';

/**
 * Clawback Manager — handles deal reversals, refunds, and cancellations.
 *
 * Policy:
 * - 0-30 days after payment: Full clawback (100%)
 * - 31-90 days: Prorated clawback (linear decay from 100% to 0%)
 * - 91+ days: No clawback
 *
 * Clawbacks are offset against future commission payments.
 */

const DEFAULT_CLAWBACK_POLICY: ClawbackPolicy = {
  fullClawbackDays: 30,
  proratedClawbackDays: 90,
  noneAfterDays: 91,
};

/**
 * Detect potential clawbacks by checking for deal reversals in the CRM.
 * Called during reconciliation to check tracked deals.
 */
export async function detectClawback(
  trackerId: string,
  triggerType: ClawbackTrigger,
  triggerDate: Date
): Promise<ClawbackCalculation | null> {
  const tracker = await prisma.commissionTracker.findUniqueOrThrow({
    where: { id: trackerId },
    include: { tenant: true, ledger: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });

  // Only claw back calculated commissions
  if (!['calculated'].includes(tracker.status)) {
    return null;
  }

  const ledgerEntry = tracker.ledger[0];
  if (!ledgerEntry) return null;

  const originalAmount = Number(ledgerEntry.calculatedAmount);
  const paymentDate = tracker.match3At ?? tracker.closedWonAt;
  const daysSincePayment = Math.floor(
    (triggerDate.getTime() - paymentDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  const clawbackPolicy = loadClawbackPolicy(
    tracker.tenant.rsaConfig as Record<string, unknown> | null
  );

  const calculation = calculateClawbackAmount(
    originalAmount,
    daysSincePayment,
    clawbackPolicy
  );

  if (calculation.policyApplied === 'none') {
    await auditLog(tracker.tenantId, 'icm_clawback_skipped', trackerId, {
      triggerType,
      daysSincePayment,
      reason: 'outside_clawback_window',
    });
    return null;
  }

  // Create clawback record
  const quarterKey = getQuarterKey(new Date());
  await prisma.clawback.create({
    data: {
      tenantId: tracker.tenantId,
      trackerId,
      triggerType,
      triggerDate,
      originalAmount,
      clawbackAmount: calculation.clawbackAmount,
      clawbackRate: calculation.clawbackRate,
      daysSincePayment,
      policyApplied: calculation.policyApplied,
      offsetQuarterKey: quarterKey,
      status: 'pending',
    },
  });

  // Update tracker status
  await prisma.commissionTracker.update({
    where: { id: trackerId },
    data: { status: 'clawed_back' },
  });

  // Reverse the ledger entry
  await prisma.commissionLedger.update({
    where: { id: ledgerEntry.id },
    data: { status: 'reversed' },
  });

  await auditLog(tracker.tenantId, 'icm_clawback_created', trackerId, {
    triggerType,
    triggerDate: triggerDate.toISOString(),
    originalAmount,
    clawbackAmount: calculation.clawbackAmount,
    clawbackRate: calculation.clawbackRate,
    policyApplied: calculation.policyApplied,
    daysSincePayment,
  });

  return calculation;
}

/**
 * Apply pending clawbacks as offsets against future commission payments.
 */
export async function applyClawbackOffsets(tenantId: string): Promise<{
  offsetsApplied: number;
  totalOffset: number;
}> {
  const pendingClawbacks = await prisma.clawback.findMany({
    where: { tenantId, status: 'pending', offsetApplied: false },
  });

  let offsetsApplied = 0;
  let totalOffset = 0;

  for (const clawback of pendingClawbacks) {
    await prisma.clawback.update({
      where: { id: clawback.id },
      data: {
        offsetApplied: true,
        offsetAppliedAt: new Date(),
        status: 'offset',
      },
    });

    offsetsApplied++;
    totalOffset += Number(clawback.clawbackAmount);
  }

  if (offsetsApplied > 0) {
    await auditLog(tenantId, 'icm_clawback_offsets_applied', undefined, {
      offsetsApplied,
      totalOffset,
    });
  }

  return { offsetsApplied, totalOffset };
}

/**
 * Get clawback summary for a tenant.
 */
export async function getClawbackSummary(tenantId: string) {
  const clawbacks = await prisma.clawback.findMany({
    where: { tenantId },
    include: { tracker: true },
    orderBy: { createdAt: 'desc' },
  });

  const pending = clawbacks.filter((c) => c.status === 'pending');
  const applied = clawbacks.filter((c) => c.status === 'offset' || c.status === 'applied');

  return {
    total: clawbacks.length,
    pendingCount: pending.length,
    pendingAmount: pending.reduce((sum, c) => sum + Number(c.clawbackAmount), 0),
    appliedCount: applied.length,
    appliedAmount: applied.reduce((sum, c) => sum + Number(c.clawbackAmount), 0),
    clawbacks,
  };
}

// ============================================================================
// Internal helpers
// ============================================================================

function calculateClawbackAmount(
  originalAmount: number,
  daysSincePayment: number,
  policy: ClawbackPolicy
): ClawbackCalculation {
  const quarterKey = getQuarterKey(new Date());

  // Full clawback window
  if (daysSincePayment <= policy.fullClawbackDays) {
    return {
      originalAmount,
      clawbackAmount: originalAmount,
      clawbackRate: 1.0,
      daysSincePayment,
      policyApplied: 'full',
      offsetQuarterKey: quarterKey,
    };
  }

  // Prorated clawback window
  if (daysSincePayment <= policy.proratedClawbackDays) {
    const daysInProratedWindow = policy.proratedClawbackDays - policy.fullClawbackDays;
    const daysIntoProratedWindow = daysSincePayment - policy.fullClawbackDays;
    const clawbackRate = 1.0 - (daysIntoProratedWindow / daysInProratedWindow);
    const clawbackAmount = Math.round(originalAmount * clawbackRate * 100) / 100;

    return {
      originalAmount,
      clawbackAmount,
      clawbackRate: Math.round(clawbackRate * 10000) / 10000,
      daysSincePayment,
      policyApplied: 'prorated',
      offsetQuarterKey: quarterKey,
    };
  }

  // Outside clawback window
  return {
    originalAmount,
    clawbackAmount: 0,
    clawbackRate: 0,
    daysSincePayment,
    policyApplied: 'none',
    offsetQuarterKey: quarterKey,
  };
}

function loadClawbackPolicy(rsaConfig: Record<string, unknown> | null): ClawbackPolicy {
  if (!rsaConfig?.clawbackPolicy) return DEFAULT_CLAWBACK_POLICY;

  const policy = rsaConfig.clawbackPolicy as Record<string, number>;
  return {
    fullClawbackDays: policy.fullClawbackDays ?? DEFAULT_CLAWBACK_POLICY.fullClawbackDays,
    proratedClawbackDays: policy.proratedClawbackDays ?? DEFAULT_CLAWBACK_POLICY.proratedClawbackDays,
    noneAfterDays: policy.noneAfterDays ?? DEFAULT_CLAWBACK_POLICY.noneAfterDays,
  };
}

function getQuarterKey(date: Date): string {
  const quarter = Math.ceil((date.getMonth() + 1) / 3);
  return `${date.getFullYear()}-Q${quarter}`;
}
