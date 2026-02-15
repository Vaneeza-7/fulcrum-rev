import { createHash } from 'crypto';
import { prisma, auditLog } from '@/lib/db';
import {
  RSATerms,
  CommissionTier,
  CommissionCalculation,
  AttributionProof,
} from './types';

/**
 * ASC 606 Compliant Commission Calculator.
 *
 * - Immutable ledger entries (never edited, only appended)
 * - SHA-256 integrity hash for tamper detection
 * - RSA terms snapshotted at calculation time
 * - Tiered commission rates based on deal value
 */

const DEFAULT_RSA_TERMS: RSATerms = {
  tiers: [
    { name: 'standard', minDealValue: 0, maxDealValue: 50000, rate: 0.10 },
    { name: 'growth', minDealValue: 50000, maxDealValue: 150000, rate: 0.08 },
    { name: 'enterprise', minDealValue: 150000, maxDealValue: null, rate: 0.06 },
  ],
  cancellationWindowDays: 30,
  clawbackPolicy: {
    fullClawbackDays: 30,
    proratedClawbackDays: 90,
    noneAfterDays: 91,
  },
  paymentSchedule: 'quarterly',
};

/**
 * Calculate commission for a fully triple-matched deal.
 * Only processes deals where status = 'ready_for_calculation'
 * AND the cancellation window has passed.
 */
export async function calculateCommission(trackerId: string): Promise<CommissionCalculation | null> {
  const tracker = await prisma.commissionTracker.findUniqueOrThrow({
    where: { id: trackerId },
    include: { tenant: true },
  });

  // Guard: only calculate once
  if (tracker.status !== 'ready_for_calculation') {
    return null;
  }

  // Guard: cancellation window must have passed
  if (tracker.cancellationWindowEndsAt && new Date() < tracker.cancellationWindowEndsAt) {
    return null;
  }

  const rsaTerms = loadRSATerms(tracker.tenant.rsaConfig as Record<string, unknown> | null);
  const dealValue = Number(tracker.dealValue);

  // Find applicable tier
  const tier = findApplicableTier(dealValue, rsaTerms.tiers);
  const commissionAmount = dealValue * tier.rate;
  const quarterKey = getQuarterKey(tracker.closedWonAt);

  // Build calculation proof
  const calculationProof = {
    formula: `deal_value (${dealValue}) × rate (${tier.rate}) = ${commissionAmount}`,
    inputs: {
      dealValue,
      commissionRate: tier.rate,
      calculatedAmount: commissionAmount,
    },
    rsaVersion: `rsa_${tracker.tenantId}_${new Date().toISOString().slice(0, 10)}`,
  };

  const attributionProof = tracker.attributionProof as unknown as AttributionProof;

  // Generate integrity hash
  const integrityHash = generateIntegrityHash({
    trackerId: tracker.id,
    tenantId: tracker.tenantId,
    dealValue,
    commissionRate: tier.rate,
    calculatedAmount: commissionAmount,
    quarterKey,
    closedWonAt: tracker.closedWonAt.toISOString(),
  });

  // Create immutable ledger entry
  await prisma.commissionLedger.create({
    data: {
      tenantId: tracker.tenantId,
      trackerId: tracker.id,
      dealValue,
      commissionRate: tier.rate,
      tierName: tier.name,
      calculatedAmount: commissionAmount,
      calculationProof: calculationProof as any,
      attributionProof: (attributionProof ?? {}) as any,
      rsaTermsSnapshot: rsaTerms as any,
      integrityHash,
      quarterKey,
      status: 'pending',
    },
  });

  // Update tracker status
  await prisma.commissionTracker.update({
    where: { id: trackerId },
    data: { status: 'calculated' },
  });

  await auditLog(tracker.tenantId, 'icm_commission_calculated', trackerId, {
    dealValue,
    tier: tier.name,
    commissionRate: tier.rate,
    calculatedAmount: commissionAmount,
    quarterKey,
    integrityHash,
  });

  return {
    dealValue,
    tier,
    commissionRate: tier.rate,
    calculatedAmount: commissionAmount,
    quarterKey,
    calculationProof,
    attributionProof,
    rsaTermsSnapshot: rsaTerms,
    integrityHash,
  };
}

