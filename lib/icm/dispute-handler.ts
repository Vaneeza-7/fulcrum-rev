import { prisma, auditLog } from '@/lib/db';
import {
  DisputeType,
  DisputeStatus,
  DisputeEvidence,
  DisputeResolution,
} from './types';

/**
 * Dispute Handler — automated resolution for ~80% of disputes.
 *
 * Dispute types:
 * 1. attribution_challenge — Client claims deal wasn't Fulcrum-sourced
 * 2. value_discrepancy — Client disagrees with deal value used for commission
 * 3. payment_status — Client claims payment wasn't received / was refunded
 * 4. split_credit — Client claims another source deserves partial credit
 *
 * Auto-resolution logic:
 * - If Fulcrum has timestamped evidence proving lead was discovered BEFORE
 *   any CRM activity → auto-resolve in Fulcrum's favor
 * - If value discrepancy is within tolerance → auto-resolve
 * - Otherwise → escalate to Joe via Slack
 */

/**
 * File a new dispute against a commission tracker.
 */
export async function fileDispute(
  trackerId: string,
  disputeType: DisputeType,
  clientReason: string
): Promise<string> {
  const tracker = await prisma.commissionTracker.findUniqueOrThrow({
    where: { id: trackerId },
    include: { tenant: true },
  });

  // Build evidence from attribution proof
  const attributionProof = tracker.attributionProof as Record<string, unknown> | null;
  const evidence: DisputeEvidence = {
    clientClaim: clientReason,
    fulcrumEvidence: {
      leadDiscoveredAt: attributionProof?.leadDiscoveredAt as string | undefined,
      fulcrumAlertAt: attributionProof?.fulcrumAlertAt as string | undefined,
      pushedToCrmAt: attributionProof?.leadPushedToCrmAt as string | undefined,
    },
    autoResolutionAttempted: false,
  };

  const dispute = await prisma.dispute.create({
    data: {
      tenantId: tracker.tenantId,
      trackerId,
      disputeType,
      clientReason,
      evidence: evidence as any,
      status: 'open',
    },
  });

  // Mark tracker as disputed
  await prisma.commissionTracker.update({
    where: { id: trackerId },
    data: { status: 'disputed' },
  });

  await auditLog(tracker.tenantId, 'icm_dispute_filed', dispute.id, {
    trackerId,
    disputeType,
    dealName: tracker.dealName,
  });

  // Attempt auto-resolution
  await attemptAutoResolution(dispute.id);

  return dispute.id;
}

/**
 * Attempt automatic resolution of a dispute.
 * Returns true if auto-resolved, false if escalated.
 */
export async function attemptAutoResolution(disputeId: string): Promise<boolean> {
  const dispute = await prisma.dispute.findUniqueOrThrow({
    where: { id: disputeId },
    include: { tracker: true },
  });

  if (dispute.status !== 'open') return false;

  const evidence = dispute.evidence as unknown as DisputeEvidence;
  evidence.autoResolutionAttempted = true;

  let resolved = false;

  switch (dispute.disputeType as DisputeType) {
    case 'attribution_challenge':
      resolved = await resolveAttributionChallenge(dispute, evidence);
      break;

    case 'value_discrepancy':
      resolved = await resolveValueDiscrepancy(dispute, evidence);
      break;

    case 'payment_status':
      // Payment status disputes always escalate — need ERP verification
      evidence.autoResolutionResult = 'escalated';
      evidence.autoResolutionReason = 'Payment status disputes require manual ERP verification';
      break;

    case 'split_credit':
      // Split credit disputes always escalate — need human judgment
      evidence.autoResolutionResult = 'escalated';
      evidence.autoResolutionReason = 'Split credit disputes require human judgment';
      break;
  }

  if (!resolved) {
    await prisma.dispute.update({
      where: { id: disputeId },
      data: {
        status: 'escalated' as DisputeStatus,
        evidence: evidence as any,
      },
    });

    await auditLog(dispute.tenantId, 'icm_dispute_escalated', disputeId, {
      disputeType: dispute.disputeType,
      reason: evidence.autoResolutionReason,
    });
  }

  return resolved;
}

/**
 * Manually resolve a dispute (Joe's action from Slack).
 */
export async function resolveDispute(
  disputeId: string,
  resolution: DisputeResolution
): Promise<void> {
  const dispute = await prisma.dispute.findUniqueOrThrow({
    where: { id: disputeId },
  });

  const newStatus: DisputeStatus = resolution.resolvedBy === 'client_withdrew'
    ? 'withdrawn'
    : resolution.adjustmentAmount
      ? 'resolved_for_client'
      : 'resolved_for_fulcrum';

  await prisma.dispute.update({
    where: { id: disputeId },
    data: {
      status: newStatus,
      resolution: resolution.resolution,
      resolvedBy: resolution.resolvedBy,
      resolvedAt: resolution.resolvedAt,
      adjustmentAmount: resolution.adjustmentAmount,
    },
  });

  // If resolved, un-dispute the tracker
  if (newStatus !== 'withdrawn') {
    await prisma.commissionTracker.update({
      where: { id: dispute.trackerId },
      data: { status: 'calculated' },
    });
  }

  await auditLog(dispute.tenantId, 'icm_dispute_resolved', disputeId, {
    resolution: resolution.resolution,
    resolvedBy: resolution.resolvedBy,
    adjustmentAmount: resolution.adjustmentAmount,
  });
}

