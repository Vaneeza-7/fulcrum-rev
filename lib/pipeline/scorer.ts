import { prisma } from '@/lib/db';
import { EnrichmentResult } from '@/lib/ai/types';
import { DetectedSignal } from '@/lib/ai/types';
import { ScoreResult, ScoringWeights, calculateGrade, getTimeDecayMultiplier } from './types';
import { calculateIntentScore } from './signal-detector';

/**
 * Load scoring configuration from the database for a tenant.
 * All weights/ranges are stored as tenant_scoring_configs rows.
 */
async function loadScoringWeights(tenantId: string): Promise<ScoringWeights> {
  const configs = await prisma.tenantScoringConfig.findMany({
    where: { tenantId },
  });

  const configMap = new Map(configs.map((c) => [c.configType, c.configData]));

  return {
    company_size: (configMap.get('company_size') as ScoringWeights['company_size']) ?? [
      { min: 1, max: 50, points: 5 },
      { min: 51, max: 500, points: 10 },
      { min: 501, max: 5000, points: 7 },
    ],
    industry_fit: (configMap.get('industry_fit') as ScoringWeights['industry_fit']) ?? [
      { match: 'perfect', points: 8 },
      { match: 'adjacent', points: 5 },
      { match: 'neutral', points: 3 },
    ],
    role_authority: (configMap.get('role_authority') as ScoringWeights['role_authority']) ?? [
      { pattern: 'c_level', points: 15 },
      { pattern: 'vp_director', points: 12 },
      { pattern: 'manager', points: 7 },
      { pattern: 'ic', points: 3 },
    ],
    revenue_signals: (configMap.get('revenue_signals') as ScoringWeights['revenue_signals']) ?? [
      { signal: 'series_a', points: 7 },
      { signal: 'seed', points: 5 },
      { signal: 'budget_season', points: 3 },
    ],
  };
}

/**
 * Calculate the FIT score (0-40 points).
 * Components: Company Size (0-10) + Industry (0-8) + Revenue (0-7) + Role (0-15)
 */
function calculateFitScore(
  enrichment: EnrichmentResult,
  weights: ScoringWeights
): { total: number; company_size_pts: number; industry_pts: number; revenue_pts: number; role_pts: number } {
  // Company Size (0-10)
  let company_size_pts = 0;
  for (const range of weights.company_size) {
    if (enrichment.company_size_estimate >= range.min && enrichment.company_size_estimate <= range.max) {
      company_size_pts = range.points;
      break;
    }
  }

  // Industry Fit (0-8)
  // Use the first matching industry config or default to neutral
  let industry_pts = 3; // neutral default
  for (const fit of weights.industry_fit) {
    if (fit.match === 'perfect' && enrichment.industry) {
      // In production, this would check against a list of target industries
      // For now, the Claude enrichment provides confidence_score as a proxy
      if (enrichment.confidence_score >= 70) industry_pts = 8;
      else if (enrichment.confidence_score >= 40) industry_pts = 5;
      break;
    }
  }

  // Revenue Signals (0-7)
  let revenue_pts = 0;
  if (enrichment.funding_stage) {
    for (const sig of weights.revenue_signals) {
      if (enrichment.funding_stage === sig.signal) {
        revenue_pts = sig.points;
        break;
      }
    }
  }
  // Budget timing bonus
  if (enrichment.budget_timing) {
    const month = new Date().getMonth();
    if (month >= 9 || month <= 2) { // Q4/Q1
      revenue_pts = Math.min(revenue_pts + 3, 7);
    }
  }

  // Role Authority (0-15)
  let role_pts = 3; // default IC
  for (const role of weights.role_authority) {
    if (role.pattern === enrichment.decision_maker_level) {
      role_pts = role.points;
      break;
    }
  }

  const total = Math.min(company_size_pts + industry_pts + revenue_pts + role_pts, 40);

  return { total, company_size_pts, industry_pts, revenue_pts, role_pts };
}

/**
 * Score a lead using the dual-axis model.
 * Fulcrum Score = (Fit × 0.40) + (Intent × 0.60)
 */
export async function scoreLead(
  tenantId: string,
  enrichment: EnrichmentResult,
  signals: DetectedSignal[]
): Promise<ScoreResult> {
  const weights = await loadScoringWeights(tenantId);

  // Fit Score (0-40)
  const fit = calculateFitScore(enrichment, weights);

  // Intent Score (0-60, capped)
  const intent_score = calculateIntentScore(signals);

  // Fulcrum Score = (Fit × 0.40) + (Intent × 0.60)
  // Normalize: fit is out of 40, intent is out of 60
  // Final score is on 0-100 scale
  const fit_normalized = (fit.total / 40) * 100;
  const intent_normalized = (intent_score / 60) * 100;
  const fulcrum_score = (fit_normalized * 0.40) + (intent_normalized * 0.60);

  return {
    fit_score: fit.total,
    intent_score,
    fulcrum_score: Math.round(fulcrum_score * 100) / 100,
    fulcrum_grade: calculateGrade(fulcrum_score),
    breakdown: {
      company_size_pts: fit.company_size_pts,
      industry_pts: fit.industry_pts,
      revenue_pts: fit.revenue_pts,
      role_pts: fit.role_pts,
      signals: signals.map((s) => {
        const multiplier = getTimeDecayMultiplier(s.days_ago);
        return {
          type: s.signal_type,
          raw_score: multiplier > 0 ? s.signal_score / multiplier : s.signal_score,
          decayed_score: s.signal_score,
        };
      }),
    },
  };
}