/**
 * Verify the integrity of a ledger entry (tamper detection).
 * Cross-references with the CommissionTracker to include closedWonAt in hash verification.
 */
export async function verifyLedgerIntegrity(ledgerEntryId: string): Promise<boolean> {
  const entry = await prisma.commissionLedger.findUniqueOrThrow({
    where: { id: ledgerEntryId },
    include: { tracker: true },
  });

  const expectedHash = generateIntegrityHash({
    trackerId: entry.trackerId,
    tenantId: entry.tenantId,
    dealValue: Number(entry.dealValue),
    commissionRate: Number(entry.commissionRate),
    calculatedAmount: Number(entry.calculatedAmount),
    quarterKey: entry.quarterKey,
    closedWonAt: entry.tracker.closedWonAt.toISOString(),
  });

  return entry.integrityHash === expectedHash;
}

/**
 * Get pending commissions for a tenant (not yet invoiced/paid).
 */
export async function getPendingCommissions(tenantId: string) {
  const entries = await prisma.commissionLedger.findMany({
    where: {
      tenantId,
      status: { in: ['pending', 'approved'] },
    },
    include: { tracker: true },
    orderBy: { createdAt: 'desc' },
  });

  const total = entries.reduce((sum, e) => sum + Number(e.calculatedAmount), 0);

  return {
    entries,
    totalPending: total,
    count: entries.length,
  };
}

/**
 * Get commission summary by quarter.
 */
export async function getQuarterlySummary(tenantId: string, quarterKey?: string) {
  const where: Record<string, unknown> = { tenantId };
  if (quarterKey) where.quarterKey = quarterKey;

  const entries = await prisma.commissionLedger.findMany({
    where,
    include: { tracker: true },
    orderBy: { createdAt: 'desc' },
  });

  const byQuarter: Record<string, { total: number; count: number; deals: string[] }> = {};

  for (const entry of entries) {
    if (!byQuarter[entry.quarterKey]) {
      byQuarter[entry.quarterKey] = { total: 0, count: 0, deals: [] };
    }
    byQuarter[entry.quarterKey].total += Number(entry.calculatedAmount);
    byQuarter[entry.quarterKey].count++;
    byQuarter[entry.quarterKey].deals.push(entry.tracker.dealName ?? entry.trackerId);
  }

  return byQuarter;
}

// ============================================================================
// Internal helpers
// ============================================================================

function loadRSATerms(rsaConfig: Record<string, unknown> | null): RSATerms {
  if (!rsaConfig || Object.keys(rsaConfig).length === 0) {
    return DEFAULT_RSA_TERMS;
  }

  return {
    tiers: (rsaConfig.tiers as CommissionTier[]) ?? DEFAULT_RSA_TERMS.tiers,
    cancellationWindowDays: (rsaConfig.cancellationWindowDays as number) ?? 30,
    clawbackPolicy: (rsaConfig.clawbackPolicy as RSATerms['clawbackPolicy']) ?? DEFAULT_RSA_TERMS.clawbackPolicy,
    paymentSchedule: (rsaConfig.paymentSchedule as 'monthly' | 'quarterly') ?? 'quarterly',
    minimumDealValue: rsaConfig.minimumDealValue as number | undefined,
    excludedStages: rsaConfig.excludedStages as string[] | undefined,
  };
}

function findApplicableTier(dealValue: number, tiers: CommissionTier[]): CommissionTier {
  // Sort tiers by minDealValue descending to find the highest applicable tier
  const sorted = [...tiers].sort((a, b) => b.minDealValue - a.minDealValue);

  for (const tier of sorted) {
    if (dealValue >= tier.minDealValue) {
      if (tier.maxDealValue === null || dealValue <= tier.maxDealValue) {
        return tier;
      }
    }
  }

  // Fallback to first tier
  return tiers[0] ?? DEFAULT_RSA_TERMS.tiers[0];
}

function getQuarterKey(date: Date): string {
  const quarter = Math.ceil((date.getMonth() + 1) / 3);
  return `${date.getFullYear()}-Q${quarter}`;
}

function generateIntegrityHash(inputs: Record<string, unknown>): string {
  const payload = JSON.stringify(inputs, Object.keys(inputs).sort());
  return createHash('sha256').update(payload).digest('hex');
}
