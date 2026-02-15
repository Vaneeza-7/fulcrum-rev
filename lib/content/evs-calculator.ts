import { EVSInput, EVSResult, ProfitabilityScore } from './types';

/**
 * Economic Value Score (EVS) Calculator.
 * Every content decision is an investment decision — EVS quantifies expected ROI.
 *
 * Formula (from PRE prompt):
 * 1. revenue_per_visitor = deal_size × close_rate × conversion_rate
 * 2. monthly_traffic = volume × (1 - difficulty/100) × 0.3
 * 3. monthly_revenue = traffic × revenue_per_visitor
 * 4. roi_18mo = (monthly_revenue × 18 - content_cost) / content_cost
 * 5. adjusted = roi × min(ltv_cac / 3, 2.0)
 * 6. evs = min(adjusted / 10, 100)
 *
 * EVS Tiers:
 * - Tier 1 (80+): 70% of content capacity
 * - Tier 2 (60-80): 20% of content capacity
 * - Tier 3 (40-60): 10% of content capacity
 * - Deprioritize (<40): Kill / reallocate
 */

const DEFAULT_CONTENT_COST = 500; // $ per content piece

/**
 * Calculate EVS for a keyword × service combination.
 */
export function calculateEVS(input: EVSInput): EVSResult {
  const contentCost = input.contentCost || DEFAULT_CONTENT_COST;
  const ltvCacRatio = input.cac > 0 ? input.ltv / input.cac : 1;

  // Step 1: Revenue per visitor
  const revenuePerVisitor = input.dealSize * input.closeRate * input.conversionRate;

  // Step 2: Estimated monthly traffic
  const estimatedMonthlyTraffic = input.searchVolume * (1 - input.difficulty / 100) * 0.3;

  // Step 3: Monthly revenue potential
  const estimatedMonthlyRevenue = estimatedMonthlyTraffic * revenuePerVisitor;

  // Step 4: 18-month ROI
  const totalRevenue18Mo = estimatedMonthlyRevenue * 18;
  const roi18Month = contentCost > 0 ? (totalRevenue18Mo - contentCost) / contentCost : 0;

  // Step 5: LTV:CAC quality adjustment
  const ltvCacMultiplier = Math.min(ltvCacRatio / 3, 2.0);
  const adjustedROI = roi18Month * ltvCacMultiplier;

  // Step 6: Convert to 0-100 scale
  const evs = Math.min(Math.max(adjustedROI / 10, 0), 100);

  // Determine tier
  let tier: 1 | 2 | 3 | 0;
  if (evs >= 80) tier = 1;
  else if (evs >= 60) tier = 2;
  else if (evs >= 40) tier = 3;
  else tier = 0;

  return {
    evs: Math.round(evs * 100) / 100,
    tier,
    revenuePerVisitor,
    estimatedMonthlyTraffic: Math.round(estimatedMonthlyTraffic),
    estimatedMonthlyRevenue: Math.round(estimatedMonthlyRevenue * 100) / 100,
    roi18Month: Math.round(roi18Month * 100) / 100,
    adjustedROI: Math.round(adjustedROI * 100) / 100,
    ltvCacRatio: Math.round(ltvCacRatio * 100) / 100,
  };
}

/**
 * Calculate service profitability score for content allocation weighting.
 *
 * Profitability Score =
 *   (gross_margin × 40%) +
 *   (min(LTV_CAC_ratio / 30, 1.0) × 30%) +
 *   (min(deal_size / 100000, 1.0) × 20%) +
 *   ((1 - sales_cycle_days / 90) × 10%)
 */
export function calculateProfitabilityScore(service: {
  id: string;
  name: string;
  margin: number;
  ltv: number;
  cac: number;
  dealSize: number;
  salesCycleDays: number;
}): ProfitabilityScore {
  const ltvCacRatio = service.cac > 0 ? service.ltv / service.cac : 1;

  const marginComponent = service.margin * 40;
  const ltvCacComponent = Math.min(ltvCacRatio / 30, 1.0) * 30;
  const dealSizeComponent = Math.min(service.dealSize / 100000, 1.0) * 20;
  const speedComponent = Math.max(1 - service.salesCycleDays / 90, 0) * 10;

  const score = marginComponent + ltvCacComponent + dealSizeComponent + speedComponent;

  return {
    serviceId: service.id,
    serviceName: service.name,
    score: Math.round(score * 100) / 100,
    components: {
      marginComponent: Math.round(marginComponent * 100) / 100,
      ltvCacComponent: Math.round(ltvCacComponent * 100) / 100,
      dealSizeComponent: Math.round(dealSizeComponent * 100) / 100,
      speedComponent: Math.round(speedComponent * 100) / 100,
    },
    allocationPercentage: 0, // Calculated in allocateContentSlots
  };
}

/**
 * Distribute content slots across services based on profitability scores.
 */
export function allocateContentSlots(
  services: ProfitabilityScore[],
  totalSlots: number
): ProfitabilityScore[] {
  const totalScore = services.reduce((sum, s) => sum + s.score, 0);
  if (totalScore === 0) return services;

  return services.map((service) => ({
    ...service,
    allocationPercentage: Math.round((service.score / totalScore) * 100),
  }));
}
