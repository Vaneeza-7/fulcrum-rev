import { prisma, auditLog } from '@/lib/db';
import { ERPConnector } from '@/lib/erp/base-erp-connector';
import {
  TripleMatchResult,
  InvoiceMatch,
  PaymentMatch,
  TrackerStatus,
} from './types';

/**
 * Triple-Match Validation Engine.
 *
 * Match 1: CRM Closed-Won deal detected (already done by commission-tracker)
 * Match 2: ERP Invoice found matching the deal (customer + amount within tolerance)
 * Match 3: ERP Payment confirmed against the invoice
 *
 * After Match 3 + cancellation window, commission is ready for calculation.
 */

const DEFAULT_AMOUNT_TOLERANCE = 0.05; // 5% tolerance for amount matching

/**
 * Run Match 2: Find an ERP invoice for a tracked deal.
 */
export async function runMatch2Invoice(
  trackerId: string,
  erpConnector: ERPConnector,
  tolerance: number = DEFAULT_AMOUNT_TOLERANCE
): Promise<TripleMatchResult> {
  const tracker = await prisma.commissionTracker.findUniqueOrThrow({
    where: { id: trackerId },
  });

  if (tracker.match2Invoice) {
    return {
      stage: 'match_2_invoice',
      success: true,
      details: { alreadyMatched: true, erpInvoiceId: tracker.erpInvoiceId },
      matchedAt: tracker.match2At!,
    };
  }

  const customerName = tracker.customerName ?? tracker.dealName ?? '';
  const dealValue = Number(tracker.dealValue);

  const invoice = await erpConnector.findInvoiceForDeal(
    customerName,
    dealValue,
    tolerance
  );

  if (!invoice) {
    return {
      stage: 'match_2_invoice',
      success: false,
      details: { customerName, dealValue, tolerance, reason: 'no_invoice_found' },
      matchedAt: new Date(),
    };
  }

  const amountDelta = Math.abs(invoice.amount - dealValue);
  const withinTolerance = amountDelta <= dealValue * tolerance;

  const invoiceMatch: InvoiceMatch = {
    erpInvoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    invoiceAmount: invoice.amount,
    dealValue,
    amountDelta,
    tolerance,
    withinTolerance,
  };

  if (!withinTolerance) {
    return {
      stage: 'match_2_invoice',
      success: false,
      details: { ...invoiceMatch, reason: 'amount_outside_tolerance' },
      matchedAt: new Date(),
    };
  }

  // Update tracker with Match 2
  const now = new Date();
  await prisma.commissionTracker.update({
    where: { id: trackerId },
    data: {
      match2Invoice: true,
      match2At: now,
      erpInvoiceId: invoice.id,
      status: 'match_2_complete' as TrackerStatus,
    },
  });

  await auditLog(tracker.tenantId, 'icm_match_2_invoice', trackerId, {
    ...invoiceMatch,
  });

  return {
    stage: 'match_2_invoice',
    success: true,
    details: invoiceMatch as any,
    matchedAt: now,
  };
}

/**
 * Run Match 3: Confirm payment against a matched invoice.
 */
export async function runMatch3Payment(
  trackerId: string,
  erpConnector: ERPConnector
): Promise<TripleMatchResult> {
  const tracker = await prisma.commissionTracker.findUniqueOrThrow({
    where: { id: trackerId },
  });

  if (!tracker.match2Invoice || !tracker.erpInvoiceId) {
    return {
      stage: 'match_3_payment',
      success: false,
      details: { reason: 'match_2_not_complete' },
      matchedAt: new Date(),
    };
  }

  if (tracker.match3Payment) {
    return {
      stage: 'match_3_payment',
      success: true,
      details: { alreadyMatched: true, erpPaymentId: tracker.erpPaymentId },
      matchedAt: tracker.match3At!,
    };
  }

  const payment = await erpConnector.findPaymentForInvoice(tracker.erpInvoiceId);

  if (!payment) {
    return {
      stage: 'match_3_payment',
      success: false,
      details: { erpInvoiceId: tracker.erpInvoiceId, reason: 'no_payment_found' },
      matchedAt: new Date(),
    };
  }

  // Get invoice amount for comparison
  const invoice = await erpConnector.getInvoice(tracker.erpInvoiceId);
  const invoiceAmount = invoice?.amount ?? Number(tracker.dealValue);

  const paymentMatch: PaymentMatch = {
    erpPaymentId: payment.id,
    paymentAmount: payment.amount,
    paymentDate: payment.paymentDate,
    paymentMethod: payment.paymentMethod,
    invoiceAmount,
    fullyPaid: payment.amount >= invoiceAmount,
  };

  // Update tracker with Match 3
  const now = new Date();
  const rsaConfig = await getTenantRSAConfig(tracker.tenantId);
  const cancellationWindowDays = rsaConfig?.cancellationWindowDays ?? 30;
  const cancellationWindowEndsAt = new Date(now);
  cancellationWindowEndsAt.setDate(cancellationWindowEndsAt.getDate() + cancellationWindowDays);

  await prisma.commissionTracker.update({
    where: { id: trackerId },
    data: {
      match3Payment: true,
      match3At: now,
      erpPaymentId: payment.id,
      cancellationWindowEndsAt,
      status: 'ready_for_calculation' as TrackerStatus,
    },
  });

  await auditLog(tracker.tenantId, 'icm_match_3_payment', trackerId, {
    ...paymentMatch,
    cancellationWindowEndsAt: cancellationWindowEndsAt.toISOString(),
  });

  return {
    stage: 'match_3_payment',
    success: true,
    details: { ...paymentMatch, cancellationWindowEndsAt: cancellationWindowEndsAt.toISOString() },
    matchedAt: now,
  };
}

/**
 * Check if a tracker has passed its cancellation window and is ready for calculation.
 */
export async function checkCancellationWindow(trackerId: string): Promise<boolean> {
  const tracker = await prisma.commissionTracker.findUniqueOrThrow({
    where: { id: trackerId },
  });

  if (tracker.status !== 'ready_for_calculation') return false;
  if (!tracker.cancellationWindowEndsAt) return false;

  return new Date() >= tracker.cancellationWindowEndsAt;
}

/**
 * Get RSA (Revenue Sharing Agreement) terms for a tenant.
 */
async function getTenantRSAConfig(tenantId: string) {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { rsaConfig: true },
  });

  const config = tenant.rsaConfig as Record<string, unknown> | null;
  if (!config || Object.keys(config).length === 0) return null;

  return {
    cancellationWindowDays: (config.cancellationWindowDays as number) ?? 30,
    tiers: (config.tiers as unknown[]) ?? [],
    clawbackPolicy: config.clawbackPolicy as Record<string, number> | undefined,
    paymentSchedule: (config.paymentSchedule as string) ?? 'quarterly',
  };
}
