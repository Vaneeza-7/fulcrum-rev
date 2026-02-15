// ============================================================================
// Analytics Types — Google Analytics 4, Microsoft Clarity
// ============================================================================

/** Page-level metrics from Google Analytics 4. */
export interface GA4PageMetrics {
  pageUrl: string;
  sessions: number;
  bounceRate: number; // 0-1
  avgTimeOnPage: number; // seconds
  scrollDepth: number; // 0-1 average
  conversions: number;
  conversionRate: number; // 0-1
  newUsers: number;
  returningUsers: number;
}

/** Funnel step with drop-off analysis. */
export interface FunnelStep {
  stepName: string;
  pageUrl: string;
  sessions: number;
  dropOffRate: number; // 0-1
  dropOffCount: number;
}

/** Conversion event from GA4. */
export interface GA4ConversionEvent {
  eventName: string;
  count: number;
  value: number;
  topPages: { pageUrl: string; count: number }[];
}

/** Session behavior metrics from Microsoft Clarity. */
export interface ClaritySessionMetrics {
  pageUrl: string;
  totalSessions: number;
  rageClicks: number;
  deadClicks: number;
  quickBacks: number;
  excessiveScrolling: number;
  avgScrollDepth: number; // 0-100
}

/** Heatmap summary from Clarity. */
export interface ClarityHeatmapData {
  pageUrl: string;
  clickHeatmap: { element: string; clicks: number; percentage: number }[];
  scrollReach: { depth: number; percentage: number }[];
}

/** Form-level analytics from Clarity. */
export interface ClarityFormAnalytics {
  formSelector: string;
  pageUrl: string;
  totalInteractions: number;
  completionRate: number; // 0-1
  avgCompletionTime: number; // seconds
  fieldDropoffs: {
    fieldName: string;
    interacted: number;
    abandoned: number;
    abandonmentRate: number; // 0-1
    avgTimeSpent: number; // seconds
    errorRate: number; // 0-1
  }[];
}

/** Combined page performance from GA4 + Clarity. */
export interface PagePerformance {
  pageUrl: string;
  pageType: string; // 'homepage' | 'service' | 'pricing' | 'contact' | 'blog' | 'case_study'
  ga4: GA4PageMetrics;
  clarity?: ClaritySessionMetrics;
}

/** GA4 auth config stored in tenant.ga4Config. */
export interface GA4AuthConfig {
  accessToken?: string;
  refreshToken?: string;
  propertyId?: string; // e.g. '123456789'
}

/** Clarity config stored in tenant.clarityConfig. */
export interface ClarityAuthConfig {
  apiToken?: string;
  projectId?: string;
}
