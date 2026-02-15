// ============================================================================
// SEO Types — Google Search Console, DataForSEO, position tracking
// ============================================================================

/** Raw keyword performance data from Google Search Console. */
export interface GSCKeywordData {
  query: string;
  page: string;
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
  date: string; // ISO date
}

/** Keyword economics from DataForSEO. */
export interface DataForSEOKeywordResult {
  keyword: string;
  searchVolume: number;
  difficulty: number; // 0-100
  cpc: number;
  competition: number; // 0-1
  monthlySearches: { month: string; volume: number }[];
}

/** SERP competitor result from DataForSEO. */
export interface DataForSEOSERPResult {
  keyword: string;
  results: {
    position: number;
    url: string;
    domain: string;
    title: string;
    description: string;
  }[];
}

/** Position snapshot for week-over-week comparison. */
export interface PositionSnapshot {
  keyword: string;
  assetId?: string;
  currentPosition: number | null;
  previousPosition: number | null;
  delta: number | null; // positive = dropped
  impressions: number;
  clicks: number;
  ctr: number;
}

/** Position drop with severity classification. */
export interface PositionDrop {
  keyword: string;
  assetId?: string;
  assetUrl?: string;
  fromPosition: number;
  toPosition: number;
  delta: number;
  severity: 'medium' | 'high' | 'critical';
}

/** Auto-generated refresh brief from Claude. */
export interface RefreshBrief {
  data_updates: { old: string; new: string; source: string }[];
  content_gaps: string[];
  technical_fixes: { issue: string; fix: string }[];
  internal_links_to_add: { anchor: string; targetUrl: string }[];
  meta_title: string;
  meta_description: string;
  faq_items: { question: string; answer: string }[];
  estimated_recovery_days: number;
  priority: 'medium' | 'high' | 'critical';
}

/** Cannibalization detection result. */
export interface CannibalizationResult {
  keyword: string;
  assets: {
    assetId: string;
    url: string;
    title: string;
    position: number;
  }[];
  recommendation: 'merge' | 'redirect' | 'differentiate';
  details: string;
}

/** Weekly SEO health report for Slack notifications. */
export interface SEOHealthReport {
  tenantName: string;
  totalKeywordsTracked: number;
  positionImprovements: number;
  positionDrops: number;
  criticalDrops: PositionDrop[];
  cannibalizationIssues: CannibalizationResult[];
  briefsGenerated: number;
  reindexSubmitted: number;
}

/** GSC auth configuration stored in tenant.gscConfig. */
export interface GSCAuthConfig {
  accessToken?: string;
  refreshToken?: string;
  siteUrl?: string; // e.g. 'https://example.com'
}

/** DataForSEO auth configuration stored in tenant.dataforseoConfig. */
export interface DataForSEOAuthConfig {
  login?: string;
  password?: string;
}
