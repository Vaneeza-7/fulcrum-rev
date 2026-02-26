import { prisma, auditLog } from '@/lib/db';
import { CRMFactory } from '@/lib/crm/factory';
import { CRMAuthConfig } from '@/lib/crm/types';
import { processClosedWonDeals } from '@/lib/icm/commission-tracker';
import { runMatch2Invoice, runMatch3Payment, checkCancellationWindow } from '@/lib/icm/triple-match';
import { calculateCommission } from '@/lib/icm/commission-calculator';
import { checkAndLockExpiredAudit } from '@/lib/icm/initial-audit';
import { ReconciliationResult, ClosedWonDeal } from '@/lib/icm/types';
import { getSlackClient } from '@/lib/slack/client';
import { buildReconciliationSummaryBlocks, buildCommissionAlertBlocks } from '@/lib/slack/blocks';
import { jobLogger } from '@/lib/logger';

const _log = jobLogger('icm_reconciliation');

/**
 * ICM Reconciliation Job — runs daily for performance-based tenants.
 *
 * Schedule:
 * - 6 AM: Scan CRM for new closed-won deals (Match 1)
 * - 7 AM: Check ERP for invoices matching tracked deals (Match 2)
 * - 8 AM: Check ERP for payment confirmation (Match 3)
 * - After Match 3 + cancellation window: Calculate commissions
 *
 * All three stages are run sequentially in this single job for simplicity.
 * The cron schedule triggers this once per day; internally it processes all stages.
 */

/**
 * Run the full ICM reconciliation for a single tenant.
 */
export async function runICMReconciliation(tenantId: string): Promise<ReconciliationResult> {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
  });

  const result: ReconciliationResult = {
    tenantId,
    tenantName: tenant.name,
    newDealsFound: 0,
    invoicesMatched: 0,
    paymentsConfirmed: 0,
    commissionsCalculated: 0,
    clawbacksDetected: 0,
    errors: [],
    runAt: new Date(),
  };

  // Guard: only process performance-based tenants with locked audits
  if (tenant.businessModel !== 'performance_based') {
    return result;
  }

  if (tenant.auditStatus === 'appeal_window') {
    await checkAndLockExpiredAudit(tenantId);
    // Re-check after potential lock
    const updated = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    if (updated.auditStatus !== 'locked') {
      return result; // Still in appeal window
    }
  } else if (tenant.auditStatus !== 'locked') {
    return result; // Audit not complete
  }

  // ---- Stage 1: Scan CRM for new closed-won deals ----
  try {
    const crm = CRMFactory.create(tenant.crmType, tenant.crmConfig as CRMAuthConfig);
    await crm.authenticate();

    // Get deals closed in the last 7 days (overlap for safety)
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const closedWonDeals = await crm.getClosedWonDeals(since);

    const mapped: ClosedWonDeal[] = closedWonDeals.map((d) => ({
      crmDealId: d.id,
      dealName: d.name,
      dealValue: d.value,
      customerName: d.customerName,
      closedWonAt: d.closedWonAt,
      contactName: d.contactName,
      ownerName: d.ownerName,
    }));

    const trackResult = await processClosedWonDeals(tenantId, mapped);
    result.newDealsFound = trackResult.tracked;
  } catch (error) {
    result.errors.push(`CRM scan failed: ${error}`);
  }

  // ---- Stage 2: Check ERP for invoices (Match 2) ----
  try {
    const match2Trackers = await prisma.commissionTracker.findMany({
      where: { tenantId, status: 'match_1_complete', match2Invoice: false },
    });

    if (match2Trackers.length > 0 && tenant.erpType) {
      const { ERPFactory } = await import('@/lib/erp/factory');
      const erp = ERPFactory.create(tenant.erpType, tenant.erpConfig as Record<string, string>);
      await erp.authenticate();

      for (const tracker of match2Trackers) {
        try {
          const match = await runMatch2Invoice(tracker.id, erp);
          if (match.success) result.invoicesMatched++;
        } catch (error) {
          result.errors.push(`Invoice match failed for ${tracker.dealName}: ${error}`);
        }
      }
    }
  } catch (error) {
    result.errors.push(`ERP invoice scan failed: ${error}`);
  }

  // ---- Stage 3: Check ERP for payments (Match 3) ----
  try {
    const match3Trackers = await prisma.commissionTracker.findMany({
      where: { tenantId, status: 'match_2_complete', match3Payment: false },
    });

    if (match3Trackers.length > 0 && tenant.erpType) {
      const { ERPFactory } = await import('@/lib/erp/factory');
      const erp = ERPFactory.create(tenant.erpType, tenant.erpConfig as Record<string, string>);
      await erp.authenticate();

      for (const tracker of match3Trackers) {
        try {
          const match = await runMatch3Payment(tracker.id, erp);
          if (match.success) result.paymentsConfirmed++;
        } catch (error) {
          result.errors.push(`Payment match failed for ${tracker.dealName}: ${error}`);
        }
      }
    }
  } catch (error) {
    result.errors.push(`ERP payment scan failed: ${error}`);
  }

  // ---- Stage 4: Calculate commissions for fully-matched deals past cancellation window ----
  try {
    const readyTrackers = await prisma.commissionTracker.findMany({
      where: { tenantId, status: 'ready_for_calculation' },
    });

    for (const tracker of readyTrackers) {
      const windowPassed = await checkCancellationWindow(tracker.id);
      if (!windowPassed) continue;

      try {
        const commission = await calculateCommission(tracker.id);
        if (commission) result.commissionsCalculated++;
      } catch (error) {
        result.errors.push(`Commission calculation failed for ${tracker.dealName}: ${error}`);
      }
    }
  } catch (error) {
    result.errors.push(`Commission calculation scan failed: ${error}`);
  }

  // ---- Send Slack summary ----
  try {
    await sendReconciliationNotification(tenantId, result);
  } catch (error) {
    result.errors.push(`Slack notification failed: ${error}`);
  }

  await auditLog(tenantId, 'icm_reconciliation_complete', undefined, {
    newDealsFound: result.newDealsFound,
    invoicesMatched: result.invoicesMatched,
    paymentsConfirmed: result.paymentsConfirmed,
    commissionsCalculated: result.commissionsCalculated,
    errors: result.errors.length,
  });

  return result;
}

