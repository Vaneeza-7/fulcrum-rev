// ============================================================================
// CRO Types — Conversion Rate Optimization intelligence
// ============================================================================

/** Page-type benchmark targets (from PRE prompt). */
export interface PageBenchmark {
  pageType: string;
  bounceRate: { target: number; alertThreshold: number };
  timeOnPage: { target: number; alertThreshold: number }; // seconds
  scrollDepth?: { target: number; alertThreshold: number }; // 0-1
  ctaClickRate?: { target: number; alertThreshold: number }; // 0-1
  conversionRate?: { target: number; alertThreshold: number }; // 0-1
  formSubmissionRate?: { target: number; alertThreshold: number }; // 0-1
}

/** Funnel leakage detection result. */
export interface FunnelLeakage {
  stepName: string;
  pageUrl: string;
  sessions: number;
  dropOffRate: number;
  estimatedPipelineImpact: number; // $ lost/month
  isCritical: boolean; // >50% drop-off
}

/** Form field abandonment analysis. */
export interface FormAnalysis {
  pageUrl: string;
  totalAbandonment: number; // 0-1
  highFrictionFields: {
    fieldName: string;
    abandonmentRate: number;
    recommendation: string;
  }[];
  estimatedPipelineImpact: number;
}

/** Trust signal audit result. */
export interface TrustSignalAudit {
  category: 'social_proof' | 'authority' | 'risk_reduction' | 'urgency';
  signal: string;
  present: boolean;
  recommendation?: string;
  estimatedConversionLift?: number; // percentage points
}

/** A/B test hypothesis generated from CRO findings. */
export interface ABTestHypothesis {
  pageUrl: string;
  hypothesis: string;
  controlDesc: string;
  variantDesc: string;
  expectedLift: number; // percentage
  expectedPipelineImpact: number;
  priority: 'low' | 'medium' | 'high';
  duration: string; // e.g. "2 weeks"
  minConversions: number;
}

/** CRO analysis result from Claude. */
export interface CROAnalysisResult {
  critical: CROIssue[];
  warnings: CROIssue[];
  optimizations: CROIssue[];
}

/** Individual CRO issue with fixes. */
export interface CROIssue {
  issue: string;
  root_cause: string;
  fixes: {
    fix: string;
    estimated_lift: number; // percentage
    estimated_pipeline_impact: number; // $/month
  }[];
}

/** Complete CRO report for Slack notification. */
export interface CROReport {
  tenantName: string;
  auditDate: string;
  pagesAudited: number;
  criticalIssues: number;
  warnings: number;
  optimizations: number;
  totalEstimatedPipelineImpact: number;
  topIssues: {
    pageUrl: string;
    pageType: string;
    issue: string;
    estimatedImpact: number;
  }[];
  abTestsQueued: number;
}

/**
 * Default page benchmarks from the PRE prompt.
 */
export const PAGE_BENCHMARKS: Record<string, PageBenchmark> = {
  homepage: {
    pageType: 'homepage',
    bounceRate: { target: 0.40, alertThreshold: 0.50 },
    timeOnPage: { target: 90, alertThreshold: 60 },
    scrollDepth: { target: 0.70, alertThreshold: 0.50 },
    ctaClickRate: { target: 0.08, alertThreshold: 0.05 },
  },
  service: {
    pageType: 'service',
    bounceRate: { target: 0.35, alertThreshold: 0.45 },
    timeOnPage: { target: 120, alertThreshold: 90 },
    scrollDepth: { target: 0.80, alertThreshold: 0.60 },
    ctaClickRate: { target: 0.12, alertThreshold: 0.08 },
  },
  pricing: {
    pageType: 'pricing',
    bounceRate: { target: 0.25, alertThreshold: 0.35 },
    timeOnPage: { target: 180, alertThreshold: 120 },
    formSubmissionRate: { target: 0.15, alertThreshold: 0.10 },
    conversionRate: { target: 0.40, alertThreshold: 0.25 },
  },
  contact: {
    pageType: 'contact',
    bounceRate: { target: 0.20, alertThreshold: 0.30 },
    timeOnPage: { target: 60, alertThreshold: 45 },
    formSubmissionRate: { target: 0.30, alertThreshold: 0.20 },
  },
  blog: {
    pageType: 'blog',
    bounceRate: { target: 0.50, alertThreshold: 0.65 },
    timeOnPage: { target: 180, alertThreshold: 120 },
    scrollDepth: { target: 0.60, alertThreshold: 0.40 },
  },
  case_study: {
    pageType: 'case_study',
    bounceRate: { target: 0.30, alertThreshold: 0.40 },
    timeOnPage: { target: 150, alertThreshold: 100 },
    ctaClickRate: { target: 0.10, alertThreshold: 0.06 },
  },
};
