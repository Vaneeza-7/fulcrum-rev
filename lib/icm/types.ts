/**
 * ICM (Incentive Compensation Management) types.
 * Covers the full commission lifecycle: tracking → triple-match → calculation → disputes → clawbacks.
 */

// ============================================================================
// Commission Tracker
// ============================================================================

export type TrackerStatus =
  | 'tracking'
  | 'match_1_complete'
  | 'match_2_complete'
  | 'ready_for_calculation'
  | 'calculated'
  | 'disputed'
  | 'clawed_back'
  | 'ineligible';

export interface ClosedWonDeal {
  crmDealId: string;
  dealName: string;
  dealValue: number;
  customerName: string;
  closedWonAt: Date;
  contactName?: string;
  ownerName?: string;
}

export interface AttributionProof {
  fulcrumLeadId: string | null;
  fulcrumAlertAt: string | null;
  firstCrmActivityAt: string | null;
  leadDiscoveredAt: string | null;
  leadPushedToCrmAt: string | null;
  matchMethod: 'exact_crm_id' | 'company_fuzzy' | 'contact_name_fuzzy' | 'no_match';
  matchConfidence: number; // 0-1
  matchedLeadName?: string;
  matchedCompany?: string;
  contentAssetIds?: string[]; // Content assets that influenced this lead (PRE attribution loop)
}

// ============================================================================
// Triple-Match Validation
// ============================================================================

export type MatchStage = 'match_1_crm' | 'match_2_invoice' | 'match_3_payment';

export interface TripleMatchResult {
  stage: MatchStage;
  success: boolean;
  details: Record<string, unknown>;
  matchedAt: Date;
}

export interface InvoiceMatch {
  erpInvoiceId: string;
  invoiceNumber: string;
  invoiceAmount: number;
  dealValue: number;
  amountDelta: number;
  tolerance: number;
  withinTolerance: boolean;
}

export interface PaymentMatch {
  erpPaymentId: string;
  paymentAmount: number;
  paymentDate: string;
  paymentMethod: string;
  invoiceAmount: number;
  fullyPaid: boolean;
}

// ============================================================================
// Commission Calculation (ASC 606)
// ============================================================================

export interface RSATerms {
  tiers: CommissionTier[];
  cancellationWindowDays: number;
  clawbackPolicy: ClawbackPolicy;
  paymentSchedule: 'monthly' | 'quarterly';
  minimumDealValue?: number;
  excludedStages?: string[];
}

export interface CommissionTier {
  name: string;
  minDealValue: number;
  maxDealValue: number | null; // null = unlimited
  rate: number; // 0.10 = 10%
}

export interface ClawbackPolicy {
  fullClawbackDays: number;    // e.g. 0-30 days = full clawback
  proratedClawbackDays: number; // e.g. 31-90 days = prorated
  noneAfterDays: number;        // e.g. 91+ = no clawback
}

export interface CommissionCalculation {
  dealValue: number;
  tier: CommissionTier;
  commissionRate: number;
  calculatedAmount: number;
  quarterKey: string; // '2026-Q1'
  calculationProof: {
    formula: string;
    inputs: Record<string, number>;
    rsaVersion: string;
  };
  attributionProof: AttributionProof;
  rsaTermsSnapshot: RSATerms;
  integrityHash: string; // SHA-256 of calculation inputs
}

// ============================================================================
// Disputes
// ============================================================================

export type DisputeType =
  | 'attribution_challenge'
  | 'value_discrepancy'
  | 'payment_status'
  | 'split_credit';

export type DisputeStatus =
  | 'open'
  | 'auto_resolved'
  | 'escalated'
  | 'resolved_for_fulcrum'
  | 'resolved_for_client'
  | 'withdrawn';

export interface DisputeEvidence {
  clientClaim: string;
  fulcrumEvidence: {
    leadDiscoveredAt?: string;
    fulcrumAlertAt?: string;
    pushedToCrmAt?: string;
    crmActivityTimeline?: Array<{ date: string; action: string }>;
  };
  erpEvidence?: {
    invoiceId?: string;
    invoiceDate?: string;
    paymentDate?: string;
    amount?: number;
  };
  autoResolutionAttempted: boolean;
  autoResolutionResult?: 'resolved' | 'escalated';
  autoResolutionReason?: string;
}

export interface DisputeResolution {
  resolvedBy: 'auto' | 'joe' | 'client_withdrew';
  resolution: string;
  adjustmentAmount: number | null;
  resolvedAt: Date;
}

// ============================================================================
// Clawbacks
// ============================================================================

export type ClawbackTrigger =
  | 'cancellation'
  | 'refund'
  | 'churn'
  | 'deal_reversal'
  | 'invoice_void';

export interface ClawbackCalculation {
  originalAmount: number;
  clawbackAmount: number;
  clawbackRate: number; // 1.0 = full, 0.5 = half
  daysSincePayment: number;
  policyApplied: 'full' | 'prorated' | 'none';
  offsetQuarterKey: string;
}

// ============================================================================
// Initial Audit
// ============================================================================

export interface AuditBaseline {
  tenantId: string;
  totalDealsFound: number;
  totalValueExcluded: number;
  dealsExcluded: Array<{
    crmDealId: string;
    dealName: string;
    dealValue: number;
    customerName: string;
    source: 'crm_scan' | 'erp_scan';
  }>;
  auditStartedAt: Date;
  auditCompletedAt?: Date;
}

// ============================================================================
// Reconciliation Job
// ============================================================================

export interface ReconciliationResult {
  tenantId: string;
  tenantName: string;
  newDealsFound: number;
  invoicesMatched: number;
  paymentsConfirmed: number;
  commissionsCalculated: number;
  clawbacksDetected: number;
  errors: string[];
  runAt: Date;
}

// ============================================================================
// Slack Notification Types
// ============================================================================

export interface SlackCommissionAlert {
  type: 'new_commission' | 'payment_confirmed' | 'clawback_detected' | 'dispute_filed' | 'dispute_resolved';
  tenantName: string;
  dealName: string;
  dealValue: number;
  commissionAmount?: number;
  details: string;
}

export interface SlackReconciliationSummary {
  tenantName: string;
  newDeals: number;
  invoicesMatched: number;
  paymentsConfirmed: number;
  pendingCommissions: number;
  pendingCommissionValue: number;
  errors: string[];
}