/**
 * Run ICM reconciliation for all performance-based tenants.
 */
export async function runICMReconciliationAll(): Promise<{
  results: ReconciliationResult[];
  errors: string[];
}> {
  const tenants = await prisma.tenant.findMany({
    where: {
      isActive: true,
      businessModel: 'performance_based',
    },
  });

  const results: ReconciliationResult[] = [];
  const errors: string[] = [];

  for (const tenant of tenants) {
    try {
      const result = await runICMReconciliation(tenant.id);
      results.push(result);
    } catch (error) {
      errors.push(`Reconciliation failed for ${tenant.name}: ${error}`);
    }
  }

  return { results, errors };
}

/**
 * Send Slack notification with reconciliation summary.
 */
async function sendReconciliationNotification(
  tenantId: string,
  result: ReconciliationResult
): Promise<void> {
  // Only notify if something happened
  if (
    result.newDealsFound === 0 &&
    result.invoicesMatched === 0 &&
    result.paymentsConfirmed === 0 &&
    result.commissionsCalculated === 0 &&
    result.errors.length === 0
  ) {
    return;
  }

  const slack = await getSlackClient(tenantId);
  if (!slack) return;

  // Get pending commission totals
  const pendingLedger = await prisma.commissionLedger.findMany({
    where: { tenantId, status: { in: ['pending', 'approved'] } },
  });
  const pendingTotal = pendingLedger.reduce((sum, e) => sum + Number(e.calculatedAmount), 0);

  const summary = {
    tenantName: result.tenantName,
    newDeals: result.newDealsFound,
    invoicesMatched: result.invoicesMatched,
    paymentsConfirmed: result.paymentsConfirmed,
    pendingCommissions: pendingLedger.length,
    pendingCommissionValue: pendingTotal,
    errors: result.errors,
  };

  await slack.client.chat.postMessage({
    channel: slack.channelId,
    text: `ICM Reconciliation: ${result.newDealsFound} new deals, ${result.commissionsCalculated} commissions calculated`,
    blocks: buildReconciliationSummaryBlocks(summary) as never[],
  });

  // Send individual commission alerts for newly calculated commissions
  if (result.commissionsCalculated > 0) {
    const recentLedger = await prisma.commissionLedger.findMany({
      where: { tenantId, status: 'pending' },
      include: { tracker: true },
      orderBy: { createdAt: 'desc' },
      take: result.commissionsCalculated,
    });

    for (const entry of recentLedger) {
      await slack.client.chat.postMessage({
        channel: slack.channelId,
        text: `New commission: ${entry.tracker.dealName} - $${Number(entry.calculatedAmount).toLocaleString()}`,
        blocks: buildCommissionAlertBlocks({
          type: 'new_commission',
          tenantName: result.tenantName,
          dealName: entry.tracker.dealName ?? 'Unknown',
          dealValue: Number(entry.tracker.dealValue),
          commissionAmount: Number(entry.calculatedAmount),
          details: `Tier: ${entry.tierName} | Rate: ${(Number(entry.commissionRate) * 100).toFixed(1)}% | Quarter: ${entry.quarterKey}`,
        }) as never[],
      });
    }
  }
}
