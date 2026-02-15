// ============================================================================
// Content Engine Types — EVS scoring, profitability, saturation, ROI
// ============================================================================

/** Inputs for EVS (Economic Value Score) calculation. */
export interface EVSInput {
  // From ServiceProfile
  dealSize: number;
  closeRate: number; // 0-1
  ltv: number;
  cac: number;
  margin: number; // 0-1
  salesCycleDays: number;

  // From DataForSEO keyword data
  searchVolume: number;
  difficulty: number; // 0-100
  conversionRate: number; // 0-1 (historical or estimated)

  // Content cost
  contentCost: number; // estimated $ to produce
}

/** Result of EVS calculation. */
export interface EVSResult {
  evs: number; // 0-100 final score
  tier: 1 | 2 | 3 | 0; // 80+ = 1, 60-80 = 2, 40-60 = 3, <40 = 0 (deprioritize)
  revenuePerVisitor: number;
  estimatedMonthlyTraffic: number;
  estimatedMonthlyRevenue: number;
  roi18Month: number;
  adjustedROI: number;
  ltvCacRatio: number;
}

/** Service profitability score for content allocation. */
export interface ProfitabilityScore {
  serviceId: string;
  serviceName: string;
  score: number; // 0-100
  components: {
    marginComponent: number; // 40% weight
    ltvCacComponent: number; // 30% weight
    dealSizeComponent: number; // 20% weight
    speedComponent: number; // 10% weight
  };
  allocationPercentage: number; // calculated share of content slots
}

/** Market saturation signal. */
export interface SaturationSignal {
  type: 'engagement_decline' | 'traffic_plateau' | 'keyword_cannibalization' | 'ranking_efficiency';
  triggered: boolean;
  value: number;
  threshold: number;
  description: string;
}

/** Content allocation plan for a tenant. */
export interface ContentAllocation {
  totalSlots: number;
  allocations: {
    serviceId: string;
    serviceName: string;
    slots: number;
    percentage: number;
    profitabilityScore: number;
    saturationScore: number;
    adjustedSlots: number; // after saturation rebalancing
  }[];
  tier1Topics: { keyword: string; evs: number; serviceId: string }[];
  tier2Topics: { keyword: string; evs: number; serviceId: string }[];
  tier3Topics: { keyword: string; evs: number; serviceId: string }[];
  deprioritized: { keyword: string; evs: number; reason: string }[];
}

/** Individual asset performance metrics. */
export interface AssetPerformance {
  assetId: string;
  title: string;
  evs: number;
  monthlyVisits: number;
  pipelineContribution: number;
  attributedRevenue: number;
  costPerLead: number | null;
  revenuePerPiece: number; // attributedRevenue / 1 (single piece)
  category: 'revenue_champion' | 'pipeline_builder' | 'traffic_driver' | 'kill';
}

/** Monthly content ROI report. */
export interface MonthlyContentReport {
  tenantName: string;
  month: string;
  totalAssets: number;
  totalVisits: number;
  totalPipeline: number;
  totalRevenue: number;
  revenueChampions: AssetPerformance[];
  pipelineBuilders: AssetPerformance[];
  trafficDrivers: AssetPerformance[];
  killList: AssetPerformance[];
}

/** Persona snippet generation result from Claude. */
export interface PersonaSnippetResult {
  persona: 'cfo' | 'director' | 'end_user';
  hook: string;
  body: string;
  cta: string;
  trigger_words_used: string[];
}