/**
 * Get open disputes for a tenant.
 */
export async function getOpenDisputes(tenantId: string) {
  return prisma.dispute.findMany({
    where: {
      tenantId,
      status: { in: ['open', 'escalated'] },
    },
    include: { tracker: true },
    orderBy: { createdAt: 'desc' },
  });
}

// ============================================================================
// Auto-resolution strategies
// ============================================================================

/**
 * Auto-resolve attribution challenges.
 * If Fulcrum discovered the lead BEFORE any CRM activity, resolve in Fulcrum's favor.
 */
async function resolveAttributionChallenge(
  dispute: { id: string; tenantId: string; trackerId: string },
  evidence: DisputeEvidence
): Promise<boolean> {
  const fulcrumAlertAt = evidence.fulcrumEvidence.fulcrumAlertAt;
  const firstCrmActivity = evidence.fulcrumEvidence.pushedToCrmAt;

  if (!fulcrumAlertAt) {
    evidence.autoResolutionResult = 'escalated';
    evidence.autoResolutionReason = 'No Fulcrum alert timestamp found — cannot prove attribution';
    return false;
  }

  // If Fulcrum alerted before any CRM activity, attribution is proven
  if (firstCrmActivity && new Date(fulcrumAlertAt) < new Date(firstCrmActivity)) {
    evidence.autoResolutionResult = 'resolved';
    evidence.autoResolutionReason =
      `Fulcrum discovered lead at ${fulcrumAlertAt}, before CRM activity at ${firstCrmActivity}. Attribution proven.`;

    await prisma.dispute.update({
      where: { id: dispute.id },
      data: {
        status: 'auto_resolved' as DisputeStatus,
        resolution: evidence.autoResolutionReason,
        resolvedBy: 'auto',
        resolvedAt: new Date(),
        evidence: evidence as any,
      },
    });

    // Restore tracker status
    await prisma.commissionTracker.update({
      where: { id: dispute.trackerId },
      data: { status: 'calculated' },
    });

    await auditLog(dispute.tenantId, 'icm_dispute_auto_resolved', dispute.id, {
      reason: evidence.autoResolutionReason,
    });

    return true;
  }

  evidence.autoResolutionResult = 'escalated';
  evidence.autoResolutionReason = 'Timeline inconclusive — Fulcrum alert and CRM activity timing ambiguous';
  return false;
}

/**
 * Auto-resolve value discrepancies.
 * If the discrepancy is within 2% tolerance, resolve in Fulcrum's favor.
 */
async function resolveValueDiscrepancy(
  dispute: { id: string; tenantId: string; trackerId: string },
  evidence: DisputeEvidence
): Promise<boolean> {
  const tracker = await prisma.commissionTracker.findUniqueOrThrow({
    where: { id: dispute.trackerId },
  });

  // Check if there's a ledger entry to compare
  const ledger = await prisma.commissionLedger.findFirst({
    where: { trackerId: dispute.trackerId },
    orderBy: { createdAt: 'desc' },
  });

  if (!ledger) {
    evidence.autoResolutionResult = 'escalated';
    evidence.autoResolutionReason = 'No commission calculation found to verify discrepancy';
    return false;
  }

  const dealValue = Number(tracker.dealValue);
  const calculatedValue = Number(ledger.dealValue);
  const discrepancy = Math.abs(dealValue - calculatedValue) / dealValue;

  if (discrepancy <= 0.02) {
    evidence.autoResolutionResult = 'resolved';
    evidence.autoResolutionReason =
      `Value discrepancy (${(discrepancy * 100).toFixed(1)}%) within 2% tolerance. Commission stands.`;

    await prisma.dispute.update({
      where: { id: dispute.id },
      data: {
        status: 'auto_resolved' as DisputeStatus,
        resolution: evidence.autoResolutionReason,
        resolvedBy: 'auto',
        resolvedAt: new Date(),
        evidence: evidence as any,
      },
    });

    await prisma.commissionTracker.update({
      where: { id: dispute.trackerId },
      data: { status: 'calculated' },
    });

    await auditLog(dispute.tenantId, 'icm_dispute_auto_resolved', dispute.id, {
      reason: evidence.autoResolutionReason,
      discrepancy,
    });

    return true;
  }

  evidence.autoResolutionResult = 'escalated';
  evidence.autoResolutionReason = `Value discrepancy (${(discrepancy * 100).toFixed(1)}%) exceeds 2% tolerance`;
  return false;
}
