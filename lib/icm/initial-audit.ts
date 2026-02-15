import { prisma, auditLog } from '@/lib/db';
import { CRMConnector } from '@/lib/crm/base-connector';
import { AuditBaseline, ClosedWonDeal } from './types';

/**
 * Initial Audit — establishes a baseline of pre-existing deals when ICM is first enabled.
 *
 * Purpose:
 * - Scan the CRM for all deals that closed BEFORE Fulcrum was active
 * - Mark these as "pre-existing" so they're excluded from commission calculations
 * - Provide a 14-day appeal window for clients to contest specific exclusions
 *
 * Flow:
 * 1. Tenant enables performance_based business model
 * 2. System scans CRM for all closed-won deals
 * 3. Deals closed before contractStartDate are marked pre-existing
 * 4. 14-day appeal window opens
 * 5. After appeal window, audit locks and ICM tracking begins
 */

const APPEAL_WINDOW_DAYS = 14;

/**
 * Run the initial audit for a tenant entering performance-based billing.
 * Scans CRM and marks all pre-existing deals.
 */
export async function runInitialAudit(
  tenantId: string,
  crmConnector: CRMConnector
): Promise<AuditBaseline> {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
  });

  if (tenant.auditStatus !== 'none') {
    throw new Error(`Audit already ${tenant.auditStatus} for tenant ${tenant.name}`);
  }

  // Mark audit as in progress
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { auditStatus: 'in_progress' },
  });

  const contractStart = tenant.contractStartDate ?? new Date();

  // Fetch all closed-won deals from CRM
  await crmConnector.authenticate();
  const allDeals = await crmConnector.getDeals({ stage: 'Closed Won' });

  const baseline: AuditBaseline = {
    tenantId,
    totalDealsFound: allDeals.length,
    totalValueExcluded: 0,
    dealsExcluded: [],
    auditStartedAt: new Date(),
  };

  for (const deal of allDeals) {
    // Use stage_change_date (when deal moved to Closed Won), falling back to last_activity_date
    const dealDate = deal.stage_change_date
      ? new Date(deal.stage_change_date)
      : deal.last_activity_date
        ? new Date(deal.last_activity_date)
        : new Date();

    if (dealDate < contractStart) {
      await prisma.preExistingDeal.upsert({
        where: { tenantId_crmDealId: { tenantId, crmDealId: deal.id } },
        create: {
          tenantId,
          crmDealId: deal.id,
          dealName: deal.name,
          dealValue: deal.value,
          customerName: deal.contact_name || deal.name,
          source: 'crm_scan',
          status: 'ineligible',
        },
        update: {},
      });

      baseline.dealsExcluded.push({
        crmDealId: deal.id,
        dealName: deal.name,
        dealValue: deal.value,
        customerName: deal.contact_name || deal.name,
        source: 'crm_scan',
      });
      baseline.totalValueExcluded += deal.value;
    }
  }

  // Move to appeal window
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { auditStatus: 'appeal_window' },
  });

  baseline.auditCompletedAt = new Date();

  await auditLog(tenantId, 'icm_initial_audit_complete', undefined, {
    totalDeals: baseline.totalDealsFound,
    dealsExcluded: baseline.dealsExcluded.length,
    totalValueExcluded: baseline.totalValueExcluded,
  });

  return baseline;
}

/**
 * File an appeal for a pre-existing deal that the client believes should be eligible.
 */
export async function appealPreExistingDeal(
  dealRecordId: string,
  reason: string
): Promise<void> {
  const deal = await prisma.preExistingDeal.findUniqueOrThrow({
    where: { id: dealRecordId },
    include: { tenant: true },
  });

  if (deal.tenant.auditStatus !== 'appeal_window') {
    throw new Error('Appeal window is not open');
  }

  if (deal.status !== 'ineligible') {
    throw new Error(`Deal already has status: ${deal.status}`);
  }

  await prisma.preExistingDeal.update({
    where: { id: dealRecordId },
    data: {
      status: 'appealed',
      appealReason: reason,
      appealedAt: new Date(),
    },
  });

  await auditLog(deal.tenantId, 'icm_deal_appealed', dealRecordId, {
    dealName: deal.dealName,
    reason,
  });
}

/**
 * Resolve an appeal (Joe's decision).
 */
export async function resolveAppeal(
  dealRecordId: string,
  approved: boolean,
  resolvedBy: string = 'joe'
): Promise<void> {
  const deal = await prisma.preExistingDeal.findUniqueOrThrow({
    where: { id: dealRecordId },
  });

  await prisma.preExistingDeal.update({
    where: { id: dealRecordId },
    data: {
      status: approved ? 'appeal_approved' : 'appeal_denied',
      appealResolvedAt: new Date(),
      appealResolvedBy: resolvedBy,
    },
  });

  await auditLog(deal.tenantId, 'icm_appeal_resolved', dealRecordId, {
    approved,
    resolvedBy,
  });
}

/**
 * Lock the audit after the appeal window has passed.
 * After locking, ICM tracking begins for new deals.
 */
export async function lockAudit(tenantId: string): Promise<void> {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
  });

  if (tenant.auditStatus !== 'appeal_window') {
    throw new Error(`Cannot lock audit — current status: ${tenant.auditStatus}`);
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      auditStatus: 'locked',
      auditLockedAt: new Date(),
    },
  });

  await auditLog(tenantId, 'icm_audit_locked', undefined, {
    lockedAt: new Date().toISOString(),
  });
}

/**
 * Check if the appeal window has expired and auto-lock if needed.
 */
export async function checkAndLockExpiredAudit(tenantId: string): Promise<boolean> {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
  });

  if (tenant.auditStatus !== 'appeal_window') return false;

  // Find when audit started
  const auditStartLog = await prisma.auditLog.findFirst({
    where: {
      tenantId,
      actionType: 'icm_initial_audit_complete',
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!auditStartLog) return false;

  const appealDeadline = new Date(auditStartLog.createdAt);
  appealDeadline.setDate(appealDeadline.getDate() + APPEAL_WINDOW_DAYS);

  if (new Date() >= appealDeadline) {
    await lockAudit(tenantId);
    return true;
  }

  return false;
}

/**
 * Get audit status summary for a tenant.
 */
export async function getAuditSummary(tenantId: string) {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { auditStatus: true, auditLockedAt: true, name: true },
  });

  const preExistingDeals = await prisma.preExistingDeal.findMany({
    where: { tenantId },
  });

  const appealed = preExistingDeals.filter((d) => d.status === 'appealed');
  const approved = preExistingDeals.filter((d) => d.status === 'appeal_approved');
  const denied = preExistingDeals.filter((d) => d.status === 'appeal_denied');

  return {
    tenantName: tenant.name,
    auditStatus: tenant.auditStatus,
    auditLockedAt: tenant.auditLockedAt,
    totalExcluded: preExistingDeals.length,
    totalValue: preExistingDeals.reduce((sum, d) => sum + Number(d.dealValue), 0),
    appealed: appealed.length,
    appealApproved: approved.length,
    appealDenied: denied.length,
    deals: preExistingDeals,
  };
}
